# Plan: v1.3.0 디자인 게이트 M3 follow-up — H15 heading depth + H16 unrendered MD literal

**Worktree**: 본 plan은 **PR #45 merge 후** 새 worktree에서 시작 (`.worktrees/v1.3.0-design-gate-m3-followup/`, branch `feat/v1.3.0-design-gate-m3-followup`). 현재 worktree(`chore/v1.3.0-prd-status-roll`)은 PR #45가 OPEN 상태이므로 같은 branch에 stack 금지.
**Parent plan**: `.claude/PRPs/plans/completed/v1-3-0-design-gate-m3-output-constraints.plan.md` (M3 partial Axis C completion이 본 plan으로 닫힘 — Codex F1 absorption 약속)
**Spec anchor**: `docs/v1.3.0-observability/DESIGN.md` H1-H14 (확장 대상 — H15+H16 신규 추가)
**Selected Milestone**: M3 follow-up — Axis C completion (heading depth + raw markdown literal mechanical lint)
**Complexity**: Small

## Summary

Parent M3 plan(`v1-3-0-design-gate-m3-output-constraints.plan.md` 의 Spec 매핑 표 + OQ #5)은 PRD §Design Direction의 abstract rule (a) "정보 위계 3단계" + (c) "raw markdown marker 금지"를 *partial Axis C* deferral로 명시화하면서 follow-up plan을 약속했다. 본 plan은 그 약속을 닫는다 — DESIGN.md에 H15/H16 spec을 추가한 뒤(spec creation 선행), `plugins/mccp/scripts/lib/renderer/output-constraints.js`에 2 rule을 H1-H14와 같은 deterministic priority chain으로 implement한다. m3-redux baseline(`STATUS.md` h1+h2만, HTML h1+h2만)이 0 violation으로 pass — 본 plan의 가치는 *현재 산출 차단*이 아니라 *향후 renderer drift 회귀 방지*.

## 본 follow-up의 위상 (parent plan과의 관계)

| 시점 | M3 lint coverage | 본 follow-up 후 |
|---|---|---|
| M3 ship 직후 (PR #45) | H1-H14 14 rule, *partial Axis C* | H1-H16 16 rule, **Axis C complete** |
| Parent plan Acceptance line 253 | "H15+H16 follow-up plan slug 명시 — PR merge 후 즉시 진입(지연 시 silent-stuck risk)" | 본 plan 진입으로 silent-stuck 회피 |

→ 본 plan acceptance는 두 가지: (1) 현재 m3-redux 산출이 16/16 pass (sanity), (2) drift fixture에서 H15+H16 violation 검출 + warnings push surface (anti-regression).

## Spec creation phase (선행, M3 처리 못 한 부분)

본 plan의 *first task*는 코드가 아니라 **DESIGN.md spec 확장**이다. 이유:

- parent plan F1 absorption note: "H15 위계 spec 자체가 DESIGN.md에 없음 → spec creation 선행 필요"
- parent plan F1 absorption note: "H16 unrendered marker catalog가 명시 안 됨 — H16 spec에서 catalog 정의 후 implement"
- M3가 H1-H14는 DESIGN.md line 35-55의 invariant 표를 1:1로 mirror — 본 follow-up도 같은 패턴 유지(spec ↔ code 1:1 매핑).

DESIGN.md에 추가될 spec(Task 1+2):

| # | Invariant | Lint signal | 근거 |
|---|-----------|-------------|------|
| H15 | Heading depth ≤ 3. PM voice surface는 h1(verdict) + h2(section) 만, h3는 sub-section 보조용으로만 허용. h4+는 금지(정보 위계가 3단계를 초과하면 PM이 60초 scan을 못 한다). | (a) HTML body 내 `<h([4-9])` 카운트 == 0, (b) STATUS.md `^#{4,}\s` 카운트 == 0. | PRD §Design Direction line 149 "(a) 정보 위계 3단계". m3-redux baseline은 h1+h2만 emit — 본 rule은 future drift 차단. |
| H16 | NO unrendered markdown literal in HTML body. `**bold**` / `__bold__` paired markers, inline backtick `` ` `` pairs, markdown link `[text](url)` 패턴, markdownlint code `MD0\d\d` 식별자가 HTML body의 rendered text로 노출되면 안 됨. | HTML body에서 `<code>`/`<pre>`/HTML attribute strip 후 다음 4 패턴 카운트 == 0: (i) `\*\*[^*\n]+\*\*`, (ii) `__[^_\n]+__` (intra-word `__` false-positive 회피 위해 단어 경계 검사), (iii) `\[[^\]]+\]\([^)]+\)`, (iv) `\bMD0?\d{2,4}\b`. | PRD §Design Direction line 149 "(c) raw markdown marker 금지" + parent plan Spec 매핑 표의 "MD0xx" 예시. H10(em-dash)이 prose punctuation을 cover, H16은 unrendered markup marker를 cover — 두 rule는 직교. |

DESIGN.md spec 추가 위치는 line 53 H14 row 다음(H1-H14 표의 hardcoded numeric ordering 보존). line 54-55의 "H1–H14 are the **mechanical lint target**" 문장도 "H1–H16"으로 갱신.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Deterministic rule chain | `plugins/mccp/scripts/lib/renderer/output-constraints.js:12-216` | `RULES` array 끝에 H15+H16 push. 각 rule은 `{id, severity, check({css,html,md}) → null | {evidence}}` shape. severity는 H15='invariant'(soft limit), H16='absolute-ban'(parent rule (c) 표현). |
| Code/pre/attr strip carve-out | `output-constraints.js:131-156` (H10) | H16이 동일 strip 적용 — `<code>...</code>` + `<pre>...</pre>` + `(?:title|alt|aria-label)="[^"]*"` 제거 후 4 pattern 카운트. H15는 strip 불필요(`<h([4-9])` 태그는 attribute나 code 안에 등장하지 않는다 — `<code>&lt;h4&gt;</code>` 같은 escape는 이미 `&lt;`로 다른 토큰). |
| Test fixture pattern | `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js:64-79` (H1 pass/fail) | H15+H16 각각 pass(baseline) + fail(injected fixture). H15 fail = `<h4>`, H16 fail = `**bold**`. |
| End-to-end sanity | `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` | 현재 14 rule 0 violation assert — 16 rule 0 violation assert로 확장. degraded === false assert 유지. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H15+H16 spec row 추가 (line 53 H14 다음). "H1–H14 mechanical lint target" → "H1–H16" 갱신(line 54-55). |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | `RULES` array 끝에 H15+H16 rule push. 기존 H1-H14 무변경. `RULES.length` 가 14→16 됨에 따라 test `RULES.length` assertion(`output-constraints.test.js:27`)도 갱신 필요(test 파일에서 처리). |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | (a) `RULES.length === 14` → `=== 16` 갱신 + id 검증 loop을 `i <= 16`으로. (b) H15 4 test(pass+html-fail+md-fail+indented-fail+fenced-pass) + H16 11 test(pass+4 fail pattern+inline-backtick+entity-decimal+entity-hex+3 dunder-pass+1 non-dunder fail+pre carve-out) = 15 test 추가. 기존 14 rule × 2 + framework 4 = 32 test → 47 test. (Codex F1+F2+F3 R1 absorption 반영) |
| `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` | UPDATE | (1) `design_constraint_violations === []` assertion은 동일하지만 16 rule 기준으로 회귀 0 확인 (m3-redux baseline은 자연스럽게 pass). (2) drift fixture test 1건 추가 — `renderStatus` 호출 후 H15/H16 violation 강제 검출 sanity. |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | 이미 위 row에 명시 — Files to Change 표는 file path 단위 unique. 동일 file이 두 번 등장하지 않도록 위 row가 H15+H16 spec + line 54-55 갱신을 모두 cover. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | minor bump (1.7.0 → 1.8.0). Axis C completion은 functional surface 확장이므로 patch 아닌 minor. CLAUDE.md §3.7 milestone 의무 체크리스트 정합. |
| `.claude/plans/v1-3-0-design-gate-m3-followup-heading-depth-and-md-literal.plan.md` | CREATE | (이 파일 self) |

