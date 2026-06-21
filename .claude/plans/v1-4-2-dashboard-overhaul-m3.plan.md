# Plan: v1.4.2 Dashboard Overhaul — Milestone 3 (a11y AA + OQ 명문화)

**Source PRD**: [.claude/prds/v1-4-2-dashboard-overhaul.prd.md](../prds/v1-4-2-dashboard-overhaul.prd.md)
**Selected Milestone**: M3 — a11y WCAG 2.2 AA + 잔여 OQ 명문화
**Complexity**: Medium (5 a11y 축 + OQ 7건 본문화 + 4 lint test create)
**Branch**: `v1-4-2-dashboard-overhaul` (M1+M2와 동일 worktree, 같은 cycle 누적)

## Summary

PRD §Risks의 "a11y WCAG 2.2 full pass (다음 cycle)"를 본 M3가 흡수한다. M1(staleness/i18n/hoist) + M2(content/actionability) ship 후 surface는 5초 skim에 적합한 수준이나, **키보드 단독 사용자 / 스크린리더 / 색각이상 / motion sensitivity** 4 사용자 경로는 아직 첫 사용 친화가 아니다. M3는 (a) semantic landmark + skip-link + focus-visible 일관성 + ARIA label 4축의 mechanical 정렬, (b) WCAG AA 색 contrast lint, (c) severity color-only 금지 lint를 추가한다. 동시에 PRD §Open Questions 7건(OQ-a~g)을 M1/M2가 default 채택한 결정으로 **본문화**하여 PRD 자체가 *결정 history*가 되게 한다. 새 외부 의존 0, derive surface immutable, renderer 내부 markup + CSS lint test만 변경.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| section composer | `plugins/mccp/scripts/lib/renderer/index.js:1` | sections array → html.js 단일 합성. M3는 새 section 추가 없음 — html.js markup 자체 수정만. |
| escape utility | `plugins/mccp/scripts/lib/renderer/format-utils.js:93` (`escapeAttr`) | aria-label / title 동일하게 escapeAttr 적용 |
| 4-part component | `plugins/mccp/scripts/lib/renderer/sections/open-questions.js:67` (`severity-tag` HTML) | severity가 icon + text + color 3중 — M3 lint가 이 invariant 보호 |
| reduced-motion | `plugins/mccp/scripts/lib/renderer/html.js:144` (`@media (prefers-reduced-motion)`) | 기존 `*` selector 유지, 새 motion 추가 시 동일 invariant |
| dark/light tokens | `plugins/mccp/scripts/lib/renderer/html.js:3-33` (OKLCH 토큰) | 색 contrast lint가 light/dark 양 mode 모두 검증 |
| test fixture | `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | M2가 작성한 HTML markup assertion 스타일 — M3 a11y test도 동일 grep 기반 |
| jargon expand | `plugins/mccp/scripts/lib/renderer/parsers/jargon-dictionary.js:1` (`renderJargonHtml`) | OQ-b 결정 본문화 시 식별자(`mccp-plan-codex` 등)는 영어 유지 + 한글 풀이 `<abbr>` — 이미 구현됨, M3는 PRD 본문 확정 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` | UPDATE | M3 row in-progress (이미 적용), §Open Questions 7건을 결정 본문화 (M1/M2 채택 default), §Risks "a11y full pass" 행 mitigation column에 M3 흡수 명시 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `<main>` landmark + `id="main"`, skip-link 1행, `<footer>` landmark명시, OKLCH 토큰 contrast 미세조정 (--muted light/dark 모두 4.5:1 보장), `.sr-only` 유틸 CSS 추가, `details summary :focus-visible` 추가, `.grid-cell :focus-visible` 추가, code 안 영어 식별자에 `lang="en"` 옵션 (text 단위 wrap) |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | `.grid-cell`에 `tabindex="0"` + `aria-label` (icon-only 회피), `c.intent`이 있을 때 `aria-describedby` 또는 visible hint 추가 검토 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | severity-tag에 `aria-label="<SEV>"` 추가 (스크린리더가 emoji 발화 회피), copy-btn `aria-label="복사: …"` |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 동일 — severity-tag aria-label + copy-btn aria-label |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | severity 없음 — `<time datetime>` semantic time 적용 (역사적 가독성) |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-landmarks.test.js` | CREATE | landmark 4종(`main`, `nav`-없음, `footer`, `aside role=alert`) + skip-link + h1 단일 + h2 hierarchy lint |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js` | CREATE | severity-tag aria-label + copy-btn aria-label + grid-cell aria-label + status-strip aria-label invariant |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-contrast.test.js` | CREATE | OKLCH 토큰 파싱 + L1/L2 + body/muted 조합 WCAG AA contrast >= 4.5:1 (small) / 3:1 (large) light + dark 모두 |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js` | CREATE | severity 표기는 (text || icon) 둘 중 하나 이상 — color-only HTML 0건 grep invariant |
| `CHANGELOG.md` | UPDATE | `[1.11.0]` entry — a11y AA + OQ 본문화 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.10.0 → 1.11.0` minor bump |
| `.claude/PRPs/reports/v1-4-2-dashboard-overhaul-m3-report.md` | CREATE | M3 implementation report (Phase 4 implement 후) |
| `.claude/receipts/mccp-implement-codex/v1-4-2-dashboard-overhaul-m3.json` | CREATE | Implement-Codex receipt (Phase 2.5 게이트 결과) |

(plan은 Plan-Codex 게이트 후 implement에서 commit 분할 — parser → section → wire → meta 4 chunk 권장.)

## Tasks

### Task 1 — PRD §Open Questions 7건 본문화 (parser/code 변경 0)
- **Action**: PRD를 직접 edit. §Open Questions의 OQ-a/b/c/d/e/f/g 각 항목 아래에 "**결정 (v1.4.2-M3)**: …" 1줄 append. M1/M2가 default로 채택한 결정을 본문화:
  - **OQ-a (stale 판정)**: M1 `plan-body.js#staleness-guard` 채택 = **(i) plan path basename cycle ID와 STATE.md `task_fingerprint` 일치** + **(ii) plan file mtime** 둘 다. **(iii) PRD status column**은 보조 신호 (mismatch 시 i+ii 우선).
  - **OQ-b (식별자 영어 유지 범위)**: gate name(`mccp-plan-codex`), env var(`MCCP_GATE_ROUND_CAP`), command(`/mccp:plan`), file path는 **영어 그대로**. `<abbr title="…">` 한글 풀이는 jargon-dictionary whitelist에 등록된 37 entry만 적용. 산문/label/section heading은 한글.
  - **OQ-c (interaction 깊이)**: **hover background-color shift + native `<details>` expand만**. filter/search/sort는 v1.4.3+ defer (impeccable Acceptable register 정합 — "차분, 산만 최소").
  - **OQ-d (history source)**: M2 `milestone-history.js` 채택 = **(ii) PRD `## Delivery Milestones` complete row** + **(iii) receipt `mccp-pr-codex/*` ship 이벤트** 결합. (i) git log parse는 secondary verification만 (`<time datetime>` 정확도 보강).
  - **OQ-e (한 화면 N)**: **3 expanded + 나머지 `<details>+N 더보기`** (OQ, Risks 동일).
  - **OQ-f (action prompt source)**: **(i) static template whitelist** (`/mccp:plan`, `/mccp:plan-prd`, `/codex:rescue`). LLM-derived 및 plan body anchor parse는 v1.4.3+.
  - **OQ-g (meta-cue source)**: **(i) plan body 헤딩 path + 항목 위치 추출** — `basename §section, line N` 형식. (ii) 인접 산문 1-2줄 추출은 v1.4.3+ defer.
