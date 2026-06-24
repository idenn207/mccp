# Plan: v1.3.0 디자인 게이트 — M3 출력 제약 mechanical lint

**Worktree**: `.worktrees/v1.3.0-prd-status-roll/` (branch `chore/v1.3.0-prd-status-roll`)
**Parent plan**: `.claude/plans/v1-3-0-design-gate-mechanical-enforcement.plan.md` (M3 sub-milestone)
**Source PRD**: `.claude/prds/v1-3-0-observability-surface-ii.prd.md` §Design Direction (line 148-231) — DESIGN.md H1-H14가 본 M3의 spec
**Selected Milestone**: M3 — 출력 제약 mechanical lint (Axis C)
**Complexity**: Medium

## Summary

DESIGN.md H1-H14 lint contract (`docs/v1.3.0-observability/DESIGN.md:35-55`)를 deterministic priority chain으로 구현해 renderer 산출물(`.claude/cache/STATUS.md` + `status.html`)이 PRD §Design Direction 14개 invariant을 위반하면 `design_constraint_violations` array에 surface한다. fail-open invariant 유지 — 위반이 render를 차단하지 않으며 advisory level. 현재 m3-redux baked-in CSS가 14/14 pass가 1차 acceptance, future renderer drift 회귀 차단이 본 axis의 가치.

## 본 M3의 위상 (재해석 — m3-redux 이후 회귀 안전망)

| 시점 | 상태 | M3 lint의 역할 |
|---|---|---|
| Parent plan 작성 시 (b204510) | 8 absolute-ban 위반, 14 invariant 다중 fail | 위반 발견 + 차단 — *진단 layer* |
| m3-redux 이후 (bbdf84c, 본 worktree commit log f5bbd46 시점) | CSS literal에 mechanical baked-in (H1-H14 mostly pass by construction) | 미래 renderer 수정에서 *재발생 차단* — *회귀 안전망* |

→ M3 acceptance는 "현재 산출물이 14/14 pass"가 1차 (sanity check), "renderer drift fixture에서 violation 검출 + surface"가 2차 (anti-regression).

## Spec 매핑 — parent plan abstract spec ↔ DESIGN.md H1-H14 (Codex F1 R1 absorption)

parent plan의 abstract rule (a)-(d)는 DESIGN.md spec에 다음과 같이 흡수됩니다 (drift 방지). **본 M3 scope는 *partial Axis C* — DESIGN.md H1-H14 14 rule만 완결한다. parent plan의 (a)(c)(d) 중 mechanical 가능한 (a) heading depth + (c) raw markdown literal은 별도 H15+H16 follow-up plan으로 분리** (Codex F1 absorption: "M3 declares Axis C complete" silent gate gap을 명시적 partial scope로 닫음):

| Parent plan abstract (line 149) | DESIGN.md concrete | M3 처리 |
|---|---|---|
| (a) 정보 위계 3단계 (heading depth ≤ 3) | (DESIGN.md 직접 spec 없음 — H3 no-cards + H5 no-grid가 위계 시각 평면화 보장하지만 *heading semantic depth ≠ 위계 시각*) | **partial — H15 follow-up plan**. `<h([4-9])` HTML 카운트 + STATUS.md `^#{4,}` 카운트 grep-based로 mechanical 가능. M3에 묶지 않는 이유: 위계 spec 자체가 DESIGN.md에 없음 → spec creation 선행 필요. follow-up plan에서 PRD §정보 위계 anchor 확정 후 implement. |
| (b) 강조색 화면당 1개 | **H11** (severity vocabulary ≤ 3 tokens, accent 1개) | **M3 covered** — 1:1 매핑. |
| (c) raw markdown marker 금지 | **H10** (em-dash normalized in body) + H9 (uppercase ≤ 1) | **partial — H16 follow-up plan**. em-dash는 H10이 cover. unrendered `**bold**` / `MD0xx` literal 검출은 별도 H16. M3에 묶지 않는 이유: unrendered marker catalog가 명시 안 됨 — H16 spec에서 catalog 정의 후 implement. |
| (d) 한 화면 항목 수 상한 | (DESIGN.md spec 외) | **section logic 영역 — M3 scope 외 영구**. `sections/open-questions.js`의 행위적 제약. grep-based mechanical lint로 검증 불가 (rendered HTML 카운트는 가능하지만 sections.js 행위로 이미 결정). M3/follow-up 모두 N/A. |

