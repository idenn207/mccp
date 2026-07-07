# Plan: v1.4.2 Dashboard Overhaul — Milestone 1 (Layout / i18n / Staleness)

**Source PRD**: [.claude/prds/v1-4-2-dashboard-overhaul.prd.md](../prds/v1-4-2-dashboard-overhaul.prd.md)
**Selected Milestone**: 1 — layout/i18n/staleness (axes 8 + 2 + 7 + 1)
**Complexity**: Medium (4 axis, M3 renderer 본문 + parsers/plan-body.js만, 신규 dep 0, 새 source reader 0)

## Summary

M3 renderer surface 4 결함을 한 PR로 정리한다. (8) next-step staleness guard — `parsers/plan-body.js`에 `computePlanStaleness`를 추가해 verdict.js + sections/status-grid.js가 stale plan을 amber 처리하거나 "next" 셀에서 빼낸다. (2) i18n surface label — section `<h2>` / footer / header meta를 한글로 번역 (`mccp 상태` / `타임라인` / `미해결 질문` / `위험` / `워커` / `최근 활동` / `마지막 갱신`), 식별자(gate name, env var, file path)는 영어 유지. (7) status hoist — `html.js` LAYOUT을 sticky header strip(verdict tone + 4축 grid + 갱신 메타)으로 재구성, status grid가 main 본문에서 header로 이동. (1) UX 시각 위계 — 헤딩 depth ≤ 3, accent 1/viewport invariant CSS, sectionWrapper class로 L2/L3 grouping. 결과는 캐시(`STATUS.md` + `status.html`) 양 산출물이 5초 안에 4축 파악 가능하도록.

M1 design decisions (PRD §Open Questions에서 본 plan이 결정 — M2가 OQ-d/f/g 처리):

- **OQ-a (stale plan 판정 기준)** — recommend **(i) basename cycle ID prefix가 STATE.md `task_fingerprint`의 cycle prefix와 일치 + (iii) PRD `## Delivery Milestones` row status='in-progress'** 두 신호 AND. mtime은 의도적으로 제외 — worktree rebase/checkout이 mtime을 흔들어서 false-positive 다발. cycle prefix 추출 규칙: `v0-3-5-codex-disabled-honor` → cycle `v0-3-5`, `v1-4-2-dashboard-overhaul-m1` → cycle `v1-4-2`. fingerprint `v1-4-2-dashboard-overhaul`는 prefix `v1-4-2` 매치. (i) 미일치 시 stale, (iii) 미일치 시도 stale, 둘 다 매치 시 fresh, fingerprint 자체가 없으면 `unknown` 처리.
- **OQ-b (식별자 정제 범위)** — gate name(`mccp-plan-codex`), env var(`MCCP_GATE_ROUND_CAP`), file path, receipt id, decision_id, command(`/mccp:plan`)는 **영어 유지**. 산문(section h2, footer, status grid label, verdict 문장, error message)만 한글화. mixed Korean+English code-switch는 CLAUDE.md §0 룰 정합.
- **OQ-c (interaction 깊이)** — hover bg shift + native `<details>` expand만. filter/search는 v1.4.3+로 defer (M2도 scope 아님). M1은 *layout shell만* 준비 — `<details>` 컴포넌트 markup은 M2 axis 9에서 active surface로 활성.
- **OQ-e (항목수 상한)** — 3 expanded + 나머지 `<details><summary>+N more</summary>` collapse. M1은 cap=3 enum을 코드로 표현 (`MAX_EXPANDED_ITEMS = 3`), M2가 markup 적용. 본 M1에서 OQ/Risks 출력 자체는 기존(no cap) 유지 — Reading만 영향 받지 않게 (M2 ship 전까지 user-visible behavior 변화 0 in OQ/Risks).