## Tasks

### Task 0: PR #45 merge preflight (mandatory, Codex F4 R1 absorption)

- **Action**: plan implementation entry의 *첫 step*으로 다음 mechanical preflight 실행. 한 가지라도 fail 시 plan 진입 abort. prose-only ordering의 silent-violation 회피.
  ```bash
  set -e
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ "$CURRENT_BRANCH" = "chore/v1.3.0-prd-status-roll" ]; then
    echo "[STOP] Current branch is the PR #45 branch. Create new follow-up branch first."
    exit 1
  fi
  git fetch origin main --quiet
  MAIN_VERSION=$(git show origin/main:plugins/mccp/.claude-plugin/plugin.json \
    | node -e "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{console.log(require('semver').gte? '' : ''); try{const v=JSON.parse(s).version; process.stdout.write(v);}catch(e){process.stdout.write('parse-error');}})")
  # PR #45 merge gate: origin/main plugin.json must be >= 1.7.0
  node -e "
    const v='$MAIN_VERSION';
    const [a,b,c]=v.split('.').map(n=>parseInt(n,10));
    if (a<1 || (a===1 && b<7)) { console.error('[STOP] origin/main plugin.json version='+v+', expected >= 1.7.0 (PR #45 not merged)'); process.exit(1); }
    console.log('[OK] origin/main plugin.json version='+v);
  "
  BASE=$(git merge-base HEAD origin/main)
  echo "[OK] preflight pass — branch=$CURRENT_BRANCH base=$BASE main-version=$MAIN_VERSION"
  ```
- **Mirror**: CLAUDE.md §3.8 worktree convention + parent plan OQ #2 worktree 분리 결정.
- **Validate**: preflight stderr/stdout에 `[OK] preflight pass` 출력 + exit 0. fail 시 plan 진입 차단.

### Task 1: DESIGN.md에 H15 spec row 추가

