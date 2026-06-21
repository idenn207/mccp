# Plan: v1.4.2 Dashboard Overhaul — Milestone 2 (Content + Actionability)

**Source PRD**: [.claude/prds/v1-4-2-dashboard-overhaul.prd.md](../prds/v1-4-2-dashboard-overhaul.prd.md)
**Selected Milestone**: 2 — content + actionability (axes 3 + 4 + 5 + 6 + 9)
**Complexity**: Medium-Large (5 axis, M1 branch 위 추가 commit, parser 4 신규 + section 1 신규 + sections 2 확장, M3 renderer surface 본문 변경)

## Summary

PRD §M2 5축을 단일 commit chunk로 정리한다. (3) jargon expand — static whitelist 기반 `expandJargon(text)`로 gate name / env var / file path / decision_id에 한글 expansion 부착 (HTML `<abbr title>`, markdown parenthetical). (4) cross-section dedupe — OQ ↔ Risks 사이 text fingerprint 매칭으로 동일 사안 중복 제거 (OQ 표시는 살리고 Risks 표시에서 `> 동일 OQ 참조` cue 추가). (5) milestone history — PRD `## Delivery Milestones` complete row + `mccp-pr-codex/*` receipt cross-ref로 완료된 milestone 흐름을 새 section `<section id="milestone-history">`로 surface. (6) intent extraction — plan/PRD body `## Hypothesis`/`## Summary`/`## Problem`에서 1줄 intent 추출, status-grid `next` cell tooltip + verdict text 확장에 첨부. (9) actionability — OQ/Risks를 4-part component (severity tag + item text + `> 왜:` meta-cue + action prompt block + Copy button)로 재구성, severity별 static template routing.

M2 design decisions (PRD §Open Questions에서 본 plan이 결정):

- **OQ-d (milestone history surface 데이터 source)** — **(ii) PRD `## Delivery Milestones` complete row aggregation + (iii) receipt `mccp-pr-codex/*` ship event cross-ref** dual source. (i) git log + plugin.json version bump commits parse는 OS shell 의존 + worktree rebase 시 commit graph 변형 위험으로 제외. PRD complete row는 *declarative truth* (사용자가 milestone complete 선언), receipt는 *ship 증거* (실제 PR merge 발생). 매칭은 PRD row 1줄 ↔ receipt decision_id heuristic — PRD plan path basename에서 cycle prefix(`v1-4-2`) + milestone 키워드 추출 후 receipt decision_id substring 매칭. mismatch 시 PRD-only entry로 surface (date 없음). receipt 단독 cross-ref(PRD entry 부재)는 surface 안 함 — 사용자가 declare하지 않은 milestone은 history가 아님.
- **OQ-f (action prompt template source)** — PRD §Design Direction이 이미 recommend한 **(i) static template whitelist** 채택. severity별 routing:
  | Severity | Template | Rationale |
  |---|---|---|
  | CRITICAL / HIGH | `/codex:rescue "<item text>"` | adversarial review + investigation 위임 |
  | MEDIUM | `/mccp:plan "<item text>"` | plan 단계 진입 |
  | LOW / unknown | `/mccp:plan-prd "<item text>"` | PRD 단계로 routing (LOW는 problem definition부터 다시) |
  | Risks (likelihood × impact ≥ HIGH×MEDIUM) | `/codex:rescue "리스크 완화: <risk> — 제안 mitigation: <mitigation>"` | risk는 mitigation context 동반 |
  LLM-derived는 v1.4.3+로 defer (PRD §OQ-f recommend). template surface는 raw text + `[복사]` button — clipboard API.
- **OQ-g (Open Question meta-cue 데이터 source)** — **(i) plan body 헤딩 path + 항목 위치 추출** 채택. `parseOpenQuestions`를 line-aware로 확장하여 각 OQ item에 `{ text, source, headingPath: ['## Open Questions'], lineNumber: 102 }` metadata 첨부. meta-cue surface 형식: `> 왜: <plan basename> §Open Questions, line <N>` 1줄. (ii) 인접 산문 1-2줄 추출은 휴리스틱이 불안정(빈 줄 / 별도 항목 / nested bullet 혼재) — v1.4.3+로 defer. plan body 산문 일부만 가져오는 대신 anchor를 정확히 가리키는 것이 *읽고 이동 가능*하다는 actionability 가치에 더 부합.
- **Additional decision (jargon scope, M2-내부)** — whitelist 32-48 entry 시작:
  - gate names (`mccp-plan-codex`, `mccp-implement-codex`, `mccp-pr-codex`, `mccp-code-review`)
  - env vars (`MCCP_GATE_ROUND_CAP`, `MCCP_RECEIPT_GATE_MODE`, `MCCP_AUTO_HANDOFF`, `MCCP_BRIEFING`, `MCCP_PR_SKIP_CODEX_REVIEW`, `MCCP_CODEX_DISABLED`, `MCCP_FORCE_PR_WITHOUT_*`, etc.)
  - commands (`/mccp:plan`, `/mccp:plan-prd`, `/mccp:prp-implement`, `/mccp:pr`, `/mccp:work`, `/mccp:resume`, `/mccp:receipt-*`, `/codex:rescue`, `/codex:setup`)
  - special concepts (`fail-closed`, `fail-open`, `dual-review`, `cross-gate dedupe`, `receipt chain`, `pr-phase lock`)
  - file path 식별자 (`STATE.md`, `STATUS.md`, `plan.md`, `prd.md`, `receipts/`, `cache/snapshots/`)
  expansion 표기: HTML `<abbr title="한글 풀이">` wrap, markdown은 첫 등장에만 `(<풀이>)` parenthetical append. 같은 출력 안에서 같은 jargon은 1회만 expand — first-occurrence-only invariant.
- **Additional decision (cross-section dedupe 알고리즘)** — text normalize → fingerprint:
  - normalize: lowercase + 양쪽 trim + 연속 whitespace 1 space로 collapse + punctuation(`. , ; :`) 제거 + 마커(`OQ-a` / `**OQ-a**` / `**a.**`) 제거
  - fingerprint: 첫 60 chars hash (no SHA — `'a..b..c'` 형식 단순 normalize string)
  - 매칭: OQ fingerprint와 Risks fingerprint 비교, 동일 시 Risks row에 `relatedOpenQuestion: '<OQ text 첫 40 chars>'` 첨부
  - dedupe action: Risks는 *surface 유지* + `<aside class="related-oq">동일 OQ 참조</aside>` 한 줄 cue. OQ는 *primary surface*로 그대로 유지. (Risks 자체 제거는 mitigation 정보 손실)