- **Mirror**: PRD `## Open Questions` 기존 list 형식 유지, 결정만 sub-bullet으로 추가.
- **Validate**: `grep -c "결정 (v1.4.2-M3)" .claude/prds/v1-4-2-dashboard-overhaul.prd.md` == 7

### Task 2 — html.js semantic landmark + skip-link (clip-based) + footer (F7 absorption)
- **Action** (Codex F7 absorption — skip-link clip-based hidden + focused 상태 explicit):
  - `<body>` 다음 1행 — `<a class="skip-link sr-only" href="#main">본문 바로가기</a>` — sr-only가 hidden state, :focus-visible이 explicit visible state.
  - `<main>` → `<main id="main" tabindex="-1">` (skip-link target + 키보드 focus 허용).
  - `<footer>` → `<footer role="contentinfo" class="muted mono">`.
  - LAYOUT CSS — **clip-based hidden + focused fixed (offscreen 9999px 폐기)**:
    ```css
    .sr-only {
      position: absolute; width: 1px; height: 1px;
      overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%);
      white-space: nowrap; border: 0; padding: 0; margin: -1px;
    }
    .skip-link:focus-visible {
      position: fixed; top: 0.25rem; left: 0.25rem;
      clip: auto; clip-path: none; width: auto; height: auto;
      margin: 0; padding: 0.4rem 0.75rem;
      background: var(--accent); color: var(--bg);
      z-index: 11; outline: 2px solid var(--bg); outline-offset: 2px;
      text-decoration: none; border-radius: 3px;
    }
    ```