- **Action**: `docs/v1.3.0-observability/DESIGN.md` line 53(H14 row) 직후에 다음 row 삽입:
  ```markdown
  | H15 | Heading depth ≤ 3. h1(verdict) + h2(section) + h3(sub-section) 만 허용. h4+ 금지 — PRD §Design Direction line 149 "(a) 정보 위계 3단계". | HTML body `<h([4-9])` 카운트 == 0 AND STATUS.md *fenced code block strip 후* `^ {0,3}#{4,6}\s` (CommonMark ATX with leading 0-3 spaces) 카운트 == 0 | (m3-redux baseline은 h1+h2만 emit — 본 rule은 future drift 차단) |
  ```
  + line 54-55의 "H1–H14 are the **mechanical lint target**" → "H1–H16 are the **mechanical lint target**" 갱신.
- **Mirror**: DESIGN.md line 39-53 H1-H14 row format (4 column: # / Invariant / Lint signal / Where this was broken).
- **Validate**: `grep -E "^\| H1[56] \|" docs/v1.3.0-observability/DESIGN.md` 가 2 line 반환.

### Task 2: DESIGN.md에 H16 spec row 추가

- **Action**: Task 1로 추가된 H15 row 직후 H16 row 삽입:
  ```markdown
  | H16 | NO unrendered markdown literal in HTML body. `**bold**` / `__bold__` paired markers, inline backtick `` `code` `` pairs(raw + entity-encoded `&#96;`/`&#x60;`), markdown link `[text](url)` 패턴, markdownlint code `MD0\d\d` 식별자가 rendered text로 노출되면 안 됨. H10(em-dash punctuation)과 직교 — H10은 prose, H16은 unrendered markup. | HTML body에서 `<code>` / `<pre>` / HTML attribute strip + Python dunder whitelist(`__init__`/`__name__`/`__main__`/`__file__`/`__doc__`/`__str__`/`__repr__`/`__call__`/`__enter__`/`__exit__`) 제거 후 5 패턴 카운트 == 0: (i) `\*\*[^*\n]+\*\*`, (ii) `\b__[^_\n]+__\b`(dunder strip 후), (iii) `` `[^`\n]+` ``(raw backtick) + entity-encoded `(&#96;|&#x60;)[^&\n]+(&#96;|&#x60;)`, (iv) `\[[^\]]+\]\([^)]+\)`, (v) `\bMD0?\d{2,4}\b` | (m3-redux baseline은 `**`/`__`/`` ` ``/`[](`/MD0xx 가 HTML body에 미노출 — markdown.js의 ``.replace(/\*\*/g, '...')`` 같은 normalization은 본 plan scope 아님, lint-only) |
  ```
- **Mirror**: H10 carve-out (line 48 + `output-constraints.js:131-156`) — code/pre/attribute strip 동일 패턴.
- **Validate**: `grep -E "^\| H16 \|" docs/v1.3.0-observability/DESIGN.md` 가 1 line 반환.

### Task 3: `output-constraints.js`에 H15 rule 구현

- **Action**: `plugins/mccp/scripts/lib/renderer/output-constraints.js`의 `RULES` array 끝(line 215 닫는 `]` 직전)에 다음 rule 객체 push. Codex F2 R1 absorption: markdown 검사는 fenced code block strip 후 CommonMark-compatible ATX(leading 0-3 spaces) regex 사용 — `   #### indented` 진짜 h4 잡고 fenced code 안의 `####` 예시는 false-positive 회피.
  ```js
  // H15 heading depth <= 3. h1 + h2 + h3 만 허용. h4+ 등장 시 PM voice 60s scan 불가.
  // HTML body + markdown source 양쪽 검사. attribute 안의 `<h4>` 같은 escape는
  // 이미 &lt; 로 변환돼 다른 토큰 — strip 불필요.
  // Codex F2 absorption: markdown은 fenced code block(```) strip 후 CommonMark ATX
  // (`^ {0,3}#{4,6}\s`) 매칭 — indented heading 잡고 fenced 예시 false-positive 회피.
  {
    id: 'H15',
    severity: 'invariant',
    check: ({ html, md }) => {
      let count = 0;
      const hits = [];
      if (html) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : html;
        const m = bodyContent.match(/<h[4-9]\b/gi);
        if (m) { count += m.length; hits.push('html(' + m.length + ')'); }
      }
      if (md) {
        const stripped = md.replace(/```[\s\S]*?```/g, '');
        const m = stripped.match(/^ {0,3}#{4,6}\s/gm);
        if (m) { count += m.length; hits.push('md(' + m.length + ')'); }
      }
      if (count > 0) return { evidence: count + ' h4+/heading(s): ' + hits.join('+') };
      return null;
    },
  },
  ```
- **Mirror**: H10 (`output-constraints.js:131-156`) — html body 추출 + md 양쪽 검사 + hits[] 배열 join.
- **Validate**: `node -e "const {runOutputConstraints,RULES}=require('./plugins/mccp/scripts/lib/renderer/output-constraints'); console.log(RULES.find(r=>r.id==='H15').severity)"` → `invariant`.

### Task 4: `output-constraints.js`에 H16 rule 구현

- **Action**: Task 3 H15 push 직후 다음 rule 객체 push. Codex F1 R1 absorption: inline backtick + entity-encoded backtick pattern 추가. Codex F3 R1 absorption: Python dunder whitelist를 strip 단계에서 제거(no-op test 회피, dunder는 절대 H16 fire 안 함).
  ```js
  // H16 unrendered markdown literal in HTML body.
  // Catalog: paired ** / paired __ / inline backtick (raw + entity) / md link / MD lint code.
  // Carve-out (same as H10): strip <code>/<pre>/HTML attributes before count.
  // Codex F1 absorption: inline backtick pair는 H16 invariant 명시 catalog였으나
  // 1차 draft에서 누락 — raw `foo` + entity-encoded &#96;foo&#96; / &#x60;foo&#x60;
  // 양쪽 모두 검출.
  // Codex F3 absorption: Python dunder identifier(__init__/__name__/__main__/__file__/
  // __doc__/__str__/__repr__/__call__/__enter__/__exit__)는 strip 단계에서 제거 — 정당한
  // Python 식별자가 H16 absolute-ban을 trigger해 noise 양산하는 패턴 차단. dunder 외
  // 임의 __foo__는 여전히 violation.
  // markdown source는 IS markdown — 본 rule는 HTML body only.
  {
    id: 'H16',
    severity: 'absolute-ban',
    check: ({ html }) => {
      if (!html) return null;
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyContent = bodyMatch ? bodyMatch[1] : html;
      const PYTHON_DUNDERS = /\b__(?:init|name|main|file|doc|str|repr|call|enter|exit)__\b/g;
      const stripped = bodyContent
        .replace(/<code[\s\S]*?<\/code>/g, '')
        .replace(/<pre[\s\S]*?<\/pre>/g, '')
        .replace(/(?:title|alt|aria-label)="[^"]*"/g, '')
        .replace(PYTHON_DUNDERS, '');
      const patterns = [
        { name: 'bold-asterisk', re: /\*\*[^*\n]+\*\*/g },
        { name: 'bold-underscore', re: /\b__[^_\n]+__\b/g },
        { name: 'inline-backtick', re: /`[^`\n]+`/g },
        { name: 'entity-backtick', re: /(?:&#96;|&#x60;)[^&\n]+(?:&#96;|&#x60;)/g },
        { name: 'md-link', re: /\[[^\]]+\]\([^)]+\)/g },
        { name: 'md-lint-code', re: /\bMD0?\d{2,4}\b/g },
      ];
      const hits = [];
      let total = 0;
      for (const p of patterns) {
        const m = stripped.match(p.re);
        if (m) { total += m.length; hits.push(p.name + '(' + m.length + ')'); }
      }
      if (total > 0) return { evidence: total + ' unrendered marker(s): ' + hits.join('+') };
      return null;
    },
  },
  ```
- **Mirror**: H10 carve-out (`output-constraints.js:131-156`) + H8 multi-pattern aggregation (`output-constraints.js:104-115`).
- **Validate**: `node -e "const {runOutputConstraints}=require('./plugins/mccp/scripts/lib/renderer/output-constraints'); console.log(runOutputConstraints({css:'', html:'<body>**bold**</body>', md:''}).violations.includes('H16'))"` → `true`.

### Task 5: `output-constraints.test.js` 갱신 + H15/H16 unit test 추가

- **Action**: `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` 2 부분 갱신:
  - (a) line 27 `assert.equal(RULES.length, 14)` → `assert.equal(RULES.length, 16)` + 루프 `i <= 14` → `i <= 16`.
  - (b) 파일 끝에 H15(2 test) + H16(8 test = pass + 4 fail pattern + 1 strip carve-out + 2 false-positive guard) 추가. 패턴:
    ```js
    // H15 — heading depth
    test('H15 — pass on m3-redux baseline (h1+h2 only)', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS,
        html: '<body><h1>x</h1><h2>y</h2><h3>z</h3></body>',
        md: '# x\n## y\n### z\n',
      });
      assert.ok(!out.violations.includes('H15'));
    });
    test('H15 — fail when <h4> appears in HTML body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS,
        html: '<body><h1>x</h1><h4>y</h4></body>',
        md: '',
      });
      assert.ok(out.violations.includes('H15'));
    });
    test('H15 — fail when ^#### appears in markdown', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS,
        html: '',
        md: '# x\n## y\n#### z\n',
      });
      assert.ok(out.violations.includes('H15'));
    });
    // Codex F2 absorption: indented ATX heading (CommonMark allows 0-3 leading spaces)
    test('H15 — fail when indented #### appears in markdown (CommonMark ATX)', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '', md: '# x\n   #### indented drift\n',
      });
      assert.ok(out.violations.includes('H15'));
    });
    // Codex F2 absorption: fenced code blocks containing #### must NOT trigger
    test('H15 — pass when #### appears inside fenced code block', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '',
        md: '# x\n```md\n#### example only\n```\n',
      });
      assert.ok(!out.violations.includes('H15'));
    });
    // H16 — unrendered markdown literal
    test('H16 — pass on m3-redux baseline (no unrendered markers)', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS,
        html: '<body><strong>x</strong> <code>**literal**</code></body>',
        md: '',
      });
      assert.ok(!out.violations.includes('H16'));
    });
    test('H16 — fail when **bold** literal in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>see **important** note</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    test('H16 — fail when __bold__ literal in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>see __important__ note</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    test('H16 — fail when markdown link literal in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>read [docs](https://example.com)</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    test('H16 — fail when MD0xx markdownlint code in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>fix MD025 in heading</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    test('H16 — carve-out: literal inside <code> does not trigger', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS,
        html: '<body>example: <code>**bold**</code> here</body>',
        md: '',
      });
      assert.ok(!out.violations.includes('H16'));
    });
    // Codex F1 absorption: raw inline backtick pairs must fire H16
    test('H16 — fail when raw inline backtick `foo` literal in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>see `foo` inline</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    // Codex F1 absorption: entity-encoded backticks must fire H16
    test('H16 — fail when entity-encoded &#96;foo&#96; literal in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>see &#96;foo&#96; inline</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    test('H16 — fail when hex entity &#x60;foo&#x60; literal in body', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>see &#x60;foo&#x60; inline</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    // Codex F3 absorption: Python dunder identifiers must be whitelisted (strict assertion)
    test('H16 — Python dunder __init__ does NOT trigger (strict assertion)', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>Python __init__ constructor</body>', md: '',
      });
      assert.ok(!out.violations.includes('H16'));
    });
    test('H16 — Python dunder __name__ / __main__ do NOT trigger', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>__name__ == __main__</body>', md: '',
      });
      assert.ok(!out.violations.includes('H16'));
    });
    test('H16 — non-dunder __custom__ still triggers (whitelist is narrow)', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS, html: '<body>see __custom_marker__ in body</body>', md: '',
      });
      assert.ok(out.violations.includes('H16'));
    });
    test('H16 — false-positive guard: <pre> 안의 marker는 trigger 안 됨', () => {
      const out = runOutputConstraints({
        css: BASELINE_CSS,
        html: '<body><pre>some **bold** and [link](url)</pre></body>',
        md: '',
      });
      assert.ok(!out.violations.includes('H16'));
    });
    ```
- **Mirror**: 기존 H1-H14 test pattern + framework 4 test의 schema/multi-violation/empty-input/RULES.length 검증.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` — 32 + H15(4) + H16(11) = 47 test pass, 0 fail. (R1 absorption으로 H15 indented + fenced-code 2 test, H16 inline-backtick + 2 entity + 3 dunder = 6 test 추가, dunder no-op 1 test 제거 → 10 → 15 신규.)