PRD scope 변경 없음 — M2가 다루지 않는 ax는 다음 cycle (v1.4.3+):
- a11y WCAG 2.2 full pass
- responsive layout (mobile 360px)
- LLM-derived action prompt
- meta-cue 산문 추출 (헤딩 anchor + line number만으로 충분)
- jargon dictionary i18n (한국어 외 언어)
- milestone history archive export

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Section render API | `plugins/mccp/scripts/lib/renderer/sections/open-questions.js:5-41` (`renderOpenQuestions`) | `(model, formatUtils, planBody) → { md, html }` 순수 함수. 외부 fs 직접 호출 금지. M2에서 4-part 확장 시 signature 유지 |
| Severity rank ladder | `plugins/mccp/scripts/lib/renderer/sections/risks.js:5-6` (`RANK` map) | `{ HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 }` enum. M2 action-prompt router도 동일 enum 사용 |
| HTML escape + accent | `plugins/mccp/scripts/lib/renderer/format-utils.js:82-99` (`escapeHtml` / `escapeAttr`) | 모든 user-controlled string (OQ text, risk mitigation, action prompt argument)에 적용. accent attr는 `escapeAttr` |
| Section h2 wrap | `plugins/mccp/scripts/lib/renderer/html.js:172-186` (`<section id="..."><h2>한글</h2>...`) | 새 section `milestone-history`도 동일 패턴. h2 텍스트 `이정표 기록` |
| Heading path stack | (없음 — M2가 신규 도입) | `parseOpenQuestions` line-aware 확장 시 `## Open Questions` 진입/이탈 stack 유지 + line counter |
| Test fixture composition | `plugins/mccp/scripts/lib/renderer/tests/staleness-guard.test.js` (M1 산출) | 4 fixture × `fsRead` 주입. M2 신규 test도 동일 — node:test + assert/strict |
| Safe-fallback wrap | `plugins/mccp/scripts/lib/renderer/index.js:15-34` (`safeSection`) | 모든 section render에 try/catch wrap. 신규 milestone-history section + 4-part wrap은 try/catch 내부에서 동작 |
| Receipt timeline read | `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js:67-74` (`m.sources.receipts.items`) | M2 milestone-history도 같은 source 재사용. created_at parse 동일 패턴 |
| PRD delivery row read | `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js:37-56` (`parseDeliveryMilestones`) | complete row filter → milestone-history에 surface. status === 'complete' 분기 추가만 필요 (parser 자체 변경 없음, helper export) |
| Copy button pattern | (없음 — M2가 신규 도입) | `navigator.clipboard.writeText` + inline JS one-liner. button 외부 attr `data-copy="<escaped text>"`로 payload, JS 1개로 모든 button 처리 (event delegation) |
| Korean copy patterns | `plugins/mccp/scripts/lib/renderer/format-utils.js:3-40` + M1 audit-timeline 한글 | 텔레그래픽 단문 (`복사됨` / `이정표 기록` / `왜:` / `다음 액션`). PRODUCT.md Calm voice 정합 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/jargon-dictionary.js` | CREATE | Static whitelist (32-48 entry 시작) + `expandJargon(text, opts) → { text, expansions: [{token, korean, span}] }` pure function. `opts.firstOccurrenceOnly = true` default — 같은 출력 안에서 같은 jargon 1회만 expand. opts.seen Set 주입 가능 (cross-section 공유). |
| `plugins/mccp/scripts/lib/renderer/parsers/intent-extractor.js` | CREATE | `extractIntent(body, opts) → string \| null` pure function. PRD body면 `## Hypothesis` 첫 줄 또는 `## Problem` 첫 문장, plan body면 `## Summary` 첫 문장 우선. 60자 cap (telegraphic). `opts.fsRead`로 inject. 결과는 status-grid `next` cell tooltip + verdict text suffix에 첨부. |
| `plugins/mccp/scripts/lib/renderer/parsers/action-prompt.js` | CREATE | `buildActionPrompt(item, kind) → { command, args, fullText }` pure function. `kind ∈ {'openQuestion', 'risk'}`. severity routing table 내장. fullText는 copy 대상 (`/codex:rescue "원문"` 형식). |
| `plugins/mccp/scripts/lib/renderer/parsers/cross-section-dedupe.js` | CREATE | `dedupOQAndRisks(openQuestions, risks) → { openQuestions, risks }` pure function. **F3 absorption (Codex MEDIUM 0.86)** — exact-prefix-60 fingerprint으로는 PRD 실제 OQ-a(`Stale plan 판정 기준 — (i)…`) vs Risk(`stale plan 판정 기준이 false-positive…`)의 의미적 overlap을 못 잡음. (a) marker regex를 `**OQ-a.**` / `**F1**` / `**a.**` (dot 포함) 모두 잡도록 확장, (b) normalize 후 token Jaccard 임계 (0.45 이상) 사용 — exact prefix 폐기. Risks row에 `relatedOpenQuestion: '<40자>'` mutation. OQ 자체는 변경 없음. |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | `parseOpenQuestions(planBody) → string[]` → `parseOpenQuestions(planBody) → Array<{text, lineNumber, headingPath}>` 시그니처 확장. 기존 caller가 raw text array를 기대했으므로 `parsePlanBody`가 호출 시 wrap 풀어서 `openQuestions: [{source, text, lineNumber, headingPath}]`로 surface (기존 객체 자체 형식은 유지 — text는 그대로 string, metadata는 신규 sibling 필드). 또한 `parseDeliveryMilestones` 결과에서 complete row만 추출하는 helper `parseDeliveryMilestonesComplete(prdBody) → Array<{name, planBasename, completedAt?}>` export. completedAt은 row에 없으면 undefined — receipt cross-ref에서 채움. |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | 4-part component (severity tag + item text + meta-cue + action prompt + copy button). state OQ는 severity unknown → MEDIUM default. plan OQ는 line + headingPath 사용. 3 expanded + `<details><summary>+N more</summary>` 나머지 collapse (PRD anchor 4 — 항목수 상한). markdown은 4-part을 plain bullet sub-list로 변환. severity icon: 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / ⚪ LOW. |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 4-part component 동일 적용. table 형태 폐기 (impact/likelihood/mitigation 모두 4-part 안 흡수). severity 산출: `max(impact, likelihood) → tag enum`. 3 expanded + collapse. dedupe cue `<aside class="related-oq">동일 OQ 참조: <40자>…</aside>` 한 줄, html/md 동일. |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | CREATE | `renderMilestoneHistory(model, formatUtils, planBody) → { md, html }` pure function. PRD complete row + mccp-pr-codex receipt cross-ref. 5 가장 최근 entry (date desc) surface, 나머지 `<details>+N more</summary>` collapse. 각 entry: milestone name + date(receipt cross-ref hit 시) + plan basename code chip. dedupe key = plan basename (한 plan이 multiple receipt 시 최신만). |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | (a) `milestone-history` section render call 추가 — main의 `<section id="risks">` 위에 배치 (history → OQ → Risks 흐름). (b) Copy button JS one-liner inline `<script>` 추가 — `addEventListener('click', e => { const t = e.target.closest('[data-copy]'); if(!t) return; navigator.clipboard.writeText(t.dataset.copy).then(() => { t.dataset.copied='1'; setTimeout(() => delete t.dataset.copied, 1500); }) })`. CSS: `.action-prompt`, `.severity-tag`, `.meta-cue`, `.related-oq`, `[data-copied="1"]::after { content: ' ✓복사됨'; color: var(--ok); }`. accent invariant 재검증 — 신규 element는 `--ink-2`/`--muted` 사용, accent는 status-strip first cell + (선택) 1개 milestone-history active entry까지만. **F1 absorption preview (Codex finding 가능)** — JS inline은 escape 위험. data-copy attr에 `escapeAttr` 적용 + payload는 ASCII fence (한글은 그대로 attr value에 들어가지만 `"` escape 필수). XSS surface 없음 — 모든 input은 plan body (사용자 통제 안 됨 — local fs 기반). |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | (a) `## 이정표 기록` section 추가 (history 위치는 `## 미해결 질문` 위). (b) 4-part component를 plain bullet sub-list로 변환:<br>`- 🟠 **OQ-a (HIGH)** — Stale plan 판정 기준`<br>`  - 왜: v1-4-2-dashboard-overhaul-m1.plan.md §Open Questions, line 102`<br>`  - 다음 액션: ` + code fence + `/codex:rescue "OQ-a 결정: ..."`. copy button은 markdown에는 surface 안 됨 (terminal context). |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | milestone-history section wire-up. `safeSection('milestone-history', ...)` 추가, sections 배열 6 → 7 element. `renderMarkdown` / `renderHtml` 시그니처 영향 — sections destructure 순서 명시 (idx 6 = milestone-history). |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATE (minimal) | step 9/10 verdict text에 intent suffix append. `next: v1.4.2 · dashboard overhaul m1 — <intent 60자>` 형태. intent 없으면 기존 text 그대로. `extractIntent(planBody, opts)` 호출은 verdict 내부에서. fail-open — extractor exception은 swallow, intent 없는 verdict로 fallback. |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE (minimal) | `nextStep` 셀에 intent tooltip 추가. `<code title="<intent escaped>">…</code>` — hover 시 intent surface. markdown 영향 없음. |
| `plugins/mccp/scripts/lib/renderer/tests/jargon-dictionary.test.js` | CREATE | 6 fixture: (a) gate name single occurrence expand, (b) env var single, (c) command single, (d) 같은 jargon 2회 등장 — first-occurrence-only invariant 검증, (e) 비-whitelist token unchanged, (f) HTML escape interplay (`MCCP_BRIEFING` + `<script>` 같은 hostile input은 escape 후 expand). |
| `plugins/mccp/scripts/lib/renderer/tests/intent-extractor.test.js` | CREATE | 5 fixture: (a) PRD `## Hypothesis` 첫 줄 추출, (b) PRD `## Problem` fallback (hypothesis 없을 때), (c) plan `## Summary` 첫 문장, (d) 60자 cap, (e) extractor exception → null fallback. |
| `plugins/mccp/scripts/lib/renderer/tests/action-prompt.test.js` | CREATE | 7 fixture: (a-d) severity별 routing (HIGH→codex:rescue, MEDIUM→mccp:plan, LOW→mccp:plan-prd, unknown→mccp:plan-prd), (e) risk kind는 mitigation 동반, (f) text 내 quote escape, (g) text length cap. |
| `plugins/mccp/scripts/lib/renderer/tests/cross-section-dedupe.test.js` | CREATE | 5 fixture: (a) 완전 일치 매칭 + Risks row에 cue 첨부, (b) normalize 후 매칭(공백 차이만), (c) 매칭 0건, (d) marker(`**OQ-a**`) 제거 후 매칭, (e) Risks 자체 제거 안 됨 검증. |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | CREATE | 9 fixture: (a-d) OQ/Risks 양쪽 4-part HTML markup 존재 (severity tag + meta-cue + action prompt + copy button), (e) 3 expanded + `<details>` collapse, (f) markdown sub-list 변환, (g) related-oq cue surface, (h) milestone-history section 존재 + complete row count, (i) copy button JS data-copy attr 존재. |
| `plugins/mccp/scripts/lib/renderer/tests/integration.test.js` | UPDATE | M1 fixture에 OQ 1건 + Risk 1건 (overlap text) 추가. 통합 출력에 4-part surface + dedupe cue + milestone-history 1 entry 검증. M1 staleness 검증은 그대로. |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | header hoist (M1) 그대로 유지 검증 + milestone-history section DOM 존재 추가. |
| `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` | UPDATE | Delivery Milestones row 2 (content + actionability): Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m2.plan.md](../plans/v1-4-2-dashboard-overhaul-m2.plan.md)`. row 1은 M1이 이미 in-progress 상태 (M1 commit에 포함). |
| `CHANGELOG.md` | UPDATE | 기존 `[1.9.0]` entry에 ### Added / ### Changed 항목 추가 — M2 5축 정리. version은 그대로 (M1+M2 single PR 가정). 만약 사용자가 별도 PR로 split 결정 시 새 `[1.10.0]` entry로 분리. |
| `plugins/mccp/.claude-plugin/plugin.json` | NO CHANGE (default) | M1+M2 single PR 가정 시 M1 commit이 이미 `1.8.0 → 1.9.0` bump 완료. M2가 추가 bump 불필요. 만약 별도 PR split 시 `1.9.0 → 1.10.0` minor bump. PR 작성 시점에 user 의도 재확인. |

**No mutations** to: `plugins/mccp/scripts/derive/*` (M1 derive surface immutable invariant 그대로 — M2도 read-only consumer). `plugins/mccp/commands/*.md` (renderer scope 외). `plugins/mccp/scripts/lib/renderer/trigger.js` (M4 trigger surface, scope 외). M1 산출 4 file (parsers/plan-body.js의 staleness 부분, sections/status-grid.js의 formatPlanLabel, html.js의 header strip, markdown.js의 한글 heading)은 *확장만* 적용, 기존 동작 invariant 유지.

## Tasks

### Task 1: parsers/jargon-dictionary.js — static whitelist + expandJargon

- **Action**: 신규 module `plugins/mccp/scripts/lib/renderer/parsers/jargon-dictionary.js`:
  ```js
  'use strict';
  const DICTIONARY = Object.freeze({
    // gate names
    'mccp-plan-codex': 'plan 단계 Codex 검토',
    'mccp-implement-codex': '구현 단계 Codex 검토',
    'mccp-pr-codex': 'PR 단계 Codex 검토',
    'mccp-code-review': '로컬 코드 리뷰',
    // env vars
    'MCCP_GATE_ROUND_CAP': 'gate 재실행 상한',
    'MCCP_RECEIPT_GATE_MODE': 'receipt 게이트 엄격도',
    'MCCP_AUTO_HANDOFF': '비용 임계 자동 핸드오프',
    'MCCP_BRIEFING': 'LLM briefing stamp 토글',
    'MCCP_PR_SKIP_CODEX_REVIEW': 'PR 단계 Codex skip(감사 가능)',
    'MCCP_CODEX_DISABLED': 'Codex 호출 영구 비활성',
    'MCCP_FORCE_PR_WITHOUT_IMPECCABLE': 'impeccable 미가용 우회(감사)',
    'MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER': 'security-reviewer 미가용 우회(감사)',
    // commands
    '/mccp:plan': '구현 계획 작성 + Codex R1',
    '/mccp:plan-prd': '문제 정의 PRD 작성',
    '/mccp:prp-implement': '계획 실행 + 검증 루프',
    '/mccp:pr': 'GitHub PR 생성 + Codex R3',
    '/mccp:work': '단일 entry orchestrator',
    '/mccp:resume': '핸드오프 신호 복원',
    '/codex:rescue': 'Codex에 위임 (조사/수정)',
    '/codex:setup': 'Codex CLI 인증 확인',
    // concepts
    'fail-closed': '실패 시 차단',
    'fail-open': '실패 시 통과 + 경고',
    'dual-review': '서로 다른 모델 2개 합의',
    'cross-gate dedupe': '같은 결정 중복 검토 skip',
    'receipt chain': '게이트 receipt 연쇄 검증',
    'pr-phase lock': 'PR 검토 단계 write 차단',
    // file path 식별자 (short forms)
    'STATE.md': '세션 연속성 상태',
    'STATUS.md': '대시보드 markdown 산출',
  });
  // longer keys first → 짧은 key가 긴 key 안에 substring으로 들어있어도 longer 먼저 match
  const SORTED_KEYS = Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);
  function expandJargon(text, opts) {
    opts = opts || {};
    const seen = opts.seen instanceof Set ? opts.seen : new Set();
    const expansions = [];
    let out = String(text || '');
    for (const key of SORTED_KEYS) {
      if (seen.has(key)) continue;
      const idx = out.indexOf(key);
      if (idx === -1) continue;
      expansions.push({ token: key, korean: DICTIONARY[key], span: [idx, idx + key.length] });
      seen.add(key);
    }
    return { text: out, expansions };
  }
  function renderJargonHtml(text, opts, escapeHtml, escapeAttr) {
    const { text: raw, expansions } = expandJargon(text, opts);
    if (expansions.length === 0) return escapeHtml(raw);
    expansions.sort((a, b) => b.span[0] - a.span[0]);
    let html = escapeHtml(raw);
    // 단순 substring replace — escapeHtml 통과 후 token이 손상되지 않은 jargon에만 적용
    for (const ex of expansions) {
      const escToken = escapeHtml(ex.token);
      const escKorean = escapeAttr(ex.korean);
      const wrapped = '<abbr title="' + escKorean + '">' + escToken + '</abbr>';
      const at = html.indexOf(escToken);
      if (at === -1) continue;
      html = html.slice(0, at) + wrapped + html.slice(at + escToken.length);
    }
    return html;
  }
  function renderJargonMarkdown(text, opts) {
    const { text: raw, expansions } = expandJargon(text, opts);
    if (expansions.length === 0) return raw;
    let md = raw;
    expansions.sort((a, b) => b.span[0] - a.span[0]);
    for (const ex of expansions) {
      const replacement = ex.token + ' (' + ex.korean + ')';
      const at = md.indexOf(ex.token);
      if (at === -1) continue;
      md = md.slice(0, at) + replacement + md.slice(at + ex.token.length);
    }
    return md;
  }
  module.exports = { DICTIONARY, expandJargon, renderJargonHtml, renderJargonMarkdown };
  ```
- **Mirror**: `format-utils.js:82-99` (`escapeHtml`/`escapeAttr` 패턴) — 모든 user text는 escape 후 surface. dictionary는 frozen object (immutable).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/jargon-dictionary.test.js` — 6 fixture 통과.

### Task 2: parsers/intent-extractor.js — pure intent puller

- **Action**: 신규 module `plugins/mccp/scripts/lib/renderer/parsers/intent-extractor.js`:
  ```js
  'use strict';
  const fs = require('fs');
  const MAX_LEN = 60;
  function firstNonEmptyLine(section) {
    if (!section) return null;
    const lines = section.split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('#') || t.startsWith('|') || t.startsWith('-')) continue;
      if (t.startsWith('<!--') || t.startsWith('>')) continue;
      return t;
    }
    return null;
  }
  function findSection(body, heading) {
    const m = new RegExp('^' + heading + '\\s*$', 'm').exec(body);
    if (!m) return null;
    const rest = body.slice(m.index + m[0].length);
    const next = rest.match(/\n##\s/);
    return next ? rest.slice(0, next.index) : rest;
  }
  function truncate(s) {
    if (!s) return null;
    const t = s.replace(/[*_`]/g, '').trim();
    if (!t) return null;
    if (t.length <= MAX_LEN) return t;
    return t.slice(0, MAX_LEN - 1) + '…';
  }
  function extractIntent(body, opts) {
    if (typeof body !== 'string' || !body) return null;
    // PRD 우선 순위 — Hypothesis → Problem
    const hyp = findSection(body, '## Hypothesis');
    if (hyp) return truncate(firstNonEmptyLine(hyp));
    const prob = findSection(body, '## Problem');
    if (prob) return truncate(firstNonEmptyLine(prob));
    // plan body — ## Summary
    const sum = findSection(body, '## Summary');
    if (sum) return truncate(firstNonEmptyLine(sum));
    return null;
  }
  function extractIntentFromPath(absPath, opts) {
    opts = opts || {};
    const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
    try { return extractIntent(fsRead(absPath), opts); }
    catch (_) { return null; }
  }
  module.exports = { extractIntent, extractIntentFromPath };
  ```
- **Mirror**: `plan-body.js:8-15` (`findSection`) 동일 helper. truncate는 PRODUCT.md telegraphic voice 정합.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/intent-extractor.test.js` — 5 fixture 통과.

### Task 3: parsers/action-prompt.js — severity → static template router

- **Action**: 신규 module `plugins/mccp/scripts/lib/renderer/parsers/action-prompt.js`:
  ```js
  'use strict';
  const RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };
  function rank(s) { return RANK[String(s || '').toUpperCase()] || 0; }
  function maxRank(a, b) { return rank(a) >= rank(b) ? a : b; }
  function quoteArg(s) {
    // PowerShell + Bash 양쪽 호환 — double quote escape only. 사용자가 prompt를 셸에 paste할 가능성.
    return '"' + String(s || '').replace(/"/g, '\\"') + '"';
  }
  function truncateText(s, n) {
    const t = String(s || '').trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1) + '…';
  }
  function buildActionPrompt(item, kind) {
    const ARG_CAP = 200;
    if (kind === 'risk') {
      const r = item || {};
      const sev = maxRank(r.impact, r.likelihood);
      const sevUp = String(sev || '').toUpperCase();
      const risk = truncateText(r.risk, ARG_CAP);
      const mit = truncateText(r.mitigation, ARG_CAP);
      const arg = '리스크 완화: ' + risk + (mit ? ' — 제안 mitigation: ' + mit : '');
      return {
        command: '/codex:rescue',
        args: quoteArg(arg),
        fullText: '/codex:rescue ' + quoteArg(arg),
        severity: sevUp,
      };
    }
    // openQuestion default
    const o = item || {};
    const sev = String(o.severity || '').toUpperCase();
    const text = truncateText(o.text, ARG_CAP);
    let cmd;
    if (sev === 'CRITICAL' || sev === 'HIGH') cmd = '/codex:rescue';
    else if (sev === 'MEDIUM') cmd = '/mccp:plan';
    else cmd = '/mccp:plan-prd';
    return {
      command: cmd,
      args: quoteArg(text),
      fullText: cmd + ' ' + quoteArg(text),
      severity: sev || 'UNKNOWN',
    };
  }
  module.exports = { buildActionPrompt, rank, maxRank };
  ```
- **Mirror**: `sections/risks.js:5-6` (`RANK` map) 동일 enum.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/action-prompt.test.js` — 7 fixture 통과.

### Task 4: parsers/cross-section-dedupe.js — token Jaccard matching (F3 absorption)

- **Action**: 신규 module `plugins/mccp/scripts/lib/renderer/parsers/cross-section-dedupe.js`. **F3 absorption (Codex MEDIUM 0.86)** — exact prefix-60 fingerprint은 의미 overlap을 못 잡으므로 token Jaccard overlap (threshold 0.45) 채택. marker regex는 dot 포함 form (`**OQ-a.**`, `**F1.**`) 모두 잡도록 확장.
  ```js
  'use strict';
  const MIN_TOKEN_LEN = 2;
  const JACCARD_THRESHOLD = 0.45;
  const MIN_TOKENS = 4; // 너무 짧은 텍스트는 false-positive 위험
  // F3 absorption — `**OQ-a.**`, `**F1.**`, `**a.**` (dot/dash/space 포함 marker) 모두 strip
  const MARKER_RE = /\*\*[A-Za-z0-9_.\- ]+\*\*/g;
  // 조사/공통 단어 dedup 위해 stop words 일부 (영/한 mix)
  const STOP = new Set(['', '의', '이', '가', '을', '를', '는', '은', '에', '와', '과', 'or', 'and', 'the', 'a', 'an']);
  function tokenize(text) {
    const t = String(text || '')
      .toLowerCase()
      .replace(MARKER_RE, ' ')
      .replace(/[*_`]/g, ' ')
      .replace(/[.,;:!?(){}\[\]<>"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return new Set();
    const toks = t.split(/\s+/).filter(x => x.length >= MIN_TOKEN_LEN && !STOP.has(x));
    return new Set(toks);
  }
  function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }
  function dedupOQAndRisks(openQuestions, risks) {
    const oq = Array.isArray(openQuestions) ? openQuestions : [];
    const rs = Array.isArray(risks) ? risks : [];
    if (oq.length === 0 || rs.length === 0) return { openQuestions: oq, risks: rs };
    const oqTokens = oq.map(q => ({ q, toks: tokenize(q && q.text) }));
    const updated = rs.map(r => {
      const rToks = tokenize(r && r.risk);
      if (rToks.size < MIN_TOKENS) return r;
      let best = null, bestScore = 0;
      for (const { q, toks } of oqTokens) {
        if (toks.size < MIN_TOKENS) continue;
        const s = jaccard(toks, rToks);
        if (s > bestScore) { bestScore = s; best = q; }
      }
      if (!best || bestScore < JACCARD_THRESHOLD) return r;
      const preview = String(best.text || '').trim().slice(0, 40);
      return Object.assign({}, r, { relatedOpenQuestion: preview, _dedupeScore: Number(bestScore.toFixed(2)) });
    });
    return { openQuestions: oq, risks: updated };
  }
  module.exports = { dedupOQAndRisks, tokenize, jaccard, JACCARD_THRESHOLD };
  ```
- **Mirror**: `audit-timeline.js:21-29` (`rowKey` pattern). MIN_TOKENS=4 + threshold 0.45는 v1.4.2 PRD의 OQ-a/Risk 1 (stale plan 기준 ↔ stale plan false-positive)와 OQ-f/Risk 2 (action prompt template 후보 ↔ Actionability prompt 잘못 제시) 모두 catch 가능한 휴리스틱 sweet spot.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/cross-section-dedupe.test.js` — Task 13의 real-PRD fixture 포함 6 fixture 통과.

### Task 5: parsers/plan-body.js — line-aware parseOpenQuestions + complete row helper

- **Action**: 기존 `parseOpenQuestions` 시그니처 확장:
  ```js
  function parseOpenQuestions(planBody) {
    if (!planBody) return [];
    const lines = planBody.split(/\r?\n/);
    const out = [];
    const headingStack = [];
    let inOQ = false;
    let oqHeadingLine = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 헤딩 stack 갱신
      const h2 = /^##\s+(.+?)\s*$/.exec(line);
      const h3 = /^###\s+(.+?)\s*$/.exec(line);
      if (h2) {
        headingStack.length = 0;
        headingStack.push('## ' + h2[1].trim());
        inOQ = /open\s+questions/i.test(h2[1]);
        if (inOQ) oqHeadingLine = i + 1;
        continue;
      }
      if (h3) {
        // h3은 stack 끝에만 — h2가 새로 들어오면 reset
        while (headingStack.length > 1) headingStack.pop();
        headingStack.push('### ' + h3[1].trim());
        continue;
      }
      if (!inOQ) continue;
      const m = line.match(/^\s*-\s+(?:\[[ xX]?\]\s+)?(.+?)\s*$/);
      if (m) {
        const text = m[1].trim();
        if (text) {
          out.push({
            text,
            lineNumber: i + 1,
            headingPath: headingStack.slice(),
            oqHeadingLineNumber: oqHeadingLine,
          });
        }
      }
    }
    return out;
  }
  ```
  + `parsePlanBody` 내부에서 `oq` 결과를 wrap 풀어 `openQuestions.push({ source, text, lineNumber, headingPath })` — 기존 caller(open-questions.js)가 `entry.text` 접근만 하므로 backwards-compat. 추가 metadata는 4-part rendering에서 사용.
  + `parseDeliveryMilestonesComplete(prdBody) → Array<{name, planBasename}>` helper export:
    ```js
    function parseDeliveryMilestonesComplete(prdBody) {
      const out = [];
      const section = findSection(prdBody, '## Delivery Milestones');
      if (!section) return out;
      const rows = parseTableRows(section);
      for (const cells of rows) {
        if (cells.length < 5) continue;
        const status = cells[3].toLowerCase();
        if (status !== 'complete') continue;
        const name = (cells[1] || '').trim();
        const planCell = cells[4] || '';
        const linkMatch = planCell.match(/\(([^)]+)\)/);
        const basename = linkMatch ? linkMatch[1].split(/[\\/]/).pop() : null;
        if (name) out.push({ name, planBasename: basename });
      }
      return out;
    }
    ```
- **Mirror**: 기존 `parseOpenQuestions`의 raw text 추출 패턴. heading stack은 markdown depth ≤ 3 invariant (PRD anchor 1) 정합. backwards-compat 보장 — caller가 `q.text` 접근만 하면 작동.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` — 기존 통과 + 신규 metadata 검증.

### Task 6: sections/open-questions.js — 4-part component

- **Action**: 전면 재작성:
  ```js
  'use strict';
  const { buildActionPrompt } = require('../parsers/action-prompt');
  const { renderJargonHtml, renderJargonMarkdown } = require('../parsers/jargon-dictionary');
  const path = require('path');
  const MAX_EXPANDED = 3;
  const SEVERITY_ICON = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪', UNKNOWN: '⚪' };
  function severityIcon(sev) {
    return SEVERITY_ICON[String(sev || 'UNKNOWN').toUpperCase()] || '⚪';
  }
  function metaCue(q) {
    if (!q || (!q.source && !q.lineNumber)) return null;
    const base = q.source ? path.basename(q.source) : null;
    const head = (q.headingPath && q.headingPath[0]) || '## Open Questions';
    const heading = head.replace(/^##\s+/, '');
    const lineN = q.lineNumber ? ', line ' + q.lineNumber : '';
    if (base) return base + ' §' + heading + lineN;
    return '§' + heading + lineN;
  }
  function renderOpenQuestions(model, formatUtils, planBody) {
    const { escapeHtml, escapeAttr } = formatUtils;
    const m = model || {};
    const sources = m.sources || {};
    const stateItem = sources.state && sources.state.item;
    const stateBody = (stateItem && stateItem.body) || {};
    const stateOQRaw = Array.isArray(stateBody.open_questions) ? stateBody.open_questions : [];
    const planOQ = Array.isArray(planBody && planBody.openQuestions) ? planBody.openQuestions : [];
    // state OQ는 raw string array — MEDIUM default + no source line
    const merged = [];
    const seen = new Set();
    for (const text of stateOQRaw) {
      const s = String(text || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      merged.push({ text: s, source: 'STATE.md', severity: 'MEDIUM' });
    }
    for (const q of planOQ) {
      const s = String((q && q.text) || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      // severity 추론 — text 안 `(HIGH)` / `**high**` 패턴
      const sev = /\b(critical|high|medium|low)\b/i.exec(s);
      merged.push(Object.assign({}, q, {
        severity: sev ? sev[1].toUpperCase() : 'MEDIUM',
      }));
    }
    if (merged.length === 0) return null;
    const expanded = merged.slice(0, MAX_EXPANDED);
    const collapsed = merged.slice(MAX_EXPANDED);
    const jargonSeen = new Set();
    function renderItem(q) {
      const sev = q.severity || 'MEDIUM';
      const ap = buildActionPrompt(q, 'openQuestion');
      const cue = metaCue(q);
      // HTML
      const sevTag = '<span class="severity-tag s-' + escapeHtml(sev.toLowerCase()) + '">'
        + severityIcon(sev) + ' ' + escapeHtml(sev) + '</span>';
      const textHtml = '<span class="item-text">' + renderJargonHtml(q.text, { seen: jargonSeen }, escapeHtml, escapeAttr) + '</span>';
      const cueHtml = cue ? '<blockquote class="meta-cue">왜: ' + escapeHtml(cue) + '</blockquote>' : '';
      // F1 absorption (Codex HIGH 0.93) — escapeAttr은 URL-encode (공백→%20, 괄호→%28%29)이라
      // 복사 시 slash command가 깨짐. data-copy attr는 HTML attribute escape만 필요
      // (`"` / `&` / `<` / `>` / `'`). escapeHtml로 충분 (format-utils의 escapeHtml은 6 char escape).
      const apHtml = '<div class="action-prompt">'
        + '<code>' + escapeHtml(ap.fullText) + '</code>'
        + '<button class="copy-btn" data-copy="' + escapeHtml(ap.fullText) + '" type="button">복사</button>'
        + '</div>';
      const html = '<li class="oq-item">' + sevTag + ' ' + textHtml + cueHtml + apHtml + '</li>';
      // Markdown
      const mdSeen = new Set();
      const textMd = renderJargonMarkdown(q.text, { seen: mdSeen });
      const md = '- ' + severityIcon(sev) + ' **' + sev + '** — ' + textMd
        + (cue ? '\n  - 왜: ' + cue : '')
        + '\n  - 다음 액션: `' + ap.fullText + '`';
      return { html, md };
    }
    const expandedRendered = expanded.map(renderItem);
    const collapsedRendered = collapsed.map(renderItem);
    let html = '<ul class="open-questions" role="list">' + expandedRendered.map(r => r.html).join('') + '</ul>';
    if (collapsed.length > 0) {
      html += '<details class="oq-more"><summary>+' + collapsed.length + ' 더보기</summary>'
        + '<ul role="list">' + collapsedRendered.map(r => r.html).join('') + '</ul></details>';
    }
    let md = expandedRendered.map(r => r.md).join('\n');
    if (collapsed.length > 0) {
      md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
        + collapsedRendered.map(r => r.md).join('\n')
        + '\n\n</details>';
    }
    return { md, html };
  }
  module.exports = { renderOpenQuestions };
  ```
- **Mirror**: 기존 `open-questions.js` signature 유지 (`(model, formatUtils, planBody) → { md, html }`). 3 expanded + collapse는 PRD anchor 4. `<details>` native는 PRD §Interaction model (no JS expand).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` 일부 — OQ 4-part 검증.