- **Mirror**: M1 hoist header `position: sticky` (z-index: 10) 위에 skip-link가 stack — z-index: 11. WebAIM clip-path standard pattern.
- **Validate**:
  - `node --test plugins/mccp/scripts/lib/renderer/tests/a11y-landmarks.test.js`
  - `grep -c 'class="skip-link sr-only"' .claude/cache/status.html` >= 1 (default hidden via sr-only)
  - `grep -c '\.skip-link:focus-visible' plugins/mccp/scripts/lib/renderer/html.js` >= 1 (focused state CSS 존재)
  - `grep -c 'left: -9999px' plugins/mccp/scripts/lib/renderer/html.js` == 0 (구 offscreen 패턴 폐기 invariant)

### Task 3 — html.js focus-visible 일관성 + severity color-only 금지 + abbr lang
- **Action**:
  - LAYOUT CSS — `details summary:focus-visible`, `.grid-cell:focus-visible`, `.skip-link:focus-visible` 3건에 동일 `outline: 2px solid var(--accent); outline-offset: 2px;`
  - `.severity-tag.s-critical, .severity-tag.s-high` 등 color 적용 룰 옆에 `font-weight: 600` 추가 — 색 약시 보조
  - footer `<code>.claude/</code>` → `<code lang="en">.claude/</code>` (Task 1 OQ-b 결정에 정합)
- **Mirror**: `:focus-visible` 기존 룰(line 81/129) 동일 token.
- **Validate**: smoke render 후 `grep -c ':focus-visible' .claude/cache/status.html` >= 3

### Task 4 — status-strip 1 tab stop + cell non-focusable (F1 + F4 absorption)
- **Action** (impeccable F1 + Codex F4 absorption — Tab 순회에서 status 정보 도달 가능, 단 1 stop만):
  - status-strip 전체를 **1 tab stop**으로 만들기 — `<div class="status-strip" role="group" tabindex="0" aria-label="현황 4축: 진행 중 N · 차단 N · 다음 X · 미해결 위험 N">`. aria-label은 동적으로 4 cell 값을 포함해 SR이 strip focus 시 4축 모두 발화.
  - 동적 aria-label 생성 — `renderHtml`에서 grid cells 값을 join하여 `aria-label` 문자열 구축. 예: `"현황 4축: 진행 중 2 · 차단 1 · 다음 v1.4.2 m3 · 미해결 위험 0"`. escapeAttr 적용.
  - 개별 cell은 **focusable 아님** — `tabindex` 미적용. 시각은 그대로.
  - cell 내부 icon emoji span에 `aria-hidden="true"` 추가 — `<span class="icon" aria-hidden="true">`.
  - html.js LAYOUT의 기존 `header .status-strip .cell:focus-visible { outline: ... }` 룰 **제거** (line 81) — focus 받지 않는 cell에 :focus-visible 의미 없음. 대신 `.status-strip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` 추가 — strip 전체가 focused state.
  - Tab 순회 contract 갱신 — skip-link → status-strip (1 stop) → main → details summary × 2 → copy-btn × N.
- **Mirror**: html.js:197 기존 `role="group"` 패턴 정합. Linear/Raycast의 "1 group = 1 tab stop" 패턴.
- **Validate**:
  - `grep -E 'class="status-strip"[^>]*tabindex="0"' .claude/cache/status.html` >= 1
  - `grep -E 'aria-label="현황 4축: 진행' .claude/cache/status.html` >= 1 (동적 label 정확)
  - `grep -c 'aria-hidden="true"' .claude/cache/status.html` >= 4 (cell icon)
  - `grep -c '\.cell:focus-visible' plugins/mccp/scripts/lib/renderer/html.js` == 0 (구 룰 제거)
  - `grep -c '\.status-strip:focus-visible' plugins/mccp/scripts/lib/renderer/html.js` >= 1 (신규 룰)

