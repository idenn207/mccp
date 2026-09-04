# Plan: leadtime-observability M3 — one-line-consumption

**Source PRD**: `.claude/prds/leadtime-observability.prd.md`
**Selected Milestone**: 3 · one-line-consumption
**Complexity**: Medium

## Summary

M1은 벽시계를, M2는 패널 종료→ship 구간을 산출했다. 둘 다 **standalone 도구 안에서만** 산다 — `node plugins/mccp/scripts/lib/leadtime.js`를 손으로 치는 사람만 그 값을 본다. 우산이 base rate로 지목한 실패 모드("producer는 있는데 caller가 없다")가 이 PRD 자신에게 남아 있는 상태이고, PRD Risks 2행이 그것을 명시적으로 M3의 완료 조건으로 걸었다.

M3은 소비 회로 하나를 만든다: derive가 `model.leadtime`을 실어 renderer가 STATUS.md·status.html 상단에 **값과 커버리지를 붙여 놓은 한 줄**을 내고, 같은 투영이 git-tracked 파일 하나로 떨어져 C7이 인용할 분포가 worktree 밖에서도 살아남는다. 값이 없으면 `0`이 아니라 `미산출`이라고 적는다.

새 계측은 심지 않는다. `leadtime.js`의 오라클·수집·CLI 계약은 그대로 두고 **투영 함수 하나와 spawn 게이트 하나**만 더한다.

## User Intent

<!-- USER-STATED constraints only. 근거는 전부 `.claude/prds/leadtime-observability.prd.md`
     본문(Scope 결정 3건 · Out of scope · Success Metrics 각주 · Risks · M3 Outcome 행)이다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M3까지 착지해야 이 PRD가 완료다. M1·M2만 남기면 미완이다 | direction |
| UI2 | 값과 커버리지를 항상 함께 낸다. 커버리지 없는 값은 출력하지 않는다 | constraint |
| UI3 | 값이 없으면 없다고 적는다. 0으로 적지 않는다 | constraint |
| UI4 | C7이 인용할 분포가 파일로 남는다 | direction |
| UI5 | 임계값과 자동 분기는 이 축이 정하지 않는다. C7 소유다 | exclusion |
| UI6 | `/mccp:work` 진입 이벤트를 생산하지 않는다. C2 소유이고 이 축은 소비만 한다 | exclusion |
| UI7 | `corpus.js`의 출력 계약을 한 바이트도 바꾸지 않는다 | constraint |
| UI8 | 두 끝 앵커를 하나로 고르거나 합치지 않는다. 앵커별 별도 계열로 유지한다 | constraint |
| UI9 | 이름이 재는 구간을 말한다. 이 값은 e2e가 아니라 패널 종료 이후 구간이다 | constraint |
| UI10 | 없는 기록을 소급 생성하지 않는다. 커버리지가 낮다는 사실 자체가 산출물이다 | exclusion |
| UI11 | 게이트 배선 diff를 공집합으로 유지한다. read-only · LLM-free standalone 도구다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 모델 상단 필드 추가 | `plugins/mccp/scripts/derive/index.js:125-131` | `model.metrics = computeMetrics(model)` — correlate 뒤 **독립 try/catch**, throw는 warning + 안전 기본값. `sources.*` count-source 형태가 아닌 축은 top-level 필드로 붙인다 |
| spawn-free 예산과 opt-in | `plugins/mccp/scripts/derive/index.js:139-146` (`allowGit:false`) · `derive/cli.js:155` (`worktreeScan:true`) | bare `derive()`는 spawn 없음이 기본이고, **`render`만 opt-in**한다. 같은 두 줄 구조를 그대로 쓴다 |
| 모델→면 2개 순수 렌더 | `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:1-19` · `:end` | `{md, html}` 반환 · 부재 시 `null` · graceful-hide 규칙을 헤더 주석에 명시 · `renderStatus`가 `safeSection`으로 감싼다 |
| 스키마 additive 고정 | `plugins/mccp/scripts/derive/tests/schema-drift.test.js:52-60` (`host_version`) | `emptyModel`이 선언 + `validateShape` present-only 검사 + 드리프트 test 한 쌍. `MODEL_VERSION`은 `'v1'` 유지 |
| 원자적 파일 write | `plugins/mccp/scripts/derive/cli.js:136-142` (`writeAtomic`) | `.tmp` 형제 + `renameSync` |
| render 경로 piggyback | `plugins/mccp/scripts/derive/cli.js:195-204` (snapshot writer) | lazy require + try/catch fail-open — 부수 산출물이 render를 절대 깨지 않는다 |
| 출력 동결 test | `plugins/mccp/scripts/lib/tests/leadtime.test.js:280-364` | 리터럴 동결 + 실패 메시지에 *약속한 계약*을 적는다 (UI7의 기계적 강제가 이미 여기 있다) |
| 도구 헤더가 재는 구간을 말한다 | `plugins/mccp/scripts/lib/leadtime.js:3-22` | "이 도구가 재는 구간 / 재지 **않는** 구간"을 헤더에 못박는다 (UI9) |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~52k.

### Findings (severity-ranked)