### Task 7: sections/risks.js — 4-part component + dedupe cue

- **Action**: 전면 재작성 (table → 4-part list):
  ```js
  'use strict';
  const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
  const { renderJargonHtml, renderJargonMarkdown } = require('../parsers/jargon-dictionary');
  const MAX_EXPANDED = 3;
  const SEVERITY_ICON = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪', '': '⚪' };
  function renderRisks(model, formatUtils, planBody) {
    const { escapeHtml, escapeAttr } = formatUtils;
    const pb = planBody || {};
    const allRisks = Array.isArray(pb.risks) ? pb.risks.slice() : [];
    if (allRisks.length === 0) {
      return {
        md: '_미해결 위험 없음_',
        html: '<p class="muted"><em>미해결 위험 없음</em></p>',
      };
    }
    // sort by max(impact, likelihood)
    function sevOf(r) { return String(maxRank(r.impact, r.likelihood) || '').toUpperCase(); }
    const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };
    allRisks.sort((a, b) => (RANK_MAP[sevOf(b)] || 0) - (RANK_MAP[sevOf(a)] || 0));
    const expanded = allRisks.slice(0, MAX_EXPANDED);
    const collapsed = allRisks.slice(MAX_EXPANDED);
    const jargonSeen = new Set();
    function renderItem(r) {
      const sev = sevOf(r) || 'MEDIUM';
      const icon = SEVERITY_ICON[sev] || '⚪';
      const ap = buildActionPrompt(r, 'risk');
      const text = r.risk || '';
      const textHtml = '<span class="item-text">' + renderJargonHtml(text, { seen: jargonSeen }, escapeHtml, escapeAttr) + '</span>';
      const mitHtml = r.mitigation ? '<div class="risk-mitigation muted">mitigation: ' + renderJargonHtml(r.mitigation, { seen: jargonSeen }, escapeHtml, escapeAttr) + '</div>' : '';
      const cueHtml = r.relatedOpenQuestion
        ? '<aside class="related-oq">동일 OQ 참조: ' + escapeHtml(r.relatedOpenQuestion) + '…</aside>'
        : '';
      const sevTag = '<span class="severity-tag s-' + escapeHtml(sev.toLowerCase()) + '">' + icon + ' ' + escapeHtml(sev) + '</span>';
      // F1 absorption — data-copy는 escapeHtml만 (escapeAttr URL-encode 회피)
      const apHtml = '<div class="action-prompt">'
        + '<code>' + escapeHtml(ap.fullText) + '</code>'
        + '<button class="copy-btn" data-copy="' + escapeHtml(ap.fullText) + '" type="button">복사</button>'
        + '</div>';
      const html = '<li class="risk-item">' + sevTag + ' ' + textHtml + mitHtml + cueHtml + apHtml + '</li>';
      // markdown
      const mdSeen = new Set();
      const textMd = renderJargonMarkdown(text, { seen: mdSeen });
      const mitMd = r.mitigation ? '\n  - mitigation: ' + renderJargonMarkdown(r.mitigation, { seen: mdSeen }) : '';
      const cueMd = r.relatedOpenQuestion ? '\n  - 동일 OQ 참조: ' + r.relatedOpenQuestion + '…' : '';
      const md = '- ' + icon + ' **' + sev + '** — ' + textMd
        + mitMd + cueMd
        + '\n  - 다음 액션: `' + ap.fullText + '`';
      return { html, md };
    }
    const expandedR = expanded.map(renderItem);
    const collapsedR = collapsed.map(renderItem);
    let html = '<ul class="risks-list" role="list">' + expandedR.map(r => r.html).join('') + '</ul>';
    if (collapsed.length > 0) {
      html += '<details class="risks-more"><summary>+' + collapsed.length + ' 더보기</summary>'
        + '<ul role="list">' + collapsedR.map(r => r.html).join('') + '</ul></details>';
    }
    let md = expandedR.map(r => r.md).join('\n');
    if (collapsed.length > 0) {
      md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
        + collapsedR.map(r => r.md).join('\n')
        + '\n\n</details>';
    }
    return { md, html };
  }
  module.exports = { renderRisks };
  ```
  + `index.js`에서 `dedupOQAndRisks` 호출 후 `planBody.risks` mutation — Task 11 참조.
