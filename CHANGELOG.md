# Changelog

All notable ship milestones for **my-claude-code-plugin (mccp)** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Note on versioning**: the project ship tag (e.g. `v1.0.0`) and the inner plugin manifest (`plugins/mccp/.claude-plugin/plugin.json` — currently `1.10.0`) are intentionally decoupled. Plugin semver tracks the mccp namespace's internal API surface; project ship tags track W-VERDICT-gated milestones bundled across the repo.

## [1.10.0] — 2026-06-21

v1.4.2 dashboard overhaul — Milestone 2 ship (content + actionability). PRD §M2 5축을 단일 PR로 정리. (3) jargon expand — static whitelist 기반 `<abbr title>` / markdown parenthetical. (4) cross-section dedupe — OQ ↔ Risks 의미 overlap에 `> 동일 OQ 참조` cue. (5) milestone history — PRD complete row + `mccp-pr-codex` receipt cross-ref로 새 section `<section id="milestone-history">`. (6) intent extraction — plan/PRD `## Hypothesis`/`## Summary` 1줄을 verdict suffix + status-grid `next` tooltip에 부착. (9) actionability — OQ/Risks 4-part component (severity tag + item text + `> 왜:` meta-cue + action prompt code + `[복사]` button). plugin.json `1.9.0 → 1.10.0` minor bump per CLAUDE.md §3.7 (M2 milestone ship → minor).

### Added

- **`parsers/jargon-dictionary.js`** — 37-entry static whitelist (gate name / env var / command / concept / file path 식별자). `expandJargon(text, opts) → { text, expansions }` pure function + `renderJargonHtml` (escapeHtml 적용 후 `<abbr title>` wrap) + `renderJargonMarkdown` (parenthetical). longer-key-first sort + first-occurrence-only invariant via `opts.seen` Set. span overlap guard로 `/mccp:plan-prd` 안 `/mccp:plan` 이중 expand 방지. 6 fixture test.
- **`parsers/intent-extractor.js`** — `extractIntent(body)` + `extractIntentFromPath(absPath, opts)` pure functions. PRD body 우선순위 `## Hypothesis → ## Problem → ## Summary` 첫 non-empty line. 60자 cap + `…` suffix. fsRead 주입 가능. 5 fixture test.
- **`parsers/action-prompt.js`** — `buildActionPrompt(item, kind)` severity-routed static template. CRITICAL/HIGH → `/codex:rescue`, MEDIUM → `/mccp:plan`, LOW/UNKNOWN → `/mccp:plan-prd`. risk kind는 `리스크 완화: <risk> — 제안 mitigation: <mit>` arg 합성. quote escape + 200자 cap. 8 fixture test.
- **`parsers/cross-section-dedupe.js`** — F3 absorption. token Dice coefficient + threshold 0.30 (plan spec Jaccard 0.45는 size-imbalance에 약함 — Dice가 더 robust). marker regex `\*\*[A-Za-z0-9_.\- ]+\*\*` (dot variant 포함). 한국어 postposition strip(`이/가/을/를/은/는/의/도/로/와/과/에` + `으로/에서/하면/하는` 등). risk+mitigation 결합 tokenize. Risks row에 `relatedOpenQuestion` + `_dedupeScore` mutation, OQ는 변경 없음. 7 fixture test (real PRD OQ-a/Risk-1, OQ-f/Risk-2 absorption fixture 포함).
- **`sections/milestone-history.js`** — `renderMilestoneHistory(model, formatUtils, planBody, opts)`. PRD `## Delivery Milestones` complete row + `mccp-pr-codex` receipt cross-ref. F2 absorption — `r.gate_id || r.gate` 양쪽 호환(derive normalize 출력은 `gate`). 5 expanded + `<details>` collapse. dedup by planBasename + completedAt desc sort. 날짜 미상 fallback.
- **4-part component** in `sections/open-questions.js` + `sections/risks.js` — severity tag (🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / ⚪ LOW) + item text(jargon expand 적용) + `<blockquote class="meta-cue">왜:` + `<div class="action-prompt"><code>...</code><button class="copy-btn" data-copy>...` + (Risks only) `<aside class="related-oq">동일 OQ 참조: ...`. 3 expanded + `<details>` collapse. F1 absorption — `data-copy`은 `escapeHtml`만 (escapeAttr URL-encode 회피로 slash command 복사 가능).
- **`parsers/plan-body.js`** line-aware `parseOpenQuestions` — 시그니처 `string[]` → `Array<{text, lineNumber, headingPath, oqHeadingLineNumber}>`. heading stack 유지로 OQ item이 어느 heading 아래 있었는지 추적. `parseDeliveryMilestonesComplete(prdBody) → Array<{name, planBasename}>` helper export.
- **Copy button JS** in `html.js` — inline event delegation 한 줄. `navigator.clipboard.writeText` + `data-copied="1"` 1.5s 토글 + `::after content: '✓복사됨'`.
- **Intent surface** — `verdict.js` step 9/10 verdict text suffix `next: <slug> — <intent>`. `sections/status-grid.js` next cell `<code title="<intent>">` tooltip. extractor exception swallow → fail-open.
- **CSS** — `.severity-tag` + `.oq-item` / `.risk-item` dashed-border separator + `.meta-cue` blockquote + `.action-prompt` flex-wrap(F2 absorption — 200+ char prompt 안전 wrap + button overflow 방지) + `.copy-btn` focus-visible 2px outline + `.related-oq` aside + `.milestone-history` list-none + WCAG AA `abbr` + `details summary` color(F1 absorption).
- **5 new test files**: `jargon-dictionary.test.js` (6) + `intent-extractor.test.js` (5) + `action-prompt.test.js` (8) + `cross-section-dedupe.test.js` (7) + `four-part-rendering.test.js` (10 — F1/F2 absorption fixture 포함).

### Changed