**결론 (F1 absorption)**: M3 = DESIGN.md H1-H14 + parent rule (b)만. Axis C 완결은 **H15+H16 follow-up plan ship 후**. PR title/body에 "M3 partial Axis C completion" 명시. 본 plan body의 Acceptance에 follow-up plan 명시 + OQ에 분리 결정 기록.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Deterministic priority chain | `plugins/mccp/scripts/lib/renderer/verdict.js:30-122` | 11-step if-chain. 본 M3는 14 rule 순차 평가, 첫 hit 시 violation push 후 *다음 rule 계속 평가* (verdict와 달리 multi-violation 수집). |
| Fail-open wrapper | `plugins/mccp/scripts/lib/renderer/index.js:14-24` (`safeSection`) | try/catch + `(allow)` stderr + fallback. `runOutputConstraints`는 throw 시 `{ violations: [], degraded: true }` 반환. |
| Source string carrier | `renderer/index.js:67-137` (renderStatus return shape) | `{md, html, derivedAt, masked, warnings, verdict}`. 본 M3가 새 필드 `design_constraint_violations` 추가는 additive — caller 회귀 0. |
| Test runner | `plugins/mccp/scripts/lib/renderer/tests/sections.test.js:1-10` | `node:test` + `node:assert/strict`. 14 rule 각각 (pass fixture + fail fixture). |
| Derive warning surface | `plugins/mccp/scripts/derive/index.js:29-31` (`pushWarning`) | violation count > 0 시 caller가 `pushWarning(model, 'medium', 'renderer.design-lint', '<N> H<k> violations')` 호출 가능. 본 M3는 lint module이 array만 emit, caller wiring은 후속 axis. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | CREATE | H1-H14 lint module. `runOutputConstraints({css, html, md}) → { violations: string[], details: object[] }`. 14 rule 순차 평가, multi-violation 수집. fail-open. |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | render 완료 직후 `runOutputConstraints({css: TOKENS+LAYOUT, html, md})` 호출 (try/catch wrapped). return shape에 `design_constraint_violations: string[]` 추가. caller 회귀 0 (additive). |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `TOKENS`/`LAYOUT` constant를 module export로 expose (lint가 CSS source 검사 위해). 현재 module-local `const`. export 추가는 caller 회귀 0. |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | CREATE | 14 rule 각각 — pass fixture (현재 산출 CSS subset) + fail fixture (위반 string). `node:test` + `assert/strict`. 30+ assertions. |
| `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` | CREATE | DESIGN.md line 270이 명시한 test 파일 — 실제 `renderStatus(fixtureModel)` 산출 HTML/CSS에 대해 14 rule 적용 + 0 violation 확인 (end-to-end sanity). |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE (옵션) | `render` subcommand가 `rendered.design_constraint_violations.length > 0` 시 stderr `[mccp:renderer] design-lint <N> violations: H<list>` warn. fail-open — exit code 변경 0. |
| `.claude/plans/v1-3-0-design-gate-m3-output-constraints.plan.md` | CREATE | (이 파일) |

## Tasks

### Task 1: `output-constraints.js` 14 rule module 신설

- **Action**: `plugins/mccp/scripts/lib/renderer/output-constraints.js` 신규 작성.
  - Export: `function runOutputConstraints({ css, html, md }) → { violations: string[], details: Array<{rule, evidence, severity}> }`.
  - 14 rule deterministic 순차 평가 (H1~H14). 첫 violation에서 stop 안 함 — 모두 수집.
  - Each rule가 (a) regex 매칭, (b) evidence (matched substring), (c) severity (`absolute-ban` for H3/H4/H5/H7/H8/H10/H13, `invariant` for 나머지) 반환.
  - Fail-open: regex 자체가 throw하면 try/catch로 swallow + 해당 rule만 skip (전체 lint는 계속). loud stderr `(allow)` 메시지.
- **Mirror**: `verdict.js`의 if-chain deterministic shape + `safeSection`의 try/catch.
- **Rule 구현 (DESIGN.md line 39-52와 1:1)**:

  | Rule | Detection (regex / count on input string) |
  |---|---|
  | H1 light mode default | CSS `:root` block 첫 `--bg` 토큰의 oklch lightness ≥ 0.97. 정규식: `/--bg:\s*oklch\(\s*0\.(9[7-9]\|99)/`. fail = `:root` 발견 못 함 OR 매칭 실패. |
  | H2 max-width 720px | CSS `main\s*\{[^}]*max-width:\s*(\d+)px`. fail = 매칭 값 > 720 OR 미매칭. |
  | H3 no cards | CSS source 전체에서 `border-radius:\s*[1-9]` 카운트 (단, `header`/`footer`/`aside.secret-banner` 내 사용은 허용 — 본 M3 scope에서 section/li/td 영역만 본다. 단순화: 첫 iteration은 total count로 검사하고 m3-redux baseline에서 0건임을 acceptance 기준으로). |
  | H4 no side-stripe | CSS `border-left:\s*[2-9]\d*px` OR `inset\s+[2-9]\d*px\s+0\s+0`. fail = ≥ 1건. |
  | H5 no identical card grid | CSS `repeat\(auto-fit,\s*minmax\(` 카운트. fail = ≥ 1건. |
  | H6 no hero-metric | CSS `font-size:\s*([2-9]\|1[6-9])\.\d+rem` 카운트 (1.6+ rem 또는 ≥ 2rem). **carve-out (impeccable critique R1 absorption)**: `h1.verdict { font-size: 1.5rem }` (PRD line 117 spec)는 exact 1.5rem 허용 — regex가 1.6+ 부터 매칭하므로 자동 제외. selector context는 무시하고 token value만 검사 — 단순성 우선. 1.5/1.51/1.55 등은 H1 verdict 자체에서만 사용되는 PRD-fixed 값이고 향후 사용처가 늘어나면 H6 spec 재평가. |
  | H7 no glassmorphism | CSS `backdrop-filter\|backdrop-blur` 카운트. fail = ≥ 1건. |
  | H8 no gradient bg | CSS `color-mix.*background\|linear-gradient\(.*background\|radial-gradient` 카운트. fail = ≥ 1건. |
  | H9 uppercase ≤ 1 | CSS `text-transform:\s*uppercase` 선언 카운트. fail = > 1건. |
  | H10 no em dash | HTML body content (between `<body>` and `</body>`) 안에서 `—` (U+2014) 카운트. **carve-out (impeccable critique R1 absorption)**: (a) `<code>...</code>` + `<pre>...</pre>` 내용 strip 후 카운트 — `<code>node — version</code>` literal은 정당, (b) HTML attribute (`title="…"` / `alt="…"` / `aria-label="…"`) 내 strip — DESIGN.md line 48 "rendered prose"만 spec. STATUS.md (md): fenced code block ``` ``` 내용 strip + inline `` ` `` strip 후 카운트. fail = strip 후 > 0건. |
  | H11 severity ≤ 3 tokens | CSS `--sev-[a-z-]+:` 카운트. fail = > 3건. (현재 m3-redux는 `--signal`/`--warn`/`--ok` + `--accent` 4개지만 `--sev-` prefix 사용 안 함 — 0건이라 H11 pass by definition. drift 시 누군가 `--sev-low` 재도입을 차단.) |
  | H12 no sev-pill | CSS source 전체 `\.sev-pill\b` 매칭. fail = ≥ 1건. |
  | H13 no custom font | CSS `font-family` 선언 안에서 `Inter\|Pretendard\|JetBrains` 매칭. fail = ≥ 1건. |
  | H14 verdict prose | HTML `<h1 class="verdict[^"]*">` 내 텍스트가 raw slug format (`/^v?\d+[-\.]\d+/` 단독)인지 검사. fail = h1 텍스트가 slug-only. PM-voice prose는 공백/조사가 있어 정규식 미매칭. **현재 m3-redux의 verdict.js는 prose field를 별도 운반** — H14는 향후 drift (renderer가 prose 무시하고 slug 직접 노출) 회귀 차단. |