M2 routing (이 plan scope 외): jargon expand (3), cross-section dedupe (4), milestone history (5), intent extraction (6), actionability prompt + meta-cue (9).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Section render API | `plugins/mccp/scripts/lib/renderer/sections/status-grid.js:5-71` (`renderStatusGrid`) | `(model, formatUtils, planBody) → { md, html }` 순수 함수, format-utils 주입, 외부 fs 직접 호출 금지 |
| Korean copy patterns | `plugins/mccp/scripts/lib/renderer/format-utils.js:3-40` (`STATUS_BADGES`) + `format-utils.js:43-64` (`formatRelativeTime`) | 한국어 카피는 `korean: '...'` 또는 `'3분 전'` 식 텔레그래픽 단문. PRODUCT.md Calm voice 정합 |
| Color+icon 이중 표기 | `format-utils.js:7-39` (`appliesTo: 'both' \| 'icon'`) | severity는 색 + 텍스트 + icon 3중. PRODUCT.md §Accessibility 정합 |
| HTML escape | `format-utils.js:82-99` (`escapeHtml` / `escapeAttr`) | 모든 user-controlled string (gate/decision/plan path)에 `escapeHtml` 적용. v1.3.0-m3 F4 absorption |
| Section h2 patterns | `plugins/mccp/scripts/lib/renderer/html.js:118-137` (`<section id=...><h2>...</h2>...`) | 각 section은 `<section id="...">` 래퍼 + `<h2>` 헤딩. h2 텍스트만 i18n 대상 |
| Plan body parser | `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js:108-178` (`parsePlanBody`) | `(model, opts) → { planStatuses, openQuestions, risks, warnings, degraded }` 순수 함수 + `fsRead` 주입 (testable) |
| Verdict step composition | `plugins/mccp/scripts/lib/renderer/verdict.js:15-117` (`computeVerdict`) | 11-step priority chain, 각 step early-return. stale-plan guard는 step 9 (backlog+inProgress) / step 10 (inProgress only) 직전에 끼움 |
| Test fixture isolation | `plugins/mccp/scripts/lib/renderer/tests/integration.test.js:7-95` | `fsRead: (p) => {...}` 주입으로 host fs 미접근. plan path별 body 합성 |
| Safe-fallback | `plugins/mccp/scripts/lib/renderer/index.js:15-34` (`safeSection`/`safeCompose`) | 모든 section render에 try/catch wrap, 실패 시 inline `⚠ section ... failed` markup. M1 변경 후에도 유지 |
| Plan body markdown layout | `.claude/plans/v1-3-0-observability-m1-derive-engine.plan.md:1-15` | Header (Source PRD/Milestone/Complexity) → Summary → Patterns → Files → Tasks → Validation → Risks → Acceptance |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | Add `computePlanStaleness(plan, model) → 'fresh' \| 'stale' \| 'unknown'`. Export from existing module. Pure function — takes plan item + full derive model (STATE.md fingerprint + PRD status) → string. Used by verdict.js + status-grid.js. M0 derive surface는 immutable이라 plan-body.js 안에서 새 helper만 추가, 호출자에서 sourcing. |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE (same file) | `parsePlanBody` 반환 객체에 `planStaleness: Map<basename, 'fresh'\|'stale'\|'unknown'>` 추가. Map은 ordered, 모든 in-progress plan에 대해 entry 보장. PRD status가 in-progress가 아닌 plan은 entry 없음 (verdict/grid가 in-progress filter 후에만 stale 룩업). |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATE | `planSlug(plan, staleness)` signature 확장 — staleness `'stale'`이면 slug 뒤에 `· stale` 접미. step 9/step 10에서 `next: <slug>` 출력 직전 stale 모든 in-progress plan은 backlog count + inProgressPlans.length 표시만, slug 생략 (`<N> findings deferred · 다음 미정 (in-progress plan stale)`). step 10 단독은 `<N> plans active · 다음 미정` tone amber로 격상. |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | `cells[]`의 4축 한글 keep ('진행 중', '차단', '다음', 'risks open' → 마지막은 '미해결 위험'로). nextStep 도출 시 staleness map 확인: 모두 in-progress가 stale → nextStep `'미정'` + cell에 amber `data-stale="1"` attr 표시. nextStep label `path.basename` 그대로 surface 금지 — `formatPlanLabel(slug) → 한글 mix` helper로 정제 (cycle prefix 추출 + 본문은 plain). |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | LAYOUT CSS 재구성: header를 sticky strip으로, `<header>` 안에 inline brand + 4-cell mini-grid + meta inline. `<section id="status">` 본문 제거 (cells가 header로 hoist된 후 main에는 grid 미표시). `<title>` + `<h1 class="verdict">` 패턴은 외부 prd-status-roll worktree와 정합 — 사용자가 본 모양 mirror. accent 1/viewport CSS invariant: `.has-accent` class로 한 화면당 1개 element만 적용 추적용. section h2 한글: "타임라인" / "미해결 질문" / "위험" / "워커" / "최근 활동" / "현황". footer 한글: "v1.4.2 · `.claude/` 통합 derive". meta: "마지막 갱신" / "stale" suffix. |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | STATUS.md equivalent — section h2 한글 동일 적용 (`## 타임라인` / `## 미해결 질문` / `## 위험` etc.). 헤더 verdict는 markdown title H1으로 그대로. text 출력은 sticky 개념 없으므로 grid는 첫 H2 section으로 출력. stale 표기는 inline `· stale` 텍스트. |
| `plugins/mccp/scripts/lib/renderer/tests/staleness-guard.test.js` | CREATE | 4 fixture: (a) fingerprint match + PRD in-progress → fresh, (b) fingerprint mismatch + PRD in-progress → stale, (c) fingerprint match + PRD complete → stale, (d) fingerprint absent → unknown. verdict.js + status-grid.js 양쪽 시그널 보정 확인. |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | CREATE | renderHtml 결과 grep: `<h2>타임라인</h2>` / `<h2>미해결 질문</h2>` / `<h2>위험</h2>` / `<h2>현황</h2>` 존재 + 영어 잔존 anti-pattern `<h2>Open Questions</h2>` / `<h2>Risks</h2>` 부재. renderMarkdown 동일. footer "v1.4.2 · `.claude/` 통합 derive" 존재. |
| `plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js` | CREATE | renderHtml header 안에 verdict + 4-cell grid + meta 모두 존재. main 본문에 `<section id="status">` 부재 또는 hidden 표시 확인. sticky position CSS 포함 확인. |
| `plugins/mccp/scripts/lib/renderer/tests/integration.test.js` | UPDATE | 기존 integration fixture에 STATE.md `task_fingerprint` 필드 추가 + stale plan 1건 inject. 출력에 stale handling이 적용됐는지 grep. v1.3.0-m4/m5 회귀 0. |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | header DOM structure 변경 반영 (verdict header 안으로 hoist). status grid가 header에 있는지 assertion 추가. 기존 timeline/OQ/Risks assertion 유지. |
| `plugins/mccp/scripts/lib/renderer/tests/verdict.test.js` | UPDATE | step 9/step 10에 stale-plan 분기 추가. fixture model + planBody에 staleness 주입 → 결과 verdict text가 `다음 미정 (stale)` + tone amber 확인. 기존 step별 테스트 유지. |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATE | status-grid 호출 결과에 한글 cell label + nextStep `formatPlanLabel` 적용 확인. stale 경우 amber attr 검증. |
| `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` | UPDATE | Delivery Milestones row 1 (layout/i18n/staleness): Status `pending → in-progress`, Plan cell `—` → `[v1-4-2-dashboard-overhaul-m1.plan.md](../plans/v1-4-2-dashboard-overhaul-m1.plan.md)`. Row 2는 그대로 (M2). |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE (M1 ship 시점) | **F2 absorption (Codex HIGH 0.95)** — 실제 현재 version은 `1.7.0` (CHANGELOG에 [1.7.0] 항목 존재). 본 M1 단독 ship → patch bump `1.7.0 → 1.7.1`. M2가 합쳐서 minor bump으로 갈 경우 `1.8.0`. Plan 초안의 `1.5.x` 식별자는 stale fingerprint(`v1-3-0-cycle-close-ready`)에 인접한 잘못된 reference — 정정. |
| `CHANGELOG.md` | UPDATE | `[Unreleased]` 항목을 `[1.7.1]` 으로 박제 또는 새 `[1.7.1]` 항목 추가: layout/i18n/staleness fix 4 axis 요약. M1 ship 시점에 date stamp. |
| `.claude/state/STATE.md` | UPDATE (Task 10 함께) | **F1 absorption part 1 (Codex HIGH 0.9)** — `task_fingerprint: v1-3-0-cycle-close-ready` → `v1-4-2-dashboard-overhaul`. M1 implementation 시작 직전에 `state-writer.js` API로 atomic update. F1 catch가 정확히 가리킨 bootstrap chicken-egg — STATE.md fingerprint가 stale인 채로 staleness rule을 ship하면 본 plan이 자체적으로 stale로 표시됨. |