- **Mirror**: 기존 `risks.js` signature 유지. table → list 변환은 PRD §OQ/Risk 4-part 명시. severity는 max(impact, likelihood) — risks.js 기존 sort 룰 정합.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` 일부 — Risks 4-part + dedupe cue 검증.

### Task 8: sections/milestone-history.js — CREATE

- **Action**: 신규 module:
  ```js
  'use strict';
  const fs = require('fs');
  const path = require('path');
  const { parseDeliveryMilestonesComplete } = require('../parsers/plan-body');
  const MAX_EXPANDED = 5;
  function findPrdSourcesFromPlans(plans, cwd, fsRead) {
    const set = new Map();
    for (const p of plans) {
      if (!p || !p.source_prd) continue;
      const ref = typeof p.source_prd === 'string' ? p.source_prd
        : (p.source_prd && p.source_prd.path) || null;
      if (!ref) continue;
      const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
      const prdAbs = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(planAbs), ref);
      if (!set.has(prdAbs)) set.set(prdAbs, true);
    }
    return Array.from(set.keys());
  }
  function pickShipReceipt(receipts, planBasename) {
    // mccp-pr-codex/* 중 plan basename slug (cycle prefix + milestone keyword) 매칭
    // F2 absorption (Codex HIGH 0.9) — derive normalize 출력은 `gate`(not `gate_id`).
    // audit-timeline.js와 동일 패턴 `r.gate_id || r.gate` 사용 (양쪽 호환).
    if (!planBasename) return null;
    const slug = planBasename.replace(/\.plan\.md$/, '').replace(/\.md$/, '');
    let best = null;
    for (const r of receipts) {
      if (!r) continue;
      const gate = r.gate_id || r.gate;
      if (gate !== 'mccp-pr-codex') continue;
      const dec = r.decision_id || '';
      if (!dec) continue;
      // substring 또는 cycle prefix overlap heuristic
      const ok = dec.indexOf(slug) >= 0 || slug.indexOf(dec) >= 0
        || (slug.match(/^(v\d+-\d+-\d+)/) || [])[0] === (dec.match(/^(v\d+-\d+-\d+)/) || [])[0];
      if (!ok) continue;
      if (!r.created_at) continue;
      if (!best || (new Date(r.created_at).getTime() > new Date(best.created_at).getTime())) {
        best = r;
      }
    }
    return best;
  }
  function renderMilestoneHistory(model, formatUtils, planBody, opts) {
    opts = opts || {};
    const { escapeHtml, formatRelativeTime } = formatUtils;
    const m = model || {};
    const cwd = opts.cwd || (m.repo_root && typeof m.repo_root === 'string' && m.repo_root !== '<repo>'
      ? m.repo_root : process.cwd());
    const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
    const plans = (m.sources && m.sources.plans && m.sources.plans.items) || [];
    const receipts = (m.sources && m.sources.receipts && m.sources.receipts.items) || [];
    const prdPaths = findPrdSourcesFromPlans(plans, cwd, fsRead);
    const all = [];
    for (const prdAbs of prdPaths) {
      let body;
      try { body = fsRead(prdAbs); } catch (_) { continue; }
      const completeRows = parseDeliveryMilestonesComplete(body);
      for (const row of completeRows) {
        const ship = pickShipReceipt(receipts, row.planBasename);
        all.push({
          name: row.name,
          planBasename: row.planBasename,
          completedAt: ship && ship.created_at ? ship.created_at : null,
        });
      }
    }
    // dedup by planBasename (한 plan이 여러 PRD에 등장 시 최신)
    const seen = new Map();
    for (const e of all) {
      const key = e.planBasename || e.name;
      const prev = seen.get(key);
      if (!prev) { seen.set(key, e); continue; }
      // 최신 completedAt 우선
      const a = e.completedAt ? new Date(e.completedAt).getTime() : 0;
      const b = prev.completedAt ? new Date(prev.completedAt).getTime() : 0;
      if (a > b) seen.set(key, e);
    }
    const merged = Array.from(seen.values()).sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    });
    if (merged.length === 0) return null;
    const expanded = merged.slice(0, MAX_EXPANDED);
    const collapsed = merged.slice(MAX_EXPANDED);
    const now = Date.now();
    function renderItem(e) {
      const rel = e.completedAt ? formatRelativeTime(e.completedAt, now) : '날짜 미상';
      const planChip = e.planBasename ? '<code>' + escapeHtml(e.planBasename) + '</code>' : '';
      const html = '<li class="milestone-item"><span class="ms-name">' + escapeHtml(e.name) + '</span>'
        + ' <span class="muted">· ' + escapeHtml(rel) + '</span>'
        + (planChip ? ' ' + planChip : '') + '</li>';
      const md = '- ' + e.name + ' · ' + rel + (e.planBasename ? ' (' + e.planBasename + ')' : '');
      return { html, md };
    }
    const expR = expanded.map(renderItem);
    const colR = collapsed.map(renderItem);
    let html = '<ul class="milestone-history" role="list">' + expR.map(r => r.html).join('') + '</ul>';
    if (collapsed.length > 0) {
      html += '<details class="ms-more"><summary>+' + collapsed.length + ' 더보기</summary>'
        + '<ul role="list">' + colR.map(r => r.html).join('') + '</ul></details>';
    }
    let md = expR.map(r => r.md).join('\n');
    if (collapsed.length > 0) {
      md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
        + colR.map(r => r.md).join('\n') + '\n\n</details>';
    }
    return { md, html };
  }
  module.exports = { renderMilestoneHistory };
  ```
- **Mirror**: `audit-timeline.js` receipt iteration + `parsers/plan-body.js` PRD path resolution. 5 expanded는 dashboard 4-axis 흐름에서 reading load 보호.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` 일부 — milestone-history section 검증.