- **[HIGH][architect]** M3 has no derive-source counterpart yet — every renderer section is documented as a pure function of model.X populated by a derive/sources/*.js scanner wired into derive/index.js. leadtime.js currently has zero coupling to derive/index.js's source list, so the plan must decide whether M3 adds a new derive/sources/leadtime.js (consistent with the existing 15-source convention) or has the renderer call leadtime.js directly (breaks the derive/render separation the whole pipeline enforces). — plugins/mccp/scripts/derive/index.js:11-26 lists 15 wired sources (plans/receipts/state/backlog/.../findings); msw-metrics section is fed by model.metrics built from those sources — leadtime.js is a fully standalone CLI/oracle (plugins/mccp/scripts/lib/leadtime.js:1007 audit()), not currently one of them
- **[HIGH][architect]** leadtime.js's audit() performs its own fs + child_process I/O (readJsonDir, execFileSync git log) rather than accepting injected sources the way aggregate() does — if M3 wires this straight into the renderer/derive hot path (invoked on every STATUS.md render), it introduces a git subprocess spawn (up to 30s timeout) into a rendering path documented today as pure/fast section functions over an already-scanned model. — plugins/mccp/scripts/lib/leadtime.js:407-439 readGitTouchedPaths spawns execFileSync('git', ...) with a 30000ms timeout; leadtime.js:1007-1039 audit() is the only entry point performing this I/O, and the file's own stated boundary is 'I/O 없음' for aggregate() at line 822
- **[HIGH][architect]** Two independent anchor series (ledger_basename, ship_plan_hash) are deliberately kept unmerged per PRD Decision 1 ('둘 다 산출하고 불일치를 표면화'). A one-line STATUS.md summary is a much lower-bandwidth surface than the full JSON — the plan needs to decide explicitly which single number (or which anchor, or a synthesized worst-case) the one-liner shows, or risk silently picking a winner and defeating the PRD's explicit non-decision. — PRD lines 58, 82-85 (Decision 1 and reopened Open Questions about the two anchors never converging into one number); leadtime.js:694-742 byAnchor keeps ANCHOR_LEDGER and ANCHOR_SHIP as separate top-level siblings by design (DD11, DD2)
- **[HIGH][test]** M3 (one-line-consumption into STATUS.md) has zero existing wiring or test surface today — grep for 'leadtime' under renderer/ returns no files, and leadtime.js's exports are not called by any renderer section. — Glob of renderer/sections/*.js found no leadtime consumer; Grep for 'leadtime' under renderer/ returned no matches. leadtime.js module.exports (plugins/mccp/scripts/lib/leadtime.js:1248-1275) exposes aggregate/audit/renderHuman but nothing wires them into STATUS.md.
- **[HIGH][test]** PRD Success Metric 4 ('두 앵커 간 불일치') is flagged in the PRD's own Open Questions as structurally zero at the timestamp level (all 6 matched pairs have anchor_delta_ms===0 because ledger.completed_at literally copies the ship receipt's meta.created_at), yet the metric table still lists real-value disagreement as a deliverable. Any M3 test asserting disagreement magnitude as a live signal would assert a false claim. — PRD line 85: '지표 4(두 앵커의 불일치)는 시각 축에서 구조적으로 0이다 ... 양쪽 매치 6건의 anchor_delta_ms가 전건 정확히 0이다.' PRD metric row #4 (line 46) still reads '실값 산출' without qualifying this collapse.
- **[HIGH][explorer]** M1/M2 producer (leadtime.js) is already complete and self-contained — M3's only job is a consumer/render wire, not new aggregation logic. — plugins/mccp/scripts/lib/leadtime.js:1007-1039 exports audit(opts) and aggregate(records, opts) returning {state, panel_span, post_panel_span, coverage,...}. PRD Delivery Milestones table marks M1/M2 'complete' (.claude/prds/leadtime-observability.prd.md (line 75-76)); only M3 'one-line-consumption' is pending (:77).
- **[HIGH][explorer]** The exact reuse pattern for M3 already exists end-to-end for an analogous metric: plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js (compute) -> derive/index.js wiring -> renderer/sections/msw-metrics.js (render) -> renderer/index.js composition. Plan should mirror this pipeline instead of inventing a new one. — plugins/mccp/scripts/derive/index.js:125-131 (model.metrics = computeMetrics(model) inside try/catch fail-open, pushWarning on error) and plugins/mccp/scripts/lib/renderer/index.js:15 (const { renderMswMetrics } = require('./sections/msw-metrics')) show the full compute->derive->render chain the msw-metrics M2 milestone shipped.
- **[MEDIUM][architect]** PRD M3 asks for a single top-line summary ('STATUS.md 상단 한 줄'), but every existing consumer in the renderer is a full pull-model section (grid/pipeline/risks/msw-metrics/etc.) composed via a `sections=[...]` array and appended by `renderMarkdown`/`renderHtml`. There is no existing seam for a top-of-file, pre-section summary line — the closest analog is `computeVerdict()` which produces the verdict banner, not a metrics line. — plugins/mccp/scripts/lib/renderer/index.js:126-148 (sections array assembled, passed to renderMarkdown/renderHtml at the end) vs index.js:104-110 (verdict computed separately, passed as a distinct arg) — no existing 'top line before sections' composition point for a metric like this
- **[MEDIUM][architect]** PRD Decision 3 mandates leadtime.js stay standalone and non-plan-review-wired ('게이트 배선 diff를 공집합으로 유지'), but M3's consumption target (STATUS.md) is itself part of the derive/render pipeline shared across multiple PRDs — the plan should make explicit whether wiring leadtime output into derive counts as 'gate wiring diff' under Decision 3's constraint. — PRD line 60: '`corpus.js`의 출력 계약을 바꾸지 않는다 ... C4는 게이트 배선 diff를 공집합으로 유지한다'; derive/index.js is the shared 15-source aggregation point consumed by session-start banners and other gates per CLAUDE.md §1.4 observability row
- **[MEDIUM][architect]** The renderer's safeSection fail-open wrapper pattern (every section independently try/catch'd, degrading to null/empty rather than crashing the whole render) is the correct pattern to mirror for a new leadtime section given leadtime.js's own three-state ladder (ok/degraded/blind) — but the plan must map leadtime's ladder onto the renderer's binary null-vs-rendered convention, since 'blind' (no observations) and 'degraded' (damaged source) currently have no renderer-level distinction elsewhere. — plugins/mccp/scripts/lib/renderer/index.js:126-138 safeSection() wraps each section in try/catch, warn+null on failure; leadtime.js:145-149 STATE_EXIT_CODES {ok:0, degraded:1, blind:2} is a 3-state contract with no existing renderer precedent for surfacing 'blind' distinctly from 'section absent due to render error'
- **[MEDIUM][security]** M3 (one-line-consumption, pending) will render leadtime.js output — including record filenames and normalized plan_path strings — into STATUS.md and status.html. These strings originate from filesystem/review-record content, not from a validated allowlist, and the plan has not yet specified that the renderer's HTML-escaping discipline must be reused for this new section. — leadtime.js:846 `const name = (r && r.name) || '(unnamed)';` and line 721 `const row = { record: item.e.record };` show record identifiers flowing from disk filenames straight into JSON output. PRD row 77 (M3 scope) only states the STATUS.md line must show value+coverage, with no escaping/privacy requirement called out, while CLAUDE.md 1.4 lists 'privacy guard' as an existing convention for the observability surface that a new consumer must inherit.
- **[MEDIUM][security]** The PRD explicitly forbids retroactively fabricating missing anchor timestamps (UI6) and the M1/M2 code enforces fail-closed 'unavailable ≠ no' semantics for witnesses — this is a strong integrity invariant, but the draft plan for M3 has not stated whether the STATUS.md line reuses `leadtime.js audit()` (trusted, read-only, LLM-free) directly or reprocesses its JSON through an intermediate layer that could introduce data-fabrication risk (e.g. clamping negative spans, defaulting missing coverage to 0/100%). — PRD line 48: '커버리지 없는 값은 출력하지 않는다' and leadtime.js:472-502 DD5/DD6 comments on refusing to clamp negative spans or fabricate anchors — no equivalent invariant is yet stated for the M3 consumption layer itself.
- **[MEDIUM][test]** PRD forbids emitting values without coverage ('커버리지 없는 값은 출력하지 않는다', line 48) and the M1/M2 CLI test suite enforces coverage-precedes-value rigorously, but no equivalent test convention exists yet for the STATUS.md/renderer surface M3 will add. A plan lacking an explicit 'coverage precedes value in STATUS.md' assertion (mirroring UI3) would leave the PRD's own oracle-fit requirement unchecked on the new surface. — leadtime.js:1049 comment 'UI3 — 커버리지 줄이 값보다 먼저 나온다'; leadtime.test.js:872-885 asserts covIdx < valIdx in CLI human output. No such assertion exists for any renderer/sections/*.js file today.
- **[MEDIUM][test]** The M1/M2 test suite explicitly disclaims literal real-corpus counts because the corpus grows every gate run ('이 축의 검증에 리터럴 카운트를 쓰면 안 된다 — 관계 단언만 유효', PRD line 24). If an M3 plan's validation step snapshot-tests the rendered STATUS.md line against today's live p50/coverage numbers, that test will rot on the very next gate run. — PRD line 24; leadtime.test.js header comment lines 24-25 ('실코퍼스 리터럴 카운트는 여기 쓰지 않는다 — 코퍼스는 게이트 실행마다 자라므로 반드시 붉어진다').
- **[MEDIUM][test]** leadtime.js's only I/O-performing entry point, audit(), spawns git via execFileSync and reads 4+ directories, but it is not exercised by leadtime.test.js at all (only the pure aggregate() oracle is tested). M3's renderer consumption needs an equivalent injection seam (mirroring computePostPanelSpan's opts.anchors pattern) or its integration path will go untested end-to-end. — leadtime.js:407-439 readGitTouchedPaths uses execFileSync('git', ...); audit() at leadtime.js:1007-1039 has no direct test coverage in leadtime.test.js — the suite tests aggregate() exclusively per its own header note.
- **[MEDIUM][explorer]** renderer/sections/msw-metrics.js already encodes the exact house style the PRD demands for M3 (value never shown without coverage, graceful-hide when no data, single-accent-color, top-3-expanded + <details> collapse) — a new leadtime section should reuse these conventions rather than re-derive them. — plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:8-11 graceful-hide rule; TOP_EXPANDED=3 pattern at :21,448-449,534; 'coverage before value' convention matches leadtime.js:125-128. PRD Success Metrics footnote: '커버리지 없는 값은 출력하지 않는다' (.claude/prds/leadtime-observability.prd.md (line 48)).
- **[MEDIUM][explorer]** PRD decision 3 explicitly forbids touching corpus.js's output contract, and the plan must name this as a hard non-goal / test to add, not something to silently respect. — .claude/prds/leadtime-observability.prd.md (line 60): 'corpus.js의 출력 계약을 바꾸지 않는다 … 그 사실을 test로 고정' (Risks table row 3, :93). leadtime.js already depends on corpus.readReviewRecords/corpus.parseRecord (leadtime.js:143,847,1010) — any M3 wiring must go through these exports, not corpus.js internals.
- **[MEDIUM][explorer]** STATUS.md 'top line' insertion point is unclear from the codebase — there is no existing single-line hero/top-line renderer to extend; the plan must identify the actual insertion seam in markdown.js/html.js page-header composition before designing M3. — renderer/index.js:47-54 shows the doc-top structure is currently just '# mccp Status · <verdict>' + '_Last refreshed: ..._' in the fallback path; grep for '헤더'/'top'/'한 줄' in plugins/mccp/scripts/lib/renderer/sections/status-grid.js only found comments about hero-widget severity ranking (plugins/mccp/scripts/lib/renderer/sections/status-grid.js:12,68,194,240), not a literal single-line surface.
- **[LOW][security]** normalizePlanPath already treats absolute/non-repo paths as a leak vector and substitutes a marker — this is the correct pattern, but the same care has not yet been extended to `record` (filename) or `reviewed_plan_hash` fields, which are emitted verbatim into JSON and would flow into any STATUS.md/HTML consumer M3 builds. — leadtime.js:130-137 header comment: 'record.js:314는 호출자가 준 --plan 문자열을 무정규화로 봉인한다... 사용자 홈·드라이브 문자·머신 고유 worktree 경로가 이 도구의 출력에 실리고' — the same class of leak (machine-specific paths) is explicitly called out as a solved problem for plan_path but the fix is not generalized to other fields carrying file-derived strings.
- **[LOW][security]** readGitTouchedPaths uses execFileSync with a fixed argv array and `--` separator, correctly avoiding shell injection — this is a pattern the M3 plan should explicitly cite/mirror if it adds any further git or subprocess calls (e.g. for a future consumption CLI), rather than reintroducing string-interpolated git commands. — leadtime.js:407-429 `execFileSync('git', ['log', '--pretty=format:', '--name-only', '--'].concat(paths), { cwd: root, ... , stdio: ['ignore','pipe','ignore'], timeout: 30000, maxBuffer: 32*1024*1024 })`.
- **[LOW][security]** leadtime.js is read-only/fs+git-only (no network, no LLM) per its own header claim, and M3 must preserve this boundary when wiring into STATUS.md generation — the draft plan does not yet state a non-goal preventing the M3 consumer from, e.g., invoking Codex or writing back derived thresholds (which would violate the PRD's explicit Out-of-scope 'C7 소유' boundary on thresholds). — PRD Out of scope (line 64): '임계값과 자동 분기 — C7 소유. C4는 C7이 인용할 분포를 낼 뿐 숫자를 정하지 않는다.' combined with leadtime.js:73 'read-only · LLM-free · fs 외 의존 없음' — no explicit plan-level constraint yet ties the STATUS.md consumer to the same read-only/no-threshold boundary.
- **[LOW][test]** The PRD leaves open whether the 10x leadtime discrepancy is sample bias or a genuine out-of-panel gap, and explicitly assigns the remaining axis to C2, not this PRD. A draft M3 plan whose acceptance criteria imply this question gets 'resolved' by the STATUS.md line would overstate what M3's tests can prove. — PRD line 83: '나머지 축(/mccp:work 진입 → 패널)이 C2에 남아 있으므로 이 질문은 열어 둔다.'
- **[LOW][test]** The corpus.js output-freeze regression (decision 3) is enforced by a byte-identical literal comparison; any M3 change that touches corpus.js risks silently breaking this frozen-literal test without an obvious link back to the M3 diff. The plan should name this test explicitly as a regression guard to re-run. — leadtime.test.js:280-363, CORPUS_FROZEN literal + comment 'corpus.js output changed. leadtime-observability M1 promised NOT to change it'.
- **[LOW][explorer]** pr-ship-gate.js#deriveShipDecision is reused (not reimplemented) by leadtime.js for M2's ship-qualification logic — a positive precedent the plan should cite if M3 needs per-decision ship semantics. — leadtime.js:441-470 qualifyShipReceipts() calls gate.deriveShipDecision(r, {forceOverrideActive}) and documents 'ship 자격은 재구현하지 않는다(DD14)' (leadtime.js:33-37).

### Meta-gaps

- PRD does not specify the STATUS.md placement/format contract for the M3 one-liner (top of file vs new section vs inside existing verdict banner) — this is exactly the kind of decision the M3 plan needs to make explicit before implementation, since the codebase has no existing single-line-summary seam to mirror.  _(architect)_
- PRD does not say whether the new M3 consumer should be a new derive/sources/leadtime.js (matching the 15-source convention) or a direct renderer-side call to leadtime.js's audit() — this materially changes coupling and performance (git subprocess spawn) implications and should be pinned down in the plan.  _(architect)_
- No mention of caching/staleness for the leadtime aggregate given it triggers a git log subprocess on every audit() call — PRD's 'read-only, LLM-free' framing (Decision 3) doesn't address render-path cost if wired in naively on every STATUS.md refresh trigger.  _(architect)_
- PRD's Open Questions section (lines 79-85) has an unresolved question about metric 4 being 'structurally 0' at the timestamp level — M3's plan should state whether/how the one-liner represents this null-signal metric, since surfacing 'always 0' without context could mislead the primary user (per Users section, this metric is operator-only / not for external reporting).  _(architect)_
- Draft plan for M3 does not exist yet, so no concrete file/line targets could be checked for HTML-escaping of leadtime.js output fields (record, plan_path, reviewed_plan_hash) when embedded in status.html.  _(security)_
- PRD does not specify whether the M3 'one line' surface reads leadtime.js JSON directly at render time (trusted, deterministic) or via a cached/serialized intermediate file — the latter would need its own integrity/tamper considerations analogous to receipt hash sealing (CLAUDE.md 3.12) but no such consideration is mentioned.  _(security)_
- No explicit statement in the PRD about whether leadtime output (which includes filesystem paths and record names) is safe to display to any audience beyond the operator — PRD Users section limits use to 'Primary: 운영자 본인' and explicitly excludes external reporting, but the STATUS.md/HTML surface referenced by C4 is the same dashboard rendered by html.js which may be shared/screenshotted; the plan should state whether path-leak mitigations already in normalizePlanPath are sufficient for that broader exposure.  _(security)_
- No mention of concurrency/locking for leadtime.js reads against completion-ledger/receipt directories while other gates (write.js, pr-phase-lock.js, evidence write lock) are actively writing to the same directories — TOCTOU read of a partially-written JSON file during a concurrent receipt write is possible since leadtime.js's readJsonDir has no lock-awareness and only catches JSON.parse failures as parse_failures (not retried).  _(security)_
- Draft plan for M3 does not exist yet in this fan-out (path given as '(draft plan not yet written)') — this perspective cannot validate task-level 'Validate' steps because none exist; all findings above are PRD-derived expectations the eventual plan must satisfy.  _(test)_
- PRD Success Metrics table gives no acceptance test for metric 3 ('join 커버리지와 미짝 사유 분해') beyond what M2 already produced in JSON — unclear whether M3 needs a NEW test asserting the STATUS.md line surfaces the sum_equation_holds invariant, or whether M2's existing JSON-level test suffices.  _(test)_
- No CI wiring is mentioned for leadtime.test.js — per CLAUDE.md only 3 test files are registered in .github/workflows/; the plan should state whether M3's new renderer test needs manual `## Validation` execution since it won't be caught by CI automatically.  _(test)_
- Draft plan does not exist yet ('draft plan not yet written') — this fan-out ran against the PRD alone; no plan-side reuse violations could be checked against concrete 'Files to Change' entries.  _(explorer)_
- PRD does not specify where in STATUS.md the 'one-line' surface goes (top of document vs. inside an existing section vs. new section) — M3 plan must pin the exact insertion point and cite renderer/index.js or markdown.js line numbers, or collision with plugins/mccp/scripts/lib/renderer/sections/status-grid.js's existing hero verdict line is likely.  _(explorer)_
- PRD does not name a CLI entry-point convention for M3 even though leadtime.js already has a renderHuman-style CLI text renderer (leadtime.js:1041+) — plan should clarify whether M3 wires leadtime.js output into derive's JSON model (like msw-metrics) or keeps leadtime.js's own CLI output as the STATUS.md consumption path.  _(explorer)_
- PRD references docs/leadtime-observability/panel-span.md and post-panel-span.md as '축자 동결' (verbatim-frozen) for M1/M2 output — if that constraint extends to M3's rendered output/field names, the plan must name it; not confirmed in this pass.  _(explorer)_

### Patterns to mirror

- plugins/mccp/scripts/lib/renderer/index.js:126-138 safeSection() — every renderer section is independently try/catch wrapped and degrades to null with a stderr warning rather than crashing the whole render; a new leadtime section should follow this exact fail-open shape.  _(architect)_
- plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:1-24 — closest existing analog for a 'metrics-derived section' consuming a derive-populated model field (model.metrics), including its documented graceful-hide rules (absence vs computed) and Output Constraints (heading depth <=3, <=1 accent color, no raw markdown, list-of-N collapse) that any new leadtime section must also satisfy per CLAUDE.md §3.9.  _(architect)_
- plugins/mccp/scripts/lib/leadtime.js:822-1003 aggregate() — the existing M1/M2 code already separates pure aggregation (no I/O) from the I/O-performing audit() wrapper; if M3 adds a derive source, it should call aggregate() with pre-read data the same way tests do, not audit() directly, to avoid embedding fs/child_process calls inside the derive scan loop uncontrolled.  _(architect)_
- derive/index.js:11-26 — the 15-source registration pattern (const { scanX } = require('./sources/x'); ...) is the established extension point for any new observability axis; a new scanLeadtime would slot in the same way rather than as an ad hoc side-channel read inside the renderer.  _(architect)_
- normalizePlanPath (leadtime.js:174-183) — repo-relative normalization + NON_REPO_PATH marker for any path that would otherwise leak absolute/machine-specific info into a git-tracked or rendered artifact.  _(security)_
- execFileSync with fixed argv array + '--' path separator (leadtime.js:407-429) — the sanctioned pattern for any subprocess invocation touching user-influenced path lists, avoiding shell interpolation.  _(security)_
- sourceUnavailable/sourceDamaged 3-state witness pattern (leadtime.js:257-266) — 'unavailable' is never silently folded into a definitive negative, preventing false-confidence output from partial reads; any M3 aggregation of leadtime.js's audit() output should preserve rather than collapse these states.  _(security)_
- readJsonDir (leadtime.js:299-322) — try/catch around JSON.parse and readdirSync classifies failures without throwing, keeping the read path fail-soft/fail-visible (parse_failures counted, not swallowed) rather than crashing or fabricating zero values.  _(security)_
- renderer/html.js escapeHtml discipline (referenced across renderer/sections/*.js) — the existing STATUS.md/status.html pipeline already has an established escaping convention that M3 must extend rather than reinvent for the new leadtime section.  _(security)_
- leadtime.test.js absence-rule discipline: null/zero-observation states get a distinct 'blind' vs 'degraded' vs 'ok' ladder, and tests assert key ABSENCE (not empty arrays/zero) for undetected axes — e.g. assert.equal(Object.prototype.hasOwnProperty.call(out, 'panel_span'), false) at leadtime.test.js:126-127. M3's STATUS.md line should mirror this: absent-coverage states must render as explicit 'no data' text, never a silent 0.  _(test)_
- Fixture-builder pattern: record()/panelRecord()/ledgerEntry()/shipReceipt()/anchors() composable builders (leadtime.test.js:53-98, 379-432) avoid live-corpus dependence entirely — M3 renderer tests should use equivalent injected-object builders rather than reading real .claude/ state directories.  _(test)_
- Asymmetric-witness regression style via 'flip one input, observe one output changes' (leadtime.test.js:651-677) is a strong oracle-fit pattern — good model for testing the STATUS.md line's degraded/blind fallback text.  _(test)_
- Frozen-literal regression test for a cross-PRD-owned contract (leadtime.test.js:355-363 CORPUS_FROZEN) is reusable if M3 touches any file whose output is contractually owned elsewhere (e.g. STATUS.md's existing top-line format may be similarly frozen by another PRD).  _(test)_
- plugins/mccp/scripts/derive/index.js:125-131 — fail-open try/catch around a compute-metrics call, with pushWarning(model, 'medium', 'metrics', ...) on failure; mirror for wiring leadtime.js's audit() into the derive model.  _(explorer)_
- plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js — graceful-hide contract (metrics absent/all-insufficient -> null section) plus 'coverage never separated from value' and TOP_EXPANDED=3 + <details> collapse conventions; reuse directly for the new leadtime section.  _(explorer)_
- plugins/mccp/scripts/lib/leadtime.js:449-470 qualifyShipReceipts() — calling pr-ship-gate.js#deriveShipDecision instead of reimplementing ship-qualification; same reuse-not-reimplement principle should extend to M3.  _(explorer)_
- plugins/mccp/scripts/lib/renderer/index.js:21-40 safeSection/safeCompose — fail-open wrapper pattern for any new renderer section, consistent with the rest of the renderer pipeline.  _(explorer)_
- leadtime.js module header comments (leadtime.js:1-138) — DD/UI-numbered rationale; PRD decisions 1-3 map directly to leadtime.js's already-implemented invariants (DD2 no-corpus-mutation, DD11 composite state, UI3 coverage-first) — M3 plan text should cite these DD/UI ids rather than re-derive the same rules under new names.  _(explorer)_

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime.js` | UPDATE | `audit(opts)`에 `allowGit`(기본 `true`) 추가 + 순수 투영 `summarizeForSurface(result)` export. 오라클·CLI·기존 출력 계약 무변경 |
| `plugins/mccp/scripts/lib/leadtime-surface.js` | CREATE | 한 줄 문자열을 만드는 **단일 포매터**(`formatLeadtimeLine`). md·html·파일이 같은 문자열/수치를 쓰도록 하는 자리 |
| `plugins/mccp/scripts/lib/leadtime-distribution.js` | CREATE | `.claude/state/leadtime/distribution.json` writer. 원자적 · content-stable(내용 무변경이면 미기록) |
| `plugins/mccp/scripts/lib/leadtime-derive.js` | CREATE | `scanLeadtime(root, opts)` — `audit` 호출 + `summarizeForSurface` 투영. fail-closed sentinel 반환(throw 없음). **`derive/sources/` 가 아니다**: 그 디렉토리는 `SOURCE_SCANNERS` 에 등록돼 `model.sources.<name>` count-source 를 채우는 스캐너의 자리이고, 이 축은 top-level `model.leadtime` 을 채운다. 인용한 선례 `model.metrics` 도 `../lib/msw-metrics` 에 산다 (L2 architect/LOW 흡수) |
| `plugins/mccp/scripts/derive/model.js` | UPDATE | `emptyModel`에 `leadtime` 선언 + `validateShape` present-only 검사. `MODEL_VERSION` 무변경 |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | correlate 뒤 `model.leadtime = scanLeadtime(root, opts)` 독립 try/catch |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | `cmdRender`가 `leadtimeScan: true` opt-in + 렌더 후 distribution writer piggyback |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATE | **두 번째 렌더 진입점**(auto-refresh). `leadtimeScan` opt-in만 — **distribution writer는 배선하지 않는다**(DD17) |
| `plugins/mccp/scripts/lib/renderer/sections/leadtime-line.js` | CREATE | `{md, html}` 또는 `null`. 값 부재는 `미산출`, 축 부재만 hide |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | `safeSection('leadtime-line', …)` 추가 + `sections` 배열 확장 |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | DD7 이음매의 **실제 소유자** — `grid.md` join(`:253`)의 `summaryLine` 바로 다음에 한 줄을 끼운다. 초안이 이 행을 누락해 DD7이 구현 불가였다 (L2 architect HIGH 흡수) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | 배치 변경 **없음** — `grid.md`를 통째로 push하는 기존 경로 그대로(`:57`). 이 파일은 아래 version 동기 행으로만 열린다 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | hero-panel 안 `hero-status`/verdict 띠 직후 · widget-grid **앞** 한 줄 삽입 (DD7, 신규 CSS 클래스 0개) |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATE | `allowGit:false` 증인 강등 · 투영 순수성/동치 회귀 |
| `plugins/mccp/scripts/lib/tests/leadtime-surface.test.js` | CREATE | 포매터 · 한 줄 ↔ 파일 동일 투영 · 값 부재 표기 |
| `plugins/mccp/scripts/lib/tests/leadtime-distribution.test.js` | CREATE | 원자성 · content-stable 재기록 없음 · 변경 시 기록 |
| `plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js` | CREATE | 축 부재 hide · 값 부재 `미산출` · 값 present 시 커버리지 병기 · 결정성 |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATE | `leadtime` additive 필드 드리프트 가드 |
| `.claude/state/leadtime/distribution.json` | CREATE | C7이 인용할 git-tracked 산출물 (UI4) |
| `docs/leadtime-observability/one-line-consumption.md` | CREATE | 한 줄 문법 · 파일 스키마 · 강등 계약 · 동결 실측 |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | §2 표에 한 줄의 소유·graceful-hide 규칙 등재 |
| `.claude/prds/leadtime-observability.prd.md` | UPDATE | milestone 3 행 `pending → in-progress`(작성 시) → `complete` + Plan 경로 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 version bump (PRD 종료 → minor) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (위 행과 같은 파일 — 4면 중 2면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (위 행과 같은 파일) |
| `CHANGELOG.md` | UPDATE | §3.7 4면 동기 |

## Design Decisions

### DD1 — 한 줄과 파일은 **같은 투영 하나**를 쓴다

두 소비처가 각자 `audit()` 결과를 해석하면 언젠가 서로 다른 숫자를 낸다. 이 저장소가 이 PRD를 연 이유가 정확히 그것이다 — 같은 것을 재는 값 셋이 10배 달랐다. 그래서 `summarizeForSurface(result)`가 **유일한 해석 지점**이고, 한 줄도 파일도 그 반환값만 읽는다. 둘의 일치는 산문이 아니라 test가 강제한다(`한 줄에 실린 수치가 파일의 같은 필드와 동일`).

### DD2 — derive는 spawn-free가 기본이고 `render`만 git 증인을 opt-in한다

`audit()`은 리뷰 레코드 전건 read + ledger/ship/archived/implement 디렉토리 read + W3(git-touch) 증인의 `git log` spawn을 한다. **실측**(이 worktree): `derive(worktreeScan:true)` 2371ms에 대해 `audit()` **371ms** — 약 16% 추가다. `derive()`는 `host_version`의 `allowGit:false`와 `worktrees`의 default-off로 이미 선언된 spawn-free 예산 위에 있으므로, **축 계산 자체를 렌더 경로로 한정**한다(`leadtimeScan`, 기본 off — DD16). 그 결과 `run`/`validate`/perf-budget은 0을 지불하고, 렌더 경로만 371ms를 지불한다.

`allowGit:false`일 때 W3은 `no`가 아니라 **`unavailable`**이다. 이것은 M2가 이미 못박은 계약(`unavailable`은 `no`가 아니다)을 그대로 상속하는 것이고, 그 결과 `not_shipped`(만장일치 부정 필요)가 그 모드에서 **도달 불가**가 되어 해당 행이 `unclassified`로 떨어진다. 새 규칙이 아니라 기존 규칙의 정직한 귀결이다.

**분포는 이 강등에 영향을 받지 않는다.** 증인은 *미짝의 분류*에만 쓰이고, `panel_span`·`post_panel_span`의 백분위와 커버리지는 조인 결과만으로 결정된다. 즉 C7이 인용하는 수치는 두 모드에서 동일하고, 달라지는 것은 `unmatched` 분해뿐이다. 그 사실을 강등 배열(`degradations`)로 산출물에 싣는다 — 감추면 `unclassified` 증가가 코퍼스의 성질로 오독된다.

### DD3 — 값 부재는 숨기지 않는다. 숨기는 것은 **축 부재**뿐이다

`leadtime.js`는 3-state ladder(`ok`/`degraded`/`blind`)를 갖는데 renderer에는 "렌더한다/`null`"의 2-state 관례밖에 없다. 세 상태를 2-state에 접으면 `blind`(관측이 없다)와 `safeSection`의 렌더 실패(⚠ placeholder)가 화면에서 같아진다 — 서로 완전히 다른 사실이다. 그래서 ladder를 접지 않고 **네 갈래로 명시 사상**한다:

| 조건 | 처리 | 왜 |
|---|---|---|
| `model.leadtime`이 없다 (키 부재) | 한 줄을 **렌더하지 않는다**(`null`) | 이 축을 모르는 모델(구 스냅샷·다른 소비처)에 대해 없는 사실을 지어내지 않는다 |
| `state === 'ok'` | 값 + 커버리지 | 정상 |
| `state === 'degraded'` | 값 + 커버리지 + `일부 소스 손상` 꼬리표 | 값은 유효하되 하한이다. 숨기면 손상이 성적으로 보인다 |
| `state === 'blind'` 또는 측정 가능 0 | `미산출` + 사유 + 커버리지 | UI3 — 없는 것을 `0`으로 적지 않는다 |
| 한쪽 앵커만 조인됨 | 그 축만 값, 나머지는 `미산출` | UI8 — 합치지 않는다. 한쪽이 없다고 다른 쪽으로 대체하지 않는다 |
| 섹션 함수가 throw | `safeSection`의 ⚠ placeholder (기존 관례 그대로) | 렌더 결함과 관측 부재를 같은 글자로 쓰지 않는다 |

`msw-metrics`의 graceful-hide와 다른 규칙이다. 그쪽은 "아직 측정 전"을 조용히 넘기지만, 이 축은 **PRD가 명시적으로 '없으면 없다고 적으라'고 요구**했다(UI3). 그래서 hide 조건을 축 부재 하나로 좁힌다.

### DD4 — 두 앵커는 한 줄에서도 각각 뜬다

`ledger 0.38일 (11/49) · ship 0.28일 (17/49)`. 하나로 접으면 PRD 결정 1이 금지한 선택을 렌더 층이 대신 내리게 되고, M2 실측이 밝힌 오늘 유일한 살아있는 신호(**커버리지 차이**, ledger만 5 · ship만 11)가 화면에서 사라진다. 한 줄이 길어지는 비용은 지불한다.

### DD5 — 파일은 `.claude/state/leadtime/distribution.json`이다. `.claude/cache/`가 아니다

`.gitignore:142`가 `.claude/cache/`를 통째로 무시한다. 거기 쓴 파일은 worktree 정리(§3.8)와 함께 사라지고 다른 세션·다른 worktree의 C7이 인용할 수 없다 — UI4가 요구한 "파일로 남는다"를 만족하지 못한다. `.claude/state/`는 하위 특정 경로만 무시되고 `leadtime/`은 그중 어디에도 닿지 않으므로 git-tracked다. §3.12가 감사 대조 corpus를 git-tracked로 두는 것과 같은 근거다.

### DD6 — 파일은 content-stable하게 쓴다 (변경 없으면 기록하지 않는다)

git-tracked 파일을 렌더마다 갱신하면 `/mccp:dashboard-refresh` 한 번에 diff가 생겨 모든 커밋이 이 파일을 끌고 다닌다. 그래서 payload에 **어떤 시각 필드도 두지 않고**, 디스크의 기존 payload와 다를 때만 쓴다. "언제 갱신됐나"의 답은 git log다.

초안은 시간 축으로 `corpus_max_recorded_at`을 싣자고 적었는데 **그 필드는 실재하지 않는다**(L2 architect/MEDIUM 흡수 — `plugins/mccp/scripts/lib/leadtime.js` 전문 grep 0건). 투영이 per-record `recorded_at`을 훑어 max를 만들어야 하는데 그것은 DD13이 금지한 "새 수를 만든다"이고, 원자료가 `panel_span.records` 안에만 있어 `panel_span` 키가 부재한 blind 상태에서는 도출 자체가 불가능하다 — DD3이 열거한 상태에서 앵커가 정의되지 않는다. 시각 필드를 아예 없애면 그 세 문제가 함께 사라지고 content-stability는 **구성상** 성립한다(비교할 변동 필드가 없다).

### DD7 — 신규 섹션·heading·강조색을 만들지 않고, **next-action 아래**에 놓는다

`§3.9` 출력 제약 4종 중 둘이 직접 걸린다: heading depth ≤ 3(H15)과 강조색 화면당 1개. 한 줄은 이미 있는 대시보드/hero 블록 **안에** 들어가고 자기 heading을 갖지 않으며, 톤은 중립(`muted`)이다 — hero verdict가 유일한 loud accent라는 기존 위계를 건드리지 않는다. 신규 CSS 클래스 0개(기존 `mono`/`muted` 재사용)라 `output-constraints.js`의 H3/H4 carve-out 목록도 손대지 않는다.

**위치는 `summaryLine` 바로 다음이다 — 즉 대시보드 블록 최상단의 한 줄 상태 띠에 붙는다.**

이 결론은 두 번 바뀌었고 두 번째가 실측이다. design-critique R0은 "한 줄이 next-action **위**에 있으면 `primary action → status → detail`을 뒤집는다"며 아래로 옮기라고 했고 초안은 그대로 수용했다. **그 전제가 틀렸다** — 렌더된 STATUS.md 실측에서 `## 대시보드` 블록은 15행에서 473행까지 **459줄**이고, `nextActionMd`가 내는 `다음: ` 한 줄은 그 블록의 **462행**, 즉 거의 끝에 있다(`grid.md = [summaryLine, "", widgetsMd, "", nextActionMd]` — primary action이 이미 맨 아래다). 그 아래에 붙이면 2655줄 문서의 463행에 놓이고, PRD가 요구한 "STATUS.md **상단** 한 줄"이 성립하지 않는다.

올바른 자리는 `summaryLine`(실측 17행)의 바로 다음이다. 그 줄은 이 문서의 **한 줄 상태 띠**(`◐ 진행 중 2 · 🚫 차단 0 · …`)이고 리드타임 한 줄은 같은 종류(status)라 나란히 놓이는 것이 위계에 맞는다. next-action은 지금 있는 자리(블록 끝)에 그대로 두므로 primary action을 밀어내지도 않는다 — R0이 막으려던 것은 *행동을 측정 아래로 미는 것*이었고, 그 일은 일어나지 않는다.

구체적으로: markdown은 `grid.md`의 `summaryLine` 다음 줄. html은 hero-panel의 `hero-status`/verdict 띠 다음, widget-grid 앞.

### DD8 — `summarizeForSurface`는 per-record 배열을 싣지 않는다

`audit()` 전체 결과는 레코드 49건 + 조인 28건 + 미짝 70건의 상세를 담아 100KB급이다. 그것을 모델에 실으면 렌더마다 마스킹·직렬화 비용을 내고, git-tracked 파일에 넣으면 코퍼스가 커질수록 diff가 폭발한다. 투영은 **백분위·커버리지·미짝 사유 카운트**까지만 담는다.

전건 상세를 잃는 것이 아니다 — `node plugins/mccp/scripts/lib/leadtime.js --json`이 계속 소유하고, 문서 동결면(`post-panel-span.md`)이 그 전문을 담는다. 파일은 C7이 인용할 **분포**이지 감사 corpus가 아니다.

### DD9 — `corpus.js`도 게이트 배선도 건드리지 않는다. derive는 게이트 배선이 아니다

UI7의 기계적 강제는 이미 `leadtime.test.js:355`(byte-identical 동결)에 있고, M3은 그 test를 green으로 유지하는 것으로 충분하다.

UI11의 "게이트 배선"이 무엇인지 여기서 못박는다 — derive/renderer를 건드리는 이 milestone이 그 제약을 위반하는지가 자명하지 않기 때문이다. **게이트 배선 = 판정을 내리거나 진행을 막는 경로**다: `plugins/mccp/commands/` · `hooks/` · `scripts/hooks/` · `scripts/receipt/` · `codex-invoke.js`. derive/renderer는 **관측 표면**이고 아무것도 차단하지 않는다 — `safeSection`·독립 try/catch·fail-open이 전부 그 사실의 구조적 표현이다. Validation 9가 그 경로 집합에 대해 `--exit-code`로 공집합을 강제한다.

같은 선에서 이 소비 층의 **비목표**를 명시한다: 임계값을 계산하지 않고(UI5 — C7 소유), 어떤 값도 되쓰지 않으며(`distribution.json` 한 파일 write가 전부), LLM·네트워크·Codex를 부르지 않는다. `leadtime.js` 헤더가 선언한 read-only·LLM-free 경계를 소비 층이 그대로 상속한다.

### DD10 — derive 실패는 렌더를 깨지 않고, 렌더 실패는 파일 write를 깨지 않는다

세 층 전부 fail-open이되 **조용하지 않다**: `scanLeadtime`은 throw 대신 `{state:'blind', degraded:true, error}` sentinel을 돌려주고(그러면 한 줄이 `미산출` + 사유를 적는다), `derive/index.js`는 독립 try/catch로 warning을 남기며, distribution writer는 lazy require + try/catch로 stderr에만 적는다. 관측 축이 게이트를 막는 것은 이 저장소가 반복해 거부한 형태다.

### DD11 — 지표 4(두 앵커 불일치)를 한 줄에 싣지 않는다

M2 실측이 밝힌 대로 `anchor_delta_ms`는 양쪽 매치 전건 **정확히 0**이다 — ledger의 `completed_at`이 ship receipt의 `meta.created_at`을 복사하기 때문이고, 두 앵커는 독립 증인이 아니라 한 사건의 두 기록이다(PRD Open Question, 미판정). 한 줄에 `불일치 0`을 적으면 "두 기록이 잘 맞는다"로 읽히는데 그것은 **측정되지 않은 주장**이다. 구조적 항등식을 신호로 파는 셈이다.

그래서 한 줄은 그 수치를 **말하지 않는다**. `distribution.json`에는 `disagreement`를 싣되 `disagreement_note: 'structurally-zero: ledger.completed_at copies ship receipt meta.created_at (PRD open question)'`을 붙여 인용자가 맥락 없이 집어가지 못하게 한다. 오늘 살아있는 신호는 **커버리지 차이**이고 그것은 이미 한 줄에 있다(`(11/49)` 대 `(17/49)`).

### DD12 — 투영에는 경로도 레코드 이름도 없다 (escaping 문제를 원천 제거)

`audit()` 결과의 레코드 행은 `.claude/reviews/…` 파일명과 `plan_path`, `reviewed_plan_hash`를 담는다. 그것이 렌더 면에 흐르면 HTML escaping 규율과 경로 마스킹에 의존해야 하고, git-tracked 파일에 실리면 머신 고유 문자열이 커밋된다.

`summarizeForSurface`는 **수치와 열거형 키만** 담는다 — 파일 경로 0개, 레코드명 0개, 해시 0개. 그러면 escaping은 규율이 아니라 **구조적으로 불필요**해지고(주입할 자유 문자열이 없다), 경로 마스킹 층에 대한 의존도 사라진다. 이것은 DD8(모델 비대 방지)과 같은 결정의 다른 얼굴이며, test가 투영 전체를 훑어 `/`·`\`·`.md`·`sha256:`이 없음을 단언해 강제한다.

전건 상세는 `--json`과 문서 동결면이 계속 소유한다(DD8).

### DD13 — 투영은 산술을 하지 않는다. 필드를 **고를** 뿐이다

소비 층이 값을 만들어내면 M1·M2가 지킨 무결성이 그 층에서 무너진다 — 커버리지 결측을 `0`이나 `100%`로 채우거나, 음수 span을 clamp하거나, 두 축을 평균하는 것이 전부 같은 오류다. `summarizeForSurface`는 `aggregate`가 이미 낸 값을 **선택·재배치**만 하고 새 수를 만들지 않는다(단위 환산은 포매터의 표시 계층에서만 일어난다). 부재 필드는 `null`로 남기고 절대 기본값을 넣지 않는다.

### DD16 — 렌더 진입점은 **둘**이고, 축은 그 둘에서만 계산된다

초안은 `derive/cli.js#cmdRender` 하나만 배선했다. **거짓 전제였다**(L2 architect/HIGH 흡수): `plugins/mccp/scripts/lib/renderer/trigger.js` line 292-307이 자기 derive+render를 돌려 STATUS.md·status.html을 직접 쓰고, 그 호출자가 `receipt/write.js` line 1180 · `lib/dispatch-envelope.js` line 250 · `lib/dispatch-watcher.js` line 122 · `hooks/render-trigger-session-start.js` line 24 · `lib/dashboard-server.js` line 391이다. 즉 **실사용 렌더의 대부분이 auto-refresh 경로**다.

한쪽만 배선하면 두 가지가 깨진다: (a) UI4의 git-tracked 산출물이 auto-refresh에서 **한 번도 갱신되지 않아** 사람이 CLI를 직접 칠 때만 존재하고, (b) 화면의 한 줄과 파일이 서로 다른 실행의 산출이 되어 DD1이 구조로 막았다고 주장한 발산이 두 진입점 **사이에** 남는다. plan이 mirror로 인용한 snapshot writer 선례가 바로 그 반증이다 — 그것은 `derive/cli.js` line 195-204 **와** `trigger.js` line 322-324 **양쪽**에 배선돼 있고, 초안은 그 선례의 절반만 복제했다.

**계산 자체를 렌더 경로로 한정한다.** `scanLeadtime`은 `opts.leadtimeScan`이 참일 때만 돈다(기본 off). 두 렌더 진입점이 그것을 켜고, bare `derive()`(run · validate · perf-budget)는 `model.leadtime = null`로 남아 DD3 1행대로 한 줄이 렌더되지 않는다 — 그 경로는 애초에 STATUS.md를 만들지 않으므로 사용자에게 잃는 것이 없다.

**비용은 추정이 아니라 실측이다**(L2 architect/MEDIUM 흡수). 초안의 Risk 표는 비용을 "git spawn 하나 1.15s"로 모델링했는데 그 수치는 node 기동을 포함한 것이었고, 실제 부하는 spawn만이 아니라 리뷰 레코드 전건 read + `parseRecord` 2회 + ledger/ship/archived 디렉토리 read다. 이 worktree 실측: `derive(worktreeScan:true)` **2371ms**, `leadtime.audit(git 포함)` **371ms** — 렌더 경로에 약 16% 추가. 렌더에서만 돌므로 receipt-write 경로가 지불하는 것도 그 371ms이고, bare derive는 0이다. 값이 커지면 `leadtimeScan`을 끄는 것이 즉효 완화다.

`allowGit`은 유지하되 **test 주입 seam**이다 — 오늘 `audit()`은 test가 전혀 건드리지 않고(오라클 `aggregate`만 검증된다), `allowGit:false`가 spawn 없이 `audit()`을 실행할 유일한 통로다.

### DD17 — 한 줄은 캐시 표면이고, 파일은 **명시 렌더에서만** 발행한다

DD16이 두 진입점을 모두 배선하자 세 리뷰어가 같은 축을 독립적으로 지적했다: `distribution.json`은 git-tracked(DD5)인데 `trigger.js` 호출자가 SessionStart hook · `receipt/write.js` · dispatch watcher라 **운영자가 부르지 않는 ambient 경로**에서 쓰이고, PRD Evidence 마지막 항이 못박은 대로 코퍼스는 게이트 실행마다 자라므로 payload가 사실상 매 사이클 바뀐다. 그러면 DD6의 content-stability가 무력해지고, §3.8 병렬 worktree에서는 각 worktree가 자기 코퍼스 관점으로 **같은 tracked 파일을 서로 다르게 덮어써** 무관한 브랜치의 작업 트리가 hook 한 번으로 dirty해진다.

두 산출물의 **성격이 다르다**는 것이 답이다:

| 산출물 | 경로 | 쓰는 주체 | 성격 |
|---|---|---|---|
| 한 줄 | `.claude/cache/STATUS.md`·`status.html` (gitignored) | 두 렌더 진입점 모두 | **캐시** — worktree-local, 자주 갱신, 충돌 개념 없음 |
| 분포 파일 | `.claude/state/leadtime/distribution.json` (tracked) | `derive/cli.js#cmdRender` **만** | **발행물** — 운영자가 `/mccp:dashboard-refresh`로 명시 갱신 |

즉 `trigger.js`는 `leadtimeScan`만 켜고 writer는 부르지 않는다. DD16이 지적한 "auto-refresh가 축을 못 본다"는 **한 줄에 대한 것**이었고 그것은 여전히 닫힌다 — 두 경로 모두 같은 투영으로 같은 문장을 낸다(DD1). 파일이 auto-refresh에서 갱신되지 않는 것은 결함이 아니라 **발행 경계**이며, UI4가 요구한 "C7이 인용할 파일"은 명시 명령으로 갱신되는 편이 오히려 인용 가능한 스냅샷에 가깝다.

이로써 ambient hook이 tracked 파일을 만지는 경로가 **0개**가 되고, 병렬 worktree 충돌 축이 사라진다. 대가는 파일이 stale해질 수 있다는 것이고, 그것은 payload가 자기 커버리지를 싣고 있으므로 읽는 쪽에서 판별 가능하다.

### DD15 — backlog가 M3에 명시적으로 이연한 HIGH 2건을 여기서 닫는다

M1+M2 PR의 impeccable critique가 낸 HIGH 2건이 `codex-findings-backlog.md`에 **M3을 재판정 시점으로 지목하며** 이연돼 있다. 그 이연 사유가 "M3 소비처가 형식을 정한 뒤 함께 고치는 것이 맞다"였으므로, 지금이 그 시점이다.

| backlog 행 | 내용 | M3의 처리 |
|---|---|---|
| `leadtime.js:1058` HIGH | 사람 출력이 1줄 verdict 없이 카운터 6개로 시작한다 (`records=49 pre_measurement=13 …`) — Output Constraint 1 위반 | `renderHuman`이 **`formatLeadtimeLine`의 같은 한 줄로 시작**하고 카운터는 그 아래로 내린다. DD1의 단일 포매터가 CLI까지 확장되는 것이라 새 코드가 아니다 |
| `leadtime.js:1046-1053` HIGH | `unmatched[…]`가 5버킷·112자·129칼럼이고 5개 중 3개가 `=0` — Output Constraint 4 위반 | 비-0 버킷만 내림차순 **상위 3개 + `(+N — see --json)`**. 절삭이 항상 보이므로 조용한 절삭이 아니다 |

**동결 문서와 충돌하지 않는다** — `panel-span.md`·`post-panel-span.md`가 동결한 것은 `--json` 출력이고, 사람 출력(`renderHuman`)은 어느 동결 블록에도 실려 있지 않다(실측 확인: 두 문서에 `panel-span leadtime — state=` 0건). 그래서 이 흡수는 UI7/동결 계약을 건드리지 않는다.

같은 critique의 MEDIUM·LOW 4건은 §3.14대로 backlog에 남는다. 다만 **Task 7이 만드는 새 문서는 그 결함을 처음부터 반복하지 않는다** — 동결 블록을 `<details>`로 접고 「한계」 절을 그 **위**에 둔다(기존 두 문서는 한계가 약 1500줄의 JSON 뒤에 온다). 이연 항목을 고치는 것이 아니라 새 표면에 같은 결함을 만들지 않는 것이다.

### DD14 — 커버리지 병기는 한 줄에서 **인접성**으로 성립한다

CLI는 `UI3 — 커버리지 줄이 값보다 먼저 나온다`를 줄 순서로 지켰고 test가 `covIdx < valIdx`를 단언한다(`leadtime.test.js:872-885`). 한 줄 표면에는 "앞 줄"이 없으므로 같은 규칙을 그대로 옮길 수 없다. 규칙을 **인접성**으로 다시 적는다: 코퍼스 커버리지가 맨 앞에 오고, 그 뒤 모든 값 토큰은 자기 커버리지를 괄호로 **바로 뒤에** 단다. 커버리지 없는 값 토큰은 존재할 수 없다.

이것은 완화가 아니라 같은 명제의 1차원 표현이며, test가 정규식으로 "모든 값에 짝이 있다"를 강제한다(Validation 2).

## Tasks

### Task 1: `leadtime.js` — spawn 게이트 + 순수 투영

- **Action**:
  1. `audit(opts)`에 `allowGit`(기본 `true`) 추가. `false`면 `readGitTouchedPaths`를 호출하지 않고 `{available:false, touched:[], reason:'git-disabled'}`를 주입한다 — 기존 `git-exec-failed` 경로와 같은 형태라 `aggregate` 하류는 무변경이고 W3이 `unavailable`로 떨어진다(DD2).
  2. `summarizeForSurface(result)` 추가 — 순수 함수, I/O 없음, **산술 없음**(DD13 — 필드 선택만). 반환:
     `{ tool:'leadtime', state, coverage:{panel_records, measurable, counts_are_lower_bound}, panel_span:{n,min,p50,p90,max}|null, post_panel_span:{by_anchor:{ledger_basename:{n,p50,p90,max}|null, ship_plan_hash:{…}|null}, coverage:{eligible,matched_ledger,matched_ship,both,only_ledger,only_ship,neither}, unmatched:{<anchor>:{<reason>:count}}, disagreement:{n,p50,max}|null, disagreement_note}, degradations:[] }`
  3. **경로·레코드명·해시를 담지 않는다**(DD12). 값은 수치와 열거형 키뿐이며, 실패 sentinel도 예외가 아니다(닫힌 `error_kind` 열거형).
  3b. **두 앵커 키는 언제나 실린다** (L2 architect/MEDIUM 흡수). `aggregate`의 `by_anchor`는 **조건부 키**라 관측 0건·degraded 분기에서 아예 없다(`plugins/mccp/scripts/lib/leadtime.js` line 959-996). 투영은 두 키를 항상 만들고 부재를 `null`로 적는다 — DD13의 "부재는 `null`" 규칙 그대로이고, 이로써 Validation 1과 4가 **같은 명제**(`'ledger_basename' in by_anchor`)를 검사하게 된다. 초안은 한쪽은 truthiness로, 다른 쪽은 키 존재로 검사해 DD3이 합법이라 선언한 상태를 한쪽이 실패로 만들었다.
  4. `degradations`에 `git-disabled`(→ `not_shipped` 도달 불가)를 명시적으로 싣는다. `disagreement_note`는 DD11의 구조적-0 경고를 상수 문자열로 싣는다.
  5. 헤더 주석에 M3 절 추가 — 이 투영이 무엇을 **버리는가**(per-record 상세, DD8)와 왜 경로를 버리는가(DD12)를 적는다.
- **Mirror**: `leadtime.js:3-22` 헤더 규약 · `aggregate`의 순수-오라클/`audit`의 I/O 분리 · `normalizePlanPath`의 "머신 고유 문자열을 산출물에 넣지 않는다" 원칙(DD12는 그것을 필드 제거로 일반화)
- **Validate**: Validation 1 + 투영 경로-부재 단언(Validation 2b)

### Task 2: 한 줄 포매터 (`leadtime-surface.js`)

- **Action**: `formatLeadtimeLine(summary)` → `{ text, parts }`. `text` 형태(DD14 — 코퍼스 커버리지가 맨 앞, 그 뒤 모든 값에 자기 커버리지가 괄호로 인접):
  `리드타임 (측정 49/62) · 패널 p50 7.6min · 패널→ship ledger p50 0.38d (11/49) · ship p50 0.28d (17/49)`
  값 부재 축은 `미산출`로 쓰고 커버리지는 그대로 병기한다(UI2·UI3). 지표 4는 싣지 않는다(DD11). 순수 함수 — 모델도 fs도 읽지 않는다.

  **단위 어휘는 하나이고, 그 소유는 `leadtime-surface.js`로 옮긴다** (L2 architect HIGH 흡수). 기존 헬퍼 `fmtMin`/`fmtDay`(`plugins/mccp/scripts/lib/leadtime.js` line 1041-1047)는 영문 `min`/`d`를 내지만 **module-private이고 export되지 않는다**(`module.exports` line 1248-1275에 없다). 초안은 "그 두 함수를 그대로 재사용한다"고 적었는데, Task 6b가 `renderHuman`에서 `formatLeadtimeLine`을 부르게 하므로 그 재사용은 `leadtime.js → leadtime-surface.js → leadtime.js` **순환**을 만들고, `module.exports`가 파일 끝에서 할당되므로 surface 모듈이 top-level require로 받는 것은 미완성 exports다 — `fmtMin`이 호출 시점에 `undefined`가 된다.

  그래서 **방향을 뒤집는다**: 두 함수는 `leadtime-surface.js`가 소유하고 export하며, `leadtime.js`가 그것을 require한다. 의존은 `leadtime.js → leadtime-surface.js` 한 방향뿐이고 surface 모듈은 `leadtime.js`를 부르지 않는다(순수 함수 — 모델도 fs도 오라클도 읽지 않는다). `leadtime.js`의 기존 두 정의는 삭제하고 import로 대체하므로 어휘는 여전히 **하나**다. 단위는 식별자이므로 영문 유지가 이 저장소 관례와 정합한다.

  **`degraded` 꼬리표는 별도 줄이다** (L2 test/MEDIUM 흡수): 같은 줄에 붙이면 Task 6b의 100칼럼 상한과 충돌한다(헤드라인만으로 이미 약 99). `state==='degraded'`면 바로 아래 줄에 `일부 소스 손상: <axis>` 를 낸다 — `parts`에 실어 소비처가 두 줄을 각각 렌더한다.
- **Mirror**: `leadtime.js#renderHuman`의 단위 포맷 · `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js#formatValue`의 "값 셀은 한 지표만" 규율 · `leadtime.test.js:872-885`의 커버리지-값 순서 단언(1차원 표면용으로 인접성 규칙으로 옮김)
- **Validate**: 아래 Validation 2번

### Task 3: derive source + 모델 필드

- **Action**:
  1. `lib/leadtime-derive.js` — `scanLeadtime(root, opts)`는 `opts.leadtimeScan`이 참일 때만 `audit({repoRoot:root, allowGit:true})` → `summarizeForSurface`를 돌리고, 거짓이면 `null`을 돌려준다(DD16 — bare derive는 이 축을 계산하지 않는다). try/catch로 감싸 **절대 throw하지 않고** fail-closed sentinel을 돌려준다(`dep-check.js#checkImpeccable` 선례).

     **sentinel은 예외 메시지를 싣지 않는다** (L2 security/invariant HIGH 흡수): `{state:'blind', degraded:true, error_kind}`이고 `error_kind`는 **닫힌 열거형**(`read-failed` · `module-load-failed` · `oracle-threw`)이다. `err.message`는 stderr로만 나간다. Node의 fs/require 에러 메시지는 절대경로를 품으므로(`ENOENT: … open 'C:_project…'`), 그것을 sentinel에 실으면 DD5가 git-tracked로 옮긴 파일에 머신 고유 경로가 커밋되고 DD12의 "투영에 경로 없음"이 실패 경로에서 깨진다 — §3.12가 sanctioned 재봉인(`v1.22.4-cwd-rebind.js`)까지 필요했던 그 유출 계열이다. 인용된 선례(`derive/index.js` line 147 `error: err.message`)가 안전한 이유는 그 모델이 **gitignored** `.claude/cache/`에만 떨어지기 때문이고, DD5는 의도적으로 그 디렉토리 밖으로 나간다.
  2. `derive/model.js` — `emptyModel`에 `leadtime: null` 선언, `validateShape`에 present-only 객체 검사 추가, `MODEL_VERSION` 주석에 M3 항 추가.
  3. `derive/index.js` — correlate 뒤 독립 try/catch로 `model.leadtime = scanLeadtime(root, opts)`.
  4. **두 렌더 진입점 모두** `leadtimeScan`을 켠다(DD16): `derive/cli.js#cmdRender` — `derive(cwd, {…, leadtimeScan: true})` · `renderer/trigger.js` line 292-297 — `deriveImpl(repoRoot, { worktreeScan: true, leadtimeScan: true })`. 한쪽만 켜면 auto-refresh가 한 줄을 못 내고, 그 경로가 실사용 렌더의 대부분이다. **distribution writer는 `cmdRender`에만** 붙인다(DD17).
- **Mirror**: `derive/index.js:125-131`(metrics) · `:139-146`(host_version `allowGit:false`) · `cli.js:155`(`worktreeScan:true`)
- **Validate**: `node plugins/mccp/scripts/derive/cli.js run --json | node -e "…"`로 `leadtime` 키 present + bare derive가 git을 spawn하지 않음 확인

### Task 4: 렌더 한 줄 (md + html)

- **Action**:
  1. `renderer/sections/leadtime-line.js` — `renderLeadtimeLine(model, formatUtils)` → `{md, html}` 또는 `null`. hide 조건은 DD3 표의 첫 행 하나뿐. 헤더 주석에 그 규칙과 §3.9 제약 4종 준수 근거를 적는다.
  2. `renderer/index.js` — `safeSection('leadtime-line', …)` + `sections` 배열 확장(기존 인덱스 순서 뒤에 append — 기존 구조분해 소비처 무손상).
  3. `renderer/sections/status-grid.js` — `grid.md`를 조립하는 `[summaryLine, '', widgetsMd, '', nextActionMd]` join(`:253`)에서 리드타임 한 줄을 **`summaryLine` 바로 다음 원소로** 끼운다(DD7). 축 부재면 원소를 넣지 않는다(graceful-hide). 이 이음매의 소유자는 `markdown.js`가 **아니다** — `summaryLine`은 `renderer/sections/status-grid.js` 안에서 하나의 불투명한 `grid.md` 문자열로 합쳐지고 `markdown.js:57`은 그 블록을 통째로 `out.push`할 뿐이라, "summaryLine 다음"은 `renderer/sections/status-grid.js`를 건드리지 않고는 **구현 자체가 불가능**하다(L2 architect HIGH 흡수 — 초안은 이 파일을 Files to Change에 넣지도 않았다).
  4. `html.js` — hero-panel의 `hero-status`/verdict 띠 **다음**, widget-grid **앞**에 `<p class="mono muted">`. 신규 CSS 0개.

  초안 3·4항은 "`grid.md` 다음, `---` 앞" / "`next-action` **다음**"이라 적어 **DD7의 개정을 따라오지 못했다**(DD7은 두 번 바뀌었고 두 번째가 실측이다). 그 결과 plan이 배치를 세 가지로 말했고, Validation 3이 검사하던 것은 그중 Task가 지시하지 않는 쪽이었다.
- **Mirror**: `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js`의 `{md,html}`/`null` 계약 · `renderer/sections/status-grid.js:253`의 `grid.md` join 조립 지점 · `html.js:1057-1061` hero 조립
- **Validate**: 아래 Validation 3번(실제 렌더 산출물에서 문자열 확인 + next-action 뒤인지 순서 확인) + design-lint 무위반

### Task 5: distribution 파일 writer

- **Action**: `leadtime-distribution.js#writeDistribution(root, summary)` — `.claude/state/leadtime/distribution.json`에 `summary`를 그대로(정렬된 키로) 직렬화. 디스크 payload와 동일하면 **쓰지 않고** `{written:false, reason:'unchanged'}` 반환(DD6). 다르면 `.tmp` + `renameSync`. **`derive/cli.js#cmdRender` 한 곳에만** lazy require + try/catch로 호출한다(DD17) — line 195-204 옆, snapshot writer가 앉은 자리. **`trigger.js`에는 배선하지 않는다.**

  초안은 "두 렌더 경로 모두"라고 적어 DD17·Task 3.4·Files to Change와 정면으로 어긋났고, 리뷰어 4명이 전부 그것을 HIGH로 지목했다(L2 R1 흡수). Tasks 절이 plan의 실행 가능한 부분이므로, 여기 남은 반대 지시 하나가 DD17이 닫았다고 선언한 "ambient hook이 tracked 파일을 만지는 경로 **0개**"를 그대로 되연다. snapshot writer의 두 자리를 그대로 복제하는 것이 여기서 안전하지 않은 이유는 **목적지가 다르기 때문**이다 — snapshot은 `.gitignore:142`가 무시하는 `.claude/cache/`로 가지만 분포 파일은 tracked다(DD5).
- **Mirror**: `derive/cli.js` line 136-142(`writeAtomic`) · line 195-204(snapshot piggyback의 fail-open **호출 형태**만 빌린다 — 배선 지점은 `cmdRender` 단독, DD17)
- **Validate**: fixture test가 `writeDistribution`의 **반환값**을 직접 검사한다 — 같은 payload 2회 호출 시 두 번째가 `{written:false, reason:'unchanged'}`, 다른 payload면 `{written:true}`. mtime만 보면 "정상 skip"과 "writer가 fail-open으로 조용히 죽음"이 구분되지 않는다(L2 invariant/MEDIUM 흡수). 라이브 mtime 검사(Validation 5)는 그 위의 보조 확인이다

### Task 6: 회귀 test

- **Action**: 위 Files to Change의 test 5면. **fixture-builder로만 쓰고 실코퍼스 리터럴 카운트를 단언하지 않는다** — 코퍼스는 게이트 실행마다 자라므로 리터럴은 반드시 붉어진다(PRD Evidence 마지막 항 · `leadtime.test.js` 헤더 규약). 반드시 포함할 단언:
  - `allowGit:false`에서 W3이 `unavailable`이고 `no`가 아니다 — 그리고 같은 입력의 분포가 `allowGit:true`와 **완전히 동일**하다(DD2).
  - **`audit()`의 첫 직접 커버리지**: 합성 tmp repo + `allowGit:false`로 호출해 spawn 없이 완주한다(오늘 `audit()`은 test가 전혀 건드리지 않는다 — `allowGit`이 그 주입 seam이다).
  - 한 줄에 실린 각 수치가 파일 payload의 같은 필드와 **동일**하다(DD1) — 두 소비처가 갈라지면 red.
  - 축 부재 → `null`, 값 부재 → `미산출` 문자열 포함 **그리고** `0분`/`0일` 같은 리터럴 미포함(UI3).
  - 모든 값 토큰에 커버리지가 인접한다(DD14) — 짝 없는 값이 생기면 red.
  - 두 앵커가 한 줄에 각각 등장한다(UI8) — 하나로 접히면 red.
  - 투영 전체 직렬화에 경로 구분자·`.md`·`sha256:`이 **하나도 없다**(DD12).
  - 한 줄에 `disagreement`/`불일치`가 등장하지 **않는다**(DD11) — 구조적 0을 신호로 파는 회귀를 막는다.
  - `state==='degraded'`가 값을 지우지 않고 꼬리표만 더한다(DD3).
  - `emptyModel`이 `leadtime`을 선언하고 `validateShape`가 present-only로 검사한다.
  - `corpus.js` 동결 test가 계속 green이다(UI7).
  - **sentinel이 닫힌 `error_kind`만 싣고 경로 문자열을 싣지 않는다** (H2) — 성공 경로만 훑던 초안의 구멍.
  - **두 앵커 키가 항상 실린다**(부재는 `null`) — `by_anchor`가 조건부 키인 원본과 달리 투영은 무조건 둘 다 만든다(M2).
  - **커버리지 인접 단언이 실제로 실패할 수 있다** — 짝을 뗀 합성 입력이 red를 내는 것을 짝 test로 증명한다(DD14가 무력하지 않음을 증명. H3).
  - **`leadtimeScan:false`면 `model.leadtime`이 `null`이고 축이 계산되지 않는다**(DD16) — bare derive의 spawn-free 예산 보존.
  - **`writeDistribution`의 반환값**이 unchanged/changed를 구분한다 — mtime만으로는 fail-open 침묵과 구분 불가(invariant/MEDIUM).
  - **`--json`의 `unmatched` 키 집합이 동결된다** — Task 6b가 사람 면을 상위 3개로 절삭해도 JSON 은 전 버킷을 유지한다는 주장을 반증 가능하게 만든다(test/MEDIUM).
  - **`assertCoverageAdjacency`가 실제로 실패할 수 있다** — 짝을 뗀 문자열이 throw 하는 것을 짝 test 로 고정(H3).
  - **sentinel 경로가 의존성 주입으로 도달된다** — `audit()` 은 없는 root 에서 throw 하지 않으므로 라이브 probe 로는 그 분기에 닿지 못한다(security/invariant HIGH).
- **Mirror**: `leadtime.test.js`의 짝 test 관례(`unavailable` ↔ `no`) · fixture-builder(`record()`/`ledgerEntry()`/`shipReceipt()`) · 키 **부재** 단언(`hasOwnProperty === false`) · `plugins/mccp/scripts/derive/tests/schema-drift.test.js:52-60`
- **Validate**: 아래 Validation 6번. **CI는 이 test들을 돌리지 않는다**(`.github/workflows/`에 등재된 test는 셋뿐) — 강제 지점은 이 사이클의 `## Validation`이다

### Task 6b: backlog HIGH 2건 흡수 — `renderHuman`을 같은 한 줄로 시작시킨다

- **Action** (DD15):
  1. `renderHuman(r)`의 첫 줄을 `formatLeadtimeLine(summarizeForSurface(r)).text`로 바꾸고, 기존 카운터 줄(`records=… pre_measurement=… …`)은 그 아래로 내린다. CLI·STATUS.md·`distribution.json`이 **같은 문장**을 공유하게 되어 Design Principle 4(한 source, 여러 view)가 세 번째 면까지 확장된다.
  2. `unmatched[…]` 줄을 비-0 버킷 내림차순 상위 3개 + `(+N — see --json)`로 줄인다. `--json`은 **무변경**(전 버킷 유지) — 절삭은 사람 면에만 있다.
  3. backlog의 해당 2행에 흡수 표시를 남긴다(행 삭제 금지 — audit trail).
- **Mirror**: `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js`의 `(+N건)` 절삭 표기 · backlog 행의 `**ABSORBED in …**` 표기 관례
- **Validate**: Validation 6b(사람 출력 첫 줄이 포매터와 일치 · 모든 줄 ≤ 100칼럼) + Task 6이 추가하는 **`--json` 키 집합 동결 test**. 초안은 "동결 test로 고정"이라 적었지만 그런 test 는 존재하지 않았고 어떤 Validation 명령도 그것을 돌리지 않아, "사람 면의 절삭이 JSON 으로 새지 않는다"는 주장이 반증 불가였다(L2 test/MEDIUM 흡수)

### Task 7: 문서 2면 + PRD

- **Action**:
  1. `docs/leadtime-observability/one-line-consumption.md` — 한 줄 문법 · 파일 스키마 · 강등 계약(DD2) · 이 축이 **재지 않는** 구간(UI9) · 실측 동결 블록(라이브 출력 축자). **동결 블록은 `<details>`로 접고 「한계 — 이 문서가 주장하지 않는 것」을 그 위에 둔다**(DD15 — 기존 두 문서는 한계가 약 1500줄 JSON 뒤에 온다).
  2. `docs/v1.3.0-observability/dashboard-surface.md` §2 — 한 줄의 소유(`sections/leadtime-line.js`)와 graceful-hide 규칙을 표에 등재. §5에도 "축 부재만 hide, 값 부재는 명시" 한 줄.
  3. PRD — milestone 3 행 `complete` + Plan 경로. 남은 Open Question 2건(10배 격차 · 지표 4 정의)은 **닫지 않는다** — M3은 소비 회로이지 그 질문의 답이 아니다.
- **Mirror**: `docs/leadtime-observability/panel-span.md`·`post-panel-span.md`의 동결 블록 규약
- **Validate**: 동결 블록이 라이브 출력과 바이트 일치

### Task 8: §3.7 version 4면 + CHANGELOG

- **Action**: PRD 전 milestone 완료 → **minor**. `origin/main`이 오늘 `1.34.3`이므로 목표는 `1.35.0`. `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md`를 함께 올린다.
- **Mirror**: §3.7 "동기 대상 4면" · `renderer/tests/i18n-surface.test.js:94`가 `plugin.json`에서 파생 단언(고칠 리터럴 없음)
- **Validate**: `i18n-surface.test.js` green + **`/mccp:pr` 진입 직전 §3.7 forward-only 재계산**(형제 worktree 활성 · main이 이 사이클 중에도 움직인다)

## Validation

> 전부 **관계 단언**이다. 실코퍼스 리터럴 카운트는 쓰지 않는다 — 코퍼스는 게이트 실행마다
> 자라므로 리터럴은 반드시 붉어진다(PRD Evidence 마지막 항). 리터럴이 사는 곳은 재생성되는
> 문서 동결면뿐이다.

```bash
# 1. 도구 계약 — git 모드가 분포를 바꾸지 않고, 강등이 표면화되며, 두 앵커 키가 항상 있다
node -e "
const lt=require('./plugins/mccp/scripts/lib/leadtime');
const sa=lt.summarizeForSurface(lt.audit({repoRoot:process.cwd()}));
const sb=lt.summarizeForSurface(lt.audit({repoRoot:process.cwd(),allowGit:false}));
const j=(x)=>JSON.stringify(x);
if(j(sa.panel_span)!==j(sb.panel_span)) throw new Error('panel_span differs across git modes');
if(j(sa.post_panel_span.by_anchor)!==j(sb.post_panel_span.by_anchor)) throw new Error('by_anchor differs across git modes');
if(!(sb.degradations||[]).includes('git-disabled')) throw new Error('git-disabled degradation not surfaced');
// UI8 / M2 — 두 앵커는 **키 존재**로 검사한다. truthiness 로 보면 DD3 이 합법이라 선언한
// 상태(한쪽만 조인 → 나머지 null)에서 실패한다. Validation 4 와 같은 명제여야 한다.
const BA=sa.post_panel_span.by_anchor;
if(!('ledger_basename' in BA) || !('ship_plan_hash' in BA)) throw new Error('both anchor keys must always be present (UI8/M2)');
console.log('1 ok');"

# 2. 포매터 — 값 부재는 0이 아니고, 지표 4는 한 줄에 없다 (UI2/UI3/DD11)
node -e "
const {formatLeadtimeLine}=require('./plugins/mccp/scripts/lib/leadtime-surface');
const empty={state:'blind',coverage:{panel_records:62,measurable:0,counts_are_lower_bound:true},
  panel_span:null,post_panel_span:{by_anchor:{ledger_basename:null,ship_plan_hash:null},
  coverage:{eligible:0,matched_ledger:0,matched_ship:0,both:0,only_ledger:0,only_ship:0,neither:0},
  unmatched:{},disagreement:null,disagreement_note:''},degradations:[]};
const t=formatLeadtimeLine(empty).text;
if(t.indexOf('미산출')===-1) throw new Error('absent value must say 미산출');
if(/\b0(\.\d+)?(min|d)\b/.test(t)) throw new Error('absent value rendered as zero (UI3): '+t);
if(t.indexOf('/62')===-1) throw new Error('coverage must accompany the value (UI2)');
if(/불일치|disagreement/.test(t)) throw new Error('metric 4 is structurally zero and must not be sold as signal (DD11): '+t);
console.log('2 ok');"

# 2b. DD14 인접성 — 모든 값 토큰에 커버리지 짝이 있다. **짝을 뗀 입력은 반드시 붉어야 한다**
#     (초안의 술어는 우변이 항상 false 라 어떤 입력에도 실패할 수 없었다).
#     판정은 포매터가 export 한 순수 함수가 소유한다 — 셸이 포맷을 재구현하면 포맷이 바뀔 때
#     조용히 어긋난다.
node -e "
const lt=require('./plugins/mccp/scripts/lib/leadtime');
const {formatLeadtimeLine,assertCoverageAdjacency}=require('./plugins/mccp/scripts/lib/leadtime-surface');
const s=lt.summarizeForSurface(lt.audit({repoRoot:process.cwd(),allowGit:false}));
assertCoverageAdjacency(formatLeadtimeLine(s).text);
let caught=false;
try{ assertCoverageAdjacency('리드타임 (측정 49/62) · 패널 p50 7.6min · 패널→ship ledger p50 0.38d'); }
catch(_){ caught=true; }
if(!caught) throw new Error('assertCoverageAdjacency cannot fail — the DD14 gate is a no-op');
console.log('2b ok');"

# 2c. DD12 — 투영에 경로·레코드명·해시가 하나도 없다 (성공 경로)
node -e "
const lt=require('./plugins/mccp/scripts/lib/leadtime');
const ser=JSON.stringify(lt.summarizeForSurface(lt.audit({repoRoot:process.cwd(),allowGit:false})));
if(/[\\\\/]|\.md\b|sha256:/.test(ser)) throw new Error('projection carries a path/record/hash (DD12)');
console.log('2c ok');"

# 2d. DD12 실패 경로 — sentinel 은 닫힌 error_kind 만 싣는다.
#     **라이브 probe 로는 도달 불가**하다: audit() 는 없는 root 에서 throw 하지 않고
#     (leadtime.js line 302 · corpus.js line 681 이 존재하지 않는 디렉토리를 삼킨다) 평범한
#     blind summary 를 돌려준다. 그래서 이 축은 의존성을 주입해 throw 를 강제하는 fixture
#     test 가 소유하며, 여기서는 그 test 를 지목해 실행한다.
MCCP_CODEX_DISABLED=1 node --test \
  plugins/mccp/scripts/derive/tests/leadtime-source.test.js

# 3. 실제 렌더 산출물 — 한 줄이 상단 상태 띠에 실린다 (부재도 실패)
node plugins/mccp/scripts/derive/cli.js render --md --html --out .claude/cache 1>&2
node -e "
const fs=require('fs');
const md=fs.readFileSync('.claude/cache/STATUS.md','utf8');
const html=fs.readFileSync('.claude/cache/status.html','utf8');
// md 와 html 이 **같은 리터럴**을 쓴다.
const LEAD='리드타임 (';
const i=md.indexOf(LEAD);
if(i===-1) throw new Error('leadtime line ABSENT from STATUS.md');
if(html.indexOf(LEAD)===-1) throw new Error('leadtime line ABSENT from status.html');
// B0 — 대시보드 블록 최상단의 상태 띠 바로 다음이다. 앵커 부재는 skip 이 아니라 실패다.
const dash=md.indexOf('## 대시보드');
if(dash===-1) throw new Error('## 대시보드 heading not found — cannot verify placement');
const nextH=md.indexOf('\n## ', dash+1);
if(nextH===-1) throw new Error('no section after 대시보드 — cannot verify placement');
if(!(i>dash && i<nextH)) throw new Error('leadtime line is not inside the 대시보드 block');
// DD7 — 상태 띠(summaryLine) **바로 다음의 비어 있지 않은 줄**이 리드타임 한 줄이다.
// 초안은 앵커로 '진행 중'을 썼는데 그 문자열은 summaryLine 자신에 들어 있다
// (renderer/sections/status-grid.js:215 cells[0].label='진행 중' -> :239 summaryLine join). 즉 widget 은
// 위젯 블록이 아니라 상태 띠를 가리켰고, DD7 이 지시한 올바른 구현에서 i>widget 이 항상
// 참이라 **정답을 실패로 만드는** 게이트였다 (L2 test/architect HIGH 흡수).
const sumIdx=md.indexOf('\u25d0 진행 중', dash);
if(sumIdx===-1) throw new Error('status band (summaryLine) not found — cannot verify placement');
if(i<sumIdx) throw new Error('leadtime line sits ABOVE the status band (DD7)');
const afterBand=md.slice(md.indexOf('\n',sumIdx)+1).split('\n').find(function(l){return l.trim()!=='';});
if(!afterBand||afterBand.indexOf(LEAD)===-1) throw new Error('leadtime line is not the first line after the status band (DD7); got: '+String(afterBand).slice(0,80));
// UI8 — 두 앵커가 **그 줄 안에서** 각각 보인다. 문서 전체 grep 은 이미 다른 곳에 등장하는
// 두 단어를 잡으므로 어떤 구현에도 실패하지 않는 no-op 게이트였다.
const line=md.slice(i, md.indexOf('\n', i));
if(line.indexOf('ledger')===-1 || line.indexOf('ship')===-1) throw new Error('anchors collapsed in the line (UI8): '+line);
console.log('3 ok');"

# 3b. DD16 — auto-refresh 진입점도 같은 한 줄을 낸다. **그리고** DD17 — 그 경로는 tracked
#     파일을 쓰지 않는다. 초안은 `{force:true}` 를 넘겼는데 `triggerRender` 에 그런 옵션은
#     없고(`renderer/trigger.js:229-236` 은 debounceMs·lockLeaseMs·deriveImpl·renderImpl 만 읽는다)
#     debounce 기본값이 5000ms 라, 렌더가 **0회** 일어나도 직전 Validation 3 이 CLI 로 쓴
#     STATUS.md 를 읽고 '3b ok' 를 냈다 — 하지 않은 일의 증거가 성립했다(L2 invariant HIGH).
#     이제 (a) 실제로 지원되는 `debounceMs:0` 으로 debounce 를 무력화하고 (b) 반환값을
#     검사하며(성공 시에만 true — `renderer/trigger.js:352` 이전 모든 skip/실패 경로가 false)
#     (c) 3 이 쓴 산출물을 먼저 지워 CLI 결과로는 통과할 수 없게 하고 (d) DD17 의 핵심 주장
#     ('ambient 경로가 tracked 파일을 만지지 않는다')에 falsifier 를 붙인다.
node -e "
const fs=require('fs');
const trigger=require('./plugins/mccp/scripts/lib/renderer/trigger');
const DIST='.claude/state/leadtime/distribution.json';
const before=fs.existsSync(DIST)?fs.readFileSync(DIST,'utf8'):null;
fs.rmSync('.claude/cache/STATUS.md',{force:true});
const ran=trigger.triggerRender('m3-validation',{debounceMs:0});
if(!ran) throw new Error('triggerRender returned falsy — no render happened (debounce/lock/throw); 3b would have proven nothing (DD16)');
const md=fs.readFileSync('.claude/cache/STATUS.md','utf8');
if(md.indexOf('리드타임 (')===-1) throw new Error('trigger.js render path produced no leadtime line (DD16)');
const after=fs.existsSync(DIST)?fs.readFileSync(DIST,'utf8'):null;
if(after!==before) throw new Error('the ambient trigger path WROTE the git-tracked distribution file — DD17 violated');
console.log('3b ok');"

# 4. C7 산출물 — 명시 렌더가 발행하고, 한 줄과 같은 투영이다 (UI4 / DD1 / DD17)
node -e "
const fs=require('fs');
const p='.claude/state/leadtime/distribution.json';
if(!fs.existsSync(p)) throw new Error('distribution file NOT written by the CLI render path');
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const BA=d.post_panel_span&&d.post_panel_span.by_anchor;
if(!BA) throw new Error('distribution missing by_anchor');
if(!('ledger_basename' in BA)||!('ship_plan_hash' in BA)) throw new Error('both anchor keys required (UI8)');
if('written_at' in d) throw new Error('wall-clock stamp in payload breaks content-stability (DD6)');
// DD1 — 한 줄이 이 payload 로부터 그대로 재구성된다(같은 투영).
const {formatLeadtimeLine}=require('./plugins/mccp/scripts/lib/leadtime-surface');
const md=fs.readFileSync('.claude/cache/STATUS.md','utf8');
const want=formatLeadtimeLine(d).text;
if(md.indexOf(want)===-1) throw new Error('the rendered line is not reproducible from the published file (DD1)');
console.log('4 ok');"
git check-ignore -q .claude/state/leadtime/distribution.json \
  && { echo "FAIL: distribution file is gitignored (DD5)"; exit 1; } \
  || echo "4b ok (tracked path)"

# 5. DD6 content-stability — **반환값**으로 판정한다. mtime 만 보면 "정상 skip" 과
#    "writer 가 fail-open 으로 조용히 죽음" 이 구분되지 않는다.
MCCP_CODEX_DISABLED=1 node --test \
  plugins/mccp/scripts/lib/tests/leadtime-distribution.test.js

# 6. 회귀 test (영향 범위 — 전체 lib/tests 스위트는 선재적으로 10분 타임아웃)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/leadtime.test.js \
  plugins/mccp/scripts/lib/tests/leadtime-surface.test.js \
  plugins/mccp/scripts/lib/tests/leadtime-distribution.test.js \
  plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js \
  plugins/mccp/scripts/derive/tests/leadtime-source.test.js \
  plugins/mccp/scripts/derive/tests/schema-drift.test.js

# 6b. DD15 흡수 — 사람 출력이 공유 한 줄로 시작하고 어느 줄도 100칼럼을 넘지 않는다
node -e "
const lt=require('./plugins/mccp/scripts/lib/leadtime');
const {formatLeadtimeLine}=require('./plugins/mccp/scripts/lib/leadtime-surface');
const r=lt.audit({repoRoot:process.cwd(),allowGit:false});
const human=lt.renderHuman(r).split('\n');
const want=formatLeadtimeLine(lt.summarizeForSurface(r)).text;
if(human[0].trim()!==want.trim()) throw new Error('human output does not lead with the shared one line (DD15)');
const over=human.filter(function(l){return l.length>100;});
if(over.length) throw new Error('lines exceed 100 columns (DD15): '+over.length);
console.log('6b ok');"

# 7. renderer + derive 스위트 회귀 (한 줄 삽입이 기존 면을 깨지 않았다)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/lib/renderer/tests/
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/derive/tests/

# 8. UI7 — corpus.js 출력 무변경. **base 범위**로 본다: ref 없는 `git diff` 는 worktree vs
#    index 만 보므로 커밋한 뒤에는 위반이 있어도 항상 통과했다.
git diff --exit-code origin/main...HEAD -- plugins/mccp/scripts/lib/plan-review/corpus.js \
  || { echo "FAIL: corpus.js changed vs base (UI7)"; exit 1; }
git diff --exit-code -- plugins/mccp/scripts/lib/plan-review/corpus.js \
  || { echo "FAIL: corpus.js changed in worktree (UI7)"; exit 1; }

# 9. UI11 — 게이트 배선 diff 공집합. 같은 이유로 base 범위 + worktree 양쪽.
GATE_PATHS="plugins/mccp/commands/ plugins/mccp/hooks/ plugins/mccp/scripts/hooks/ plugins/mccp/scripts/receipt/ plugins/mccp/scripts/lib/codex-invoke.js"
git diff --exit-code origin/main...HEAD -- $GATE_PATHS \
  || { echo "FAIL: gate wiring diff vs base is not empty (UI11)"; exit 1; }
git diff --exit-code -- $GATE_PATHS \
  || { echo "FAIL: gate wiring diff in worktree is not empty (UI11)"; exit 1; }

# 10. §3.5.1 — 이 브랜치가 삭제하는 파일이 없어야 한다 (빈 출력이 통과)
git diff --diff-filter=D --name-only origin/main...HEAD

# 11. §3.7 version 4면 동기
MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 12. 이 plan 자신에 대한 L1
node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/leadtime-observability-m3.plan.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 축 계산이 receipt-write·SessionStart 경로(trigger.js)에 인라인으로 들어와 느려진다 | 중 | DD16 — `leadtimeScan` default-off로 bare derive는 0을 지불한다. 렌더 경로 비용은 **실측 371ms**(derive 2371ms 대비 약 16%)이고 추정이 아니다. 커지면 토글을 끄는 것이 즉효 완화 |
| 렌더 진입점이 둘인데 한쪽만 배선해 **한 줄**이 auto-refresh에서 안 나온다 | **높음** | DD16 — `leadtimeScan` opt-in을 `cli.js`·`trigger.js` 양쪽에 배선(한 줄 축). 분포 **파일**은 DD17대로 `cmdRender` 단독이며 그것은 결함이 아니라 발행 경계다. Validation 3b가 trigger 경로를 실제로 돌려 한 줄 존재 + 파일 미기록을 **양방향으로** 강제 |
| 실패 sentinel이 절대경로를 git-tracked 파일에 커밋한다 | **높음** | H2 — sentinel은 닫힌 `error_kind` 열거형만 싣고 원문은 stderr로만 간다. Validation 2d가 sentinel 직렬화를 훑어 강제 |
| git-tracked 파일이 렌더마다 갱신돼 모든 커밋에 딸려온다 | **높음** | DD6 — payload에 벽시계 없음 + content-stable write. DD17이 ambient 경로를 애초에 끊는다. Validation 5가 `writeDistribution`의 **반환값**으로 강제(mtime은 "정상 skip"과 "writer가 조용히 죽음"을 구분하지 못한다) |
| 한 줄이 hero의 강조 위계를 깨거나 design-lint를 붉힌다 | 중 | DD7 — 신규 heading·CSS·강조색 0개. Validation 7이 renderer 스위트 전체로 확인 |
| `allowGit:false` 모드의 `unclassified` 증가가 코퍼스 성질로 오독된다 | 중 | DD2 — `degradations:['git-disabled']`를 산출물과 문서에 싣는다. Validation 1이 그 존재를 강제 |
| 한 줄과 파일이 시간이 지나며 갈라진다 | 중 | DD1 — 단일 투영 + 동치 test. 두 소비처가 각자 해석하면 red |
| 커버리지 1/3 표본의 생존 편향이 한 줄에서 사라진다 | **높음** | UI2 — 모든 값에 커버리지를 붙인다. Validation 2·3이 병기 부재를 실패로 만든다 |
| 병렬 브랜치와 version 충돌 (§3.7 실측 4회 재발) | 중 | 목표를 미리 확정하지 않는다. base 머지 시점과 `/mccp:pr` 진입 직전 두 번 재계산 |
| M3이 PRD의 남은 Open Question 2건을 닫은 것처럼 보인다 | 중 | Task 7 — 두 질문을 명시적으로 열어 둔다. M3은 소비 회로이지 격차 판정이 아니다 |
| 지표 4의 구조적 0이 화면에서 "두 기록이 잘 맞는다"로 읽힌다 | 중 | DD11 — 한 줄에 싣지 않고, 파일에는 `disagreement_note`를 붙인다. test가 한 줄의 부재를 강제 |
| 렌더 면에 경로·레코드명이 흘러 escaping/경로 유출 축이 열린다 | 중 | DD12 — 투영에 그 필드가 아예 없다. Validation 2c가 직렬화 전체를 훑어 강제 |
| 소비 층이 결측을 `0`/`100%`로 채우거나 값을 clamp한다 | 중 | DD13 — 투영은 산술을 하지 않는다. 부재는 `null`로 남는다 |
| test가 실코퍼스 리터럴을 단언해 다음 게이트 실행에 붉어진다 | **높음** | Task 6 — fixture-builder 전용, 관계 단언만. 리터럴은 문서 동결면에만 살고 그것은 재생성물이다 |
| 다른 게이트가 receipt/ledger를 쓰는 중에 읽어 부분 기록을 파싱한다 (TOCTOU) | 낮음 | M1/M2의 선재 성질이고 M3이 render 경로로 **빈도만** 올린다. `readJsonDir`이 `parse_failures`로 계수 → `state=degraded` → 한 줄이 손상을 말한다(DD3). 락 도입은 이 milestone 사거리 밖 |
| 새 test가 CI에 등재되지 않아 조용히 썩는다 | 중 | Task 6 — CI 미등재를 명시하고 `## Validation`이 강제 지점임을 적는다 (M1·M2와 같은 조건) |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
  - 라이브 완주가 산출해야 하는 것: (a) `.claude/cache/STATUS.md` 상단에 값+커버리지가 붙은 `리드타임 ·` 한 줄, (b) `.claude/cache/status.html`의 같은 줄, (c) git-tracked `.claude/state/leadtime/distribution.json`이 두 앵커 키를 모두 갖고 실재, (d) 두 번째 렌더에서 (c)의 mtime 불변.
- [ ] `corpus.js` 출력이 한 바이트도 바뀌지 않았다 (UI7 — 동결 test green)
- [ ] 게이트 배선 diff가 공집합이다 (UI11)
- [ ] 값 부재 경로에서 `0`이 아니라 `미산출`이 나온다 (UI3 — 합성 입력으로 확인)
- [ ] PRD milestone 3 = complete, 남은 Open Question 2건은 열린 채로 남았다

## External Research Provenance

- Source PRD: .claude/prds/leadtime-observability.prd.md
- References section sha256: a08dca7b653c9256d560254aa1e06182f7e80ad6476af5603d41ff133939288c
- Stamped at: 2026-09-02T07:20:15.871Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 호출: `Skill(impeccable, "critique leadtime-observability-m3")` — 오라클이 해소한 call form(`impeccable`).
- 트리거: axis (a) detector positive — `design_signal=true`, `skill_available=true`, reason=`ok`. plan이 `renderer/sections/`·`html.js`·`markdown.js`를 건드리므로 정상 발화.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` (H15 heading depth ≤ 3 · 강조색 ≤ 1 · raw marker 금지 · list-of-N 상한) 를 loop 진입 전 Read.
- 라운드 수: 2 (R0 → 흡수 → R1). cap=2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 기본).
- verdict: **CONVERGED** (R1).

| Round | Finding | Severity | 처리 |
|---|---|---|---|
| R0 | 한 줄이 next-action **위**에 놓여 `primary action → status → detail` 위계를 뒤집는다 (제약 1). PRODUCT.md anti-reference 1(SaaS hero-metric)로 한 걸음 다가감 | HIGH | **ACCEPT_NOW** — DD7·Task 4·Validation 3을 고쳐 next-action **아래**로 이동. 순서 단언을 Validation에 추가 |
| R0 | 앵커 계열이 3개로 늘면(C2 착지) 항목 수 상한(제약 4) 규칙이 없다 | MEDIUM | DEFER_TO_BACKLOG — 오늘 3항목으로 상한 내. C2가 실제로 세 번째 계열을 낼 때 판정 |
| R0 | html 삽입에 `escapeHtml` 방어가 명시되지 않았다 | LOW | REJECT_YAGNI — DD12가 투영에서 자유 문자열(경로·레코드명·해시)을 **구조적으로** 제거하므로 이스케이프할 대상이 존재하지 않는다. Validation 2c가 그 부재를 강제 |
| R1 | (새 HIGH/CRITICAL 없음) | — | CONVERGED |

제약 4종 대조: (1) 신규 heading 0개 · 위계 정정 후 준수 · (2) 신규 강조색 0개(중립 `muted`) · (3) 투영에 마커 소스 없음(DD12) · (4) 값 항목 3개로 상한 내.

별개로, backlog가 **M3을 재판정 시점으로 지목해 이연한 HIGH 2건**을 DD15·Task 6b에서 흡수한다(이번 critique의 산출이 아니라 이전 사이클 critique의 이연분).

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더된 UI가 없으므로 **호출하지 않고** 체크리스트만 남긴다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