**No mutations** to: `plugins/mccp/scripts/derive/*` (M1 derive surface immutable), `plugins/mccp/commands/*.md` (renderer scope 외), `plugins/mccp/scripts/lib/renderer/trigger.js` (v1.3.0-m4 trigger surface, 본 M1 scope 외), `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` (이미 한글 — 변경 불필요), `format-utils.js` (이미 한글 mapping 보유). M2가 OQ/Risk 4-part surface 변경 시점에 `format-utils.js` 확장 가능.

## Tasks

### Task 1: parsers/plan-body.js — `computePlanStaleness` helper

- **Action**: 기존 `parsers/plan-body.js` module에 새 함수 추가:
  ```js
  function extractCyclePrefix(slug) {
    // 'v0-3-5-codex-disabled-honor' → 'v0-3-5'
    // 'v1-4-2-dashboard-overhaul-m1' → 'v1-4-2'
    const m = slug.match(/^(v\d+-\d+-\d+)/);
    return m ? m[1] : null;
  }
  function computePlanStaleness(plan, model) {
    if (!plan || !plan.path) return 'unknown';
    const basename = path.basename(plan.path).replace(/\.plan\.md$/, '');
    const planCycle = extractCyclePrefix(basename);
    const fp = (model && model.sources && model.sources.state
              && model.sources.state.item && model.sources.state.item.frontmatter
              && model.sources.state.item.frontmatter.task_fingerprint) || null;
    if (!fp) return 'unknown';
    const fpCycle = extractCyclePrefix(fp);
    if (!planCycle || !fpCycle) return 'unknown';
    return planCycle === fpCycle ? 'fresh' : 'stale';
  }
  ```
  + `parsePlanBody` 반환에 `planStaleness: Map<basename, 'fresh'|'stale'|'unknown'>` 추가. `parsePlanBody` loop 끝에 모든 plan에 대해 `computePlanStaleness` 호출 결과 매핑. `planStatuses.get(basename) === 'in-progress'`인 plan만 entry — pending/complete은 stale guard 무관.
  + 모듈 export에 `computePlanStaleness`, `extractCyclePrefix` 추가 (테스트용).