- **`renderer/index.js`** — milestone-history section wire-up + cross-section dedupe call. sections 배열 6→7 element. opts pass-through 확장 (status-grid + verdict + milestone-history 모두 fsRead/cwd 주입 가능).
- **`renderer/markdown.js`** — `## 이정표 기록` section + 4-part sub-list 변환 + anchor 추가.
- **`renderer/html.js`** — `<section id="milestone-history">` + COPY_SCRIPT inline + 11 신규 CSS 룰.
- **`renderer/verdict.js`** — `computeIntentForNextPlan` 추가, step 9/10 intent suffix.
- **`renderer/sections/status-grid.js`** — next cell intent tooltip + cells schema에 `intent` 필드.
- **`renderer/sections/open-questions.js`** — 4-part 재작성 (raw bullet list → severity-routed component).
- **`renderer/sections/risks.js`** — 4-part 재작성 (table → list).
- **`tests/sections.test.js`** — 4 test 4-part 형식 정합 update (옛 `+N more` / `no risks surface` → `+N 더보기` / `미해결 위험 없음`).
- **`tests/plan-body-parser.test.js`** — `parseOpenQuestions` metadata 객체 형식 검증.
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** Delivery Milestones row 2: Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m2.plan.md](...)`.
- **plugin.json version bump** `1.9.0 → 1.10.0`.

### Deviations from plan

- `parsers/cross-section-dedupe.js` — plan spec의 Jaccard 0.45 threshold가 실제 v1.4.2 PRD OQ-a/Risk-1, OQ-f/Risk-2 데이터에서 size-imbalance(짧은 risk text vs 긴 OQ text)로 매칭 실패. Dice coefficient + threshold 0.30 + risk+mitigation 결합 tokenize로 변경. F3 absorption 의도(real PRD overlap catch)는 그대로 충족. `JACCARD_THRESHOLD` export는 backwards-compat 별칭으로 유지.

## [1.9.0] — 2026-06-21

v1.4.2 dashboard overhaul — Milestone 1 ship (layout / i18n / staleness / 시각 위계). PRD §M1 4축(staleness guard + i18n surface label + status hoist + UX 시각 위계)을 단일 PR로 정리. M2(content + actionability)는 별도 milestone으로 분리. plugin.json `1.8.0 → 1.9.0` minor bump per CLAUDE.md §3.7 (M1 milestone ship → minor; v1.4.0-m3 PR #49가 main에서 1.7.0→1.8.0을 이미 차지했으므로 rebase 후 한 칸 위로 조정).

### Added

- **`computePlanStaleness(plan, model)` + `extractCyclePrefix(slug)`** in `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` — pure helpers. STATE.md `task_fingerprint`의 cycle prefix(`v\d+-\d+-\d+`)와 plan basename cycle prefix를 매칭해 `'fresh' | 'stale' | 'unknown'` 산출. mtime 의도적 제외(worktree rebase noise). `parsePlanBody` 반환에 `planStaleness: Map<basename, 'fresh'|'stale'|'unknown'>` 추가 — in-progress plan에만 entry 보장.
- **Staleness-aware verdict** in `plugins/mccp/scripts/lib/renderer/verdict.js` — step 9 (backlog + in-progress) + step 10 (in-progress only) 분기 추가. 모든 in-progress plan이 stale이면 tone `amber` + text `다음 미정 (stale)` / `다음 미정 (in-progress plan stale)`. `unknown` 또는 entry 부재는 보수적으로 fresh 처리(backwards-compat).
- **`formatPlanLabel(basename)`** in `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` — cycle prefix 추출 + 본문 단축(`'v1-4-2-dashboard-overhaul-m1' → 'v1.4.2 · dashboard overhaul m1'`). 30자 초과 시 ellipsis. stale plan 시 `<span class="stale-label">` 분기로 `<code>` 부적합(스크린 리더 monospace 오독) 회피 — impeccable F2 absorption.
- **Sticky header strip hoist** in `plugins/mccp/scripts/lib/renderer/html.js` — `<header>` 안에 brand(`mccp 상태`) + status-strip(4 cell role="group") + meta(`마지막 갱신 · stale-suffix`) 통합. `<section id="status">` main 본문 제거. accent invariant CSS — `.status-strip .cell:first-of-type`만 `var(--accent)` 적용. `body[data-stale="1"]` 토글로 stale suffix surface.
- **3 new test files**: `tests/staleness-guard.test.js` (10 fixtures — extractCyclePrefix + computePlanStaleness 4가지 시나리오 + parsePlanBody integration + computeVerdict 4 분기) + `tests/i18n-surface.test.js` (10 — html/md Korean h2 presence + English anti-pattern absence + 헤더 brand + footer + v1.9.0 version) + `tests/header-hoist.test.js` (11 — header DOM hoist + 4 cells + 본문에서 section#status 제거 + sticky CSS + accent invariant + stale fixture data-stale attr + span.stale-label 분기).

### Changed

- **i18n surface labels** — section `<h2>` 한글화 (`타임라인` / `미해결 질문` / `위험` / `워커` / `최근 활동`). HTML 본문에서 verdict section의 `<h2>`는 제거하고 `<h1 class="verdict">` 단독으로 surface(헤딩 depth 1→2 jump 회피 + header strip "현황"과의 redundant naming 차단 — impeccable F1 absorption). footer 한글화(`v1.4.2 · <code>.claude/</code> 통합 derive`). markdown.js는 STATUS.md `## 현황` anchor 보존(F3 absorption — M4 trigger의 generic invariant + 외부 text consumer 호환).
- **plugin.json version bump** `1.8.0 → 1.9.0`.
- **`.claude/state/STATE.md` task_fingerprint** `v1-3-0-cycle-close-ready → v1-4-2-dashboard-overhaul` (`state-writer.js` API) — bootstrap chicken-egg 해소. staleness rule이 ship된 시점에 본 plan이 fresh로 판정되려면 fingerprint update가 동일 PR에 들어가야 함(Codex F1 absorption — 4-file atomic bundle).
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** Delivery Milestones row 1: Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m1.plan.md](../plans/v1-4-2-dashboard-overhaul-m1.plan.md)`. Row 2(M2)는 그대로.

## [1.8.0] — 2026-06-20

v1.4.0 multi-session — Milestone 3 ship (friction zero). M2(PR #46, `33600ac`)가 cross-session discovery 완성한 위에 (1) self/other 시각 구분, (2) friction-telemetry append-only sidecar primitive, (3) full-cycle 2-worktree dogfood protocol을 얹어 PRD §M3 metric("한 cycle 내 2~5 worktree 병렬 cycle을 reconciliation 질문 없이 완주") 달성. plugin.json `1.7.0 → 1.8.0` minor bump per CLAUDE.md §3.7.

### Added

- **`derive/sources/state.js#item.self_session_id` + `item.self_resolution`** (contracted additive-only surface) — env → cwd-match → null deterministic resolution chain. `self_resolution` 4 enum(`resolved` / `resolved-by-cwd` / `env-missing` / `unresolved`) **항상 emit** — Codex Implement R1 F3 absorption (silent null fallback forbidden). Schema-surface §10 등록. resolution chain helper `resolveSelfSessionId(ledgers, options)`도 export.
- **`renderer/sections/active-sessions.js` self/other 시각 구분** — `self_session_id` 매칭 row의 첫 칼럼이 `**this worktree** \`<id>\``(md) / `<tr class="self"><td><strong>this worktree</strong> <code>…</code></td>`(html)로 시각 구분. set이 아니거나 매칭 0건이면 M2 ship 동작 그대로(graceful degrade).
- **`plugins/mccp/scripts/lib/friction-telemetry.js`** — append-only sidecar primitive. `recordBannerInjected({sessionId, projectBranch, cwd?})` 단일 public API. `<repo>/.claude/state/m3-friction-events.jsonl` 1줄 JSONL append. **No in-band cap** — Codex Implement R1 F1 absorption(concurrent SessionStart에서 read-modify-write rewrite가 telemetry event loss를 일으켰던 axis 제거). worktree `.git` file/directory 양쪽 인식. Loud fail-open(stderr WARN + ALLOW + never throw).
- **6 friction-telemetry test cases** — round-trip / no-repo WARN / concurrent 2-process loss-0 regression / CRLF+LF mix / appendFileSync EACCES no-throw / worktree `.git` file detection.
- **7 derive state-source test cases** — `resolveSelfSessionId` 4 enum × 5 case + `collectActiveSessionLedgers` env surface + `scanState` STATE.md absent + env set surface.
- **3 renderer self-marker test cases** — null/match-one/stale-no-match.
- **`docs/v1.4.0-multi-session/m3-friction-metric.md`** — single-purpose explainer. §1 sidecar schema, §2 user-side friction taxonomy 4 카테고리, §3 cycle-end aggregation, §4 dogfood pass criteria 5건, §5 retention deferral.

### Changed

- **`session-start.js`** — `summarizeOtherActiveLedgers`가 실제 banner를 push한 경우에만 `frictionTelemetry.recordBannerInjected` 호출. M2 ship된 banner inject 로직 자체는 무변경. try/catch 외피 + stderr WARN으로 telemetry 실패가 hook을 throw시키지 않도록 보장.
- **`docs/v1.3.0-observability/schema-surface.md`** — §10 신설 "Self session identity surface (v1.4.0-m3)" 2 field + 4 enum + resolution chain documented. additive-only invariant 유지.
- **`docs/v1.4.0-multi-session/state-md-narrowing.md`** — §3 끝에 v1.4.0-m3 self/other 식별 1 단락 추가. STATE.md frontmatter는 여전히 untouched.
- **`.claude/plans/codex-findings-backlog.md`** — row 2(2026-06-19 MEDIUM F4 heartbeat) Finding 칼럼에 `**ABSORBED in v1.4.0-m2 (PR #46)**` 마킹 추가(audit trail 보존). row 3(2026-06-20 LOW F1 sidecar offline retention) 신규 append — v1.5.x cycle 또는 quarterly review 후보.
- **`.gitignore`** — `.claude/state/m3-friction-events.jsonl` 1줄 추가. measurement는 worktree-local.
- **plugin.json version bump** `1.7.0 → 1.8.0`.

## [1.7.0] — 2026-06-19