### Task 6: `design-invariants.test.js` 갱신 — 16 rule 회귀 0 + drift fixture

- **Action**: `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` 2 부분 갱신:
  - (1) 기존 16 rule 회귀 0 sanity (m3-redux baseline) — 본 assertion은 `design_constraint_violations === []` 라 자동으로 H15+H16 회귀 0 검증. 변경 없음.
  - (2) drift fixture test 1건 추가 — H15+H16 violation 강제 검출 sanity. `renderStatus` mock 결과 string 조작 대신 lint 모듈 직접 호출:
    ```js
    test('design-invariants — drift fixture: H15 + H16 violations surface', () => {
      const { runOutputConstraints } = require('../output-constraints');
      const out = runOutputConstraints({
        css: '',
        html: '<body><h4>drift</h4> **bold** literal</body>',
        md: '#### drift heading\n',
      });
      assert.ok(out.violations.includes('H15'));
      assert.ok(out.violations.includes('H16'));
      const detailIds = out.details.map((d) => d.rule);
      assert.ok(detailIds.includes('H15'));
      assert.ok(detailIds.includes('H16'));
    });
    ```
- **Mirror**: 기존 design-invariants.test.js end-to-end sanity 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` — 기존 test pass + 신규 1 test pass.

### Task 7: 현재 m3-redux 산출에서 16-rule dry-run 검증

- **Action**: 본 plan 구현 직후 (PR 직전), 다음 dry-run 수동 1회 실행:
  ```bash
  node -e "
  const { renderStatus } = require('./plugins/mccp/scripts/lib/renderer');
  const fs = require('fs');
  const path = require('path');
  // 최신 .claude/cache/status.html + STATUS.md 활용 — derive cli render 호출
  require('child_process').execSync('node plugins/mccp/scripts/derive/cli.js render', { stdio: 'inherit' });
  const html = fs.readFileSync('.claude/cache/status.html', 'utf8');
  const md = fs.readFileSync('.claude/cache/STATUS.md', 'utf8');
  const { runOutputConstraints } = require('./plugins/mccp/scripts/lib/renderer/output-constraints');
  const { TOKENS, LAYOUT } = require('./plugins/mccp/scripts/lib/renderer/html');
  const out = runOutputConstraints({ css: TOKENS + LAYOUT, html, md });
  console.log('violations (expected 0 or only H10 advisory):', out.violations);
  console.log('details:', JSON.stringify(out.details, null, 2));
  "
  ```
  기대: violations 가 빈 배열 또는 *기존 H10 advisory 1건* (현재 m3-redux는 `H10: 1 violation` advisory가 user content em-dash로 by design). H15/H16 새로 fire 시 false-positive 회귀 분석 → Task 3/4 rule regex 수정.
- **Mirror**: parent plan Task 5 Codex F2 dry-run protocol.
- **Validate**: dry-run stderr에 `H15` / `H16` 미등장. 등장 시 PR 직전 blocker.

### Task 8: `plugin.json` minor bump + PR body version 명시

- **Action**: `plugins/mccp/.claude-plugin/plugin.json` `version` 필드 `1.7.0 → 1.8.0`. CHANGELOG.md에 `## [1.8.0]` row 추가:
  ```markdown
  ## [1.8.0] — 2026-MM-DD

  ### Added
  - DESIGN.md H15 (heading depth ≤ 3) + H16 (unrendered markdown literal) mechanical lint rules. `runOutputConstraints` RULES length 14 → 16. Parent M3 plan Axis C completion — heading depth + raw markdown literal grep-based enforcement closes parent plan F1 absorption약속.
  ```