### Task 5 — OQ/Risks severity-tag + copy-btn aria-label 한글 전용 (F2 + F5 absorption)
- **Action** (impeccable F2 + Codex F5 absorption — single source severity metadata + Korean SR 발화 안정):
  - **신규 module** `plugins/mccp/scripts/lib/renderer/parsers/severity-meta.js` — severity 표기하는 모든 surface (OQ / Risks / audit-timeline / milestone-history)가 import할 single source helper. drift 방지:
    ```js
    const SEVERITY_META = {
      CRITICAL: { visible: 'CRITICAL', srLabel: '최고', icon: '🔴', className: 's-critical' },
      HIGH:     { visible: 'HIGH',     srLabel: '높음', icon: '🟠', className: 's-high' },
      MEDIUM:   { visible: 'MEDIUM',   srLabel: '중간', icon: '🟡', className: 's-medium' },
      LOW:      { visible: 'LOW',      srLabel: '낮음', icon: '⚪', className: 's-low' },
      UNKNOWN:  { visible: 'UNKNOWN',  srLabel: '미상', icon: '⚪', className: 's-unknown' },
    };
    function severityMeta(sev) { return SEVERITY_META[String(sev || 'UNKNOWN').toUpperCase()] || SEVERITY_META.UNKNOWN; }
    module.exports = { SEVERITY_META, severityMeta };
    ```
  - severity-tag 출력 통일 형식 (OQ + Risks 양쪽 동일):
    ```html
    <span class="severity-tag s-{className}" aria-label="위험도: {srLabel}">
      <span class="icon" aria-hidden="true">{icon}</span>
      {visible}
    </span>
    ```
    visible label은 영어 (CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN) — PRD OQ-b 정합. aria-label은 한글 전용.
  - copy-btn — `aria-label="다음 액션 복사"` (한글 전용 고정, 본문 snippet 포함 X — Korean SR 영어 spell-out 회피).
  - milestone-history — `<time datetime="YYYY-MM-DD">` semantic 시간 (날짜 미상 fallback은 평문 유지).
- **Mirror**: parsers/jargon-dictionary.js (M2 helper 패턴) — stateless 모듈, escapeAttr 적용 일관.
- **Validate**:
  - 신규 `tests/severity-meta.test.js` — 5 enum (CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN) 각각 srLabel + visible + className + icon 4 필드 검증
  - `tests/a11y-aria-labels.test.js` — severity-tag 출력이 `aria-label="위험도: <한글>"` + visible 영어 + icon aria-hidden 3중 invariant (OQ + Risks 양쪽 fixture)
  - `grep -c 'aria-label="심각도:' plugins/mccp/scripts/lib/renderer/sections/` == 0 (구 mixed 패턴 0건 invariant)
  - `grep -c 'aria-label="위험도:' plugins/mccp/scripts/lib/renderer/sections/` >= 2 (OQ + Risks 양쪽 한글 사용)
  - 회귀 0 — sections.test.js + four-part-rendering.test.js 기존 fixture 형식 유지

> Codex Plan-Codex F5 absorption — 위 Task 5가 single source. 이전 draft의 "심각도: CRITICAL" 등 mixed-language 패턴은 폐기.