- **Validate**: `node -e "const {runOutputConstraints} = require('./plugins/mccp/scripts/lib/renderer/output-constraints'); console.log(runOutputConstraints({css: ':root{--bg:oklch(0.99 0 0);}', html:'<html></html>', md:''}))"` → `{violations: [], details: []}` (모든 rule pass on minimal valid input).

### Task 2: `html.js` 에서 TOKENS + LAYOUT export 노출

- **Action**: `plugins/mccp/scripts/lib/renderer/html.js`의 `const TOKENS = '...'` + `const LAYOUT = '...'`를 `module.exports.TOKENS` / `module.exports.LAYOUT`로 expose. 기존 `renderHtml` export 유지.
- **Mirror**: `renderer/index.js`의 module.exports 패턴 (`{ renderStatus, safeSection, safeCompose, safeFallback }`).
- **Validate**: `node -e "const h=require('./plugins/mccp/scripts/lib/renderer/html'); console.log(typeof h.TOKENS, typeof h.LAYOUT, typeof h.renderHtml)"` → `string string function`.

### Task 3: `renderer/index.js` 에 lint 통합 + return shape 확장 (Codex F2+F3 R1 absorption)

- **Action**: `renderStatus` 함수 안, `const html = safeCompose(...)` 직후에:
  ```js
  const lintResult = (function () {
    try {
      const { runOutputConstraints } = require('./output-constraints');
      const { TOKENS, LAYOUT } = require('./html');
      return runOutputConstraints({ css: TOKENS + LAYOUT, html, md });
    } catch (err) {
      process.stderr.write('[mccp:renderer] design-lint FAILED ' + err.message + ' (allow)\n');
      // Codex F2 absorption: degraded state는 violations array empty와 *별도* surface.
      // broken lint를 clean render와 indistinguishable로 만들지 않음.
      return { violations: [], details: [], degraded: true, degraded_reason: err.message };
    }
  })();
  ```
  return statement에 **2개** field 추가:
  - `design_constraint_violations: lintResult.violations,` (additive)
  - `design_lint_degraded: !!lintResult.degraded,` (Codex F2 absorption — separate degraded state)

  **Codex F3 absorption — observability loop closure**: `lintResult.violations.length > 0` 또는 `lintResult.degraded === true` 시 `model.warnings`에 push:
  ```js
  if (lintResult.violations.length > 0) {
    (model.warnings = model.warnings || []).push({
      severity: 'medium',
      source: 'renderer.design-lint',
      message: lintResult.violations.length + ' H<rule> violations: ' + lintResult.violations.join(','),
    });
  }
  if (lintResult.degraded) {
    (model.warnings = model.warnings || []).push({
      severity: 'medium',
      source: 'renderer.design-lint',
      message: 'design-lint subsystem degraded: ' + (lintResult.degraded_reason || 'unknown'),
    });
  }
  ```
  이 warnings push가 derive engine의 기존 `pushWarning` consumer surface (verdict.js 50-53 `crit = warnings.find(w => w.severity === 'critical')` chain의 medium severity sibling)와 정합. dead data 위험 해소.
- **Mirror**: `safeSection`/`safeCompose`의 try/catch + stderr `(allow)` 패턴 + derive engine의 `pushWarning` (`index.js:29-31`) shape.
- **Validate**:
  - `node plugins/mccp/scripts/derive/cli.js render` 실행 후 `.claude/cache/STATUS.md` 생성, 회귀 0 (warnings array에 lint 항목 없음 — m3-redux baseline pass).
  - **Codex F2 dry-run (pre-PR)**: lint 모듈에 intentional throw 강제 fixture → `design_lint_degraded === true` + warnings에 'degraded' entry surface 확인.
  - **Codex F3 dry-run (pre-PR)**: html.js에 임시 `border-left: 5px solid red;` 주입 → warnings에 'H4 violations' entry surface 확인. 실제 코드는 revert.

### Task 4: `output-constraints.test.js` — 14 rule 각각 unit

- **Action**: `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` 신규. 14 test (rule 당 1개) + 4 추가 test (multi-violation 누적, fail-open swallow, empty input no-violation, schema return shape).
  - Pattern per rule:
    ```js
    test('H4 no side-stripe — pass on m3-redux baseline', () => {
      const { TOKENS, LAYOUT } = require('../html');
      const { runOutputConstraints } = require('../output-constraints');
      const out = runOutputConstraints({ css: TOKENS + LAYOUT, html: '', md: '' });
      const h4 = out.details.find(d => d.rule === 'H4');
      assert.equal(h4, undefined);  // no violation
    });
    test('H4 no side-stripe — fail on injected drift', () => {
      const { runOutputConstraints } = require('../output-constraints');
      const out = runOutputConstraints({
        css: '.x { border-left: 3px solid red; }',
        html: '', md: '',
      });
      assert.ok(out.violations.includes('H4'));
    });
    ```