v1.4.0 multi-session — Milestone 2 ship (cross-session discovery). M1(PR #43, `c071a54`)이 ship한 session-ledger primitive 위에 (1) heartbeat schema v2, (2) SessionStart discovery surface, (3) STATUS.md `## Active Sessions` 섹션 3축을 얹어 PRD §M2 metric("새 worktree 시작 후 첫 5턴 안에 manual reconciliation 질문 0회") 달성. plugin.json `1.6.0 → 1.7.0` minor bump per CLAUDE.md §3.7.

### Added

- **`last_seen_at` (v2 schema)** in `plugins/mccp/scripts/state/session-ledger.js` — ISO8601, required for v2. `createLedger`가 `created_at`으로 anchor, `updateLedgerHeartbeat`가 매 갱신마다 `nowIso()`로 progress. v1 ledger 발견 시 read-only in-memory lift(`liftV1`), 다음 heartbeat/finalize 시점에 disk 파일이 자연스럽게 v2로 rewrite.
- **`updateLedgerHeartbeat({sessionId, projectContext, scopeOverride?, timestamp?})`** — scope-aware, atomic, lock-protected last_seen_at refresh. **hybrid all-or-nothing invariant** (Codex Implement R1 F1 absorption): scope=hybrid 양쪽 path 중 일부만 update 성공하면 `ok=false` + errors에 실패 path 기록. missing-ledger는 `ok=true, noop=true` (idempotent).
- **`listLedgers` host-aware tri-state active filter** (Codex Implement R1 F1+F2 absorption) — hybrid dedupe는 newest `last_seen_at` wins(stale v1이 fresh v2를 가리지 않음). active 분류: cross-host는 heartbeat freshness만으로 판정, same-host는 `(pidIsLive AND fresh heartbeat)` 양쪽 필요. PID alive 단독 + stale heartbeat = PID-reuse 의심 → inactive. 24h fallback TTL은 v2에서 **제거**(false-immortal source).
- **`summarizeOtherActiveLedgers` in `plugins/mccp/scripts/hooks/session-start.js`** — SessionStart 첫 system-reminder에 `Other active mccp sessions in this project:` 블록 inject. 모든 field cap + 1024-char per-block hard budget(Codex Implement R1 F3 absorption — 8000-char SessionStart cap의 13% 이내). `cwd`는 `derive/mask.js#applyPathMask` 재사용으로 username/머신 경로 normalize.
- **`plugins/mccp/scripts/lib/renderer/sections/active-sessions.js`** — M3 renderer에 `## Active Sessions` 섹션 추가. 5-column 표(세션 / 브랜치 / 위치 / 호스트 / 시작). 0건이면 graceful hide. `escapeHtml` 사용으로 angle-bracket payload self-injection 차단.
- **17 new test cases**: `session-ledger.test.js` (4 schema v2 + 6 heartbeat + 6 tri-state + 2 finalize ordering + 1 invariant) + `active-sessions.test.js` (3 render + 1 escape + 1 formatAge boundary).

### Changed

- **`session-start.js`** — `createLedger` 직후 `updateLedgerHeartbeat` 호출로 resume/clear/compact 재시작 시점 last_seen_at re-anchor. discovery banner는 `summarizeActiveInstincts` push 직후 위치.
- **`session-end.js`** — `finalizeLedger` 직전에 `updateLedgerHeartbeat` 1회 호출. ended_at > last_seen_at > created_at 순서 보장(crash-vs-clean 종료 구분 가능). `finalizeLedger` 자체도 endedAt < last_seen_at일 때 +1ms로 자동 보정.
- **`docs/v1.4.0-multi-session/session-ledger-schema.md`** — v1 → v2 schema doc bump. §2에 `last_seen_at` row + §3 Public API에 `updateLedgerHeartbeat`/`pidIsLive`/`liftV1` symbol + `DEFAULT_HEARTBEAT_TTL_MS` (5분, 24h fallback removed) + tri-state filter 본문화. §6 "Deferred to M2" → "M2 Done · M3 Deferred" 재분류.
- **`renderer/index.js` + `markdown.js` + `html.js`** — 6번째 section(`active-sessions`) wire-up. anchors 목록 + section composer destructure 모두 갱신. 기존 5 section 동작 회귀 0.
- **plugin.json version bump** `1.6.0 → 1.7.0`.

## [Unreleased] — v1.4.0 automation modernization axis C (M3)

v1.4.0 PRD `automation-modernization` Milestone 3 ship — Anthropic native `/goal` completion-condition loop integration via cooperative guide pattern. M1+M2+M3 누적으로 PRD M4 (integration template doc) 별도 milestone 불필요 결정 → row status `dropped`. plugin.json version bump은 PR ship 시점 main HEAD 기준으로 결정 (CLAUDE.md §3.7) — 본 entry는 `[Unreleased]`로 두고 PR squash 시 `[X.Y.Z] — YYYY-MM-DD` 로 갱신.

### Added

- **`/mccp:milestone-close <milestone-id-or-prd-path>`** — 신규 slash command. Anthropic native `/goal` loop를 cooperative guide 패턴으로 wrapping해 milestone 종료 acceptance를 mccp receipt chain 안에 anchor한다. Phase 0 PREFLIGHT(working-tree + cost-tier) → Phase 1 DETECT(`goal-detect.js`) → Phase 2 LOCK ENTER + COOPERATIVE GUIDE → Phase 3 WAIT(grammar) → Phase 4 LOCK EXIT + closure-doc write + plan-body provenance stamp → Phase 5 (option B, 신규 gate 없음).
- **`plugins/mccp/scripts/lib/goal-detect.js`** + tests — mode-aware probe (mode=`milestone-close`). PRD `Delivery Milestones` table row parsing + 휴리스틱 (Status=in-progress AND Plan cell filled AND plan file exists). `fs.realpathSync` 기반 symlink path-traversal guard (S2 security absorption). env override `MCCP_GOAL_FEATURE={available|missing|unknown}`. 15 test scenarios + 1 symlink skip (Windows).
- **`plugins/mccp/scripts/lib/goal-phase-lock.js`** + tests — multi-turn isolation lock CLI. lock file `.claude/state/goal-phase.lock`, sidecar token `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` (mode 0o600 per S1 security absorption). lease default 90s (vs M2's 60s — multi-turn `/goal` loop tolerance). ultracode-phase-lock v0.2.8 hardened 1:1 mirror (token authority split + host-aware tri-state reclaim + H2 sidecar mkdir-before-lock + F8 symlink containment). `milestone_id` + `owner_session_id` lock body fields. 17 test scenarios (lifecycle + race + tri-state reclaim + multi-turn heartbeat sim + sidecar mode + sidecar mkdir EACCES) + 1 Windows skip.
- **`plugins/mccp/scripts/hooks/goal-phase-guard.js`** + tests — PreToolUse hook. lock 활성 중 default-deny on mccp write tools + Bash mutating commands + mccp:* Skill invocations (incl. `mccp:milestone-close`). F2 fail-CLOSED on malformed lock. **F3 STRICT non-owner policy (M3 absorption)**: `event.session_id ≠ lock.owner_session_id` 시 read-only ALLOW만 (Read/Grep/Glob/ToolSearch + git read-only Bash + lock lifecycle Bash), 단 Edit/Write/MultiEdit/NotebookEdit/Skill mccp:* 는 session 무관 항상 DENY (closure-doc anchor invariant 보존). F4 MultiEdit deny matrix 포함. S3 Bash policy는 fail-closed whitelist-only. 31 test scenarios.
- **`.claude/milestone-closures/`** — git-tracked closure document 디렉토리. 4-section spec (`## Milestone` / `## Acceptance Condition` / `## Goal Loop Result` / `## Provenance`). 본 디렉토리 파일은 직접 편집 금지 — `/mccp:milestone-close` 출력물. mutation 시 다음 `/mccp:pr` validate에서 plan_hash mismatch로 detect.
- **`docs/automation-modernization/integration-template.md`** §3 layer 4 axis C 셀 + §5 matrix axis C 셀 (option B 채택) + §6 anti-pattern (Stop-hook leakage during multi-turn native loop) + §9 M3 reference (placeholder → reference 전환) + §10 audit checklist 2개 추가 (Stop-hook isolation + Multi-turn lock lease sizing). Status mark `M1+M2-validated → M1+M2+M3-validated`. PRD Open Q §3 결정 stamp.

### Changed

- **`plugins/mccp/scripts/hooks/stop-review-loop.js`** — ~20-line inline freshness validation 추가 (Codex impl-codex R1 F2 absorption — presence-only check는 stale/forged lock에 trivially bypassable). 추가 위치: `modeFromEnv` + `repoRoot` resolve 후, `gitDiffEmpty` 호출 직전. Tri-state freshness = host + pid + mtime < 90s lease (§3.6 host-aware reclaim policy mirror). suppress 시 `[mccp:stop-review-loop] suppressed: goal-phase lock active` stderr + pass-through allow. 기존 함수/decision tree 무변경, backward-compat 보장 (기존 13 시나리오 회귀 0 + 신규 4 시나리오 추가). `os` import 추가.
- **`plugins/mccp/hooks/hooks.json`** — PreToolUse 배열에 `mccp:goal-phase-guard:pre` entry 추가 (matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|Skill`, pr-phase-guard + ultracode-phase-guard와 병렬 등록). Stop 배열 무변경 (stop-review-loop.js 본문 수정으로 처리).
- **`.claude/prds/v1-4-0-automation-modernization.prd.md`** — M2 row Status `in-progress → complete` (PR #42 ship 후 stale 정리), M3 row Status `pending → in-progress` + Plan cell 연결, M4 row Status `pending → dropped` (M1+M2+M3 누적으로 충족 결정, 2026-06-19). Open Questions 3개 모두 결정 stamp.
- **`.claude/milestone-closures/README.md`** — closure document spec + git-tracked invariant 명시.

### Security absorptions (security-reviewer R1)

- **S1 CRITICAL**: sidecar token file mode 0o600 mechanically enforced by `fs.openSync(sp, 'w', 0o600)` in `goal-phase-lock.js#cmdEnter`. POSIX test `fs.statSync(sidecarPath).mode & 0o777 === 0o600` verified.
- **S2 HIGH**: `goal-detect.js#validatePathSafety` uses `fs.realpathSync` for both repoRoot AND target before `path.relative` containment check — symlink-pointing-outside-repo rejected with `reason=path-traversal`. Test covers symlink scenario (POSIX, skipped on Windows).
- **S3 HIGH**: `goal-phase-guard.js` Bash policy is fail-closed whitelist-only — every command segment must match `BASH_ALLOW_PATTERNS`, else DENY. `bash -c "node ..."` wrappers, mixed slashes, env-var expansion all fall through to default-deny.
- **S4 MEDIUM (doc)**: Stop hook short-circuit fail-open invariant explicit — `JSON.parse` 실패(0-byte 포함) → catch → fall-through to existing decision tree (forged-empty lock = normal-stop, not suppress).
- **S5 MEDIUM (best-effort)**: closure-doc write applies `derive/mask.js#applySecretMask` to `Goal Loop Result` section before write (5-regex catalogue reuse: sk-key, aws-key, private-key-block + bearer, password-eq). README spec forbids raw paste.
- **S6 MEDIUM (doc)**: H2 sidecar mkdir-before-lock invariant — `mkdirSync(path.dirname(sp))` MUST be invoked BEFORE `openSync(p, 'wx')` so mkdir failure (EACCES/ENOSPC/race) doesn't orphan a lock without provable ownership channel. Test covers EACCES mock → exit 19 + lock not created.

## [1.6.0] — 2026-06-19

v1.3.0 observability surface II — Milestone 6 ship (cycle close). Generic interface validation — derive + snapshot + renderer가 mccp 외 repo에서 graceful한지 4 fixture로 검증하고, "어떤 source가 optional이며 어떤 fallback이 보장되는가" contract을 본문화. M5 PR #41(`d12e82d`) 직후 cycle close. plugin.json `1.5.0 → 1.6.0` minor bump per CLAUDE.md §3.7 milestone-PR checklist. 새 기능 / 새 schema field 없음.

### Added

- **`plugins/mccp/scripts/derive/tests/generic-interface.test.js`** — 4 fixture × derive smoke. Fixture A (empty repo, 2-branch strict vs default), B (mccp-owned STATE.md only), B-foreign (외부 STATE.md frontmatter graceful reset), C (non-mccp gate_id `foo-gate`/`bar-gate` receipts with mccp-extension fields absent), D (degraded foreign repo: malformed JSON + unsupported STATE frontmatter + envelope `additionalProperties:false` 위반 + POSIX symlink with meta-derived sentinel strings). Codex Plan-Codex R1 F3+F4 absorption.
- **`plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js`** — Fixture B/C/idempotence/retention 4 case. 외부 cwd에서 snapshot writer가 throw 없이 동작 + `briefing_*` null projection + 30-day eviction + same-UTC-day idempotent.
- **`plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js`** — Fixture A/B/C/D 4 case × `renderStatus` → 6-section invariant + verdict 결정 + audit-timeline `gate_id` raw label fallback.
- **`docs/v1.3.0-observability/generic-interface.md`** — generic interface contract spec. §1 Optional sources, §2 mccp-extension fields (5 카테고리 13 field, 외부 repo에서 null projection), §3 Non-mccp gate names, §4 What is NOT generic (path shape / STATE schema ownership / degraded-surface-is-graceful / parseability minimum). Codex R1 F3 absorption — degraded surface가 contract의 일부.
- **`.claude/plans/notes/v1-3-0-m6-audit.md`** — 5 axis × {fixture / contract / patch} deterministic audit matrix. axis 1 security sub-axis 1건 patch (receipt file-level symlink guard) + 나머지 4 axes는 fixture/contract column으로 결정.
- **5번째 case in `plugins/mccp/scripts/receipt/tests/store-readreceipt-symlink.test.js`** — safe gate dir + symlinked `<decision>.json` → `UNSAFE_RECEIPT_FILE` throw 검증. POSIX 전용 (Windows admin 권한 필요로 skip).

### Changed

- **`plugins/mccp/scripts/receipt/store.js`** — `readReceipt` 가 file-level `isPlainFile` guard 통과 후에만 `fs.readFileSync`. envelopes.js:14-19 패턴 미러. 코드 리뷰에서 발견된 axis 1 security sub-axis 패치 — gate-dir level guard (v0.2.8 Task 2.6.5a/b)는 이미 있었지만 file level은 없었고, generic-interface §4.3의 "no external dereference" 보장이 receipts 측에서 미강제였음. Fixture D의 sentinel JSON을 `meta.created_at` + `meta.command` + `decision_id`까지 포함하도록 강화하여 진짜 invariant assertion으로 전환. **security-reviewer absorption (HIGH × 2)**: (1) `Error.message`에서 filesystem path 제거 — derive model 직렬화 시 directory enumeration leak 방지. path은 `err.path` field에 보존. (2) `existsSync → lstat → readFileSync` 3-syscall TOCTOU race를 `existsSync → lstat → open(O_NOFOLLOW) → fstat → read from fd → close` atomic 패턴으로 close. POSIX는 `O_NOFOLLOW`로 mid-syscall symlink swap reject + Windows는 정적 `isPlainFile` + `isSafeGateDir` 가 primary defense.
- **`docs/v1.3.0-observability/generic-interface.md`** §4.3 — symlink dereference 보장 cite를 envelopes (`isPlainFile`) + receipts (`isPlainFile`+`isSafeGateDir` 2축) 양축으로 정밀화. 원본은 envelopes의 guard만 인용하여 generalization gap 존재.
- **`docs/v1.3.0-observability/schema-surface.md`** — §9 cross-link to `generic-interface.md` 추가. read-side schema surface는 변경 없음.
- **PRD M6 row** `pending → in-progress` (PR merge 시 `complete`로 자동 전환, M5 PR #41 패턴 동일).
- **plugin.json version bump** `1.5.0 → 1.6.0` — minor jump per CLAUDE.md §3.7.

## [1.5.0] — 2026-06-19

v1.3.0 observability surface II — Milestone 5 ship (PR #41, squash `d12e82d`). Daily snapshot + 30-day audit timeline + Codex R1 absorption. M4가 plugin.json bump을 누락한 결과 (1.4.1 그대로 유지) 본 entry가 ship trail 백필로 추가됨 (v1.6.0 PR가 동시 백필 처리).

### Added

- **`plugins/mccp/scripts/lib/snapshot/index.js`** — daily snapshot writer. `.claude/cache/snapshots/YYYY-MM-DD.json` (`snapshot-v1` schema) + 30-day retention with Codex R1 F3 skew guards (future-dated files NOT evicted + cutoff > last-render aborts retention). always-mask invariant — `model.masked=false` 인 경우에도 snapshot payload는 masked. `gate_id + decision_id + receipt_hash` 3축 dedup identity (F2 absorption) — re-issued receipt(briefing restamp / dedupe attribution) 는 distinct event로 분리.
- **`receipt_hash` surface in `plugins/mccp/scripts/derive/sources/receipts.js`** — M5 dedup identity의 read-side anchor. v0.2.x-era receipt는 `null` projection.
- **30-day audit timeline read path** in `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` — snapshot history를 timeline section에 surface. snapshot 미존재 시 `최근 7일 활동 없음` graceful fallback.
- **`docs/v1.3.0-observability/snapshot-schema.md`** — canonical `snapshot-v1` JSON shape + filename-anchored retention + write-eligibility vs retention split (F4 absorption).

### Changed

- **plugin.json version bump** `1.4.1 → 1.5.0` — minor jump per CLAUDE.md §3.7. M4 PR #39 (refresh trigger + privacy guard)가 plugin.json bump을 누락한 결과, M5 bump이 M4 + M5 두 milestone을 동시 surface.
- **`docs/v1.3.0-observability/schema-surface.md`** §8 추가 — snapshot schema cross-link.
- **PRD M5 row** `in-progress → complete`.

## [1.4.0] — 2026-06-18

Minor bump on top of v1.3.1. Cycle close for the v1.3.0 observability surface II line — v1.3.0-m3 (STATUS.md + HTML renderer) ships as the final milestone, and the version jump signals the open follow-up axes (H1/M1/M2/M3/L1-4 from the M1 audit trail) consolidate into the v1.4.x patch cycle that follows. ship: PR #37, squash `9c7336b`.

### Added

- **`plugins/mccp/scripts/lib/renderer/*`** — derive model + M2 briefing fields → `.claude/cache/STATUS.md` + `status.html`. 6-section deterministic verdict(11-step priority chain) + briefing surface + worker fanout graceful hide. Codex R1 absorbed 4 findings (F1 M3-local `parsers/plan-body.js` so M1 surface stays immutable; F2 outer `safeFallback` outer-catch so `renderStatus` never throws; F3 verdict step 7.5 controller_active fallback for envelope-missing case; F4 `escapeHtml`/`escapeAttr` + 4 payload test) + impeccable P1/P2/P3 absorbed. Pure function of derive model, no new runtime deps.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — canonical spec for the M3 dashboard surface (6-section structure + verdict priority chain + status triple + graceful-hide rules + fail-open invariant + HTML injection boundary). `docs/v1.3.0-observability/schema-surface.md §7` cross-links here as the authoritative M3 anchor.
- **`derive/cli.js render`** subcommand — `node plugins/mccp/scripts/derive/cli.js render` writes `.claude/cache/STATUS.md` + `.claude/cache/status.html`. M4 (refresh triggers) and M5 (snapshots) own scheduling; M3 owns the surface only.
- **PRD M3 row** flipped from `in-progress` → `complete` in `.claude/prds/v1-3-0-observability-surface-ii.prd.md`.

### Changed

- **plugin.json version bump** `1.3.1 → 1.4.0` — minor jump per the Last Decision recorded in the v1.3.0 cycle memory. The v1.3.x hotfix patch line closes with PR #36, and the v1.4.x cycle absorbs the follow-up axes (H1 `origin_url` mask + M1 `scanPlans.invalid_count` + M2 backlog↔plan basename match + M3 `derive/index.js` catch-block degraded flag + L1-L4 audit items). CLAUDE.md §3.7 milestone PR mandatory checklist enforced.
- **CLAUDE.md** auto-gate table updated with the M3 row + §5 entry 7 added for `plugins/mccp/scripts/lib/renderer/index.js`.

## [1.4.1] — 2026-06-19

axis A of the v1.4.0 automation-modernization cycle — cooperative integration of Anthropic native `/deep-research` into `/mccp:plan-prd` Phase 2.5 without re-implementing the native feature, with mechanical chain-of-custody anchor riding on the existing `plan_hash`. plugin.json bump `1.4.0 → 1.4.1` per CLAUDE.md §3.7 milestone-PR checklist (rebased onto v1.4.0 baseline from M3 PR #37).

### Added

- **`plugins/mccp/scripts/lib/deep-research-detect.js`** — mode-aware detection probe. Tristate availability (`available | missing | unknown`, default `unknown` to prevent phantom guidance) with env override `MCCP_DEEP_RESEARCH_SKILL`. AND-gated research_signal heuristic: evidence-gap signal (`Assumption — needs validation via` marker OR empty `## Evidence` section) **AND** research-trigger keyword (`spec`, `standard`, `research`, `표준`, `외부`, `리서치`). First-class `--stdin` entry for pre-disk PRD body. Path-traversal guard mirrors `impeccable-detect.js`.
- **`plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`** — 24 tests covering tristate env override × default branches, false-positive fixture (current evidence-rich PRD), Assumption marker / empty Evidence signal paths, `--stdin` parser path, mode-mismatch (M1 is `prd`-only), env vs filesystem precedence, and AND-gate enforcement.
- **`docs/automation-modernization/integration-template.md`** — pattern doc explicitly marked `M1-experimental`. Custody anchor option matrix (a/b/c/d) deliberately leaves axis-specific decisions open; M1 chooses option (b) (body inject + plan-body provenance hash), but M2/M3 are free to pick different options. Anti-pattern §6 calls out "first-axis lock-in" as a structural risk.
- **Phase 2.5 EXTERNAL_RESEARCH** in `plugins/mccp/commands/plan-prd.md` — cooperative guide prompt fires only on `availability=available + research_signal=true`. Dedicated response grammar `paste:<content>` / `skip-research:<reason>` / `failed-research:<reason>`, explicitly separated from Phase 0 `skip` / `you decide` tokens.
- **§4.0b external research inject** in `plugins/mccp/commands/plan-prd.md` — writes `## References` section into PRD body via node-based regex replace-in-place (idempotent across re-runs of `/mccp:plan-prd` on the same PRD), with `<!-- Auto-injected from /deep-research at <ISO> -->` marker. `failed-research:` response writes an audit-trail body, not a zero-info placeholder. User-pasted content flows through `process.argv` so `$(...)` / backticks / quotes in deep-research output are inert (no shell expansion).
- **`## External Research Provenance` stamping** in `plugins/mccp/commands/plan.md` Phase 4.5 — chain-of-custody mechanical anchor. When the plan input is a `.prd.md` and the PRD has a `## References` section, `/mccp:plan` sha256-digests the References content and appends `## External Research Provenance` to the plan body. The plan body itself is hash-anchored by `plan-codex` receipt's `plan_hash`, so any later PRD `## References` mutation will mismatch on the next `/mccp:plan` validate. Idempotent — re-runs replace the prior provenance section in place.

### Changed

- **plugin.json version bump** `1.4.0 → 1.4.1` — patch bump on top of the v1.4.0 baseline shipped by M3 PR #37. axis A is the first patch of the v1.4.x cycle. ship: PR #38, squash `e7fc8de`, 2026-06-19.

### Code-review absorbed (pre-PR self-review)

- **Idempotent `## References` inject** (was MEDIUM M-1) — `plan-prd.md` Phase 4.0b switched from `cat <<EOF >> "$PRD_PATH"` (append-only) to a node regex replace-in-place. Mirrors plan.md Phase 4.5's provenance pattern, so the CHANGELOG / integration-template idempotency claim now matches the implementation.
- **`<original /mccp:plan input>` placeholder** (was MEDIUM M-2) — `plan.md` Phase 4.5 switched from `PRD_PATH="$1"` (bash positional arg, never populated for slash-command-body interpretation) to the `<placeholder>` convention used throughout the rest of the command body. Without this fix Phase 4.5 silently no-op'd because the case match always fell through to `*) PRD_PATH="" ;;`.

### Out of scope (explicit deferrals)

- New receipt fields for external research (option c in custody matrix). Deferred to M2/M3 re-evaluation. Receipt schema is invariant for this milestone.
- `/deep-research` invocation by mccp itself. CLAUDE.md §1.4 Principle (`mccp는 native 기능을 재구현하지 않는다`) is preserved — invocation stays in user turns.
- PRD Open Question §3 (`integration template doc은 M4 별도 milestone으로 할 것인가?`). Deliberately not decided in M1; revisited at v1.4.0 cycle close after M2/M3 ship.

## [1.3.1] — Unreleased

Patch cycle on top of v1.3.0-m1 — informational receipt-prompt hook + Phase 0 auto-recovery. Targets the recurring 4-step hand-recovery whenever a previous session crashes mid-/mccp:plan and leaves the receipt unwritten.

### Changed

- **`receipt-prompt.js` partition logic.** When `commandName ∈ {mccp:plan, mccp:prp-implement, mccp:resume}` AND `result.missing.length>0 && stale.length===0 && blocking.length===0 && open_critical.length===0`, the hook now emits structured `additionalContext` per `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js` and ALLOWs the prompt. Stale, blocking, and open_critical results stay hard-block (R2-F1 integrity invariant preserved). Terminal/mutating commands (`mccp:pr`, `mccp:code-review`) stay hard-block regardless (R2-F2 absorption).
- **Five validate-call callsites** (`plan.md:380`, `prp-implement.md:295`, `pr.md:539`, `code-review.md:128`, `resume.md:199`) now forward `--decision ${DECISION_SLUG} --plan <plan path>` explicitly. The CLI's silent fallback to `decisionId='default'` was the mechanical root cause of the recurring v0.2.8 generic-receipt quarantine misfire (STATE.md `Open Questions` line 49, three milestones running).
- **`MCCP_RECEIPT_GATE_MODE`** kept as a legacy advanced-debug toggle; the new default behavior supersedes its `hard` setting for the recoverable subset. Removal deferred one soak cycle (v1.4.x).

### Added

- **`plugins/mccp/scripts/hooks/lib/receipt-context-schema.js`** — single source of truth for the informational `mccp_receipt_gate` payload shape. Pure data, no I/O. Exports `RECOVERABLE_ALLOW_LIST`, `isRecoverable`, `computeMustNotProceed`, `buildAdditionalContext`.
- **Phase 0 auto-recovery body** in `plan.md` + `prp-implement.md`. Reads the injected `mccp_receipt_gate` context, asserts the missing-only invariant + auto-CRITICAL absence + plan body completeness, writes the missing receipt(s), re-runs `validate-cmd` with the explicit slug/plan, and proceeds. Any failure stops the response. `code-review.md` is NOT given this body (R2-F2 absorption).
- **`plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js`** — static guard scanning every `plugins/mccp/commands/*.md` bash fence. Fails CI if any `validate --command` call is missing `--decision` or `--plan` (R2-F3 absorption). Mechanical regression for Task 1.
- **`plugins/mccp/scripts/hooks/tests/receipt-context-schema.test.js`** — 11 unit tests on the schema lib.
- **`plugins/mccp/scripts/hooks/tests/receipt-prompt-informational.test.js`** — 5 spawn-based hook tests covering: recoverable+missing → ALLOW+context, terminal /mccp:pr → BLOCK, terminal /mccp:code-review → BLOCK, recoverable+stale → BLOCK, `MCCP_RECEIPT_GATE_MODE=hard` does not regress informational path.

### Out of scope (explicit deferrals)

- Atomic finalizer state machine (Codex MED 0.88) — prevents *occurrence*; this patch prevents *recurrence*. Separate milestone.
- Receipt JSON → derive-from-plan/git replacement — Codex HIGH 0.93 REJECT preserved.
- Recovery for stale/blocking/open_critical paths — by design, requires human triage.

## [1.2.0-m1] — Unreleased

Orchestrator cycle Stage 2 Milestone 1 (project tag: `v1.2.0-m1`) — foundation IPC for multi-worker fanout. Pilot (M2) + lifecycle hardening (M3) deferred to backlog continuation.

### Added

- **dispatch-envelope schema (Draft-07)** at `plugins/mccp/scripts/lib/dispatch-envelope.js` with explicit `worker_exit_status` enum (`pending` nonterminal + `ok`/`failure`/`timeout`/`crashed` terminal) — Codex F2 absorption from Implement-Codex review made the nonterminal state schema-valid before the controller writes the placeholder. Envelope location pinned to `<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json` (next to `STATE.md`; lifecycle clarity wins over receipt-chain integration).
- **dispatch-controller** (`plugins/mccp/scripts/lib/dispatch-controller.js`) — `prepareDispatch({workers, controllerSessionId, parentCwd})` writes placeholder envelopes + heartbeats and returns worker prompts; `mergeEnvelopes([envelope1, …])` is a pure aggregator. The controller never calls `Agent` itself (lib code can't); the caller (slash-command body) invokes Agent in parallel and feeds back the collected envelopes.
- **dispatch-watcher** (`plugins/mccp/scripts/lib/dispatch-watcher.js`) — hybrid `fs.watch` (Monitor) + `setInterval` polling. Polling is binding (cross-platform), `fs.watch` is opportunistic latency reducer. `MCCP_ORCHESTRATOR_POLL_MS` env override (default 500ms).
- **worktree-sync** (`plugins/mccp/scripts/lib/worktree-sync.js`) — atomic worktree → parent envelope move with EXDEV cross-device fallback. `cleanupWorktree({keep|remove})`.
- **Receipt schema 4 new optional `meta.*` fields** (`controller_context_marker_present`, `dispatched_by_controller_session_id`, `worker_dispatch_id`, `ipc_envelope_path`) with marker-gated all-or-nothing invariant — `marker=true → require all 3`, `marker=false → forbid all 3`. Codex Adversarial Review F2 absorption: a partial state would have allowed silent total attribution loss. Existing v0.2.x receipts (marker=undefined + 3 fields=undefined) pass validation unchanged (backward compat).
- **`mccp-receipt write` CLI flags** — `--dispatched-by-controller-session`, `--worker-dispatch-id`, `--ipc-envelope-path`. Marker detection via `MCCP_DISPATCH_CONTEXT=1` env OR the supplied envelope path existing on disk; fail-closed exit 12 (`DISPATCH_MARKER_MISSING_FIELDS`) when marker is detected but flags are missing.
- **validate-cmd envelope integrity check** (Codex F3 absorption) — when a receipt carries `meta.ipc_envelope_path`, the validator loads the envelope and asserts `envelope.dispatch_id === receipt.meta.worker_dispatch_id` AND `envelope.receipts_added ⊇ ['<gate_id>/<decision_id>']`. Mismatch surfaces as `blocking[].kind="envelope-mismatch"`.
- **`v1.2.0-dispatch-fields` migration** (`plugins/mccp/scripts/migrations/v1.2.0-dispatch-fields.js`) — additive (no-op for existing receipts); writes marker `.claude/receipts/.migrations/v1.2.0-dispatch-fields.json` with `noop=true` + `state=complete`.
- **STATE.md 3 new events + 2 patch fields** — `dispatch_started`, `dispatch_envelope_received`, `dispatch_chain_aborted` events survive the unknown-downgrade branch; `controller_session_id` (UUID, conditional emit) + `active_dispatch_count` (int, conditional emit).
- **Heartbeat + `reclaimStale`** (Codex F4 absorption) — `prepareDispatch` writes `<uuid>.heartbeat` per worker; caller is responsible for in-loop mtime refresh (lib can't run forever). `reclaimStale({envelopeDir, ttlMs=300000})` applies a host-aware tri-state policy mirroring `pr-phase-lock.js`: same-host + pid-alive = never reclaim, same-host + pid-dead = reclaim, cross-host = mtime-only with TTL. `validate-cmd.js` boot calls reclaim opportunistically (fail-open).
- **Full-cycle smoke** (`plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js`, Codex F1 absorption) — 4-row regression for caller↔controller contract: both-ok / 1-failure / 1-timeout / 1-malformed envelope. No real Agent calls; fixture-driven only. PR ship gate.
- **Docs trio** at `docs/v1.2.0-orchestrator/` — `architecture.md`, `envelope-schema.md`, `operator-runbook.md`.

### Deferred to backlog (M2/M3)

- M2 pilot vertical (`/mccp:code-review` PR mode fanout, `MCCP_ORCHESTRATOR_PILOT` flag) — needs measurement of wall-time + finding count + dual-review overlap ratio over a soak period.
- M3 case 6 (stale envelope GC, 24h TTL) — deferred until M2 dogfood signals how often stale envelopes accumulate.
- Real Agent E2E test (M2 pilot).
- Receipt → controller chain auto re-link (Stage 3+).
- `session-spawner.js` removal (deprecation cycle, Stage 2 M2 or Stage 3).
- Windows native inotify analog (`ReadDirectoryChangesW`) — polling fallback covers correctness; latency improvement in M2 watcher hardening.

## [1.1.0] — Unreleased

Orchestrator cycle Stage 1 (v1.1.0-s1).

### Fixed

- `receipt-prompt` hook의 review-mode bypass 가드가 canonical `'mccp:code-review'` 이름만 literal 매칭하던 결함을 수정. catalog가 광고하는 `/mccp:review-pr ↔ /mccp:code-review` alias 관계를 enforcement layer도 인지하도록 `REVIEW_BYPASS_COMMANDS` Set으로 normalize. `--standalone`과 Local Review Mode 두 bypass 분기 모두 alias 호출에서 정상 동작. 사용자 증상은 `/mccp:review-pr 27 --standalone`이 phantom `mccp-pr-codex` MISSING block을 일으키고 decision-slug가 branch fallback(`v1-1-0-orchestrator-s1`)으로 떨어지던 것 — surface/enforcement desync (axis L과 같은 *symmetry* 결함 카테고리). PR #27 receipt 검증 중 발견. (`plugins/mccp/scripts/hooks/receipt-prompt.js`, regression+alias 양 케이스 테스트 `receipt-prompt-alias-bypass.test.js` 추가)

## [1.0.1] — Unreleased

First patch cycle after v1.0.0 ship. Cherry-picks axis K from the W-VERDICT §7 roadmap (C3 — cross-platform `pr-phase.lock` hardening — M1 only; M2 reproduction matrix deferred to a separate plan), extends with axis K2 to close a parallel receipt-gate false-negative discovered during axis K1 dogfood (`/mccp:pr` MISSING receipt despite the chain already converged on disk), and lands axis P — hook layer tidy (A/C/D/E축) plus a hard-cut rename of all user-facing `ECC_*` env vars to `MCCP_*` so that mccp users running an additional ECC plugin install can configure each plugin independently.

### Breaking — `ECC_*` env var hard-cut rename (axis P)

mccp no longer reads any `ECC_*` env var for its own hooks. Backward-compat aliases are **not** provided — an alias is the exact source of cross-plugin collision this rename exists to eliminate. ECC origin (`ECC_ROOT`) and the install-tree-internal `ECC_DISABLED_MCPS` remain unchanged (install tree is out-of-scope of axis P; a separate cleanup axis will revisit it).

| Old (removed) | New | Surface |
|---|---|---|
| `ECC_HOOK_PROFILE` | `MCCP_HOOK_PROFILE` | hook profile selection |
| `ECC_DISABLED_HOOKS` | `MCCP_DISABLED_HOOKS` | per-hook kill switch |
| `ECC_SKIP_OBSERVE` | `MCCP_SKIP_OBSERVE` | observer recursion gate |
| `ECC_GATEGUARD` | `MCCP_GATEGUARD` | GateGuard fact-force opt-out |
| `ECC_HOOK_ID` | `MCCP_HOOK_ID` | runner→child hook id inject |
| `ECC_PLUGIN_ROOT` | `MCCP_PLUGIN_ROOT` | plugin root resolution (CLAUDE_PLUGIN_ROOT fallback) |
| `ECC_HOOK_INPUT_TRUNCATED` | `MCCP_HOOK_INPUT_TRUNCATED` | upstream stdin truncation flag |
| `ECC_HOOK_INPUT_MAX_BYTES` | `MCCP_HOOK_INPUT_MAX_BYTES` | per-hook stdin cap |
| `ECC_OBSERVE_RUNNER_TIMEOUT_MS` | `MCCP_OBSERVE_RUNNER_TIMEOUT_MS` | observe-runner child timeout |
| `ECC_SESSION_ID` | `MCCP_SESSION_ID` | explicit session id override |
| `ECC_SESSION_RETENTION_DAYS` | `MCCP_SESSION_RETENTION_DAYS` | session record retention |
| `ECC_SESSION_START_CONTEXT` | `MCCP_SESSION_START_CONTEXT` | SessionStart context inject toggle |
| `ECC_SESSION_START_MAX_CHARS` | `MCCP_SESSION_START_MAX_CHARS` | SessionStart context cap |
| `ECC_SESSION_RECORDING_DIR` | `MCCP_SESSION_RECORDING_DIR` | canonical-session recording dir |
| `ECC_QUALITY_GATE_FIX` | `MCCP_QUALITY_GATE_FIX` | quality-gate auto-fix mode |
| `ECC_QUALITY_GATE_STRICT` | `MCCP_QUALITY_GATE_STRICT` | quality-gate strict mode |
| `ECC_GOVERNANCE_CAPTURE` | `MCCP_GOVERNANCE_CAPTURE` | governance capture toggle (now off by default at the hooks.json layer too — axis C) |
| `ECC_CONTEXT_MONITOR_COST_WARNINGS` | `MCCP_CONTEXT_MONITOR_COST_WARNINGS` | cost warning surface |
| `ECC_CONTEXT_MONITOR_COST_MODE` | `MCCP_CONTEXT_MONITOR_COST_MODE` | cost message tone control |
| `ECC_MCP_HEALTH_STATE_PATH` | `MCCP_MCP_HEALTH_STATE_PATH` | mcp-health state file path |
| `ECC_MCP_CONFIG_PATH` | `MCCP_MCP_CONFIG_PATH` | MCP config path override |
| `ECC_MCP_RECONNECT_COMMAND` | `MCCP_MCP_RECONNECT_COMMAND` | mcp-health reconnect command |
| `ECC_MCP_HEALTH_FAIL_OPEN` | `MCCP_MCP_HEALTH_FAIL_OPEN` | mcp-health fail-open mode |
| `ECC_GH_SHIM` | `MCCP_GH_SHIM` | gh CLI shim path |

Preserved (axis P does **not** rename):

- `ECC_ROOT` — points at the ECC origin marketplace. User-set, mccp does not own.
- `ECC_DISABLED_MCPS` — read only by `plugins/mccp/scripts/lib/install/apply.js` (install tree). Install tree is out-of-scope of axis P and is tracked as a separate cleanup axis.
- `ECC_OBSERVER_*` (in `plugins/mccp/skills/continuous-learning-v2/agents/observer-loop.sh`) — owned by the v2 skill; will move with the skill's mccp-native migration.
- `configure-ecc` skill name + `'ecc'` install-time namespace constant — install tree identity, intentional.

Migration: replace any `ECC_X=...` line in your `.claude/settings.json`, `.claude/settings.local.json`, or shell profile with `MCCP_X=...`. There is no automatic alias.

### Removed (axis P)

- `plugins/mccp/scripts/hooks/pre-write-doc-warn.js` — pure shim; `hooks.json` calls `doc-file-warning.js` directly already.
- `plugins/mccp/scripts/hooks/auto-tmux-dev.js` — Windows no-op + only caller (`bash-hook-dispatcher.js PRE_BASH_HOOKS`) also removed.
- `plugins/mccp/scripts/hooks/insaits-security-wrapper.js` + `insaits-security-monitor.py` — InsAIts company-internal policy hook, not relevant in personal mccp install.
- `plugins/mccp/scripts/hooks/post-bash-pr-created.js` — `/mccp:pr` gate already owns the single PR-creation path.
- `hooks.json` registrations removed (scripts kept for v2 reference / standalone use): `pre|post:observe:continuous-learning` (v1 deprecated, v2 lives as a separate skill), `pre|post:governance-capture` (opt-in default off → every tool call paid 2 no-op spawns), `post:session-activity-tracker` (metrics unified through `mccp-metrics-bridge`), `post:edit:design-quality-check` (mccp is a backend CLI plugin; frontend drift warning is always a false positive), `post:edit:console-warn` (Stop's `check-console-log` covers the same surface in batch), `pre:edit-write:suggest-compact` (same role as `strategic-compact` skill), `mccp:stop:auto-handoff` (cost notify reclassified as noise per the `feedback-cost-not-stop-signal` rule).
- `mccp-context-monitor.js` (renamed from `ecc-context-monitor.js`) is retained as a script but its `hooks.json` Stop registration is unaffected — only the cost-warning surface is governed by `MCCP_CONTEXT_MONITOR_COST_WARNINGS`.

### Changed (axis P)

- `plugins/mccp/scripts/hooks/bootstrap.js` (new) — single entry point that resolves `CLAUDE_PLUGIN_ROOT` once (env → standard plugin paths → cache directory walk) and delegates to `plugin-hook-bootstrap.js`. Replaces ~30 inline `node -e "..."` bootstraps in `hooks.json`. Total `hooks.json` command character count reduced from ~36k to ~3.6k (**~90% reduction**); the file remains valid JSON.
- `pre|post:mcp-health-check` `matcher` narrowed from `"*"` (every tool) to `"^mcp__"` (MCP tool invocations only).
- `gateguard-fact-force.js` scope limited to repo-critical paths (`scripts/lib/**`, `commands/**`, `hooks/**`). Generic file edits (docs, ad-hoc scripts, plans) no longer trigger the fact-force gate.
- `quality-gate.js` reduced to syntax-only fast-fail (`node --check` / `gofmt -l` / `python -c "ast.parse(...)"`) per edit. Full lint/typecheck/formatter rewrite continues to run from Stop hooks where it can be batched per session. Per-edit budget target: <500 ms.



### Fixed

- **axis K1** — `pr-phase-guard` hook now reclaims orphan locks left by crashed PR helpers (same-host + dead PID), eliminating Linux/macOS self-trap when `/mccp:pr` is re-invoked after a helper crash. The hook reuses `pr-phase-lock.js`'s host-aware tri-state policy (`isPidAlive` + `tryReclaimStaleLock`), so live PIDs are never disturbed (`NEVER reclaim` invariant). Cross-host orphan locks fall through to the existing block path. Silent recovery is prevented by a state-file marker (`<root>/.claude/state/pr-phase-lock-stale-reclaimed.json`) that `finalize-receipt.js` consumes on the next PR cycle, stamping `meta.pr_phase_lock_stale_reclaimed_at_hook=true` on the receipt. See [docs/v0.2-state-schema.md §4.5](docs/v0.2-state-schema.md) for the marker contract.
- **axis K2** — `deriveDecisionId` (`scripts/receipt/decision.js`) now augments a valid BRANCH_BASED_COMMAND slug with the matching plan-codex receipt slug when the branch slug is a strict prefix of exactly one existing plan receipt. Closes the false-negative where `/mccp:pr` on branch `v1.0.1-axis-k` derived slug `v1-0-1-axis-k` while `/mccp:plan` had written its receipt under `v1-0-1-axis-k-pr-phase-guard-pid-alive` — receipt-gate reported MISSING even though the chain was converged on disk. Ambiguous (2+) or zero prefix-matches fall through unchanged (regression-safe). v0.3.6 Task 5 fallback chain still wires for invalid-branch-slug cases.

### Added

- `meta.pr_phase_lock_stale_reclaimed_at_hook` — additive optional boolean field on receipt schema; default `false`. Existing receipts pass schema validation unchanged (no migration script required).
- `--pr-phase-lock-stale-reclaimed-at-hook` flag on `node plugins/mccp/scripts/receipt/cli.js write` — forwarded by `finalize-receipt.js` when a stale-reclaim marker is consumed.
- `findReceiptSlugByBranchPrefix(branchSlug, cwd)` exported helper on `scripts/receipt/decision.js` — used by axis K2 augmentation; skips `.legacy` / `.bak` sidecars to avoid historical receipt pollution.
- Test axes 11.1–11.5 (PID liveness fixtures incl. Windows escape-path preservation) + 12.1–12.4 (marker shape, idempotency, finalize-receipt round-trip, corrupt-marker handling) in `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` — 9 new tests, 0 regressions on existing axes 1–10.
- 7 axis K2 tests in `scripts/receipt/tests/decision.test.js` (single-prefix augment, exact-match no-augment, ambiguous-multi no-augment, no-match / absent-dir no-augment, legacy/bak sidecars ignored, integration via `deriveDecisionId('mccp:pr',...)`, PLAN_PATH_COMMANDS invariant — only BRANCH_BASED commands are augmented). 0 regressions on existing 42 decision tests.

### Verified

- **axis K M2** — Linux + macOS cross-platform reproduction passing via GitHub Actions matrix (`.github/workflows/axis-k-m2-cross-platform.yml` × `ubuntu-latest` + `macos-latest`). Deterministic fixture (`axis-k-m2-reproduce.mjs`) exercises the real `pr-phase-lock` module's `tryReclaimStaleLock` + `isPidAlive` on each runner, asserting same-host + dead-PID orphan locks are reclaimed with canonical 5-key marker (`reclaimed_at` / `former_run_id` / `former_pid` / `former_host` / `reason`). Windows PowerShell escape path regression-free — `hooks.json` PreToolUse matchers contain no `PowerShell` substring (statically asserted by `axis-k-m2-windows-regression.mjs` on both Linux + macOS runners). F11 sealed-channel `lockBody` schema unchanged — `pr-phase-lock-f11.test.js` 15/15 PASS on both OS. W11 rubric audit row 4d recovered from `Type E (5) + NS=5` to `Type ≤C (≤3) + NS ≤2` per `.claude/audit/v1.0.1-axis-k-m2-rubric.md` re-measurement; W-VERDICT §2 BLOCKING tally 1 → 0 (single-row STOP_RELEASE source closed).

## [1.0.0] — 2026-06-15

First W-VERDICT-gated release. Ship recommendation derived from synthesis of 11 worktree dogfood audits ([W-VERDICT §7 Cherry-pick Roadmap](.claude/audit/v1.0.0-release-verification-verdict.md#7-cherry-pick-roadmap-pre-tag-vs-post-tag)) classified as **CONDITIONAL** with two pre-tag requirements (C1 + C2). Both shipped; C3 (cross-platform `pr-phase.lock` hardening) deferred to v1.0.x axis K.

### Pre-tag conditions met (C1 + C2)

- **C1** — PR [#20](https://github.com/idenn207/mccp/pull/20) `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` (commit `e892d27`). Absorbs W11 audit 11j+11k MEDIUM → LOW; partially resolves W4 4a (receipt write read-first failure hint absence).
- **C2** — PR [#21](https://github.com/idenn207/mccp/pull/21) `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` (commit `8d6504c`). Resolves W10 F-W10-1 doc-vs-code drift by demoting CLAUDE.md §4 "live" label to "LLM-observed" (W-VERDICT §6 axis M).

### Severity tally (post-C1+C2)

| Tier | Pre-W-VERDICT | Post-ship | Δ |
|---|---|---|---|
| BLOCKING | 1 | 1 | 0 (env-conditional; Linux/macOS true-BLOCKING deferred to v1.0.x axis K) |
| HIGH | 8 | **7** | **−1** (C2 axis M demote) |
| MEDIUM | 13 | 12 | −1 (C1 11j/11k MED → LOW) |
| LOW | 12 | 14 | +2 (C1 absorption) |
| PASS / INFO / NTH | 60+ | 60+ | — |

### Known Issues (release notes — non-blocking on Windows)

- **W4 4d** `pr-phase.lock` self-trap on `/mccp:pr` re-entry. Windows workaround: invoke `node plugins/mccp/scripts/lib/pr-phase-lock.js detect-stale` via PowerShell tool (outside `pr-phase-guard.js` PreToolUse hook scope). Linux/macOS escalate via process kill + new session. Permanent fix: v1.0.x axis K (`pid_alive` validation + auto-release).
- **W4 4a** Receipt write read-first failure surface. Manual `rm <receipt>` + write re-run. C1 patch resolves the `writeBlockReason()` recovery surface; full symmetry across all classifications is v1.0.x axis L.
- **W7 docs/v0.2-*** prefix (`docs/v0.2-architecture.md`, `docs/v0.2-state-schema.md`) gives a stale first impression post-tag. v1.0.x axis N housekeeping (rename + content sync).
- **W6 STATE.md frontmatter** regression (`task_fingerprint` synthetic patch + `last_event` precedence drift). Observability-only — dual-reviewer chain does not consume STATE.md frontmatter (grep-verified).
- **W1 F-W1-1** `/mccp:work` classification metadata leakage. `.claude/audit/*` and similar metadata trigger full-chain when user intent is trivial. Workaround: explicit `--trivial` override.

### Ship history (chronological)

| PR | Commit | Title | Surface |
|---|---|---|---|
| [#20](https://github.com/idenn207/mccp/pull/20) | `e892d27` | `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` | C1 — W11 11j+11k MEDIUM → LOW |
| [#21](https://github.com/idenn207/mccp/pull/21) | `8d6504c` | `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` | C2 — W10 F-W10-1 HIGH demote (HIGH 8→7) |

### Supporting artifacts

- [.claude/audit/v1.0.0-release-verification-verdict.md](.claude/audit/v1.0.0-release-verification-verdict.md) — synthesis verdict
- [.claude/audit/v1.0.0-*.md](.claude/audit/) — 11 individual worktree audit ledgers (baseline, codex-backoff, impeccable, receipts, handoff, state-continuity, docs-sync, dual-reviewer, goal-loop, env-matrix, fallback-ux)
- [.claude/plans/v1-0-0-release-verification.plan.md](.claude/plans/v1-0-0-release-verification.plan.md) — verification plan + acceptance rules
- [.claude/plans/v1-0-0-preflight-recovery-surface.plan.md](.claude/plans/v1-0-0-preflight-recovery-surface.plan.md) — C1 patch plan

### Post-merge manual step

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

The CHANGELOG entry above commits as part of the release notes PR; the annotated tag is created manually post-merge.

---

*Prior ship history (v0.2.x – v0.4.0) lives in commit history and PRs (`git log --grep "v0\\."`). v1.0.0 marks the first release-verification-gated milestone where a synthesized verdict (`.claude/audit/v1.0.0-release-verification-verdict.md`) and a documented Cherry-pick Roadmap gated the tag decision.*