### Task 6 — OKLCH 토큰 contrast 변환기 + conformance fixtures + lint (F6 absorption)
- **Action** (Codex F6 absorption — independent oracle + strict threshold + spec vectors):
  - **신규 module** `plugins/mccp/scripts/lib/renderer/parsers/oklch-contrast.js` — W3C CSS Color Module Level 4 §16.4 정합 dep-0 converter:
    1. `oklchToOklab(L, C, h)` — h: deg → rad, `a = C cos(h)`, `b = C sin(h)`
    2. `oklabToLinearSrgb(L, a, b)` — 3 stage matrix multiply (M1 LMS' → LMS cube → M2 RGB linear). W3C spec constants 그대로.
    3. `linearSrgbTosRgb(L, M, S)` — gamma companding (≤0.0031308 → linear scale 12.92, > → `1.055 * x^(1/2.4) - 0.055`). 0~1 clamp.
    4. `sRGBtoLuminance(R, G, B)` — sRGB → linear (역 companding) → `0.2126*R + 0.7152*G + 0.0722*B` (WCAG 2.2 relative luminance).
    5. `contrastRatio(L1, L2)` — `(L1 + 0.05) / (L2 + 0.05)`, L1=max.
  - **Conformance fixtures** (`tests/oklch-conformance.test.js`):
    - 7 vector — W3C spec 예시 (oklch(0.5 0.1 230) = #5c8fc0 등 표준 예시 5개) + sRGB gamma boundary 2건 (0.0031308 ≤ threshold).
    - 각 변환 단계 (OKLCH→OKLab, OKLab→LinearSRGB, LinearSRGB→sRGB, sRGB→Luminance) 별 expected 값 ε ≤ 0.005 tolerance (intermediate numeric만).
    - **contrast threshold는 strict `ratio >= target` — tolerance 없음.** false-pass 차단.
  - `tests/a11y-contrast.test.js` (production token 8 case):
    - light + dark × {본문 (`--ink` vs `--bg` ≥ 7:1), 보조 (`--muted` vs `--bg` ≥ 4.5:1), 링크 large (`--accent` vs `--bg` ≥ 3:1), severity (`--status-blocked` vs `--bg` ≥ 4.5:1)} = 8 case.
    - strict `>=` 비교 (ε 없음). fail 시 token L 값 조정 권장.
- **Mirror**: dep-0 + Node native test runner — M2 cross-section-dedupe.js의 stateless math 패턴.
- **Validate**:
  - `node --test plugins/mccp/scripts/lib/renderer/tests/oklch-conformance.test.js` — 7 spec vector ε ≤ 0.005 통과
  - `node --test plugins/mccp/scripts/lib/renderer/tests/a11y-contrast.test.js` — 8 production case strict `>=` 통과
  - 한쪽이라도 fail 시 OKLCH L parameter 조정 (light dark 양 mode 모두 통과 시점까지 iterate)

### Task 7 — severity color-only 금지 lint
- **Action**:
  - `a11y-severity-non-color.test.js` 작성 — `renderOpenQuestions` + `renderRisks` 출력 HTML에서 `class="severity-tag s-…"` 위치 모두 추출 후, 같은 element 안에 (a) text label (CRITICAL/HIGH/MEDIUM/LOW) 또는 (b) icon emoji (🔴🟠🟡⚪) 둘 중 하나가 시각 surface로 존재함을 검증.
  - status-grid `.cell.s-blocked` 같은 surface도 동일 — accent 가 color-only일 때 `aria-label` 또는 text fallback 검증.
  - Risk severity가 LOW일 때도 동일 surface 검증 (severity-tag class 일관 유지).
- **Mirror**: M2 four-part-rendering.test.js의 fixture grep 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js` 4 case 통과 (CRITICAL/HIGH/MEDIUM/LOW)

### Task 8 — smoke render + 키보드 / SR manual (F3 absorption)
- **Action** (impeccable critique F3 absorption — SR manual check):
  - `node plugins/mccp/scripts/derive/cli.js render` 실행, `.claude/cache/STATUS.md` + `status.html` 산출.
  - **키보드 Tab 순회** (P1 absorption 후 stop 수 줄어듦) — skip-link → main → details summary × 2 (OQ/Risks 더보기) → copy-btn × N 순. 회귀 0.
  - **NVDA + Windows + ko-KR voice** 4-check manual:
    1. skip-link focus 시 "본문 바로가기" 발화
    2. status-strip group 진입 시 "현황 4축" 발화 후 cell content 순회 (cell focus 안 됨 — group label 진입)
    3. severity-tag 발화 시 "위험도: 최고/높음/중간/낮음" 한글 발화 (영어 등급명 spell-out 안 됨)
    4. copy-btn 발화 시 "다음 액션 복사 버튼" 한글 자연 발화
  - DevTools Lighthouse a11y category score 보조 (사용자가 manual 가능 시).
- **Mirror**: M2 §Validation Results 형식.
- **Validate**: 사용자 manual visual inspect + Tab navigation OK + NVDA 4-check OK

### Task 9 — PRD §Risks 행 mitigation 업데이트 + §Design Direction Acceptance 보강
- **Action**:
  - PRD §Risks "design direction anchor 4 위반" 행 mitigation column에 "M3가 lint 4종(landmark/aria-labels/contrast/severity-non-color)으로 mechanize" append
  - PRD §Design Direction §Acceptance criteria에서 a11y 관련 5 항목 (WCAG AA / color+icon 이중 / prefers-reduced-motion / OQ-Risk 4-part) 각 [x] 체크 표기
- **Mirror**: PRD 기존 markdown 형식.
- **Validate**: `grep -c '\[x\]' .claude/prds/v1-4-2-dashboard-overhaul.prd.md` >= 5 (a11y 5 항목)

### Task 10 — CHANGELOG + plugin.json bump
- **Action**: `CHANGELOG.md` Keep-a-Changelog 형식 `[1.11.0]` entry append. `plugins/mccp/.claude-plugin/plugin.json` `1.10.0 → 1.11.0`.
- **Mirror**: M2 `[1.10.0]` entry 형식.
- **Validate**: `node -p "require('./plugins/mccp/.claude-plugin/plugin.json').version"` = `"1.11.0"`

### Task 11 — M3 implementation report
- **Action**: `.claude/PRPs/reports/v1-4-2-dashboard-overhaul-m3-report.md` 작성 — M2 report 구조 정합 (Summary / Assessment vs Reality / Tasks Completed / Validation Results / Files Changed / Deviations / Issues / Tests Written / Acceptance / Next Steps).
- **Mirror**: `.claude/PRPs/reports/v1-4-2-dashboard-overhaul-m2-report.md`.
- **Validate**: file present, 모든 task line 포함.

## Validation

```bash
# Phase 5 PLAN-CODEX 게이트 통과 후, /mccp:prp-implement이 사용할 검증 sequence

# (1) Unit tests — 신규 4 + 기존 166
node --test plugins/mccp/scripts/lib/renderer/tests/a11y-landmarks.test.js \
                plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js \
                plugins/mccp/scripts/lib/renderer/tests/a11y-contrast.test.js \
                plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/

# (2) Integration smoke
node plugins/mccp/scripts/derive/cli.js render

# (3) Surface lint
grep -c 'id="main"' .claude/cache/status.html        # >= 1
grep -c 'class="skip-link"' .claude/cache/status.html # >= 1
grep -c 'role="contentinfo"' .claude/cache/status.html # >= 1
grep -c 'aria-label' .claude/cache/status.html        # >= 7  (status-strip group + 4 cells + 2 buttons 최소)
grep -c ':focus-visible' .claude/cache/status.html    # >= 4  (skip-link + cell + summary + copy-btn)

# (4) Severity non-color invariant (manual sample)
grep -A0 'severity-tag' .claude/cache/status.html | grep -E '(CRITICAL|HIGH|MEDIUM|LOW)' | head -5
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| OKLCH → sRGB → contrast ratio 변환의 deterministic dep 0 구현이 W3C spec과 미세 편차 — false fail | medium | spec 기준 (W3C CSS Color 4 §16.4 OKLab to OKLCH + matrix multiply) 3 단계만 구현, ε 0.01 tolerance |
| `<span tabindex="0">` 추가가 mouse 사용자 시각 회귀 (focus outline 의도 외 발현) | low | :focus-visible만 outline (focus는 X) — 기존 패턴 정합 |
| skip-link `position: absolute; left: -9999px` 사용자 OS reader 일부에서 발화 안 됨 | low | `.sr-only` clip-path 표준 패턴 채택 — visually-hidden + reader 발화 |
| OQ 결정 본문화가 사용자 의도와 다를 수 있음 (M1/M2 default가 사용자 동의 없이 채택된 것) | medium | 본 plan Task 1 OQ-a~g 7건을 Phase 5 PLAN-CODEX 게이트 + 사용자 review에 회부. 의문 항목은 CRITICAL Open Question으로 분리 |
| a11y test가 기존 surface 회귀 (M2 4-part rendering test와 marker 충돌) | low | 신규 test 4개는 별도 파일 — 기존 fixture/assert 미수정 |
| Lighthouse a11y manual 평가가 사용자 부담 | low | M3 acceptance에서 manual visual inspect만 요구 — 자동 score 목표 없음 |
| dark mode `--muted: 0.65/0.008/250` vs `--bg: 0.18 0 0` 가 4.5:1 미달 가능 | medium | Task 6 lint가 fail 시 OKLCH L 값 조정 (예 0.68로 상향) — 색조 (h, c) 유지 |
| `aria-label` 한글 + 영어 식별자 혼용 시 reader 발화 오작동 (예: "심각도: CRITICAL" — CRITICAL이 영어 그대로) | low | OQ-b 결정 정합 — 식별자/등급은 영어 유지, prefix만 한글 |

## Acceptance

- [ ] Task 1 — PRD §Open Questions OQ-a~g 7건 모두 "**결정 (v1.4.2-M3)**: …" sub-bullet 본문화
- [ ] Task 2 — html.js `<main id="main">` + skip-link + footer role=contentinfo + sr-only/skip-link CSS 추가
- [ ] Task 3 — :focus-visible 3 selector 통일 + severity-tag font-weight + footer code lang
- [ ] Task 4 — status-grid cell tabindex + aria-label + icon aria-hidden
- [ ] Task 5 — OQ/Risks severity-tag aria-label + copy-btn aria-label + milestone-history `<time datetime>`
- [ ] Task 6 — a11y-contrast.test.js 8 case (light/dark × 본문/보조/링크/severity) 통과
- [ ] Task 7 — a11y-severity-non-color.test.js 4 case (CRITICAL/HIGH/MEDIUM/LOW) 통과
- [ ] Task 8 — smoke render + 키보드 Tab 순회 회귀 0
- [ ] Task 9 — PRD §Risks mitigation update + §Design Direction Acceptance [x] 5 항목
- [ ] Task 10 — `CHANGELOG.md [1.11.0]` + `plugin.json 1.11.0`
- [ ] Task 11 — M3 implementation report 작성
- [ ] 회귀 0 — `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 통과 (M2 166 + M3 신규 ≈ 20 = ≈ 186)
- [ ] Codex Implement-Codex 게이트 통과 — cross-gate dedupe 가능성 높음 (plan body에 Codex R1 absorption 4건 + impeccable absorption 3건 반영)
- [ ] 사용자 visual inspect — status.html 키보드 단독 사용 5초 skim 가능
- [ ] Tab 순회 정확성 — skip-link (sr-only → focus visible) → status-strip (1 stop, 4축 aria-label 동적) → main → details summary × 2 → copy-btn × N
- [ ] severity-meta.js single source helper 도입 — OQ + Risks + audit-timeline + milestone-history 모두 사용 (mixed-language drift 0)
- [ ] OKLCH conformance vectors 7건 통과 + production 8 case strict `>=` 통과

## Design Critique

> impeccable critique 결과 (Plan-Codex 게이트 5.0). target=plan spec, register=product (PRODUCT.md), anchor=Calm/Decisive/Compact.

### Anti-Patterns Verdict
- **AI slop**: 낮음. plan이 PRODUCT.md §Anti-references 3 카테고리(SaaS hero / AI-cream / Bloomberg terminal)와 명시적으로 정합. 새 markup 추가가 sr-only / skip-link / landmark — 모두 표준 a11y 패턴, "weird affordance" 없음.
- **Deterministic scan**: skip (plan은 markup이 아닌 spec — detect.mjs 대상 외).
- **결정적**: plan은 *기존 surface에 a11y만 mechanize*. 정체성 표면 변경 0, register 정합.

### Priority Issues

- **[P1] status-grid cell `tabindex="0"` — broken affordance**
  - *Why*: Task 4가 `<span class="cell" tabindex="0">`로 focusable 만들기를 추천. 그러나 cell은 click/action 없는 정보 display. PRODUCT.md §Aesthetic and Minimalist + "Don't ship with half of these" — focusable인데 activation이 없으면 키보드 사용자가 *왜 focus한지 모름*. Linear/Raycast 등 anchor refs에서도 정보 cell은 focus 받지 않음.
  - *Fix*: Task 4 수정 — cell `tabindex="0"` 제거. 대신 status-strip 전체에 `role="group" aria-label="현황 4축"` (이미 적용됨 — html.js:197) 유지 + 개별 cell은 visible text만 (screen reader는 group label로 진입 후 cell content 순회). focus-visible CSS는 *skip-link, copy-btn, details summary* 3 surface에만 한정.

- **[P1] aria-label 한글+영어 혼용 — Korean SR 발화 불안정**
  - *Why*: Task 5의 `aria-label="심각도: CRITICAL"`처럼 한글 prefix + 영어 등급명 혼용은 Korean TTS (NVDA Korean / VoiceOver ko-KR)에서 영어 단어를 spell-out (씨-알-아이-티-...) 또는 다른 voice로 switch — flow 깨짐. PRD OQ-b 결정(식별자 영어 유지)은 *visible label* 대상이지 SR-only `aria-label`까지 정당화하지 않음.
  - *Fix*: Task 5 수정 — `aria-label`은 **한글 전용** ("위험도: 최고" / "위험도: 높음" / "위험도: 중간" / "위험도: 낮음"). visible label은 plan 그대로 (영어 CRITICAL/HIGH/MEDIUM/LOW 유지). 동일 패턴을 copy-btn에도 적용 — `aria-label="다음 액션 복사"` 한글 전용, 본문 (앞 30자)는 생략 또는 별도 텍스트로.

- **[P2] M3 acceptance에 실제 SR 검증 path 부재**
  - *Why*: lint 4종(landmarks/aria-labels/contrast/severity-non-color)이 *정적 markup*만 검증. PRD success metric (a)는 "키보드 단독 사용자가 5초 skim" — keyboard 부분만 Task 8 manual에 있고 SR은 없음. PRD Risks에도 "Korean SR 발화 검증 부재"가 P1으로 등장.
  - *Fix*: Task 8 manual checklist에 "NVDA + Windows + ko-KR voice로 status.html 열고 (i) skip-link 발화 OK (ii) status-strip group 발화 OK (iii) severity-tag 발화 자연 (iv) copy-btn label 발화 자연 — 4 check" 1줄 추가. NVDA portable 사용. 사용자 운영 가능한 SR 1개로 한정 (orca / VoiceOver 등은 다음 cycle).

### Minor Observations
- `lang="en"` wrap을 footer code 1군데에만 적용 — 본문 `mccp-plan-codex` 등 영어 식별자가 등장하는 곳(jargon expand 안 / 다른 code) 모두 일관 적용 시 SR 발화 자연. 그러나 본 M3 scope 외 — v1.4.3+ defer 권장.
- OKLCH lint Task 6의 light/dark 8 case 중 `--accent` vs `--bg` 3:1 (large only) — copy-btn 등 small surface는 다른 토큰(`--ink` etc.) 사용 — accent는 large/decoration만 사용. plan은 이미 이 invariant 명시. OK.

### Cognitive Load
- Tab 순회 stop 수 (P1 채택 후): skip-link → main → details summary × N → copy-btn × N. cell focus 제거로 ≤ 8개 → 5초 skim 가능. P1 미채택 시 ≥ 12개 → noise.

### Questions to Consider
- M3 acceptance 마지막 항목 "키보드 단독 사용자 5초 skim"의 *5초*가 status.html *전체*가 아닌 *L1 sticky header*만이 아닌가? 본문 진입까지 보장 필요 시 skip-link 즉시 visible focusing 이 핵심 — Task 2 CSS의 `:focus { position: static; }`만으로 충분한지 visual 검증.
- OQ-c "filter/search v1.4.3+ defer" 채택은 OK. 그러나 OQ가 7건을 넘기 시작하면 (현재 PRD에 7건, M3 후속에서 늘 가능) `<details>+N 더보기` 안에서 search 없이는 발견 어려움 — v1.4.3 surface candidate로 기록.

### Verdict
**CONVERGED with P1 absorption recommendations.**

- Plan은 PRODUCT.md register 정합 + WCAG 2.2 AA contract 정합 + Calm/Decisive/Compact voice 유지.
- P1 finding 2건은 **implement 단계 진입 전 plan body에 absorption** 권장 — Task 4 (tabindex 제거) + Task 5 (aria-label 한글 전용) + Task 8 (SR manual 1줄 추가).
- absorption 후 plan은 ship-ready. Codex Plan-Codex 게이트로 진입 가능.

> **F1 absorption — Task 4 status-grid cell tabindex 제거.** status-strip group label만으로 SR 진입, cell은 focusable 아님.
>
> **F2 absorption — Task 5 aria-label 한글 전용.** Korean SR 발화 안정성 우선, 식별자 영어 유지는 visible label에만 적용.
>
> **F3 absorption — Task 8 NVDA + ko-KR 4-check 1줄 추가.** SR 검증 path mechanize.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 + v0.3.6 design-scope split with `--impeccable-available`)
- 라운드 수: **R1** (R2 미실행 — 모든 ACCEPT_NOW HIGH/CRITICAL이 plan body absorption으로 해소)
- 합치 결론: **needs-attention → converged-with-absorption** (impeccable scope split 정합 — design/a11y는 impeccable가 routing, Codex는 correctness/contradiction만 발화)
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F4 — Status cells become unreachable by Tab after F1 absorption | HIGH | **ACCEPT_NOW** | impeccable F1과 Codex F4 양립 — cell 비-focusable 유지 + status-strip 전체에 1 tab stop. Task 4 본문 갱신. |
  | F5 — Duplicate Task 5 can reintroduce mixed Korean/English aria labels | HIGH | **ACCEPT_NOW** | edit cycle에서 stale Task 5 drift 잔존. 삭제 + severity-meta.js single source helper로 mechanize. Task 5 본문 갱신. |
  | F6 — Custom OKLCH contrast lint has no independent correctness oracle | MEDIUM | **ACCEPT_NOW** | W3C spec conformance vectors 추가 + tolerance는 intermediate numeric만, threshold는 strict ≥. Task 6 본문 갱신. |
  | F7 — Skip-link mitigation says sr-only but planned CSS uses offscreen positioning | MEDIUM | **ACCEPT_NOW** | clip-based pattern 통일 + focused state explicit CSS. Task 2 본문 갱신. |

- Deferred to backlog: 0 (모든 finding이 plan body로 absorbed)
- Open Questions: none — R2 미실행 정당화 (모든 HIGH/CRITICAL이 R1에서 plan body absorption 완료, ACCEPT_NOW × 미해소 잔여 0)
- Codex session 참조: threadId `019eeb57-ea8f-7c20-8662-d2eba0691309`, durationMs 266707, classification=ok, blocking=false

> Cross-gate dedupe note for Phase 2.5 Implement-Codex: 본 plan body가 Codex review 이미 absorbed (4 findings, verdict=needs-attention → converged). plan-codex + 가능한 implement-codex 양쪽 모두 동일 decision-slug + verdict=approve 시 PR step의 Codex 재호출은 cross-gate dedupe로 skip 권장 (`CODEX_DEDUPE_AT_PR=1` 자동 export).

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (4 findings F4/F5/F6/F7 all `verdict=ACCEPT_NOW` + plan body absorption). M3 scope = a11y AA mechanize + OQ 본문화 — 모든 architectural 결정(severity-meta single source, clip-based skip-link, status-strip 1 tab stop, OKLCH conformance oracle)이 plan Tasks 1-11에 pre-committed. No new implement-time decisions detected. Cross-gate dedupe applied — Codex 재호출 skip.