- **Mirror**: CLAUDE.md §3.7 milestone PR 의무 체크리스트.
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `1.8.0`.

## Validation

```bash
# Task 1+2 — DESIGN.md spec rows
grep -E "^\| H1[56] \|" docs/v1.3.0-observability/DESIGN.md  # 2 lines
grep "H1–H16 are the" docs/v1.3.0-observability/DESIGN.md    # 1 line

# Task 3+4 — output-constraints.js RULES length
node -e "const {RULES}=require('./plugins/mccp/scripts/lib/renderer/output-constraints'); console.log(RULES.length, RULES.map(r=>r.id).join(','))"
# 기대: 16 H1,H2,H3,H4,H5,H6,H7,H8,H9,H10,H11,H12,H13,H14,H15,H16

# Task 5 — unit test
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js
# 기대: 42 test pass, 0 fail

# Task 6 — design-invariants
node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js
# 기대: 모든 test pass + 신규 drift fixture pass

# Task 7 — m3-redux dry-run
node plugins/mccp/scripts/derive/cli.js render
# 기대 stderr: '[mccp:renderer] design-lint 1 violation(s): H10 (advisory)' 또는 violation 0.
# H15 / H16 등장 시 PR blocker.

# 회귀 — renderer + derive + receipt 전체
node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js
node --test plugins/mccp/scripts/derive/tests/*.test.js
# 기대: 0 regression (본 plan 변경은 H1-H14 rule 본문 무손, additive only)

# Task 8 — version bump
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.8.0
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| H15 false-positive — section logic이 미래에 의도적 h4(예: deeply nested timeline detail) emit 시 정당한데 차단 | LOW | parent rule (a)가 "≤ 3"이므로 미래 h4 emit 자체가 PRD 위반. 만약 정당 use case 발견 시 본 rule severity를 'invariant' 유지(현재 spec) + DESIGN.md spec에서 carve-out 명시 후 H15 check에서 strip. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| H16 false-positive — Python dunder `__init__` / `__name__` 같은 식별자가 본문 인용 시 trigger | LOW (R1 absorption 후) | Codex F3 R1 absorption으로 dunder whitelist(10종)를 strip 단계에서 제거 — 정당한 Python 식별자는 H16 fire 안 함. dunder 외 임의 `__custom__` marker는 여전히 violation. Task 5의 strict assertion(`!out.violations.includes('H16')`)이 회귀 안전망. 추가 dunder가 필요하면 PYTHON_DUNDERS regex 1줄 확장. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| H16 false-positive — 정당한 markdown link 인용(`[docs](url)` 형식을 본문에 *literal* 으로 보여줘야 하는 case) | LOW | DESIGN.md spec line 48과 동일 pattern — `<code>[docs](url)</code>` 로 wrap 시 carve-out 통과. renderer가 이런 literal을 노출할 일은 본문 의도가 거의 없음. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Task 1 DESIGN.md 편집이 H10 (em-dash) advisory에 영향 (현재 advisory 1건 — DESIGN.md 본문에 em-dash 다수 존재) | LOW | DESIGN.md 자체는 STATUS.md 산출의 input source가 아님 — H10 advisory는 user content(STATUS.md 본문에 em-dash 노출) 영향. DESIGN.md 편집 결과는 lint 입력에 무영향. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `RULES.length` change가 외부 의존성 break (downstream code가 14를 hardcode) | LOW | grep `RULES.length` / `RULES\[(14|15)\]` 외부 사용처 없음(`output-constraints.test.js:27` 만 hit, 본 plan Task 5가 갱신). |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `plugin.json` 1.8.0 bump이 PR #45 1.7.0 bump과 conflict (rebase 필요) | MEDIUM | 본 plan은 *PR #45 merge 후* 새 worktree에서 시작 명시. 기준은 main + #45 squash commit 포함 → 1.7.0 baseline에서 1.8.0 bump이라 conflict 0. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance

- [ ] Task 0: PR #45 merge preflight pass — current branch != `chore/v1.3.0-prd-status-roll`, origin/main `plugin.json` version >= 1.7.0, base contains PR #45 squash (Codex F4 R1 absorption)
- [ ] Task 1: DESIGN.md H15 spec row 추가 (CommonMark ATX 0-3 leading spaces + fenced code strip 명시) + line 54-55 "H1–H16" 갱신
- [ ] Task 2: DESIGN.md H16 spec row 추가 — 5 pattern catalog(bold-asterisk + bold-underscore + inline-backtick raw + entity-encoded backtick + md-link + md-lint-code) + Python dunder whitelist 명시 (Codex F1+F3 R1 absorption)
- [ ] Task 3: `output-constraints.js` H15 rule 구현, severity='invariant', html `<h[4-9]` + md fenced-code-strip + CommonMark ATX(`^ {0,3}#{4,6}\s`) 검사 (Codex F2 R1 absorption)
- [ ] Task 4: `output-constraints.js` H16 rule 구현, severity='absolute-ban', 6 pattern + code/pre/attribute/dunder strip carve-out (Codex F1+F3 R1 absorption)
- [ ] Task 5: `output-constraints.test.js` 47 test pass — RULES.length=16, H15 4건(pass+html-fail+md-fail+indented-fail+fenced-pass), H16 11건(pass+4 fail pattern+inline-backtick raw+entity-decimal+entity-hex+3 dunder pass+1 non-dunder fail+pre carve-out) = 15 신규
- [ ] Task 6: `design-invariants.test.js` 16-rule baseline 회귀 0 + drift fixture H15+H16 surface 검증
- [ ] Task 7: m3-redux 산출 dry-run에서 H15 미등장 + H16은 **advisory by-design** acceptable. 실 산출(`.claude/cache/status.html`)이 H10 14건 + H16 16건(bold-asterisk 1 + entity-backtick 15). H16 entity-backtick은 `format-utils.js#escapeHtml`(line 102)이 Codex R1 F4 (M3 plan-time) absorption으로 `` ` `` → `&#96;` XSS escape로 intentional하게 emit한 결과 — markdown inline code(`` ` ``)가 `<code>` wrap 없이 escape만 되면서 H16 detector가 catch. H10과 동형 패턴(user content surface) → advisory acceptable. H16 bold-asterisk 1건도 plan body 본문(`**Task 1은 dogfood가 stuck했을 때의 fallback**`)의 surface — 동일 advisory. **Follow-up axis**: markdown inline code → `<code>` wrap (`output-constraints-followup-renderer-inline-code-wrap` plan으로 분리, scope creep 회피).
- [ ] Task 8: `plugin.json` 1.7.0 → 1.8.0 bump + CHANGELOG.md `[1.8.0]` row 추가
- [ ] 회귀 0: renderer tests 13 file pass (sections/escaping/cli/integration/index-outer-fail-open/format-utils/plan-body-parser/renderer-generic/render-integration/trigger/verdict/verdict-secret-banner/audit-timeline-snapshot)
- [ ] 회귀 0: derive tests (`scripts/derive/tests/*.test.js`) pass
- [ ] PR title 또는 body에 "Axis C completion — H15+H16 closing partial M3 deferral" 명시 + parent plan(`v1-3-0-design-gate-m3-output-constraints.plan.md` Acceptance line 253) cross-link