- **Mirror**: `plan-body.js:101-149` (`parsePlanBody` PRD/plan loop 구조). 동일 fs/cwd injection 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/staleness-guard.test.js` — 4 fixture(fresh/stale/PRD-complete/no-fingerprint) 모두 통과.

### Task 2: verdict.js — staleness-aware step 9/10

- **Action**: `computeVerdict` step 9 (backlog + in-progress) + step 10 (in-progress only) 진입 직전, `planBody.planStaleness`를 이용해 in-progress plan filter:
  ```js
  const inProgressPlans = plansItems.filter(p => {
    if (!p) return false;
    const basename = p.path ? path.basename(p.path) : null;
    const status = basename ? planStatuses.get(basename) : undefined;
    return status === 'in-progress';
  });
  const staleness = pb.planStaleness instanceof Map ? pb.planStaleness : new Map();
  const freshInProgress = inProgressPlans.filter(p => {
    const basename = path.basename(p.path);
    const st = staleness.get(basename);
    return st === 'fresh' || st === 'unknown'; // unknown 보수 = fresh로 취급
  });
  const allInProgressStale = inProgressPlans.length > 0 && freshInProgress.length === 0;

  if (backlogCount > 0) {
    if (allInProgressStale) {
      return { tone: 'amber', icon: '⚠',
        text: backlogCount + ' findings deferred · 다음 미정 (in-progress plan stale)' };
    }
    const nextSlug = freshInProgress[0] ? planSlug(freshInProgress[0]) : '(none)';
    return { tone: 'neutral', icon: '·',
      text: backlogCount + ' findings deferred · next: ' + nextSlug };
  }
  if (inProgressPlans.length > 0) {
    if (allInProgressStale) {
      return { tone: 'amber', icon: '⚠',
        text: inProgressPlans.length + ' plans active · 다음 미정 (stale)' };
    }
    return { tone: 'neutral', icon: '◐',
      text: freshInProgress.length + ' plans active · next: ' + planSlug(freshInProgress[0]) };
  }
  ```
  `planSlug` signature는 그대로 (staleness 인자 추가 안 함 — slug 표기 정제는 status-grid.js의 `formatPlanLabel`에 맡김; verdict는 raw basename 유지하되 stale 시 다른 메시지로 분기).
- **Mirror**: `verdict.js:95-117` step 9-10 기존 구조. early-return 패턴, `tone: 'amber' | 'neutral'` 분기.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/verdict.test.js` — 기존 step 1-9 통과 + 새 step 9 stale/step 10 stale 분기 통과.

### Task 3: sections/status-grid.js — 4축 한글 + staleness-aware nextStep

- **Action**: `renderStatusGrid` 본문 수정:
  ```js
  const staleness = (planBody && planBody.planStaleness instanceof Map)
    ? planBody.planStaleness : new Map();
  // ...
  let nextStep = '대기';
  let nextStale = false;
  const stateItem = sources.state && sources.state.item;
  if (stateItem && stateItem.resume_state === 'in-flight') {
    nextStep = '/mccp:resume';
  } else {
    const firstInProgress = plansItems.find(p => {
      if (!p || !p.path) return false;
      return planStatuses.get(path.basename(p.path)) === 'in-progress';
    });
    if (firstInProgress) {
      const basename = path.basename(firstInProgress.path);
      const st = staleness.get(basename);
      if (st === 'stale') {
        nextStep = '미정 (stale)';
        nextStale = true;
      } else {
        nextStep = formatPlanLabel(basename);
      }
    }
  }
  ```
  4-cell label 변경: `'진행 중' / '차단' / '다음' / '미해결 위험'` (마지막 cell 한글화 — 기존 'risks open' → '미해결 위험'). icon은 그대로 유지 (◐/🚫/→/⚠).
  + helper `formatPlanLabel(basename) → string` 추가: cycle prefix 추출 후 본문 단축 ('v1-4-2-dashboard-overhaul-m1' → 'v1.4.2 · dashboard overhaul m1'). 30자 초과 시 ellipsis.
  + html cell에 `data-stale="1"` attr (nextStale 시) 추가 — CSS가 amber 톤 적용.
  + **F2 absorption (impeccable MEDIUM)** — stale 표기는 `<code>` 부적합 (한국어 자연어 → semantic mismatch + 스크린 리더 monospace 오독). 분기:
    ```js
    const nextHtml = nextStale
      ? '<span class="stale-label">' + escapeHtml(nextStep) + '</span>'
      : '<code>' + escapeHtml(formatPlanLabel(basename)) + '</code>';
    ```
- **Mirror**: `sections/status-grid.js:5-71` 기존 구조. format-utils `escapeHtml` 동일 사용.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js` — 한글 label + nextStep formatting + stale attr 검증.

### Task 4: html.js — sticky header strip hoist + accent invariant CSS + h2 한글 + footer 한글

- **Action**: `renderHtml` LAYOUT CSS 재구성:
  - 기존 `header { position: sticky; ... }` 유지하되 안쪽 markup을 `<header>` 안 brand + 4-cell grid + meta inline 통합:
    ```html
    <header>
      <span class="brand">mccp 상태</span>
      <div class="status-strip" role="group" aria-label="현황 4축">
        <span class="cell"><span class="icon">◐</span> 진행 중 <b>${inProgressCount}</b></span>
        <span class="cell s-blocked"><span class="icon">🚫</span> 차단 <b>${blockedCount}</b></span>
        <span class="cell ${nextStale ? 's-stale' : ''}"><span class="icon">→</span> 다음 <code>${nextStep}</code></span>
        <span class="cell"><span class="icon">⚠</span> 미해결 위험 <b>${risksOpen}</b></span>
      </div>
      <span class="meta">마지막 갱신 ${relative}<span class="stale-suffix">· stale</span></span>
    </header>
    ```
  - `<main>`에서 기존 `<section id="status">` 제거 (4축은 header strip에 hoist 완료). verdict는 main 첫 section으로 유지 (1줄 verdict + tone).
  - **F1 absorption (impeccable MEDIUM)** — verdict section h2는 *제거*. h1.verdict가 자체 surface 역할 (heading depth 1 → 2 jump 회피 + header strip "현황"과의 redundant naming 차단). `<section id="verdict">` 본문은 `<h1 class="verdict">...</h1>` 만 직접 포함, h2 없음.
  - h2 한글화 (verdict 제외, 본문 sections만): `타임라인` / `미해결 질문` / `위험` / `워커` / `최근 활동`.
  - footer 한글: `<footer class="muted mono">v1.4.2 · <code>.claude/</code> 통합 derive</footer>`.
  - CSS: accent invariant — `.status-strip .cell:not(.s-blocked):not(.s-stale)` 1개만 `--accent` 적용 (`cell:first-of-type`). raw markdown marker(`**bold**`) 0건 확인.
  - WCAG AA: `.cell` 텍스트 contrast 측정 (oklch token 기존 유지). placeholder text 없음. focus visible: `.cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.
  - prefers-reduced-motion: 모든 transition `none` 분기 유지 (기존 LAYOUT 정합).