### Task 9: html.js — milestone-history wire + copy button JS + 4-part CSS + accent invariant

- **Action**: `renderHtml` 변경:
  - sections destructure: `[grid, fanout, activeSessions, timeline, questions, risks, milestoneHistory]` (idx 6 추가).
  - main 안 배치 순서: verdict → workers → sessions → timeline → milestone-history → questions → risks. (history는 timeline 아래 — 시간 흐름 인접).
  - milestone-history section render:
    ```js
    if (milestoneHistory) {
      parts.push('<section id="milestone-history"><h2>이정표 기록</h2>' + milestoneHistory.html + '</section>');
    }
    ```
  - CSS LAYOUT 확장:
    ```css
    .severity-tag { display: inline-block; padding: 0 0.35em; border-radius: 3px;
      font-size: 0.8rem; font-weight: 500; }
    .severity-tag.s-critical, .severity-tag.s-high { color: var(--status-blocked); }
    .severity-tag.s-medium { color: var(--status-stale); }
    .severity-tag.s-low { color: var(--muted); }
    .oq-item, .risk-item { margin: 0.5rem 0; padding: 0.5rem 0; border-bottom: 1px dashed var(--border); list-style: none; }
    .oq-item:last-child, .risk-item:last-child { border-bottom: none; }
    .item-text { color: var(--ink); }
    .meta-cue { font-size: 0.85rem; margin: 0.25rem 0 0.25rem 1rem; color: var(--muted); border-left: 2px solid var(--border); padding-left: 0.5rem; }
    /* F2 absorption (impeccable MEDIUM) — 200+ char prompt wrap 안전 */
    .action-prompt { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.3rem; }
    .action-prompt code { background: var(--surface); padding: 0.25rem 0.4rem; border-radius: 3px; flex: 1; min-width: 0; max-width: 100%; overflow-x: auto; }
    .copy-btn { font-size: 0.8rem; padding: 0.2rem 0.6rem; border: 1px solid var(--border); flex-shrink: 0;
      background: var(--surface); color: var(--ink); cursor: pointer; border-radius: 3px; }
    .copy-btn:hover { background: var(--bg); }
    .copy-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .copy-btn[data-copied="1"] { color: var(--status-worker-alive); border-color: var(--status-worker-alive); }
    .related-oq { font-size: 0.85rem; color: var(--muted); margin: 0.25rem 0 0.25rem 1rem; }
    .risk-mitigation { font-size: 0.85rem; margin: 0.25rem 0 0.25rem 1rem; }
    .milestone-history { list-style: none; padding-left: 0; }
    .milestone-item { padding: 0.25rem 0; border-bottom: 1px dashed var(--border); }
    .milestone-item:last-child { border-bottom: none; }
    .ms-name { color: var(--ink); }
    details { margin-top: 0.5rem; }
    /* F1 absorption (impeccable MEDIUM) — details summary + abbr underline contrast WCAG AA */
    details summary { cursor: pointer; color: var(--ink-2, var(--ink)); font-size: 0.85rem; }
    details[open] summary { margin-bottom: 0.5rem; }
    abbr { text-decoration: underline dotted var(--ink-2, var(--ink)); text-underline-offset: 2px; cursor: help; }
    ```
  - Copy button JS (inline `<script>` 하단):
    ```js
    const COPY_SCRIPT = "(function(){document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-copy]');if(!t)return;var s=t.getAttribute('data-copy')||'';if(navigator&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){t.setAttribute('data-copied','1');setTimeout(function(){t.removeAttribute('data-copied')},1500)}).catch(function(){})}});})();";
    // parts.push('<script>' + COPY_SCRIPT + '</script>') — STALE_SCRIPT 옆에
    ```
  - **F1 absorption — data-copy escape** (Codex HIGH 0.93). `escapeAttr`는 URL-encode 기반 (`foo bar (baz)` → `foo%20bar%20%28baz%29`)이라 복사 시 slash command가 percent-encoded로 깨짐 — actionability path가 죽음. 대신 `escapeHtml`만 사용 — `"` / `&` / `<` / `>` / `'` 6 char escape으로 attr 안전성 충분 (data-copy attr는 inline string, JS 측 `dataset.copy` getter가 entity decode). XSS 측면도 동등 (escape 종류만 다름). Task 6/7 본문 absorption 반영. `<code>` 표시 텍스트와 `data-copy` payload 둘 다 escapeHtml로 통일. Acceptance에 spot-test 추가 — 실제 copy 결과가 spaces/quotes/parens 보존하는지 jsdom 환경에서 확인.
  - accent invariant 재검증 — 신규 .severity-tag / .action-prompt / .milestone-item는 `--accent` 미사용. status-strip first cell + 선택적 milestone-history 첫 entry까지 1 viewport ≤ 2 (header-strip은 sticky라 항상 1 carry-over).