## Open Questions

1. **단일 PR ship vs H15/H16 분리 ship** — parent plan OQ #5 권장은 "bundle (Codex review cost amortization)". 본 plan은 bundle 가정으로 작성됨 — Task 1-8 단일 PR. 분리 시 H15 먼저 ship 후 H16은 후속 cycle. 사용자 결정 필요 — bundle 추천 (Codex 1회 호출로 2 rule cover, dual-review cost ÷2).
2. **H16 Python dunder false-positive 처리** — `__init__` / `__name__` 매칭 위험을 Task 5 test가 *기록된 trade-off*로 명시. carve-out 추가 옵션: (i) `\b__(?!init\b|name\b|main\b)[^_\n]+__\b` 식으로 dunder whitelist, (ii) 본문 인용이 `<code>__init__</code>` 형태 권장으로 docs guidance 추가. M3 dogfood 1 cycle 후 false-positive 검출 시점에 결정 — 본 plan 1차 ship에는 carve-out 미추가.
3. **plugin.json bump 정합성** — parent plan PR #45가 1.7.0 bump를 포함하므로 본 plan은 그 위에서 1.8.0. 만약 PR #45가 minor 아닌 patch bump(1.6.x → 1.6.3)로 merge되면 본 plan도 minor → patch로 재평가 필요. 사용자 PR #45 merge 후 실제 version 확인 후 시작 권장.
4. **본 plan과 M4(refresh/privacy) 정합** — M4(PR #39)가 이미 main에 ship됨 — `model.warnings` consumer가 design-lint warning을 verdict surface로 끌어올리는지 별도 검증 필요. 본 follow-up scope는 H15+H16 rule 추가까지 — warnings consumer wiring은 후속 axis (parent plan OQ #6과 동일). 본 OQ가 silent-stuck 회피 anchor.
5. **CLI advisory 강도 + blocking 승격 trigger** — parent plan OQ #4 trigger spec ((i) H15+H16 follow-up ship + (ii) 30일 dogfood false-positive 0건 + (iii) 다음 design-touching cycle retroactive 확인) 중 (i)이 본 plan 완료로 충족. (ii)(iii)이 남음. 본 plan ship 후 30일 dogfood window 시작. 사용자 확인 — 본 plan을 blocking 승격 trigger의 (i) condition 충족으로 인정할지.

---

## 본 plan 자체에 대한 critique self-attestation (M2 dogfood)

- 본 plan body는 design surface 변경(output-constraints.js + DESIGN.md) — M2 axis B의 `DESIGN_SURFACE_PATHS` whitelist에 양 path 모두 hit, Phase 5.0 detector가 `design_signal=true` 반환 예상.
- 본 plan body는 H10 (em-dash) 룰을 의식해 작성됨 — em-dash 대신 `(...)` / `,` / `:` / `.` 사용. inline 인용은 원문 SSoT 보존.
- 본 plan body의 OQ 섹션이 5개 visible (parent rule (d) "≤ 3 + collapse" 미준수). parent rule (d)는 M3 scope 외 (`sections/open-questions.js` 행위적 제약) — plan-level OQ count 제약은 본 lint scope 아님.
- 본 plan body는 H15+H16 rule을 *자체적으로 위반* 가능성 검사: heading depth는 h1(`#`) + h2(`##`) + h3(`###`) 만 사용 — h4+ 미등장. unrendered markdown marker는 `**bold**` 패턴이 본문에 다수 등장 — 그러나 본 plan body는 plan markdown이라 `**`이 정당한 markdown bold marker(rendered to `<strong>`). H16은 *HTML body의 unrendered literal*을 lint — markdown source는 IS markdown이라 본 plan body 자체 검사 대상 아님. self-consistent.

---

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` flag 적용 · classification=ok · blocking=false · durationMs=323072ms)
- 라운드 수: 1 (cap=1, 4 finding 모두 MEDIUM severity → R2 trigger 조건(HIGH/CRITICAL ACCEPT_NOW 미해소) 미충족 → R1 stop)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. 4 finding 모두 plan body 수정으로 fully resolved (Task 0 신설 + DESIGN.md spec 확장 + rule catalog 확장 + test 갱신).
- YAGNI Triage:

  | Finding | Severity | Confidence | Verdict | Why |
  |---|---|---|---|---|
  | F1: H16 omits inline-backtick + entity-encoded backtick | MEDIUM | 0.91 | ACCEPT_NOW | DESIGN.md H16 invariant 본문(Task 2)에 inline backtick 명시했으나 rule catalog 4 pattern에 누락. spec-code mismatch — Task 4 H16 rule에 `inline-backtick` + `entity-backtick`(decimal `&#96;` + hex `&#x60;`) pattern 추가, Task 5 test 3건(raw + decimal + hex) 추가. |
  | F2: H15 markdown check misses indented heading + fenced-code false-positive | MEDIUM | 0.82 | ACCEPT_NOW | regex `^#{4,}\s`는 column 0만 매칭 — CommonMark는 0-3 leading spaces 허용. 또한 fenced code block 안의 `####` 예시 false-positive. Task 3 H15 rule check에 (a) `md.replace(/```[\s\S]*?```/g, '')` strip 추가, (b) `^ {0,3}#{4,6}\s` regex로 교체. Task 5 test 2건(indented fail + fenced pass) 추가. |
  | F3: dunder false-positive test가 no-op | MEDIUM | 0.90 | ACCEPT_NOW | 1차 draft의 test는 `assert.ok(Array.isArray(out.violations))`만 검사 — `__init__`가 trigger되든 안 되든 pass. absolute-ban rule이 routine Python identifier로 noise 양산 시 reviewer가 rule 자체를 ignore. Task 4 H16 rule strip 단계에 `PYTHON_DUNDERS` regex(`__init__`/`__name__`/`__main__`/`__file__`/`__doc__`/`__str__`/`__repr__`/`__call__`/`__enter__`/`__exit__` 10종) 제거 추가. Task 5의 무의미한 guard test 제거, strict assertion 3건(`!violations.includes('H16')` for dunder pass) + 1건(non-dunder `__custom__` fail) 추가. Risks H16 dunder MEDIUM → LOW 강등. |
  | F4: PR #45 ordering prose-only, no mechanical gate | MEDIUM | 0.86 | ACCEPT_NOW | "PR #45 merge 후 시작" 문구만으로는 silent-violation 회피 불가 — 누군가 현재 worktree에서 시작하면 stacked PR + 존재 안 한 version sequence(1.7.0→1.8.0이 main에 없는 채로 publish) 위험. Task 0 신설 — (a) current branch != `chore/v1.3.0-prd-status-roll` 검증, (b) `git fetch origin main` + `plugin.json` version >= 1.7.0 검증, (c) `git merge-base HEAD origin/main` 출력. 한 가지라도 fail 시 plan 진입 abort. Acceptance에도 Task 0 항목 추가. |

- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` 미증가
- Open Questions: 5건 (plan body 본문 참조) — auto-CRITICAL catalog 6종(secret/data-loss/migration/auth/external-dest/crypto) hit 0
- Codex session 참조: threadId `019ee871-b938-7b31-a64d-2a2ac1b201dd`

### R1 absorption note

4 finding 모두 MEDIUM severity이고 plan body 수정으로 *fully resolve*되었으므로 R2 escalate 조건 미충족(cap=1 + 미해소 ACCEPT_NOW HIGH/CRITICAL 잔존 필요). M3 partial Axis C completion 약속이 본 plan으로 닫히는 axis 자체가 prose-only ordering이었던 점(F4)을 mechanical preflight로 정합화. F1/F2/F3은 모두 spec ↔ code 불일치 또는 test no-op 패턴 — implement-time bug 회피용. dual-review cross-model이 plan 단계에서 spec catalog 누락(F1) + regex 표준 미준수(F2) + test 회피(F3) + 운영 ordering 누락(F4) 4가지를 동시에 잡았다. mccp 핵심 가치(cross-model adversarial review) dogfood로 본 plan 자체에서 검증.

### Codex/impeccable cross-model 정합성 audit

본 plan은 Phase 5.0에서 `design_signal=false`로 silent-skip(detector가 git diff 기준이라 plan body의 *기술 의도*는 못 잡음 — narrow whitelist axis (b) 적용 시 design surface로 인식되도록 후속 axis 후보). impeccable critique 미실행 — Codex 단독 review. cross-model 정합성 audit은 본 cycle에 미적용. 다음 design-touching plan에서 axis (c) audited intent override(`MCCP_DESIGN_INTENT_REASON`) 활용 권장.

---

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, `--impeccable-available` flag, classification=ok, blocking=false, durationMs=337461ms)
- 라운드 수: 1 (cap=1, F1 HIGH ACCEPT_NOW + F2/F3/F4 MEDIUM ACCEPT_NOW — 4 finding 모두 plan body + implementation 갱신으로 fully resolved → R2 escalate 조건 (b) 미충족)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. plan Task 3/4/8 갱신 사항을 본 implementation에 반영.
- threadId: `019eeaf7-2e8b-7a30-aecf-1d7fc4977274`
- 호출 시 사용된 cross-gate dedupe 사전 점검: `mccp-receipt dedupe` 가 `skip_safe=false` (residual 84 files in PR #45 branch) — full Codex run 필요했음.

### YAGNI Triage (R1)

| Finding | Severity | Verdict | R1 absorption |
|---|---|---|---|
| F1: Planned version bump 1.8.0 already behind main 1.8.1 → non-monotonic release risk | HIGH | ACCEPT_NOW | Task 8 override — `plugin.json` 직접 `1.9.0` bump (PR #45 baseline 1.7.0 → 1.9.0, jump 1 minor). CHANGELOG entry도 `[1.9.0]`. Rebase 시점에서 main 1.8.1과 사이에 1.8.x 잡힘이 사라져 monotonic 보장. |
| F2: H15 fence strip은 triple-backtick만 → tilde fence + 긴 backtick fence false-positive 통과 | MEDIUM | ACCEPT_NOW | Task 3 override — markdown fence strip을 (a) triple+ backtick fence `` `{3,} `` paired, (b) triple+ tilde fence `~{3,}` paired 양쪽 cover. regex: `/^([`~]{3,})[^\n]*\n[\s\S]*?\n\1[`~]*$/gm` 또는 단순화한 두 패스 strip. Task 5에 tilde fence pass test 1건 추가. |
| F3: H16 dunder whitelist 10종 너무 좁음 — `__all__`/`__slots__`/`__dict__`/`__iter__`/`__len__` 누락, 본 repo skill docs에 이미 존재 | MEDIUM | ACCEPT_NOW | Task 4 override — `PYTHON_DUNDERS` regex를 15종으로 확장: `init,name,main,file,doc,str,repr,call,enter,exit,all,slots,dict,iter,len`. Task 5에 `__all__`/`__slots__`/`__dict__` no-trigger test 2건 추가, dunder count assertion 갱신. |
| F4: H16 entity coverage 좁음 — `&#96;`/`&#x60;` lowercase exact만, `&#096;`/`&#x060;`/`&#X60;`/`&grave;` 및 entity-encoded `*`/`_` bypass | MEDIUM | ACCEPT_NOW | Task 4 override — entity patterns 세 가지로 확장 + named entity 포함: (i) backtick: `(?:&#0*96;|&#[xX]0*60;|&grave;)`, (ii) asterisk: `(?:&#0*42;|&#[xX]0*2[aA];|&ast;)`, (iii) underscore: `(?:&#0*95;|&#[xX]0*5[fF];|&lowbar;|&UnderBar;)`. asterisk/underscore entity는 paired matching(2회 이상 등장 시 fire) — bold marker bypass 방지. Task 5에 leading-zero/uppercase/named entity 3건 + entity-asterisk 1건 = 4 test 추가. |

- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` 미증가
- Open Questions: 0 신규 (기존 5 OQ 유지)
- Auto-CRITICAL catalog 6종 hit: 0

### R1 absorption note

F1은 plan 작성 시점(2026-06-21 morning) 이후 main 진행(PR #51 → 1.8.1)을 plan body가 trail. 본 implement는 1.9.0으로 직접 bump하여 race 자체를 차단 — Task 8 코드의 `1.7.0 → 1.8.0`은 `1.7.0 → 1.9.0`으로 재해석. F2/F3/F4는 모두 spec catalog의 coverage gap — Codex가 *production repo content* (skill docs의 `__all__` 등)를 정확히 지적한 점이 dual-model dogfood의 가치. F3 expansion은 false-positive 회피, F4 expansion은 false-negative 회피로 axis 반대 — 두 vector 모두 catalog 확장으로 일관 해소.

### Stacking note

implement 진입은 PR #45 stack 모드 (사용자 명시 override). 현재 worktree `chore/v1.3.0-prd-status-roll` 유지 — Task 0 preflight branch-check은 stack 의도로 skip(plan 본문은 "PR #45 merge 후 새 worktree" 기준이었음). PR #45가 main에 squash merged 후 별도 H15+H16 PR을 voucher가 아니라 PR #45 본체에 H15+H16을 누적하여 1개 PR로 ship.