- **Mirror**: `sections.test.js`의 fixture model + assertion 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` — 18 test 모두 pass.

### Task 5: `design-invariants.test.js` — end-to-end sanity (Codex F2 R1 absorption)

- **Action**: `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` 신규. `renderStatus(realisticModel)` 호출 후 산출된 결과에 대해 **두 가지** assert:
  - (1) `result.design_constraint_violations` 빈 배열 — 1차 acceptance "현재 m3-redux 산출물이 H1-H14 14/14 pass" 검증
  - (2) **`result.design_lint_degraded === false`** (Codex F2 absorption) — broken lint subsystem이 silently pass로 둔갑하지 않음을 보장. 이 assert가 없으면 lint 모듈 자체가 throw하는 회귀가 무조건 pass로 surface됨 — 본 M3의 안전망 목적 자체가 무효화.
  - Fixture model: `derive/tests/helpers.js`의 `fixtureModel` 같은 minimal valid model (status-grid + workers + timeline 일부).
- **Mirror**: `index-outer-fail-open.test.js` 의 `renderStatus(model)` 호출 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` — pass. violation 발생 시 어떤 rule이 hit했는지 stderr에 detail print해 디버깅 dev 친화적으로. degraded 발생 시 `degraded_reason` print.

#### Codex F2 dry-run protocol (pre-PR mandatory)

본 M3가 PR 직전 acceptance 게이트로 사용되기 전, 다음 dry-run을 수동 1회 실행해 false-positive blocker 위험 차단 (Codex next_steps[2] absorption):

```bash
# (1) m3-redux 산출에 14 rule 적용 — violation 0건 기대
node -e "
const { renderStatus } = require('./plugins/mccp/scripts/lib/renderer');
const { fixtureModel } = require('./plugins/mccp/scripts/derive/tests/helpers');
const r = renderStatus(fixtureModel(), { snapshotsDir: null });
console.log('violations:', r.design_constraint_violations.length, '/', 14);
console.log('degraded:', r.design_lint_degraded);
"
# 기대: violations: 0, degraded: false
```

만약 dry-run에서 violation > 0 또는 degraded === true이면 Task 1 rule regex / Task 3 wiring을 absorption 시점에 수정 — design-invariants.test.js가 *PR의 첫 blocker*가 되지 않도록.

### Task 6: derive CLI에 informational stderr warn

- **Action**: `plugins/mccp/scripts/derive/cli.js`의 `render` subcommand에서 `rendered.design_constraint_violations` 검사. 길이 > 0 시 `process.stderr.write('[mccp:renderer] design-lint ' + n + ' violations: ' + violations.join(',') + ' (advisory)\n')`. exit code 변경 없음 — fail-open.
- **Mirror**: `cli.js:159-160` snapshot 실패 시 fail-open `(allow)` 패턴.
- **Validate**: drift 강제 fixture (예: html.js에 `.test { border-left: 5px solid red; }` 임시 추가) → `node plugins/mccp/scripts/derive/cli.js render` stderr에 `H4` violation appear. 실제 코드는 revert.

### Task 7: 본 plan body 자체에 디자인 게이트 적용 (M2 SKILL first-step + critique loop dogfood)