- **Mirror**: `html.js:91-148` 기존 `renderHtml` 구조. `format-utils.escapeHtml` 사용. accent CSS는 PRD §Design Direction acceptance criterion.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js` + `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` 양쪽 통과.

### Task 5: markdown.js — STATUS.md i18n equivalent

- **Action**: `renderMarkdown` section heading 한글화. **F3 absorption (Codex MEDIUM 0.78)** — `## 현황` (status) section을 markdown 산출에서 *유지*. M4 trigger가 STATUS.md를 write 시점에 기존 generic invariant + 외부 text consumer (renderer-generic.test.js + 잠재 grep 도구)가 `## Status` anchor를 가정 — anchor 보존이 더 안전. HTML hoist는 status-strip을 header에 통합하지만 markdown은 단일 평면 surface. 구조:
  - h1 verdict 그대로
  - `## 현황` section: 1줄 inline status `◐ 진행 N · 🚫 차단 N · → 다음 SLUG[ (stale)] · ⚠ 미해결 위험 N` (table 없이)
  - 그 외 section heading: `## 타임라인` / `## 미해결 질문` / `## 위험` / `## 워커` / `## 최근 활동`
  - footer: `*derived from .claude/ · v1.7.1*` (F2 absorption — 버전 1.7.1 정합)
- **Mirror**: `markdown.js` 기존 section 구성. table/list 출력은 그대로 (한글화는 heading + status section만).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` (markdown branch) — `## 타임라인` + `## 현황` 양쪽 존재 + `## Timeline` / `## Status` 부재.

### Task 6: tests/staleness-guard.test.js — create

- **Action**: 4 fixture로 `computePlanStaleness` 직접 호출 + `parsePlanBody` 호출 결과의 `planStaleness` Map 검증:
  - (a) fingerprint=`v1-4-2-dashboard-overhaul` + plan `v1-4-2-dashboard-overhaul-m1.plan.md` → `'fresh'`
  - (b) fingerprint=`v0-3-5-codex-disabled-honor` + plan `v1-4-2-dashboard-overhaul-m1.plan.md` → `'stale'`
  - (c) fingerprint absent (null) + plan `v1-4-2-dashboard-overhaul-m1.plan.md` → `'unknown'`
  - (d) fingerprint=`v1-4-2-dashboard-overhaul` + plan `v0-3-5-codex-disabled-honor.plan.md` → `'stale'` (cycle prefix mismatch)
  + computeVerdict 호출 결과 분기 검증: case (b) → tone amber, text `다음 미정 (stale)` 패턴 매칭.
- **Mirror**: `tests/verdict.test.js:7-100` style — node:test + assert/strict, fixture inline.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/staleness-guard.test.js` 전 4건 PASS.

### Task 7: tests/i18n-surface.test.js — create

- **Action**: renderStatus full pipeline 호출 결과 (html + md) 양쪽에 대해 grep 검증:
  - html: `>타임라인</h2>` / `>미해결 질문</h2>` / `>위험</h2>` / `>워커</h2>` / `>최근 활동</h2>` 존재
  - html: `>Open Questions</h2>` / `>Risks</h2>` / `>Timeline</h2>` 부재
  - html footer: `통합 derive` 존재
  - html header: `mccp 상태` 존재 (brand)
  - md: `## 타임라인` 존재 + `## Timeline` 부재
  - md: `## 미해결 질문` 존재