- **Mirror**: `html.js:35-111` LAYOUT 패턴. STALE_SCRIPT inline 구조 그대로.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` + `node --test plugins/mccp/scripts/lib/renderer/tests/integration.test.js`.

### Task 10: markdown.js — milestone-history section + 4-part sub-list

- **Action**: `renderMarkdown` 변경:
  - sections destructure 동일 (idx 6 = milestoneHistory).
  - 배치 순서: verdict → 현황 → workers → sessions → timeline → milestone-history → questions → risks.
  - 새 section heading: `## 이정표 기록`.
  - 4-part은 이미 sections/open-questions.js, sections/risks.js의 markdown 출력에 포함 — markdown.js는 section heading + body 합성만.
  - footer 한글 그대로 유지 (M1 산출).
- **Mirror**: M1 `markdown.js` 한글 heading 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` (markdown branch) + integration.

### Task 11: index.js — milestone-history wire + cross-section dedupe call

- **Action**: `renderStatus` 본문 확장:
  - planBody 계산 직후 dedupe 호출:
    ```js
    const { dedupOQAndRisks } = require('./parsers/cross-section-dedupe');
    // ...
    const planBody = (...)();
    if (planBody && Array.isArray(planBody.openQuestions) && Array.isArray(planBody.risks)) {
      const { openQuestions, risks } = dedupOQAndRisks(planBody.openQuestions, planBody.risks);
      planBody.openQuestions = openQuestions;
      planBody.risks = risks;
    }
    ```
  - sections 추가:
    ```js
    const { renderMilestoneHistory } = require('./sections/milestone-history');
    // ...
    const milestoneHistory = safeSection('milestone-history',
      () => renderMilestoneHistory(m, formatUtils, planBody, opts));
    const sections = [grid, fanout, activeSessions, timeline, questions, risks, milestoneHistory];
    ```
  - opts pass-through 동일.
- **Mirror**: 기존 `safeSection` wrap 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 — 회귀 0.

### Task 12: verdict.js + status-grid.js — intent suffix

- **Action** (verdict.js):
  - step 9/10에서 `freshInProgress[0]` plan body 읽어 `extractIntentFromPath` 호출. intent 있으면 verdict text suffix append: `next: <slug> — <intent>`.
  - fail-open — extractor throw 시 swallow + intent 없는 기존 text.
  - opts pass-through (fsRead injection 위해).
- **Action** (status-grid.js):
  - `nextStep` cell html에 intent tooltip 추가:
    ```js
    valueHtml = c.stale
      ? '<span class="stale-label">' + escapeHtml(c.value) + '</span>'
      : '<code' + (c.intent ? ' title="' + escapeAttr(c.intent) + '"' : '') + '>' + escapeHtml(c.value) + '</code>';
    ```
  - `cells[2]` (next)에 `intent` 필드 추가. computeVerdict와 동일 intent 추출 — 함수화: `computeIntentForNextPlan(plan, opts)`.
- **Mirror**: M1 status-grid의 cell schema 그대로 + 신규 optional 필드.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/verdict.test.js` + `sections.test.js`.

### Task 13: tests/* — CREATE 5 + UPDATE 2 (Codex F1/F2/F3 fixture 보강)

- **Action**:
  - **CREATE** `tests/jargon-dictionary.test.js` (6 fixture)
  - **CREATE** `tests/intent-extractor.test.js` (5 fixture)
  - **CREATE** `tests/action-prompt.test.js` (7 fixture)
  - **CREATE** `tests/cross-section-dedupe.test.js` (6 fixture):
    1. tokenize basic (한+영 mix + stop word filter)
    2. jaccard 0 (서로 다른 OQ/Risk)
    3. jaccard ≥ 0.45 → match (synthetic — 의도된 overlap)
    4. **F3 absorption fixture A** — real PRD `OQ-a` (Stale plan 판정 기준 — i/ii/iii) ↔ real PRD Risk row 1 (stale plan 판정 기준이 false-positive로 정상 in-progress plan을 stale 표시) — token Jaccard ≥ 0.45 검증, `relatedOpenQuestion` cue 첨부 확인
    5. **F3 absorption fixture B** — real PRD `OQ-f` (action prompt template 후보) ↔ real PRD Risk row 2 (Actionability prompt template이 작동 안 하는 command를 잘못 제시) — Jaccard 매칭 검증
    6. marker dot variant — `**OQ-a.**` / `**F1.**` / `**a.**` strip 후 매칭 (MARKER_RE 확장 검증)
  - **CREATE** `tests/four-part-rendering.test.js` (10 fixture — OQ/Risks 4-part + 3 expanded + collapse + milestone-history + dedupe cue + copy button data-copy attr + **F1 absorption fixture: data-copy round-trip 검증** — `data-copy` attr 안 string이 spaces / `"` / `(` / `)` 모두 percent-encode 없이 raw 보존, jsdom 환경에서 `el.dataset.copy === '/codex:rescue "foo bar (baz)"'`)
  - **UPDATE** `tests/integration.test.js` (OQ + Risk overlap fixture 추가 + 통합 4-part + milestone-history surface + **F2 absorption fixture: derive-normalized receipt shape — `{ gate: 'mccp-pr-codex', decision_id: '...', created_at: '...' }` (gate_id 부재) 가 milestone-history 에서 date stamped 로 surface되는지** — '날짜 미상' 부재 확인)
  - **UPDATE** `tests/render-integration.test.js` (M1 header hoist 유지 + milestone-history DOM)
- **Mirror**: M1 산출 `tests/staleness-guard.test.js` / `tests/i18n-surface.test.js` / `tests/header-hoist.test.js` 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 회귀 0. Codex F1/F2/F3 fixture 모두 통과.

### Task 14: PRD + CHANGELOG — milestone bootstrap (single PR mode)

- **Action**:
  1. `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` — Delivery Milestones row 2 (content + actionability): Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m2.plan.md](../plans/v1-4-2-dashboard-overhaul-m2.plan.md)`. row 1은 M1 commit이 이미 처리.
  2. `CHANGELOG.md` — 기존 `[1.9.0]` entry 안에 M2 5축 bullet append (M1+M2 single PR 가정):
     - ### Added 항목 추가: jargon-dictionary / intent-extractor / action-prompt / cross-section-dedupe / milestone-history / 4-part component / 5 test file
     - ### Changed 항목 추가: sections/open-questions.js → 4-part / sections/risks.js → 4-part / verdict.js intent suffix
     - 항목 끝에 "M2(content + actionability)는 같은 PR에서 함께 ship"
  3. `plugins/mccp/.claude-plugin/plugin.json` — **NO CHANGE** (M1이 이미 1.8.0→1.9.0 bump). 만약 PR 작성 시점에 사용자가 별도 PR로 split 결정 시 `1.9.0 → 1.10.0` minor bump으로 분리.
  4. `.claude/state/STATE.md` — task_fingerprint 무변경 (M1 commit이 이미 `v1-4-2-dashboard-overhaul`로 set). 같은 cycle 진행 중이므로 staleness fresh 유지.
- **Mirror**: M1 산출 PRD update + CHANGELOG entry 패턴 동일.
- **Validate**:
  - `git diff origin/main -- .claude/prds/v1-4-2-dashboard-overhaul.prd.md` row 2 status 변경 확인
  - `git diff origin/main -- CHANGELOG.md` `[1.9.0]` entry 안 M2 bullet 추가 확인
  - `git diff origin/main -- plugins/mccp/.claude-plugin/plugin.json` 변경 없음 (single PR mode) 또는 1.9.0→1.10.0 (split mode)
  - 자기 staleness 검증: `node plugins/mccp/scripts/derive/cli.js run --json` 결과 verdict가 fresh + intent suffix 포함

## Validation

```bash
# 1) Per-task tests
node --test plugins/mccp/scripts/lib/renderer/tests/jargon-dictionary.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/intent-extractor.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/action-prompt.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/cross-section-dedupe.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js

# 2) Regression (M1 + M2 모든 test)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 3) Smoke render — 실제 STATUS.md + status.html 확인
node plugins/mccp/scripts/derive/cli.js render

# 4) 4-part surface lint — copy button + meta-cue + severity tag 존재
grep -E 'class="copy-btn"' .claude/cache/status.html && echo OK || echo FAIL_NO_COPY_BTN
grep -E 'class="severity-tag' .claude/cache/status.html && echo OK || echo FAIL_NO_SEV_TAG
grep -E 'class="meta-cue"' .claude/cache/status.html && echo OK || echo FAIL_NO_META_CUE

# 5) milestone-history section 존재
grep -E '<section id="milestone-history"' .claude/cache/status.html && echo OK || echo FAIL_NO_MS_HISTORY

# 6) jargon expand — abbr 존재 (whitelist token이 plan body에 등장하면)
grep -E '<abbr title=' .claude/cache/status.html && echo OK || echo "(jargon 없으면 skip OK)"

# 7) Visual inspect (사용자 수행)
# open .claude/cache/status.html