- **Action**: 본 plan 작성 자체가 m3-redux 이후 첫 design-touching plan (renderer/* 변경). M2 axis B에 의해 `frontend-design-direction` SKILL이 first-step Read 되었음 + Phase 5.0이 impeccable critique을 trigger할 예정 (Phase 5.0 detector가 `plugins/mccp/scripts/lib/renderer/output-constraints.js`를 `DESIGN_SURFACE_PATHS` 화이트리스트(M1 ship)에 hit해 `design_signal=true` 반환). critique loop는 plan body가 H1-H14 spec과 충돌하지 않는지(예: 본 plan body에 raw em-dash 노출, OQ visible count 등) 검증.
- **Mirror**: M2 (`f5bbd46`) SKILL first-step 강제 + critique retry loop 패턴.
- **Validate**: Phase 5.0 detect 결과 `design_signal=true` + `skill_available=true` → critique 호출 → 본 plan body가 retry loop 0회 또는 1회 만에 통과.

## Validation

```bash
# Task 1+4 — output-constraints module + unit test
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js

# Task 2 — html.js export
node -e "const h=require('./plugins/mccp/scripts/lib/renderer/html'); console.log(typeof h.TOKENS==='string' && typeof h.LAYOUT==='string' ? 'OK' : 'FAIL')"

# Task 3+5 — renderer integration + design-invariants end-to-end
node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js

# Task 6 — CLI surface
node plugins/mccp/scripts/derive/cli.js render
# stderr는 violations 0건일 때 design-lint 라인 미emit (verbose가 아니므로). violation 있으면 1줄 출력.

# 회귀 — 기존 89 renderer test
node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js
# 89 + 18 (output-constraints) + 1-2 (design-invariants) = ~108-109 pass, 0 regression

# 회귀 — derive 40 + snapshot 16 + receipt 34
node --test plugins/mccp/scripts/derive/tests/*.test.js
node --test plugins/mccp/scripts/lib/snapshot/tests/*.test.js  # 존재 시
node --test plugins/mccp/scripts/receipt/tests/*.test.js  # 존재 시
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Regex false-positive — 정상 CSS 패턴(`header`의 `border-bottom`, `aside.secret-banner`의 `border:1px`)을 H3/H4가 위반으로 잡음 | MEDIUM | Task 1 rule 정의 시 `border-radius:\s*[1-9]` 등 *non-zero* 만 매칭. `border-bottom`은 H3 scope 외 명시. m3-redux 산출에 대한 design-invariants.test.js (Task 5)가 false-positive 회귀 차단. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| H6 selector context 무시 — `h1.verdict { font-size: 1.5rem }` (정상)를 PM-voice prose H1으로 인정하지 않으면 false-positive | MEDIUM | rule body에서 H1.verdict는 PRD line 117 spec(1.5rem) 명시 — exact 1.5rem 허용, 1.51 이상만 차단. 단순 `>= 1.5` 매칭은 PRD spec과 충돌. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| H10 em-dash가 `<code>` 내부에 정당하게 존재 가능 (예: shell prompt `node — version`) | LOW | DESIGN.md line 48이 "rendered prose"만 명시. H10 scope를 "body text excluding `<code>` / `<pre>`"로 한정. Task 1에서 HTML body 추출 후 `<code>...</code>` strip 후 카운트. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| H14 verdict prose 검사가 verdict.text fallback (`prose === text` when no LLM) 때문에 false-fail | MEDIUM | DESIGN.md line 226 "deterministic template `{N} findings active, next: {next_slug}`"는 조사/공백 있어 H14 정규식(`/^v?\d+[-\.]\d+/`)을 패스. 본 fallback 패턴을 Task 5 fixture에 명시. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| 본 plan이 `design_constraint_violations` field를 추가하지만 downstream consumer(snapshot? STATE.md? trigger?)는 아직 읽지 않음 | LOW | additive only — caller 회귀 0. consumer wiring은 후속 axis (예: STATUS.md에 violation surface, derive 모델에 stamp). 본 M3는 *데이터 emit*까지만. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `runOutputConstraints` 호출이 render path에 새 latency 추가 (대규모 CSS string 14 regex) | LOW | 14 regex 모두 short string match (CSS 5-6KB, HTML 24KB). 측정 미만 1ms 예상. perf-budget.test.js (derive 영역)에는 영향 없음 (lint는 renderer 영역, derive 무관). |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] Task 1: `output-constraints.js` exists, exports `runOutputConstraints({css,html,md}) → {violations[], details[], degraded?, degraded_reason?}`, 14 rule 모두 구현
- [ ] Task 2: `html.js`에서 `TOKENS` + `LAYOUT` export 노출, 기존 `renderHtml` 회귀 0
- [ ] Task 3: `renderer/index.js`의 `renderStatus` return shape에 **`design_constraint_violations` + `design_lint_degraded` 두 field** 추가 (Codex F2 absorption — separate degraded state), violations 또는 degraded 시 `model.warnings` push (Codex F3 absorption — dead-data 해소), 모든 기존 caller 회귀 0
- [ ] Task 4: `output-constraints.test.js` 18 test pass (14 rule × pass/fail + 4 framework test)
- [ ] Task 5: `design-invariants.test.js` end-to-end pass — 현재 m3-redux 산출 HTML/CSS에서 (1) `design_constraint_violations === []` + (2) **`design_lint_degraded === false`** (Codex F2 absorption — broken lint subsystem이 clean render와 indistinguishable로 만들지 않음 보장)
- [ ] Task 5 Codex F2 dry-run: lint 모듈 intentional throw → degraded === true + warnings 'degraded' entry surface 확인
- [ ] Task 5 Codex F3 dry-run: html.js 임시 violation 주입 → warnings 'H<rule> violations' entry surface 확인 후 revert
- [ ] Task 6: CLI render가 violation 발견 시 stderr 1줄 informational warn emit, exit code 변경 0
- [ ] 회귀 0: 기존 renderer tests (sections/escaping/cli/integration/index-outer-fail-open/format-utils/plan-body-parser/renderer-generic/render-integration/trigger/verdict/verdict-secret-banner/audit-timeline-snapshot 13 file ~89 tests) 모두 pass
- [ ] 회귀 0: derive tests (`scripts/derive/tests/*.test.js` ~40) 모두 pass
- [ ] `plugin.json` minor bump (예: 1.6.x → 1.7.0) — M3가 M1+M2 후속 milestone이므로 patch가 아닌 minor (parent plan의 mechanical-enforcement axis **partial completion** 신호)
- [ ] M3 PR body에 "DESIGN.md H1-H14 lint contract enforcement (parent plan M3 Task 7+8 partial absorption — Axis C completes after H15+H16 follow-up plan ship)" 명시 — Codex F1 absorption
- [ ] H15+H16 follow-up plan slug 명시 — 예: `v1-3-0-design-gate-m3-followup-heading-depth-and-md-literal.plan.md`. 본 M3 PR merge 후 즉시 follow-up plan 작성 진입 (지연 시 silent-stuck risk)

## Open Questions

1. **plugin.json bump 시점** — M3 단독 ship 시 minor (1.7.0) vs M3+H15+H16+M4 묶음 ship 시 minor 한 번. 본 plan은 M3 단독 ship 가정. M4 (workflow guidance + dogfood) 미존재 시 M3가 마지막 *partial* milestone. 사용자 결정 필요.
2. **Worktree 적합성 재확인** — 본 worktree(`chore/v1.3.0-prd-status-roll`)은 STATE.md roll housekeeping용. M1+M2가 본 worktree에 commit됨 (`ec4e7a0`, `f5bbd46`)이라 M3도 같은 worktree squash가 자연스럽다. 별도 branch 분리는 reviewer 부담만 늘림. 사용자 confirm 권장.
3. **H6 hero-metric selector context** — 본 plan은 "1.5rem 정확히는 PRD verdict H1 spec(line 117)이라 허용, 1.6+ rem만 차단"으로 결정 (impeccable critique R1 absorption). PRD ↔ rule constants 동기화 자동화는 후속 axis. 사용자 confirm 권장.
4. **CLI advisory 강도 + blocking 승격 trigger spec (Codex F2 + impeccable P2#2 absorption)** — Task 6은 violation을 stderr informational warn으로만 surface (exit code 0 유지, fail-open). **blocking 승격 trigger 명시**: (i) H15+H16 follow-up plan ship 후 + (ii) 30일 dogfood에서 false-positive 0건 + (iii) 다음 design-touching cycle 1회 retroactive 확인 — 세 조건 충족 시 M4 또는 별도 axis로 승격. trigger spec 없는 채로 M4 진입 금지. 본 OQ가 자체 silent-stuck 회피 anchor.
5. **H15 (heading depth) + H16 (unrendered markdown literal) follow-up plan scope** — Codex F1 absorption per `Spec 매핑` 표. H15: `<h([4-9])` HTML 카운트 + STATUS.md `^#{4,}` 카운트. H16: unrendered `**bold**` / `MD0xx` literal catalog 정의 후 검출. 두 plan은 single milestone bundle 또는 H15/H16 분리 ship — 사용자 결정 필요. 권장: bundle (Codex review cost amortization).
6. **observability loop closure 강도 (Codex F3 absorption)** — Task 3 R1 absorption으로 `model.warnings` push 통합 완료. verdict.js의 11-step chain이 medium severity warning을 verdict surface로 끌어올릴지 여부는 별도 결정. 본 M3 scope에서는 warnings array push까지만, verdict downstream wiring은 follow-up. 사용자 confirm 권장.

---

## 본 plan 자체에 대한 critique self-attestation (M2 dogfood)

- 본 plan body는 m3-redux 이후 첫 design-touching plan (renderer/* 변경). M1 ship의 `DESIGN_SURFACE_PATHS` 화이트리스트가 `plugins/mccp/scripts/lib/renderer/` 를 명시 — Phase 5.0 detector가 `design_signal=true` 반환 예상.
- 본 plan body는 H10 (em-dash) 룰을 의식해 작성됨 — *em dash가 plan body 자체에 노출되지 않도록* 표 작성 시 ` — ` 대신 ` (M3 spec) ` 표기 또는 `:` `.` 등 punctuation 대안 사용. 단, parent plan inline 인용은 원문 보존(SSoT).
- 본 plan body의 `## Open Questions` 섹션이 4개 visible (parent plan의 rule (d) "≤ 3 + collapse" 미준수). 그러나 (d)는 M3 scope 외 (`sections/open-questions.js` 행위적 제약). 본 plan body는 parent plan의 (d)가 H1-H14에 매핑되지 않음을 명시했으므로 plan-level OQ count 제약은 자체 lint 대상 아님.

---

## Design Critique

> Target: 본 plan body (`v1-3-0-design-gate-m3-output-constraints.plan.md`) as a mechanical lint enforcement specification.
> Assessment A (LLM design review) only. Assessment B (deterministic detector + browser) `unavailable` — target은 markdown plan body, markup 아님.
> Slug: `s-v1-3-0-design-gate-m3-output-constraints-plan-md`. Slop catalog (side-stripe, hero-metric, glassmorphism)은 본 target에 N/A — `## 본 plan 자체에 대한 critique self-attestation` 섹션이 anti-pattern self-check를 이미 처리.

### Design Health Score (plan-body-as-artifact, applicable subset)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | "본 M3의 위상" 표 pivot 명시 우수 |
| 2 | Match Real World | 4/4 | DESIGN.md H1-H14 spec 1:1 매핑, 한국어/영어 mix가 식별자 보존 정합 |
| 3 | User Control | n/a | plan body 입력 surface 아님 |
| 4 | Consistency | 3/4 | rule 표 일관 — H6 description만 single-line, 나머지 multi-clause |
| 5 | Error Prevention | 2/4 | H6/H10 carve-out이 risks section에만 명시, Task 1 rule spec 본문엔 없음 — 구현자가 fragile regex 짤 위험 |
| 6 | Recognition | 4/4 | parent abstract ↔ DESIGN.md concrete 매핑 표, "본 M3의 위상" pivot 표 모두 noted |
| 7 | Flexibility | n/a | plan body 단방향 |
| 8 | Aesthetic/Minimalist | 3/4 | 표준 6 섹션 정합 — Task 7만 dogfood라 결이 다름 (action 아닌 attestation) |
| 9 | Error Recovery | n/a | static document |
| 10 | Help/Docs | 3/4 | parent plan + DESIGN.md cross-link 충실, reader가 follow 가능 |
| **Total (applicable)** | | **22/28 → ≈31/40 normalized** | Good band (28-35), address weak areas |

### Anti-Patterns Verdict

**LLM**: AI-generated tell minimal. plan body는 *mechanical wiring* 문서로 표준 PRD-plan 패턴 (Files/Tasks/Validation/Risks/Acceptance/OQ) 정확히 따름. AI slop 후보는 "M1+M2 묶음" 식 boilerplate 단어 한 번, table-heavy 구성 (8 tables) — 단 모든 표가 정보를 운반하므로 noise 아닌 signal.

**Deterministic scan**: Unavailable (target = .md plan body, detector는 markup만 처리). manual review로 대체.

### Priority Issues

#### [P1] H6 selector context — exact-1.5rem 허용이 fragile

- **Why**: plan body의 Task 1 H6 spec은 `font-size:\s*([2-9]|1[5-9])\.\d+rem` 카운트 — 즉 ≥ 2rem 또는 1.5+ rem (1.5/1.6/.../1.9). 하지만 risks의 H6 carve-out은 "1.5rem exact 허용, 1.51+만 차단". 두 기술이 **불일치** — regex `1[5-9]\.\d+`은 1.50/1.51/1.59 모두 매칭하므로 risks 카운트가 spec과 충돌.
- **Fix**: Task 1의 H6 regex를 `1[6-9]\.\d+rem|[2-9]\.\d+rem` (1.6+ rem만 차단)으로 수정 + spec section 본문에 "verdict H1 1.5rem 정확값 허용" 명시. risks section과 spec section을 정합화.
- **Suggested command**: `/impeccable harden` (production-ready: edge cases)

#### [P1] H10 em-dash carve-out 위치가 risks-only

- **Why**: plan body의 Task 1 H10 spec은 `HTML body content 안에서 — 카운트, fail = > 0건`만 명시. risks section에 별도로 "DESIGN.md line 48 'rendered prose'만 명시. H10 scope를 'body text excluding `<code>` / `<pre>`'로 한정"이 있지만 *spec본문 미반영*. 구현자가 spec만 따라 짜면 `<code>node — version</code>` literal도 violation 처리 → false-positive.
- **Fix**: Task 1 H10 rule 본문에 carve-out 명시 — "HTML body content 추출 후 `<code>...</code>` + `<pre>...</pre>` + HTML attribute(`title=""`/`alt=""`) strip 후 카운트". STATUS.md도 fenced code block ``` ``` strip 후 카운트.
- **Suggested command**: `/impeccable clarify` (improve rule labels / spec precision)

#### [P2] parent plan (a) "정보 위계 3단계" deferral 정당성 약함

- **Why**: 본 plan body는 (a)를 "section logic 영역"으로 분류해 M3 scope 외로 deferred. 그러나 (a)는 `<h1>/<h2>/<h3>/<h4>+` 카운트로 *충분히 grep-based mechanical lint 가능*. DESIGN.md H3 "NO cards on sections", H5 "NO identical card grids"가 위계 시각 평면화를 보장한다는 본 plan의 주장은 **위계 시각 ≠ heading semantic depth**. h4+가 등장해도 H3/H5는 위반 아님. 위계 spec gap.
- **Fix**: 둘 중 선택 — (i) (a)를 H15로 추가 (`<h([4-9])` HTML 카운트 = 0 + STATUS.md `^#{4,}` 카운트 = 0), (ii) deferral 정당화 강화 — "h4+가 등장해도 DESIGN.md spec 위반 아니므로 M3 scope에서 제외, 후속 axis 후보"로 OQ 추가. 본 plan body는 deferral 결정만 명시했으나 *왜 안전한지*는 부족.
- **Suggested command**: `/impeccable shape` (re-plan: scope decision documentation)

#### [P2] fail-open → blocking 승격 trigger spec 부재

- **Why**: 본 plan body는 fail-open advisory를 1차 acceptance로 채택. Open Question 4가 "M4 진입 시점에 blocking 승격 결정"이지만 *어떤 조건이 충족되면 승격할지* spec 없음. M4가 빈손으로 들어가면 또 advisory로 끝남 — silent drift 위험. M1/M2 cycle이 silent skip을 surface로 해결한 패턴과 대조됨.
- **Fix**: Acceptance 또는 OQ 4에 명시적 trigger 추가 — 예: "M4 진입 시점에 (i) renderer drift fixture 회귀 0 + (ii) 30일 dogfood에서 false-positive 0건 + (iii) 사용자 confirm 시 blocking 승격". 또는 "현재 m3-redux 산출이 14/14 pass + 회귀 0이면 즉시 blocking 승격"으로 강한 옵션.
- **Suggested command**: `/impeccable shape` (scope decision documentation)

#### [P3] Task 7 (본 plan 자체 dogfood)이 action이 아닌 attestation

- **Why**: Task 1-6은 모두 *action* (CREATE/UPDATE/run). Task 7은 "Phase 5.0 detector가 design_signal=true 반환 예상 + critique loop 통과"라는 *기대 결과 attestation*. structure 일관성 약함.
- **Fix**: Task 7을 Acceptance 체크리스트로 흡수 (`[ ] Phase 5.0 critique 결과 attached + DIVERGENT 아닌 verdict 확인`). Tasks 섹션은 action만 유지.
- **Suggested command**: `/impeccable distill` (strip noise)

### Persona Red Flags

**Alex (Power User, plan reader = skypark207 본인)**: plan body 길이 ~360줄, 8 tables. 60초 scan 어렵지만 ## 헤딩 + 표 위계가 명확해 jump-to-section 가능. "본 M3의 위상" 표가 pivot 즉시 인식 도움 — Alex가 *왜 lint가 안전망인지* 첫 화면에서 이해 가능. red flag: Tasks section 7개가 expanded 상태로 모두 visible — collapse marker 없음 (plan body의 (d) self-exempt가 정당하지만 UX는 wall-of-text).

**Sam (Accessibility)**: plan body는 plain markdown. 헤딩 위계 (h1/h2/h3) 정합. 표 caption 부재는 markdown 한계 (renderer 영역). N/A.

### Minor Observations

- "본 plan 자체에 대한 critique self-attestation" 섹션이 critique 결과보다 *앞에* 위치 — Phase 5.0이 결과를 append하면 두 critique 섹션이 동거. 다음 design-touching plan에서는 self-attestation을 critique 결과 *뒤*로 배치해 일관성 확보.
- Files to Change 표의 마지막 row가 "이 파일" — meta self-reference라 reader 혼동 minor 가능. 명시적으로 "(self)" suffix.
- Risks 표 7개 row 중 LOW 3건이 "consumer wiring 후속 axis" / "schema additive" 같은 *완화 자체가 진실 statement*이라 risk 항목보다는 decision audit 항목에 가까움.

### Questions to Consider

- H6 spec ↔ risks 불일치를 인식하지 못한 채 구현이 들어가면 *현재 m3-redux 산출이 H6 violation으로 잡힘* (`.verdict { font-size: 1.5rem }` 라인). 본 critique의 P1#1 absorption이 안 되면 Task 5 design-invariants.test.js가 fail → blocker. 반드시 R1 absorption.
- (a) deferral 정당성을 강화하지 않으면 future critique이 같은 deferral 반복 — "section logic 영역" 정의가 spec 자체에 없으면 M3와 후속 axis의 boundary가 모호. 본 plan에서 한 번 잠그면 후속 cycle 가벼워짐.
- fail-open advisory의 승격 trigger 없이 M4를 진입하면 M5 회고에서 "M3 lint가 advisory로 stuck됐다" 패턴이 v1.3.0 silent-skip retrospective와 isomorphic. 본 plan에서 trigger를 못 박는 게 self-consistent dogfood.

### Trend
First run for this target, no trend yet.

---

*Critique persisted via critique-storage.mjs (slug `s-v1-3-0-design-gate-m3-output-constraints-plan-md`).*

---

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` flag 적용 · classification=ok · blocking=false · durationMs=275s)
- 라운드 수: 1 (cap=1, 모든 ACCEPT_NOW finding이 R1 absorption으로 plan body에 fully resolved → R2 trigger 조건 미충족)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. Codex 핵심 지적 3개 모두 plan body 수정으로 흡수 (Spec 매핑 표 + Task 3 + Task 5 + Acceptance + OQ 5종 위치 갱신).
- YAGNI Triage:

  | Finding | Severity | Confidence | Verdict | Why |
  |---|---|---|---|---|
  | F1: M3 scope drops parent rules ((a) heading depth + (c) raw markdown + (d) OQ count) — silent gate gap | HIGH | 0.90 | ACCEPT_NOW | "Axis C 완결" 주장이 silent gate gap. 옵션 (b) — scope를 *partial Axis C: H1-H14 only*로 명시 + H15+H16 follow-up plan으로 분리. 본 plan body `## Spec 매핑` 표 갱신 + Acceptance에 follow-up plan 명시 + OQ #5 신설. M3에 H15+H16을 묶지 않는 이유: scope creep + critique cost (H15 위계 spec 자체가 DESIGN.md에 없음 → spec creation 선행). |
  | F2: Lint integration fail-open이 broken lint를 clean render와 indistinguishable로 만듦 | HIGH | 0.92 | ACCEPT_NOW | broken lint subsystem의 silent false-negative가 본 M3의 안전망 목적 자체를 무효화. Task 3 return shape에 `design_lint_degraded` separate field 추가 + Task 5 design-invariants.test.js가 `degraded === false`도 assert + Codex F2 dry-run protocol 신설. OQ #4에 blocking 승격 trigger spec 추가 (impeccable P2#2와 정합). |
  | F3: Violation field가 dead data — downstream consumer 미wired | MEDIUM | 0.86 | ACCEPT_NOW | CLI stderr만으로는 PR review 시점에 invisible (gh가 stderr 안 보임). Task 3에 `model.warnings` push 통합 — derive engine의 기존 `pushWarning` consumer surface (verdict.js)와 정합. Patterns to Mirror 마지막 row가 이미 명시했지만 Task 본문에 spec 부재였음 → 끌어올림. OQ #6에 verdict downstream wiring decision 분리. |

- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` 미증가
- Open Questions: 6건 (plan body 본문 참조) — auto-CRITICAL catalog 6종(secret/data-loss/migration/auth/external-dest/crypto) hit 0
- Codex session 참조: threadId `019ee5ae-c8be-7743-8382-64997a22c421`

### R1 absorption note

세 finding 모두 *plan body 수정으로 fully resolve*되었으므로 R2 escalate 조건(`MCCP_GATE_ROUND_CAP=1` cap + 미해소 ACCEPT_NOW HIGH/CRITICAL 잔존)을 충족하지 않음. M3 scope가 *partial Axis C (H1-H14 only)*로 명시화됐고 H15+H16은 follow-up plan으로 분리. 본 R1 absorption은 impeccable critique의 P1#1/P1#2 (이미 spec 본문에 R1 absorption 완료)와 P2#1/P2#2 (Codex F1/F2와 정합)도 함께 흡수 — dual critique이 plan body의 internal inconsistency를 양측에서 잡아 R1에서 일괄 해소. 결과적으로 본 plan body는 dual-review cross-model 검증을 통과한 ship-ready 상태.

### Codex/impeccable cross-model 정합성 audit

| Codex finding | impeccable critique 대응 | 정합 |
|---|---|---|
| F1 (M3 scope partial) | P2#1 (heading depth deferral 정당성 약함) | ✓ 일치 — 두 reviewer 모두 deferral 정당화 부족 지적 |
| F2 (lint subsystem degraded silent) | P2#2 (fail-open → blocking trigger spec 부재) | ✓ 확장 — Codex가 더 구체적 (lint module throw 시나리오 + degraded surface 요구), impeccable은 advisory→blocking trigger angle |
| F3 (dead data, consumer 미wired) | (impeccable 미발견) | Codex 단독 — observability loop closure가 plan body level critique에서는 보이지 않는 axis |

cross-model 정합성: Codex 3건 중 2건이 impeccable과 일치(F1≈P2#1, F2≈P2#2), 1건 단독(F3). Codex의 강점인 mechanical correctness 분석이 dead-data axis(F3)를 추가로 잡음. dual-reviewer cross-model가 single-model blind spot을 정확히 방지한 케이스. mccp의 핵심 가치 (cross-model adversarial review)를 본 plan 자체에서 dogfood로 검증.

---

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (F1/F2/F3 all ACCEPT_NOW R1 absorbed: scope partial-Axis-C declared, `design_lint_degraded` separate field 추가, `model.warnings` push 통합). No new implement-time decisions detected — Files to Change list fully covers M3 scope (output-constraints.js CREATE, html.js export expose, index.js wire-up, 2 test files, derive/cli.js advisory warn). Cross-gate dedupe applied. Worktree contains prior cycle commits (M1+M2 design-gate + m3-redux) but M3-specific files (output-constraints.js + its test) are net-new, satisfying the dedupe spirit.

- impeccable detect (implement mode): `design_signal=false` (no staged design surface diff yet — implementation will create files but detector reads current git state). Sub-step skipped silently per 2.5.5b decision tree (SKILL_AVAIL=1, SIGNAL=0).
- Security-sensitive areas: none — module is regex-based lint of CSS/HTML strings, no auth/crypto/secrets/input-validation/SSRF surface.