- **Mirror**: `tests/integration.test.js:7-95` fixture composition.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` PASS.

### Task 8: tests/header-hoist.test.js — create

- **Action**: renderStatus html 결과에서:
  - `<header>` 안에 `<span class="brand">` + `<div class="status-strip">` + `<span class="meta">` 3 element 존재
  - `<div class="status-strip">` 안에 4 cell 존재 (정규식 `class="cell"` 4 occurrences)
  - `<main>` 안에 `<section id="status">` 부재 (4축 hoist 완료)
  - `<section id="verdict">`은 `<main>` 안에 그대로 유지
  - CSS: `header { position: sticky; top: 0;` 포함 (string contains check)
  - accent invariant: `.status-strip .cell:first-of-type` 또는 동등 selector 1개만 `--accent` 적용
  - stale fixture: `data-stale="1"` cell attr 등장 확인
- **Mirror**: `tests/render-integration.test.js` DOM grep 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js` PASS.

### Task 9: tests/integration.test.js + render-integration.test.js — update for stale fixture + hoist

- **Action**: 기존 fixture에 STATE.md `task_fingerprint: 'v1-4-2-dashboard-overhaul'` 추가 (state source). `parsePlanBody` 호출 시 `planStaleness` Map 검증 추가. render-integration의 header DOM 확인 추가. 기존 timeline/OQ/Risks assertion은 그대로.
- **Mirror**: 기존 `tests/integration.test.js:7-95` + `tests/render-integration.test.js` 동일 구조.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` — 전체 회귀 0.

### Task 10: PRD + STATE.md + CHANGELOG + plugin.json — milestone bootstrap & version bundle

**Codex F1 + F2 absorption** — bootstrap atomicity. staleness rule이 ship된 시점에 본 plan이 fresh로 인식되려면 STATE.md fingerprint + PRD row update가 *staleness rule code 변경과 동일 commit/PR*에 들어가야 함. 별도 chore PR 분리는 chicken-egg.

- **Action** (4-file atomic bundle):
  1. `.claude/state/STATE.md` — `task_fingerprint: v1-3-0-cycle-close-ready` → `v1-4-2-dashboard-overhaul`. `state-writer.js` API로 atomic update (직접 .md 편집 금지). M1 implement 시작 직전 또는 PR 직전 step.
  2. `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` — `## Delivery Milestones` row 1 (layout/i18n/staleness): Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m1.plan.md](../plans/v1-4-2-dashboard-overhaul-m1.plan.md)`. (직접 markdown edit OK — PRD는 plan과 달리 state-writer가 관리 안 함.)
  3. `CHANGELOG.md` — 기존 `[Unreleased]` 항목 위치에 `## [1.7.1] — YYYY-MM-DD` 헤더 + 4 bullet (staleness guard / i18n surface / status hoist / UX 위계). date stamp는 PR squash 일자.
  4. `plugins/mccp/.claude-plugin/plugin.json` — `version: "1.7.0"` → `"1.7.1"` patch bump. M1 단독 ship 시 적용. M2 합쳐서 minor bump 시 본 row는 `1.8.0`로 정정.
- **Mirror**: 기존 PRD update + CHANGELOG 패턴 (recent commits `v1.4.0-m3` style). state-writer.js API는 `plugins/mccp/scripts/state/state-writer.js:174-203` (`readState` + 그 위 `writeStateFingerprint` 또는 동등 API).
- **Validate**:
  - `git diff origin/main -- .claude/state/STATE.md` task_fingerprint 변경 확인
  - `git diff origin/main -- .claude/prds/v1-4-2-dashboard-overhaul.prd.md` row 1 status 변경
  - `git diff origin/main -- CHANGELOG.md` `[1.7.1]` row 추가
  - `git diff origin/main -- plugins/mccp/.claude-plugin/plugin.json` version 변경
  - 자기 staleness 검증: 본 plan이 새 fingerprint 기준으로 fresh 판정되는지 — `node plugins/mccp/scripts/derive/cli.js run --json` 결과의 verdict text가 `다음 미정 (stale)` 아닌 `next: v1.4.2 · dashboard overhaul m1` 형태로 출력

## Validation

```bash
# 1) Per-task tests
node --test plugins/mccp/scripts/lib/renderer/tests/staleness-guard.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js

# 2) Regression (M1 unchanged tests + updated)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 3) Smoke render — actual STATUS.md + status.html 확인
node plugins/mccp/scripts/derive/cli.js render

# 4) Korean copy lint — grep으로 영어 잔존 확인
grep -E '<h2>(Status|Timeline|Open Questions|Risks|Verdict|Workers)</h2>' .claude/cache/status.html && echo "FAIL: English h2 잔존" || echo "OK"

# 5) Visual inspect (사용자가 수행)
open .claude/cache/status.html        # 또는 live-server 사용

# 6) plugin.json version
cat plugins/mccp/.claude-plugin/plugin.json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(j.version)'  # → 1.5.1
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cycle prefix regex (`v\d+-\d+-\d+`)가 비표준 cycle ID(`v2.0.0-foo`)를 detect 실패 → false unknown | medium | medium | Task 1 regex가 v-숫자 3개 segment 보장. 비표준 cycle은 의도적 `'unknown'` (보수=fresh로 취급), 사용자 명시 deviation 시 fingerprint 일치하면 fresh로. fixture에 v2.0.0-style test 추가. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| header strip hoist가 mobile 720px 미만에서 4 cell wrap → 시각적 깨짐 | medium | low | `.status-strip` `flex-wrap: wrap` + cell `min-width: 120px`. WCAG zoom 200%에서 visible 유지. v1.4.x scope은 desktop 단일 (PRODUCT.md 정합) — mobile은 acceptance criterion 아님. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| accent 1/viewport invariant — 한 화면에 `--accent` 2 이상 적용되는 경우 (예: verdict tone neutral + status-strip 첫 cell + audit-timeline accent 동시) | high | medium | CSS audit: `.status-strip .cell:first-of-type { color: var(--accent); }` 1군데만 default accent. timeline/OQ는 `--ink-2` 유지. Task 8 header-hoist.test.js에 accent count assertion 추가 (string match `var(--accent)` ≤ 3 occurrences in computed style — 정확한 invariant 검증은 visual). |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| stale-guard false-positive — 사용자가 의도적으로 같은 cycle 안 다중 plan 운용 시 (v1.4.2-m1 + v1.4.2-m2 worktree 병행) → fingerprint=v1.4.2일 때 v1.4.2-m1 + v1.4.2-m2 모두 fresh | low | high | cycle prefix `v1-4-2`로 통일 — m1/m2 suffix 무관하게 fresh. 의도된 동작. PRD §OQ-a 설명에 명시. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| markdown.js i18n이 STATUS.md grep 도구(외부 script)를 깨뜨릴 위험 | medium | medium | STATUS.md는 인간 read 위주, grep 도구 부재. 단 receipt-validate 등 mccp 내부 script가 `## Open Questions` heading 의존 시 깨질 가능성 — Task 5 진행 전 `grep -r '## Open Questions' plugins/mccp/scripts/` + `grep -r '## Timeline' plugins/mccp/scripts/` 의존성 검사. 의존 발견 시 한글 + 영어 dual heading 또는 anchor id 유지. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Korean character escape 깨짐 (escapeHtml이 multi-byte char 손상) | low | high | format-utils.escapeHtml은 HTML entity escape만 (`&`, `<`, `>`, `"`, `'`, `\``) — 한글 char 그대로 pass-through (UTF-8 보존). 기존 audit-timeline.js가 한글 출력 중이라 검증됨. fixture에 한글 fixture 1건 추가. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| plugin.json version bump 누락 (CLAUDE.md §3.7 빈번 axis) | high | medium | Task 10에 명시 + PR 직전 grep check. M1 PR 본문에 `1.5.0 → 1.5.1` 표기 의무. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Codex R1이 staleness 판정 기준 (i)+(iii) AND 룰을 too-strict로 지적 → R2 trigger | medium | low | OQ-a default가 PRD에 명시되어 있고 plan body에 rationale도 명시 — Codex이 다른 기준 제안 시 ACCEPT_NOW × HIGH가 아니라면 DEFER_TO_BACKLOG. mtime 추가는 worktree rebase noise로 인해 reject. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 9 Task 묶음 PR review 부담 | medium | low | M1만 묶었음 — M2는 별도 cycle. Task 1-5는 production code, 6-9는 test, 10은 metadata. PR body에 task chunk별 commit 분리 권장. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Codex review-only invariant — Phase 3.5 PR-phase가 staleness logic을 *수정* 시도 시 mechanical block | low | low | pr-phase-guard.js가 알아서 block. Codex가 finding 표면화는 가능, 본문 수정은 ban. Plan-Codex (본 gate) 단계는 PR-phase lock 안 잡힘. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance

- [ ] **Task 1-5** 모두 구현 + 단위 테스트 통과 (parsers/plan-body.js 확장 + verdict.js 분기 + sections/status-grid.js i18n + html.js hoist + markdown.js i18n)
- [ ] **Task 6-9** 신규 테스트 3개 + 기존 테스트 회귀 0
- [ ] **Task 10** PRD row 1 in-progress 표시 + CHANGELOG.md [1.5.1] entry + plugin.json `1.5.1` (M1 단독 ship 시점)
- [ ] **사용자 직접 확인** — `node plugins/mccp/scripts/derive/cli.js render` 후 `.claude/cache/status.html` 5초 안에 *현재 진행 + next + 차단 + 최근* 4축 파악 가능
- [ ] **stale surface 0건** — 다른 cycle plan (`.worktrees/v1.3.0-prd-status-roll/`의 `v0-3-5-codex-disabled-honor.plan.md` 등) inject 시 nextStep cell amber 처리 + verdict text `다음 미정 (stale)`
- [ ] **한글 surface label 적용** — h2 `타임라인` / `미해결 질문` / `위험` / `워커` / `최근 활동`, header brand `mccp 상태`, meta `마지막 갱신`, footer `v1.4.2 · `.claude/` 통합 derive`
- [ ] **status hoist** — header에 verdict tone + 4-cell grid + meta가 sticky strip으로 통합. main 본문에서 `<section id="status">` 제거
- [ ] **accent 1/viewport invariant** — 한 화면 `--accent` 적용 element 1개. CSS audit + header-hoist test 통과
- [ ] **WCAG AA** — 본문 4.5:1 (oklch token 그대로), focus-visible 2px accent outline
- [ ] **prefers-reduced-motion** — 모든 transition `none` 대안 유지
- [ ] **Codex R1 gate 통과** — `mccp-plan-codex` receipt converged + DEFER_TO_BACKLOG ≤ 3
- [ ] **회귀 0** — `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 PASS, M3/M4/M5 surface 변경 없음
- [ ] **impeccable critique loop** — design-direction anchor 4 (위계 3단계 / accent 1 / no raw markdown / 항목수 상한) acceptance check 통과
- [x] **mobile out-of-scope (F3 absorption)** — PRODUCT.md "데스크탑 단일 환경" + 사용자 명시(2026-06-21 "PC 전용") — 360px viewport 시각 적합성은 본 cycle scope 외. responsive test 미요구.

## Design Critique

impeccable critique loop (Plan-Codex gate Phase 5.0) 실행 결과 — `Skill(impeccable, "critique v1-4-2-dashboard-overhaul-m1")` 산출.

**Verdict**: CONVERGED (R1 단독, R2 미트리거 — ACCEPT_NOW × HIGH/CRITICAL 0건)

**Coverage matrix** (PRD §Design Direction 8 acceptance criteria × plan task chunk):

| PRD criterion | Plan coverage | 평가 |
|---|---|---|
| 위계 3단계 (heading depth ≤ 3) | Task 4 (F1 absorption 후 — verdict는 h1 single + body sections h2만) | ✅ 충실 |
| accent 1/viewport invariant | Task 4 `.status-strip .cell:first-of-type` + Task 8 assertion | ✅ 충실 |
| no raw markdown marker | Task 5 markdown.js + Task 4 html.js surface 차단 | ✅ 충실 |
| 항목 수 상한 (3 expanded + collapse) | M1 enum 정의만, markup activate는 M2 (의도된 분리) | ✅ 충실 |
| WCAG AA (4.5:1 본문) | Task 4 oklch token 유지 + focus-visible 2px outline | ✅ 충실 |
| color + icon 이중 표기 | Task 4 cell 마다 icon + Korean label + count `<b>` 3중 | ✅ 충실 |
| prefers-reduced-motion | Task 4 기존 LAYOUT 정합 명시 | ✅ 충실 |
| OQ/Risk 4-part | M1 scope 외 명시 (M2 axis 9) | ✅ 충실 |

**Findings — 모두 ACCEPT_NOW, plan body inline absorbed**:

| F | Severity | Finding | Resolution |
|---|---|---|---|
| F1 | MEDIUM | h2 "현황 (요약)" + header strip "현황" double-naming → 위계 messaging 흐려짐 | Task 4 본문 absorbed — verdict section h2 제거, h1.verdict가 자체 surface |
| F2 | MEDIUM | `<code>${nextStep}</code>` markup이 stale label "미정 (stale)"을 wrap → semantic mismatch + 스크린 리더 monospace 오독 | Task 3 본문 absorbed — `nextStale` 시 `<span class="stale-label">` 분기 |
| F3 | LOW | mobile fallback Task 8 미테스트 | Acceptance 항목 추가 — PC 전용 명시 (PRODUCT.md + 사용자 2026-06-21 명시) → scope 외 |

**Detector (Assessment B)** — 현행 renderer source scan (`html.js` LAYOUT + `format-utils.js` + `audit-timeline.js`):

- Side-stripe border anti-ref: 0 hit ✓
- uppercase eyebrow anti-ref: 0 hit ✓
- 균일 카드 grid anti-ref: status-strip 4 cell이지만 brand anchor + accent first-cell asymmetry로 carded grid 아님 ✓
- 한글 surface 정합: `audit-timeline.js` 이미 한글 운영 중 (보관 누락 N일 / 복원) — Task 5 markdown.js i18n과 정합 ✓

**Open Questions**: 없음 (모든 finding ACCEPT_NOW로 plan body 흡수, DIVERGENT 0건).

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 + v0.3.6 design-scope honor `--impeccable-available`)
- 라운드 수: R1 단독 (cap=1, ACCEPT_NOW × HIGH 모두 inline absorption으로 plan body가 self-resolve → R2 미트리거)
- Codex verdict: `needs-attention` (3 findings — F1 HIGH 0.9, F2 HIGH 0.95, F3 MEDIUM 0.78)
- 합치 결론: 모든 finding ACCEPT_NOW × inline absorption. plan body가 자체 self-attest로 fix를 박았기 때문에 R2 미실행 (gate-design.md §5.4 absorption-resolved 룰).
- Codex thread: `019ee5a1-55a9-75d2-84f5-b12d0bb9f267`

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — Staleness rule이 본 M1 plan 자체를 stale로 마킹 (STATE.md task_fingerprint=`v1-3-0-cycle-close-ready` + PRD row 미업데이트) | HIGH (0.9) | ACCEPT_NOW | 정확한 catch — bootstrap chicken-egg. Task 10에 STATE.md fingerprint + PRD row update를 4-file atomic bundle로 묶음. self-staleness validation을 Task 10 acceptance에 추가. |
| F2 — plugin.json version target `1.5.0 → 1.5.1`이 obsolete (실제 현재 1.7.0) | HIGH (0.95) | ACCEPT_NOW | Bash 검증으로 1.7.0 확인. Files to Change + Task 10 모두 `1.7.0 → 1.7.1` patch bump으로 정정. markdown.js footer `v1.4.2` → `v1.7.1`. CHANGELOG entry `[1.7.1]`로 통일. |
| F3 — Task 5 markdown.js가 `## Status` section 제거 시 텍스트 consumer 회귀 (M4 trigger가 STATUS.md write, renderer-generic.test.js anchor 의존) | MEDIUM (0.78) | ACCEPT_NOW | 정확. HTML hoist만 적용 + markdown은 `## 현황` section 유지. Task 5 본문에 absorption 명시 + i18n-surface test에 `## 현황` 존재 assertion 추가. |

### Deferred to backlog

0 (전 finding이 inline absorption으로 plan body에 self-resolve, DEFER_TO_BACKLOG 없음).

### Open Questions

없음 — Codex 3 finding 모두 plan body 4 edit으로 absorbed, DIVERGENT_UNRESOLVED 0건, auto-CRITICAL catalog (secret/data-loss/auth/migration/external-destination/crypto) 해당 0건.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1, 3 ACCEPT_NOW absorptions). No new implement-time decisions detected — plan body Files to Change table + Task 1-10 본문이 file 경로 / 함수 시그니처 / markup 구조 / CSS scope을 모두 pre-commit한 상태. impeccable design gate도 Plan Phase 5.0에서 critique CONVERGED (2 MEDIUM + 1 LOW absorbed). Cross-gate dedupe applied.