# 8) plugin.json version (single PR mode = 무변경)
node -e 'const j=JSON.parse(require("fs").readFileSync("plugins/mccp/.claude-plugin/plugin.json","utf8"));console.log(j.version)'
# 기대: 1.9.0 (M1 commit 그대로) — split mode 결정 시 1.10.0
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 4-part rendering이 OQ/Risks 1건당 markup 30+ line 폭증 → DOM 무거워짐 + 가독성 저하 | medium | medium | 3 expanded + `<details>` collapse로 viewport 안 max 6 항목. CSS dashed border separator만 사용 (heavy card 금지). markdown은 sub-list 2 depth만. |
| copy button JS event delegation이 `<details>` 내부 button 에서 작동 안 함 | low | medium | event delegation은 document.addEventListener 단일 — `<details>` 안/밖 무관. fixture에 `<details>` 내부 button click 검증. |
| jargon expand가 false-positive — 영어 token이 plan body 산문 안 다른 의미로 등장 (예: `MCCP_BRIEFING`이 코드 fence 안에 있을 때 expand) | medium | low | dictionary는 entry당 long-form key (`MCCP_BRIEFING` 6+ char). first-occurrence-only로 첫 등장만 expand. markdown code fence(\`\`\`...\`\`\`) 안 token도 expand 대상 — *intentional* (사용자 시점에서 code fence라도 처음 보는 jargon이면 expand 유용). raw HTML `<abbr>` wrap이 code fence 내부에 들어가도 OK (markdown은 parenthetical만). |
| cross-section dedupe fingerprint 매칭이 너무 관대 → 다른 OQ/Risk가 같다고 표시 | medium | medium | fingerprint length 60 char + normalize 후 < 12 char OQ 제외. fixture에 false-positive 케이스 1건 + true-positive 1건. dedupe action이 *Risks 자체 제거*가 아닌 *cue 추가*라 false-positive 결과도 사용자가 보고 무시 가능 (Risks row 그대로 surface). |
| milestone-history cross-ref가 mccp-pr-codex receipt와 plan basename heuristic 매칭 실패 → date 없음 entry | high | low | date 없으면 `날짜 미상`으로 fallback (graceful). PRD complete row 자체가 declaration이므로 entry surface는 보장. heuristic 강화는 v1.4.3+. |
| intent extractor가 `## Hypothesis` 첫 줄이 markdown table heading 또는 멀티라인 경우 60자 cap 안에서 의미 잘림 | medium | medium | telegraphic 60자 cap 명시. 잘리면 `…` suffix. PRD writer가 Hypothesis 첫 줄을 1-line summary로 쓰는 convention 권장 (PRODUCT.md voice). fixture에 multi-line + 60자 cap 검증. |
| 4-part severity 추론 (OQ text 안 `(HIGH)` 패턴) false-positive — 영어 단어 'high'가 산문에 자연 등장 | medium | low | regex `\b(critical|high|medium|low)\b` (word boundary) + 모두 MEDIUM default fallback. 사용자가 OQ 작성 시 `**HIGH**` / `(HIGH)` convention 권장 (PRODUCT.md voice 정합). false-positive 시 severity icon만 약간 다르게 surface — actionability에 영향 미미. |
| copy button XSS surface — data-copy attr에 plan body 출처 text 그대로 들어감 | low | high | `escapeAttr` 필수 (Task 6/7/9에서 적용). plan body는 *local fs* 출처라 외부 입력 0 — 위협 모델 미해당. nevertheless escape는 strict 유지. fixture에 hostile string (`"><script>` 등) 1건 inject 검증. |
| `<details>` native가 일부 stale browser에서 미작동 → 더보기 항목 영구 hidden | low | low | PRODUCT.md desktop 환경 + 사용자 단독 — Chromium 기반 최신 브라우저. fallback CSS `details summary::before { content: '▸ '; }` 정도. v1.4.3+에서 보완. |
| jargon dictionary growth → maintenance burden | high | low | M2는 minimum viable 32-48 entry. 확장은 lazy — 사용자가 새 jargon 발견 시 dictionary entry 추가. Codex가 dictionary entry 부족을 finding으로 surface 가능. |
| 4-part action prompt template (static whitelist) 가 future-defined command에 비대응 | high | low | severity → command map만 변경 (한 곳). future axis로 `MCCP_ACTION_PROMPT_TEMPLATE` env override 또는 LLM-derived (PRD §OQ-f) — defer to v1.4.3+. |
| M1 PR(#50) 미merge 상태에서 M2 추가 commit → branch 진행이 reviewer에게 무거워짐 | medium | medium | 사용자 명시("M1+M2 한번에 merge") — single PR 전제. commit chunk를 task 단위로 분리 (1 task = 1 commit ideally) 권장. PR body가 [1.9.0] entry 그대로 사용 + M2 bullet 추가. |
| Codex R1이 `## Open Questions` parsing line-aware 확장을 *과도*하다고 지적 | medium | low | line number metadata는 meta-cue actionability에 필수 (OQ-g decision 직접 충족). Codex finding이 ACCEPT_NOW × HIGH 아니면 DEFER. |
| accent 1/viewport invariant — milestone-history active entry에 accent 적용 시 status-strip first cell과 충돌 | medium | low | milestone-history는 accent 미사용 (M1 status-strip 1개만 carry-over). entry는 `--ink` + `--muted`. CSS audit으로 검증. |
| renderer-generic.test.js (v1.3.0-m4 generic invariant)가 새 section milestone-history를 unknown으로 reject | low | high | renderer-generic은 STATUS.md anchor only 검증 — `## 이정표 기록` heading 추가는 위반 아님 (markdown freedom). 사전 검증: `grep -E '"## (Status|Verdict|Timeline|...)"' plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js`. |
| 12 Task 묶음 PR review 부담 | high | medium | M2만 묶었음 (M1 commit은 별도). Task 1-5는 parser/extractor (pure functions), 6-8은 section 변경, 9-10은 surface, 11은 wire-up, 12는 verdict/grid minimal, 13은 test, 14는 metadata. PR body에 task chunk별 commit 분리 권장. |

## Acceptance

- [ ] **Task 1-5** parser/extractor 4 신규 모듈 + plan-body.js line-aware 확장 + 단위 테스트 통과
- [ ] **Task 6-7** OQ/Risks 4-part component 적용 + dedupe cue surface
- [ ] **Task 8** milestone-history section CREATE + PRD complete row + receipt cross-ref 매칭
- [ ] **Task 9-10** html.js copy button JS + 4-part CSS + milestone-history section render / markdown.js equivalent
- [ ] **Task 11** index.js dedupe call + milestone-history wire-up
- [ ] **Task 12** verdict.js intent suffix + status-grid intent tooltip
- [ ] **Task 13** 5 신규 test + 2 update test, 회귀 0
- [ ] **Task 14** PRD row 2 in-progress + CHANGELOG [1.9.0] entry 안 M2 bullet append (single PR mode) — plugin.json은 변경 없음
- [ ] **사용자 직접 확인** — `node plugins/mccp/scripts/derive/cli.js render` 후 `.claude/cache/status.html` 5초 안에 *현재 진행 + next + intent + 차단 + 최근 + 완료된 milestone* 6축 파악 가능
- [ ] **OQ/Risk 4-part** — 각 항목에 severity tag + item text + `> 왜:` meta-cue + `<code>` action prompt + `[복사]` button + clipboard 작동
- [ ] **3 expanded + collapse invariant** — OQ 3 + Risks 3 expanded, 나머지 `<details><summary>+N 더보기</summary>` 안
- [ ] **cross-section dedupe** — OQ와 Risks 둘 다 같은 fingerprint면 Risks에 `동일 OQ 참조` cue surface
- [ ] **milestone history** — 완료된 milestone 5 entry (date desc) + 나머지 collapse. date 없으면 `날짜 미상`
- [ ] **intent surface** — verdict text `next: <slug> — <intent>` (intent 있을 때) + status-grid next cell hover tooltip
- [ ] **jargon expand** — whitelist token 첫 등장 시 HTML `<abbr title>` / markdown parenthetical `(풀이)`, 같은 출력 안 2회+는 raw
- [ ] **accent 1/viewport invariant** — 한 화면 `--accent` 적용 element ≤ 1 (status-strip first cell만; 신규 4-part / milestone-history는 미사용)
- [ ] **WCAG AA** — 본문 4.5:1 (oklch token 그대로), copy button focus-visible 2px accent outline, `<details>` 키보드 navigable
- [ ] **prefers-reduced-motion** — copy button feedback transition은 즉시 (motion 부재 시 동작 동일)
- [ ] **XSS surface 0** — data-copy attr + abbr title + action-prompt code 모두 escape 적용
- [ ] **Codex R1 gate 통과** — `mccp-plan-codex` receipt converged + DEFER_TO_BACKLOG ≤ 5 (M2 5축 묶음 plan이라 cap 약간 완화)
- [ ] **회귀 0** — `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 PASS, M1/M3/M4/M5 surface 변경 없음
- [ ] **impeccable critique loop** — Plan-Codex Phase 5.0 design gate 통과
- [ ] **PRODUCT.md 정합** — Calm/Decisive/Compact voice 유지 (텔레그래픽 카피, accent 1, 균일 카드 grid 회피)
- [x] **mobile out-of-scope** — PRODUCT.md "데스크탑 단일 환경" 명시 — 360px viewport 적합성은 본 cycle scope 외 (M1 동일 invariant)
- [x] **a11y WCAG 2.2 full pass out-of-scope** — PRD §Out of scope — v1.4.3+ 정식 a11y pass

## Design Critique

impeccable critique loop (Plan-Codex gate Phase 5.0) 실행 결과 — `Skill(impeccable, "critique v1-4-2-dashboard-overhaul-m2")` 산출.

**Verdict**: CONVERGED (R1 단독, R2 미트리거 — ACCEPT_NOW × HIGH/CRITICAL 0건; MEDIUM 2건 inline absorption, LOW 2건 DEFER_TO_BACKLOG)

**AI slop verdict**: CLEAR. PRODUCT.md anti-ref 3 카테고리 (SaaS hero-dashboard / AI-cream warm minimal / Bloomberg terminal) 모두 회피. side-stripe border 0 / gradient text 0 / hero-metric 0 / identical card grid 0 / uppercase eyebrow 0 / numbered section markers 0 (detector scan against plan body markup snippets).

**Coverage matrix** (PRD §Design Direction 8 acceptance criteria × M2 plan task chunk):

| PRD criterion | Plan coverage | 평가 |
|---|---|---|
| 위계 3단계 (heading depth ≤ 3) | h1 verdict / h2 section (milestone-history 추가도 h2 single) / `<li>` 4-part item (no h3). depth 유지 | ✅ 충실 |
| accent 1/viewport invariant | Task 9 본문 — 신규 4-part / milestone-history 모두 `--ink` / `--muted` / severity token만. M1 status-strip first cell 1개만 accent carry-over | ✅ 충실 |
| no raw markdown marker | 4-part component이 raw text를 `escapeHtml` 후 surface, severity 추론 regex로 `**HIGH**` 마커를 enum 추출만 (raw 노출 안 함) | ✅ 충실 |
| 항목 수 상한 (3 expanded + collapse) | Task 6/7 OQ/Risks `MAX_EXPANDED=3` + `<details><summary>+N 더보기` collapse. milestone-history도 5 + collapse | ✅ 충실 |
| WCAG AA (4.5:1 본문) | Task 9 copy button focus-visible 2px accent outline, contrast token oklch 그대로. **`abbr` underline-dotted muted + details summary muted 0.85rem은 대비 측정 필요** | ⚠ minor — Task 9에 contrast spot-check 추가 (F1) |
| color + icon 이중 표기 | severity tag = `🔴 + "CRITICAL" + .s-critical color class` 3중. milestone-history도 muted 본문 + 텍스트 단독 | ✅ 충실 |
| prefers-reduced-motion | copy button feedback (data-copied attr 1.5s) transition 없이 enum 토글만 — motion-free 정합 | ✅ 충실 |
| OQ/Risk 4-part | Task 6/7 본문 직접 충족 + milestone-history도 list-item separator 패턴 | ✅ 충실 |

**Voice 분석** (PRODUCT.md Calm/Decisive/Compact): 텔레그래픽 한국어 — `복사됨` / `왜:` / `다음 액션` / `이정표 기록` / `날짜 미상` / `+N 더보기` / `동일 OQ 참조`. action-prompt 본문 `/codex:rescue "원문"`은 코드 톤. 4-part component이 "회피 없는 직접 routing" (Decisive) + "한 항목 정보 4 element 안에 응축" (Compact). PRODUCT.md voice 정합.

**Layout 분석** (PRODUCT.md "5섹션 스트레스 없이"): main 본문에 verdict + workers + sessions + timeline + milestone-history + questions + risks = 7 section. M1 (6) 대비 milestone-history 1 추가. 3 expanded + collapse invariant로 viewport 안 항목 부담 완화. 사용자 단독 desktop 720px column 가정.

**Findings**:

| F | Severity | Verdict | Finding | Resolution |
|---|---|---|---|---|
| F1 | MEDIUM | ACCEPT_NOW | `<abbr title>` underline-dotted muted + `<details><summary>` muted 0.85rem font이 WCAG AA 4.5:1 통과 borderline (oklch 0.45/0.65 muted 토큰 × 0.85rem ≤ 14pt) | Task 9 CSS 본문에 `details summary { color: var(--ink-2); }` 분기 추가 (또는 muted 대신 ink-2 사용) + abbr underline-color `var(--ink-2)` 명시. 4.5:1 contrast 보장. acceptance에 contrast spot-check 추가 |
| F2 | MEDIUM | ACCEPT_NOW | `.action-prompt { display: flex; gap: 0.5rem; }` + `<code>` flex:1 + `<button>` 우측 — 긴 action prompt (200+ char) 가 720px column에서 button overflow / wrap 위험 | Task 9 CSS 본문에 `.action-prompt { flex-wrap: wrap; } .action-prompt code { min-width: 0; overflow-x: auto; max-width: 100%; } .copy-btn { flex-shrink: 0; }` 명시. wrap 시 button이 다음 줄로 — 가독성 우선 |
| F3 | LOW | DEFER_TO_BACKLOG | `<abbr title>` hover/long-press 의존 — keyboard-only Sam persona 부적합 (`<abbr>`는 focusable 아님) | PRODUCT.md "desktop 단일 환경" + WCAG AA full pass scope 외 명시. backlog: `.claude/plans/codex-findings-backlog.md` append — v1.4.3+ 정식 a11y pass에서 `<button>` 또는 inline `(풀이)` 일관 적용 |
| F4 | LOW | DEFER_TO_BACKLOG | meta-cue anchor (`<plan basename> §Open Questions, line 102`) 가 clickable link 아님 — 사용자가 path를 *복사*해서 IDE 열어야 함 | `file://` link는 브라우저 보안 차단. IDE deep link (vscode://file/...) 검토는 v1.4.3+ axis. M2 scope 외 |

**Detector (Assessment B)** — plan body inline markup snippet scan:

- `border-left: <N>px solid` (side-stripe) 0 hit ✓
- `background-clip: text` (gradient text) 0 hit ✓
- `backdrop-filter` (glassmorphism) 0 hit ✓
- `text-transform: uppercase` + `letter-spacing` (eyebrow) 0 hit ✓
- 균일 card grid pattern (`display:grid; grid-template-columns: repeat(...)` + 카드 정형) 0 hit — `<ul>` + `<li>` + border-bottom dashed list 패턴만 ✓
- Numbered section markers (01 / 02 / 03) 0 hit ✓
- AI-cream / warm neutral bg shift 0 hit (M1 oklch token 그대로) ✓

**Persona red flags**:

- **Alex (Power User)**: keyboard shortcut 미정의 — copy button은 button focus + Enter로 작동 (browser default). `<details>` summary는 Enter/Space로 toggle (native). 통과.
- **Sam (Accessibility)**: `<abbr>` focus 부재 (F3 known limitation), severity icon 단독 표기 아님 (텍스트 + color 3중), copy button focus-visible 2px accent outline 명시. partial pass.
- **Riley (Stress Tester)**: hostile input (data-copy attr에 `"><script>` 등) → `escapeAttr` 적용 검증 명시 (Task 9 본문). plan body 산출 origin 안전. JSON snapshot이 0 entry / 50+ entry edge에서 `<details>` collapse 정상 작동. 통과.

**Open Questions**: 없음 (F1/F2는 plan body 4 edit으로 absorbed, F3/F4는 backlog defer, DIVERGENT 0건, auto-CRITICAL catalog 해당 0건).

**absorption 적용 위치**:
- F1 → Task 9 CSS 본문 (details summary color + abbr underline-color)
- F2 → Task 9 CSS 본문 (action-prompt flex-wrap + button flex-shrink)
- F3/F4 → `.claude/plans/codex-findings-backlog.md` append (M2 ship 직전)

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 + v0.3.6 design-scope honor `--impeccable-available`)
- 라운드 수: R1 단독 (cap=1, 3 finding 모두 inline absorption으로 plan body가 self-resolve → R2 미트리거, gate-design.md §5.4 absorption-resolved 룰)
- Codex verdict: `needs-attention` (3 findings — F1 HIGH 0.93, F2 HIGH 0.9, F3 MEDIUM 0.86)
- Codex summary: "No-ship: M2 plan has at least two implementation-level defects that would make core actionability and milestone-history promises fail even if tests pass superficially."
- 합치 결론: 모든 finding ACCEPT_NOW × inline absorption. plan body 5 위치 self-attest fix 박음. fact-check 양쪽 verify 완료 — escapeAttr URL-encode 검증 + derive/sources/receipts.js `gate` field 확인 + PRD OQ-a/Risk row token Jaccard 추정. R2 미실행.
- Codex thread: `019ee80e-7890-7062-bfa7-b57cf811be43`

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — Copy buttons will copy percent-encoded slash commands (`escapeAttr` URL-encode가 공백→%20, 괄호→%28%29으로 변환 → actionability path 깨짐) | HIGH (0.93) | ACCEPT_NOW | 정확한 catch. fact-check verify: `escapeAttr("/codex:rescue \"hello world\"")` = `"/codex:rescue%20&quot;hello%20world&quot;"`. data-copy payload를 `escapeHtml`(6 char escape)으로 변경, `<code>` 표시와 동일. Task 6/7 본문 + Task 9 acceptance + Task 13 fixture 본문 absorption 반영. |
| F2 — Milestone receipt cross-ref skips normalized receipt rows (`pickShipReceipt`이 `r.gate_id === 'mccp-pr-codex'` 만 check, derive sources/receipts.js는 `gate: entry.gate_id`로 normalize → 0 match) | HIGH (0.9) | ACCEPT_NOW | 정확한 catch. fact-check verify: `derive/sources/receipts.js` line 17/26/38이 `gate: entry.gate_id`로 normalize. `audit-timeline.js`는 이미 `r.gate_id || r.gate` 패턴 사용 — mirror 정합. Task 8 본문 absorption 반영 (`const gate = r.gate_id || r.gate`). Task 13 integration fixture에 derive-normalized shape 추가. |
| F3 — Cross-section dedupe misses actual PRD duplicates (60-char exact prefix는 OQ-a/Risk-1, OQ-f/Risk-2 의미 overlap을 못 잡음 + `**OQ-a.**` marker regex dot 미지원) | MEDIUM (0.86) | ACCEPT_NOW | 정확한 catch. fact-check verify: 두 row 첫 60자 normalized 비교 — 조사 + 표현 차이로 exact mismatch. Task 4 본문 absorption — fingerprint 폐기, token Jaccard threshold 0.45 + MARKER_RE `[A-Za-z0-9_.\- ]` 확장 (dot 포함). Task 13 fixture A/B (real PRD OQ-a/OQ-f) + marker dot variant test 추가. MIN_TOKENS=4 + threshold 0.45는 v1.4.2 PRD 실제 데이터로 catch 가능한 sweet spot 휴리스틱. |

### Deferred to backlog

0 (전 finding이 inline absorption으로 plan body 5 위치 self-resolve, DEFER_TO_BACKLOG 없음).

### Open Questions

없음 — Codex 3 finding 모두 plan body 본문 absorption으로 self-attest fix, DIVERGENT_UNRESOLVED 0건, auto-CRITICAL catalog (secret/data-loss/auth/migration/external-destination/crypto) 해당 0건.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1, 3 ACCEPT_NOW absorptions). No new implement-time decisions detected — plan body Files to Change table + Task 1-14 본문이 file 경로 / 함수 시그니처 / markup 구조 / CSS scope을 모두 pre-commit한 상태. impeccable design gate도 Plan Phase 5.0에서 critique CONVERGED (2 MEDIUM absorbed + 2 LOW deferred). Cross-gate dedupe applied per CLAUDE.md §1.2 v0.2.8 Task 2.6.1 B+D+C pattern — Implement-Codex 재호출 skip 권장 + receipt에 `codex_dedupe_at_implement=true` stamp 예정.
