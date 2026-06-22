# Changelog

All notable ship milestones for **my-claude-code-plugin (mccp)** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Note on versioning**: the project ship tag (e.g. `v1.0.0`) and the inner plugin manifest (`plugins/mccp/.claude-plugin/plugin.json` — currently `1.11.0`) are intentionally decoupled. Plugin semver tracks the mccp namespace's internal API surface; project ship tags track W-VERDICT-gated milestones bundled across the repo.

## [1.15.0] — 2026-06-23

dashboard 마일스톤 기록 정확성 + 용어 통일 (M2 잔여) — "마일스톤 기록" 섹션의 두 결함을 닫는다. **용어**: 섹션 제목·앵커를 "이정표"→"마일스톤"으로 통일(markdown.js 앵커+heading, html.js h2 — id `milestone-history`는 영어라 불변). **정확성**: 완료 마일스톤 10건이 전부 "날짜 미상"으로 표시되던 근본 원인 4개를 수정 — (A) `derive/sources/plans.js`의 Source PRD 추출이 마크다운-링크만 매칭해 평문/백틱 경로 PRD discovery 누락(`SOURCE_PRD_PLAIN_RE` + `extractSourcePrd`), (B) `parseDeliveryMilestonesComplete`가 Plan 셀 첫 괄호 `(report: …)`를 잡아 plan 대신 report basename 추출(`extractPlanPath` — `.plan.md` 우선), (C) receipt가 working-tree 전용(gitignored)이라 과거 사이클 ship receipt 부재 → `pickShipReceipt` null → completedAt=null(git commit 시점 fallback `resolveGitCommitTime`). 결과: 마일스톤 섹션 날짜 미상 10→0, dashboard 자기 M1 표시 복원. Codex Plan-Codex R1 2 HIGH absorbed: F1(평문 source_prd가 렌더러 plan-dir 기준 resolve로 이중 경로 → `resolvePrdRef` dual-path 해석 + wrapper strip), F2(git fallback basename 재구성이 `.claude/PRPs/plans/completed/` archived plan 미발견 → directory-preserving planPath + completed/ archive basename 최종 후보). Implement-Codex cross-gate dedupe. 모두 read-side 렌더링·상관 로직 — receipt/derive 스키마 불변. renderer 312 + derive 68 = 380 test PASS. plugin.json `1.14.0 → 1.15.0` minor bump per CLAUDE.md §3.7. PRD M3~M6(레이아웃·길찾기·필터·스타일)는 impeccable shape→craft→audit 워크플로로 진행 예정(PRD Design Direction 명문화).

## [1.14.0] — 2026-06-22

dashboard 활동 로그 step-chart (M2) — 진행 현황 대시보드(`status.html`)의 audit-timeline 섹션을 평범한 `<ul>` 텍스트 로그에서 **시간순 세로 step-chart rail**로 변환. 각 receipt가 세로 connector 위 상태 노드 마커(✓ 수렴 / ◐ 진행)로 표시돼 활동 흐름을 형태·색으로 즉시 스캔할 수 있다(GitHub Actions job-run timeline 미학). **데이터 로직(snapshot read, MAX_ROWS caps, 정렬, footnote, briefing, md 출력)은 일절 변경 없이 시각 레이어만 재구성** — 회귀 위험 최소화. 세로 connector는 `.tl-rail::before` background 라인(`border-left` 미사용 → H4 회피), 노드 마커 `.tl-node`만 원형 pill(H3 carve-out 추가). design critique 1 finding absorbed: emphasis 반전 — 20행 timeline에서 converged(흔한 상태)는 quiet(`.tl-done` muted), pending(예외/개입 후보)만 loud(`.s-stale`), accent는 노드에 미사용 → viewport당 accent ≤ 1 보존(M1 pipeline의 converged=accent와 의도적 divergence, cardinality 차이). Codex Plan-Codex R1 1 HIGH + 1 MEDIUM absorbed: F1(STATE.md `chain_aborted`/`session_end_imminent` true 잔재가 in-progress chain short-circuit → state-writer reconcile), F2(`<span class="tl-body">`가 flow content `<blockquote>` wrap = non-conforming HTML → `<div>` 전환 + containment 구조 검증 test). Implement-Codex cross-gate dedupe. plugin.json `1.13.0 → 1.14.0` minor bump per CLAUDE.md §3.7. (M3 GitHub Actions 전체 비주얼 리프레시는 후속 cycle.)

### Added

- **`scripts/lib/renderer/tests/timeline-chart.test.js`** — 8 test (rail wrapper / converged-quiet·pending-loud 노드 매핑 / briefing blockquote containment(Codex F2) / md 동치 / escape / footnote tl-note 비-step).

### Changed

- **`scripts/lib/renderer/sections/audit-timeline.js`** — `renderRow` HTML을 step-chart 구조(`<li class="tl-step">` + `.tl-node` 마커 + `<div class="tl-body">`)로 재구성, wrapper `<ol class="timeline tl-rail">`, footnote li → `.tl-note`. 2-상태 노드 map(NODE_TL). 데이터 로직·md 출력 불변.
- **`scripts/lib/renderer/html.js`** — `.tl-rail`/`.tl-step`/`.tl-node`/`.tl-body`/`.tl-note` CSS(세로 connector `::before` background 라인, 노드 pill, emphasis 반전 색). `PIPELINE_SCRIPT`에 `.tl-step` hover/focus enhancement 추가(vendored jQuery 재사용, 외부 src 0).
- **`scripts/lib/renderer/output-constraints.js`** — `H3_CARVEOUT`에 `tl-node` 추가(노드 마커 한정 carve-out). H4는 background 라인이라 carve-out 불필요.
- **`docs/v1.3.0-observability/DESIGN.md`** — H3 carve-out 행에 `tl-node` + v1.14.0 활동 step-chart design intent 절(세로 rail / emphasis 반전 / 항목 수 상한 근거).
- **`scripts/lib/renderer/tests/{output-constraints,render-integration,audit-timeline-snapshot}.test.js`** — tl-node carve-out narrow 검증 + timeline rail 합성 HTML 포함 + footnote class 회귀 갱신.

## [1.13.0] — 2026-06-22

dashboard 게이트 파이프라인 chart (M1) — 진행 현황 대시보드(`status.html`)에 receipt를 `decision_id`별로 묶어 게이트 진행(plan-codex → implement-codex → pr-codex)을 보여주는 가로 파이프라인 스테퍼 신규 섹션 추가. 기존엔 게이트 스테이지 수렴 상태가 audit-timeline 텍스트 로그에만 흩어져 있어 "이 decision이 지금 어느 단계인가"를 한눈에 못 봤다. 신규 `pipeline.js`가 verdict 다음에 decision별 노드 흐름(✓ 수렴 / ◐ 진행 / ○ 대기)을 렌더한다. 미학 리드는 GitHub Actions 절제(중립 base + 상태색, 신규 강조색 0, 기존 OKLCH 토큰 재사용). baseline은 inline SVG/CSS(JS 없이도 상태 표시) — 외부 script URL 0(self-contained 유지). Codex Plan-Codex R1 2 HIGH + 1 MEDIUM absorbed: F1(canonical 정규화 — `gate_id`∥`gate`, `mccp-*` 만 매핑, `(decision,gate)`별 최신 receipt로 retry false→true 수렴 반영), F2(CDN third-party JS trust-boundary 침범 → vendored-inline 전환으로 raw 데이터 exfiltration 차단), F3(status-aware collapse — 미수렴 decision은 절대 collapse 안 함, `attention→active→complete` 정렬, top-3 + 상태별 카운트). design critique 2 rounds converged. Implement-Codex cross-gate dedupe. plugin.json `1.12.0 → 1.13.0` minor bump per CLAUDE.md §3.7. (M2 활동 로그 step chart / M3 GitHub Actions 전체 리프레시는 후속 cycle.)

### Added

- **`scripts/lib/renderer/sections/pipeline.js`** — 게이트 스테이지 파이프라인 섹션. canonical gate 정규화 + `(decision,gate)`별 최신 선택 + status-aware collapse + 색+아이콘+sr-only 병행(a11y) + 전체 escape. baseline 마크업(JS 무관).
- **`scripts/lib/renderer/tests/pipeline.test.js`** — 10 test (정규화/retry 수렴/collapse/escape/a11y 등).

### Changed

- **`scripts/lib/renderer/html.js`** — `<section id="pipeline">` 조립 + `.pipe-*` CSS(pipe-node pill / pipe-edge 수평 라인, border-left 미사용).
- **`scripts/lib/renderer/index.js`** — `renderPipeline` safeSection wire (grid 다음).
- **`scripts/lib/renderer/markdown.js`** — `## 게이트 파이프라인` 섹션 + anchor (텍스트 표현).
- **`scripts/lib/renderer/output-constraints.js`** — H3 carve-out에 `pipe-node` 추가.
- **`scripts/lib/renderer/tests/four-part-rendering.test.js`** — sections positional fixture 8요소로 갱신.
- **`PRODUCT.md`** / **`DESIGN.md`** — `/impeccable init` 셋업(PRODUCT.md 원칙 6 + 루트 DESIGN.md 신규).
- **`commands/pr.md`** — worktree-safe tmp dir 수정. `/mccp:pr` Phase 2.5.3가 `codex-result.json`/stderr를 literal `.git/mccp/tmp`에 쓰던 탓에 worktree에서 `.git`이 gitdir 포인터 *파일*일 때 `mkdir: Not a directory`로 깨지던 결함 차단 — `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"`로 진짜 gitdir resolve (누적 8+ cycle 반복 결함). 설명 prose의 `.git/mccp/tmp/` 참조도 `<gitdir>/mccp/tmp/`로 정정.
## [1.12.1] — 2026-06-22

detector probeAvailability 재설계 — 세 built-in 기능 detector(`deep-research-detect.js`/`ultracode-detect.js`/`goal-detect.js`)의 `probeAvailability()`가 `~/.claude/commands/*.md`·`~/.claude/skills/*/` filesystem을 probe하던 구조적 오류를 제거했다. built-in slash command는 user-level command/skill 파일을 남기지 않으므로 이 probe는 기능 활성 여부를 영원히 관측할 수 없었다. 공식 문서로 확정한 실제 활성화 신호로 교체: deep-research/ultracode는 동적 워크플로우 신호(`disableWorkflows`/`enableWorkflows`/env `CLAUDE_CODE_DISABLE_WORKFLOWS`)를 공유하고, goal은 별개 축인 hooks 신호(`disableAllHooks`/`allowManagedHooksOnly`)로 판정한다. 신규 공용 헬퍼 `settings-signal.js`가 managed+user+project 3-level 머지(우선순위 project > user > managed)를 수행한다. Codex Plan-Codex R1 absorbed: F1 HIGH(enterprise managed 정책 fail-open → managed 경로 OS별 읽기 추가 + managed present-but-unreadable 시 `unknown` 강등), F3 MEDIUM(goal/workflows 비대칭 근거 → 각 기능의 공식 활성화 모델 차이 본문화), F2 MEDIUM(런타임 게이트 버전/trust 체크 → backlog DEFER). Implement-Codex cross-gate dedupe. plugin.json `1.12.0 → 1.12.1` patch bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/settings-signal.js`** — 3-level settings 머지 공용 헬퍼. `readMergedSettings`(managed+user+project, fail-loud parse via settings-writer) + `workflowsEnabled(opts)` tristate + `hooksGoalEnabled(opts)` tristate(F1+F3 absorption — managed 포함, 미확인 시 unknown) + `MANAGED_SETTINGS_PATHS` OS 상수.
- **`scripts/lib/tests/settings-signal.test.js`** — 17 test (머지 우선순위 4 + workflows tristate 6 + hooks tristate 6 + OS path 1).

### Changed

- **`scripts/lib/deep-research-detect.js`** / **`ultracode-detect.js`** — `probeAvailability`가 filesystem probe 대신 `settings-signal.workflowsEnabled()` 위임. env override(`MCCP_DEEP_RESEARCH_SKILL`/`MCCP_ULTRACODE_FEATURE`) 최우선 유지. 옵션 시그니처 `{projectRoot,userPath,projectPath,managedPath}` 주입 가능.
- **`scripts/lib/goal-detect.js`** — `probeAvailability`가 `settings-signal.hooksGoalEnabled()` 위임. goal은 default-on이라 hook-disable 신호 부재 = 활성. env override(`MCCP_GOAL_FEATURE`) 최우선 유지.
- **3 detect 테스트 파일** — filesystem probe 케이스(S1d/S8c/S8d/S9 등)를 settings 신호 케이스로 교체.

## [1.12.0] — 2026-06-22

dashboard serve + refresh commands — `.claude/cache/status.html` 대시보드를 localhost로 띄우는 `/mccp:dashboard`와 캐시를 다시 굽는 `/mccp:dashboard-refresh` 추가. 기존엔 `derive/cli.js render` 수동 실행 + 파일 직접 열기 + 자주 stale한 캐시라는 3단 마찰이 있었다. `/mccp:dashboard`는 띄우기 직전 자동 render → dep-free Node `http` 서버를 `127.0.0.1`에 bind → 브라우저 자동 오픈 → `.claude/cache/` watch로 status 변경 시 SSE live-reload. 캐시 `status.html`은 byte-pristine 유지(reload `<script>`는 서빙 시점 on-the-fly 주입). Codex Plan-Codex R1 2 findings absorbed: F1(PID 파일을 repo/cache scope — `{pid,host,port,started_at,repoRoot,statusPath}` 기록 + same-host·live-PID·repoRoot·statusPath 4중 일치 시만 재사용 → worktree 간 stale PID로 다른 checkout 서버 URL 반환 차단), F2(포트 +1 silent fall-forward 제거 → 우리 서버면 identity probe로 재사용, foreign이면 loud 충돌 + `--port` 요구 → bookmark 안정성 보존). Implement-Codex cross-gate dedupe. plugin.json `1.11.0 → 1.12.0` minor bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/dashboard-server.js`** — dep-free localhost 대시보드 서버. 고정 라우트(`/` reload 주입 + `/__mccp_reload` SSE + `/__mccp_identity` JSON, 그 외 404 — `req.url`→파일 매핑 없어 path-traversal surface 0). `startServer`/`createServer`/`injectReloadScript`/`isReusablePid` 등 export. fs.watch + watchFile 폴백 live-reload, 브라우저 오픈/watch는 loud fail-open.
- **`commands/dashboard.md`** — `/mccp:dashboard` (render → background 서버 → URL/PID/stop 보고).
- **`commands/dashboard-refresh.md`** — `/mccp:dashboard-refresh` (`derive/cli.js render` wrap, 서버 무관).
- **`scripts/lib/tests/dashboard-server.test.js`** — 13 test (reload 주입, 라우트, identity JSON, SSE, 404, missing-status 안내, PID roundtrip + repo scope, isReusablePid 3중 AND, 127.0.0.1 bind, our-server 재사용).

## [1.11.0] — 2026-06-22

v1.4.2 dashboard overhaul — Milestone 3 ship (a11y WCAG 2.2 AA + 잔여 OQ 명문화). PRD §M3 두 축을 단일 PR로 정리. (a) semantic landmark + skip-link (clip-based sr-only / focus-visible explicit) + footer role=contentinfo + main id=tabindex=-1 + status-strip 1 tab stop(group label dynamic 4축 aria-label, cell non-focusable + icon aria-hidden) + severity-tag aria-label "위험도: 한글" + copy-btn aria-label "다음 액션 복사" + WCAG AA contrast lint(OKLCH → sRGB → luminance dep-0 oracle) + severity color-only 금지 lint, (b) PRD §Open Questions OQ-a~g 7건을 M1/M2 채택 default로 본문화. Codex Plan-Codex R1 4 findings(F4 status-cell unreachable / F5 severity drift / F6 contrast oracle / F7 skip-link clip-based) + impeccable critique F1/F2/F3 모두 plan body absorbed → Implement-Codex cross-gate dedupe. plugin.json `1.10.0 → 1.11.0` minor bump per CLAUDE.md §3.7 (M3 milestone ship → minor).

### Added

- **`parsers/severity-meta.js`** — single source severity 메타데이터. 5 enum × 4 필드 (`visible` English / `srLabel` 한글 / `icon` emoji / `className` s-prefix) + `severityMeta(sev)` lookup + `severityTagHtml(sev, escapeHtml)` 통일 render helper. mixed-language drift 차단(F5 absorption).
- **`parsers/oklch-contrast.js`** — W3C CSS Color Module Level 4 §16.4 정합 dep-0 변환기. `oklchToOklab` → `oklabToLinearSrgb` → `linearSrgbTosRgb` → `sRGBtoLuminance` → `contrastRatio` 5-stage pipeline. `contrastRatioOKLCH(fg, bg)` convenience export. independent oracle로 false-pass 차단(F6 absorption).
- **`tests/oklch-conformance.test.js`** — 11 test. 변환 단계별 ε ≤ 0.005 tolerance + gamma boundary + 21:1 black/white reference + bg-light/bg-dark luminance bounds.
- **`tests/a11y-contrast.test.js`** — 8 production case strict `>=` (ε 없음). light + dark × {ink ≥ 7, muted ≥ 4.5, accent ≥ 3 large, blocked ≥ 4.5}. token L 조정 권장 fail message.
- **`tests/a11y-landmarks.test.js`** — 9 test. main/footer landmark + skip-link sr-only/focus-visible + clip-based pattern + offscreen -9999px 폐기 invariant + h1 단일 + raw alert role.
- **`tests/a11y-aria-labels.test.js`** — 9 test. severity-meta 5 enum 4 필드 + 한글 fallback("미상") + severityTagHtml 통합 invariant(aria-label 한글 + visible 영어 + icon hidden) + status-strip group tabindex/aria-label/현황 4축 prefix + 심각도 legacy mixed-language 0건.
- **`tests/a11y-severity-non-color.test.js`** — 5 test. severity-tag 추출(중첩 span 인식) + 4 sev × 2 surface(OQ/Risks) 모두 icon AND text 동시 보유 invariant.
- **html.js CSS** — `.sr-only` (clip-path inset 50%) + `.skip-link:focus-visible` (fixed top/left, accent bg, z-index 11) + `details summary:focus-visible` + `.status-strip:focus-visible` + severity-tag `font-weight: 600` (색 약시 보조) + `main:focus { outline: none }`.
- **html.js markup** — `<a class="skip-link sr-only" href="#main">본문 바로가기</a>` after `<body>` + `<main id="main" tabindex="-1">` + `<footer role="contentinfo">` + `<code lang="en">.claude/</code>` + status-strip `tabindex="0"` + dynamic aria-label `현황 4축: <label1> <value1> · <label2> <value2> · …` + cell `<span class="icon" aria-hidden="true">`.

### Changed

- **`sections/open-questions.js`** — `severityTagHtml` import (severity-tag 본문 단축). copy-btn에 `aria-label="다음 액션 복사"` 추가(한글 전용 고정).
- **`sections/risks.js`** — 동일 — `severityTagHtml` + copy-btn `aria-label="다음 액션 복사"`. SEVERITY_ICON local map 제거.
- **`sections/milestone-history.js`** — `<time datetime="<ISO>">` semantic 시간 wrap (날짜 미상은 fallback).
- **html.js LAYOUT** — `header .status-strip .cell:focus-visible` 룰 제거(cell non-focusable). `header .status-strip:focus-visible` 신규 룰로 교체.
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** §Open Questions OQ-a~g 7건에 "**결정 (v1.4.2-M3)**: …" sub-bullet append (M1/M2 채택 default 본문화). §Risks "design direction anchor 4 위반" 행 mitigation column에 M3 lint 4종 mechanize 추가. §Design Direction Acceptance criteria 5 a11y 항목 `[x]` 체크. M3 row in-progress → complete.
- **plugin.json version bump** `1.10.0 → 1.11.0`.

### Deviations from plan

- **status-grid.js 변경 0건** — plan §Files to Change에 status-grid.js UPDATE가 명시되었으나, status-grid의 `html` 출력은 dashboard 어디에도 surface되지 않음(html.js는 `grid.cells`만, markdown.js는 `grid.md`만 사용). 실제 strip은 html.js의 `renderStripCell`이 담당하며 본 PR에서 같은 파일이 이미 a11y 적용 받음. status-grid.js 수정은 dead code 변경이라 skip.
- **aria-label line count vs occurrence count** — plan validation `grep -c 'aria-label' .claude/cache/status.html` ≥ 7은 line-count 가정. compact HTML(한 줄에 다수 aria-label)에서 line count = 3으로 보이나 실제 occurrence는 5건(strip 1 + 위험도 2 + 다음 액션 복사 2). 정성 invariant는 모두 통과.
- **design-gate H3/H4 carve-out (main merge resolution)** — main에서 merge한 v1.3.0 design-gate `output-constraints.js` H3(card-less) + H4(stripe-less) absolute-ban rule이 v1.4.2 4-part OQ/Risks 컴포넌트(severity-tag pill + action-prompt code chip + meta-cue stripe + skip-link + copy-btn + raw-alert banner) design intent와 정면 충돌. selector-aware carve-out으로 해결 — `findSelectorContext()` helper + `H3_CARVEOUT`/`H4_CARVEOUT` regex(severity-tag/action-prompt/skip-link/copy-btn/s-secret/[role="alert"] + blockquote/meta-cue) 적용. carve-out selector 매칭 hit는 ignore, 일반 layout chrome의 카드/스트라이프는 여전히 absolute-ban. DESIGN.md H3/H4 row에 carve-out 명문화. 281/281 test PASS.

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

## [1.8.1] — 2026-06-21

v1.4.x patch — privacy + invariant polish on top of M3 ship. PRD §85(cross-repo contamination risk) + §87(invariant 강화) + §69(M1 session-ledger primitive) + §43(M2 metric — branch name이 STATE.md/logging inject 경로) audit가 검출한 axis 2개를 single PR로 처리. plugin.json `1.8.0 → 1.8.1` patch bump per CLAUDE.md §3.7. No schema/api break.

### Added

- **`session-ledger.js#isValidGitBranch(name)`** — git ref-format rule helper. Total function (`null → true`, non-string → false, never throws). 10 reject rules: length 1-255, leading-dot, double-dot, whitespace, control-char (0x00-0x1F + 0x7F), `@{`, consecutive `/`, trailing `/`, `.lock` suffix, `~^:?*[`.
- **`session-ledger.js#liftLegacyBranch(ledger, sourcePath)`** — read-side branch lift (Codex R1 F1 + R2 F1 absorption). In-memory only — wonky `git_branch` → `null` 강등 + module-level `WARNED_LEGACY_BRANCH_PATHS` Set memo로 per-process per-sourcePath 1회 stderr WARN cap (R2 F3 absorption). 호출 site 4개: `readLedger`, `listLedgers`, `updateLedgerHeartbeat`, `finalizeLedger` 모두 `read → lift → validate` 순서 invariant.
- **`derive/sources/receipts.js` `cwd` field emit** — receipts source가 `meta.cwd`를 surface (v0.2.x-era receipts 없는 키는 `pick()` undefined 처리, additive-only). derive/mask.js receipts cwd mask key와 짝이 활성화됨.
- **`derive/mask.js#safeTrailingSegment(input)` + `isOutsideRoot(input, repoRoot)`** — platform-independent helper 2개 (Codex R2 F2 absorption). 양쪽 slash kind 양쪽 normalize → 마지막 non-empty segment → drive-prefix / empty / `.` / `..` / separator-containing → `_` 대체. POSIX host에서 Windows-drive/UNC 입력도 leak-free.
- **`maskPath()` outside-root placeholder** — `<outside-repo:basename>` 변환. Sibling worktree / parent dir / cross-drive / UNC / restored receipts from other repos 모두 raw segment leak 0.
- **세션-ledger 11개 + mask 7개 새 test** — 5 write-side negative + 1 write-side positive + 1 helper-total + 2 read-side lift + 1 WARN cardinality + 6 maskPath case + 1 outside-root no-separator-leak invariant.

### Changed

- **`session-ledger.js#validate()`** — `git_branch !== null` 블록 안에 `isValidGitBranch` strict rule 추가. createLedger 경로(write-side)만 strict reject. v2 schema version은 유지 (backward-compat — 기존 valid v2 ledger 모두 통과).
- **`session-ledger.js` read paths** — `readLedger`/`listLedgers`/`updateLedgerHeartbeat`/`finalizeLedger` 4개 모두 JSON parse → liftV1 → **liftLegacyBranch** → validate 순서. invalid v2 ledger silent drop 방지 (Codex R2 F1 absorption — discovery surface 보존).
- **`derive/mask.js#maskPath()`** — 기존 `path.relative(root, p)`이 `..` 시작 시 absolute leak하던 결함 차단. `isOutsideRoot()` 3축 detection (Windows-drive cross-drive / UNC / POSIX `path.isAbsolute` + relative `..`) → `<outside-repo:safeTrailingSegment>` placeholder.
- **plugin.json version bump** `1.8.0 → 1.8.1`.

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

## [1.9.0] — 2026-06-22

v1.3.0 design-gate M3 follow-up — H15(heading depth ≤ 3) + H16(unrendered markdown literal) mechanical lint rules. Parent M3 plan(`v1-3-0-design-gate-m3-output-constraints.plan.md`)의 partial Axis C deferral 약속을 닫는다. RULES length 14 → 16. PR #45 stacked ship 모드 (M3 lint + M3 follow-up 단일 PR로 묶음). plugin.json `1.7.0 → 1.9.0` (Codex Implement-Codex R1 F1 absorption — main이 v1.4.x cycle로 1.8.1까지 진행, race 회피로 1.8.0 skip 1.9.0 직행).

### Added

- **DESIGN.md H15 spec** — Heading depth ≤ 3. h1(verdict) + h2(section) + h3(sub-section) 허용, h4+ 금지. PRD §Design Direction line 149 "(a) 정보 위계 3단계" mirror. Lint: HTML body `<h([4-9])` 카운트 == 0 AND markdown은 backtick + tilde 양쪽 fenced-code-block strip 후 CommonMark ATX `^ {0,3}#{4,6}\s` 카운트 == 0.
- **DESIGN.md H16 spec** — NO unrendered markdown literal in HTML body. 6 패턴 catalog: bold-asterisk, bold-underscore (dunder strip), inline-backtick raw, entity-encoded backtick/asterisk/underscore (leading-zero + uppercase + named entity variant 모두), md-link, MD0xx lint code. carve-out: `<code>`/`<pre>`/HTML attribute + Python dunder 15종 whitelist(`__init__`/`__name__`/`__main__`/`__file__`/`__doc__`/`__str__`/`__repr__`/`__call__`/`__enter__`/`__exit__`/`__all__`/`__slots__`/`__dict__`/`__iter__`/`__len__`).
- **`plugins/mccp/scripts/lib/renderer/output-constraints.js` H15 + H16 rules** — RULES array에 push. severity `invariant` / `absolute-ban`. Codex Implement-Codex R1 4 finding absorption: F1 version skip-to-1.9.0, F2 tilde fence strip, F3 dunder 10→15 expansion, F4 entity variants permissive.
- **`output-constraints.test.js` 22 test 추가** — H15 6건(pass+html-fail+md-fail+indented-fail+backtick-fenced-pass+tilde-fenced-pass) + H16 16건(pass+5 fail pattern+carve-out+raw backtick+entity decimal+hex+leading-zero+upper-hex+named+entity-asterisk pair+3 dunder pass+expanded dunder pass+non-dunder fail+pre carve-out). 총 68/68 pass. (plan target 47, R1 absorption으로 expansion)
- **`design-invariants.test.js` drift fixture** — H15+H16 violation 강제 검출 sanity. 16-rule end-to-end는 `design_constraint_violations === []` assertion으로 자동 회귀 0.

### Changed

- **`output-constraints.js` 헤더 주석** — "H1-H14" → "H1-H16", "all 14 rules" → "all 16 rules".
- **`DESIGN.md` line 54-55** — "H1–H14 are the mechanical lint target" → "H1–H16 ... all 16 grep-based checks".
- **plugin.json version bump** `1.7.0 → 1.9.0` — minor jump skipping 1.8.x to avoid race with main(1.8.1, v1.4.x cycle parallel merge). PR #45 squash + rebase 시 conflict resolve 단순화.

### Codex Implement-Codex R1 absorption

4 finding (HIGH×1 + MEDIUM×3) 모두 R1 ACCEPT_NOW + plan body + implementation 양쪽 fully resolved (R2 미escalate, `MCCP_GATE_ROUND_CAP=1`):

- **F1 (HIGH)** Planned version bump 1.8.0 already behind main 1.8.1 → non-monotonic release risk. Task 8 override: 1.9.0 직접 bump.
- **F2 (MEDIUM)** H15 fence strip은 triple-backtick만 → tilde + 긴 backtick fence false-positive. Task 3 override: 두 fence 종류 모두 strip + tilde fence pass test 추가.
- **F3 (MEDIUM)** H16 dunder whitelist 10종 너무 좁음 — repo skill docs에 `__all__`/`__slots__`/`__dict__` 다수 존재. Task 4 override: 15종으로 확장 + expanded dunder pass test 추가.
- **F4 (MEDIUM)** H16 entity coverage 좁음 — `&#96;`/`&#x60;` exact만, `&#096;`/`&#X60;`/`&grave;` + entity-encoded `*`/`_` bypass. Task 4 override: 3 entity variant 모두 cover (leading-zero + upper-hex + named entity) + paired entity-asterisk/underscore + 4 test 추가.

### Acceptance summary

- ✓ RULES.length 16 + H15/H16 ID 정합
- ✓ output-constraints.test.js 68/68 pass
- ✓ design-invariants.test.js 5/5 pass (포함 drift fixture)
- ✓ DESIGN.md spec rows 추가 + "H1–H16" 갱신
- △ Task 7 m3-redux dry-run: H10 14건 + H16 16건 advisory by-design. H16 entity-backtick 15건은 `format-utils.js#escapeHtml`(M3 plan Codex R1 F4 XSS 방어)이 backtick → `&#96;` escape하는 의도된 동작 + markdown inline code(`` ` ``)가 `<code>` wrap 없이 escape만 됨. H10이 user content em-dash로 advisory by-design인 것과 동형. **Follow-up axis**: markdown inline code → `<code>` wrap (별도 plan).

## [1.6.2] — 2026-06-20

v1.3.0 design-gate enforcement M2 ship — SKILL first-step + critique retry loop. M1이 silent-skip을 *관측*만 했던 axis를 M2가 *positive enforcement*로 닫음: design surface plan/implement/PRD는 (1) `frontend-design-direction` SKILL의 새 `## Output Constraints` 섹션을 Phase 진입 즉시 Read, (2) impeccable critique을 bounded retry loop(`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default 2)으로 돌리고, (3) PR step은 critique invoke 자체 제거 + chain-check만 (prior receipt verdict='divergent' 발견 시 BLOCK). 4 Codex Plan-Codex R1 HIGH finding 모두 plan body에 fully absorbed (F1 3-axis trigger / F2 oracle UNKNOWN=fail / F3 PR-scope chain-check / F4 pre-ship dogfood gate). plugin.json `1.6.1 → 1.6.2` patch bump per CLAUDE.md §3.7.

### Added

- **`plugins/mccp/scripts/lib/design-critique-decide.js`** — Pure-function oracle. `SEVERITY_ALIASES` + `normalizeSeverity` (lowercase / `P0` / `P1` / `blocker` / missing → fail-closed UNKNOWN) + `parseRetryCap` (env-driven, range 0-3, default 2) + `decideCritique({findings,round,cap}) → 'CONVERGED'|'ESCALATE_NEXT_ROUND'|'DIVERGENT_UNRESOLVED'`. dep-free. Codex R1 F2 absorption — `findings=null` → DIVERGENT (caller 책임).
- **`plugins/mccp/scripts/lib/tests/design-critique-decide.test.js`** — 9 fixture (기본 6 + F2 absorption 3: lowercase normalize / missing+null+P1 alias / parse-fail fail-closed).
- **`plugins/mccp/scripts/receipt/tests/validate-cmd-design-critique.test.js`** — 5 fixture A-E covering chain-check + audited escape + legacy compat (회귀 0).
- **`plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js`** — 6 fixture pre-ship dogfood (M2 acceptance gate). `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` 양 시나리오 + receipt rounds/verdict stamp + chain-check BLOCKs PR + fixture file presence (F4 absorption).
- **`.claude/cache/test-fixture-status.html`** — 합성 design-surface fixture (1줄). 좁은 whitelist (axis b)가 positive로 인식하는 synthetic artifact.
- **`plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 섹션** — 4 rule (정보 위계 3단계 / 강조색 화면당 1개 / raw markdown marker 금지 / 한 화면 항목 수 상한). critique loop fail/M3 lint mechanical 검증의 anchor.
- **Receipt schema 4 신규 meta field** (additive — schema_version 유지): `design_critique_rounds: int|null` + `design_critique_verdict: 'converged'|'divergent'|'skipped'|null` + `design_intent_reason: string|null` + `pr_design_chain_skip_reason: string|null`. 두 reason field는 strict reason validator (M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` 룰 mirror).
- **Receipt CLI 4 신규 플래그**: `--design-critique-rounds <N>` / `--design-critique-verdict <enum>` / `--design-intent-reason <text>` / `--pr-design-chain-skip-reason <text>`.
- **CLAUDE.md §3.9** — "디자인 surface 변경 시 SKILL first-step + critique retry loop" 신설. 3-axis trigger + 4 출력 제약 + bounded retry + PR scope chain-check + 자기-적용 dogfood 명시. §4 cheat sheet에 4 env 토글 추가.

### Changed

- **`plugins/mccp/scripts/lib/impeccable-detect.js`** — `DESIGN_SURFACE_PATHS`에 design-gate control-plane 3 path 추가 (좁은 확장, F1 absorption): `impeccable-detect.js` / `design-critique-decide.js` / `skills/frontend-design-direction/`. `commands/*.md` 전체는 overshoot 회피로 제외. detector 자기-적용 의무 + 본 plan 자기-재현 차단.
- **`plugins/mccp/scripts/receipt/validate-cmd.js`** — (a) lenient surface: plan/implement gate에서 `design_critique_verdict='divergent'`이면 `warnings[].push(kind='design_critique_divergent')`. (b) chain-check (F3 absorption): terminal `mccp:pr` / `mccp:prp-pr` validate 시 prior receipt verdict 검증, divergent 발견 시 `blocking[].push(kind='design_critique_chain_divergent')`. `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape (strict reason validator) 활성 시 advisory mode (warning으로 강등).
- **`plugins/mccp/commands/plan.md`** — Phase 5.0 입구에 3-axis trigger preflight (`SKILL_AVAIL` × `SIGNAL` × `DESIGN_INTENT_ACTIVE`) + SKILL Read 강제 stderr signal. Phase 5.0 SIGNAL=1 분기를 retry loop으로 확장 (`decideCritique` + Edit 명시 섹션만 + cap 도달 시 DIVERGENT). 5.6 receipt-write에 4 신규 flag forward.
- **`plugins/mccp/commands/prp-implement.md`** — Phase 2.5.5b에 plan.md와 동일한 3-axis trigger + retry loop mirror. Edit target은 plan body 대신 산출 code/diff. cap 도달 시 fix-task.md append + receipt verdict stamp (downstream PR chain-check BLOCK).
- **`plugins/mccp/commands/plan-prd.md`** — Phase 4.0에 동일 3-axis trigger + critique loop wire (PRD body 재생성). plan-prd는 receipt 미작성이므로 verdict는 observational, 다운스트림 `/mccp:plan`이 derived plan에서 verdict 전파.
- **`plugins/mccp/commands/pr.md`** — Phase 1.6 신설: design-critique chain-check preflight 명시. PR scope는 critique retry loop **비활성** (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 무시) + chain-check이 prior receipt verdict 검증. divergent 발견 시 STOP exit 1 (gh 호출 전, receipt 미작성). audited escape `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` 활성 시 advisory mode. 2.5.7 receipt-write에 `--pr-design-chain-skip-reason` forward.
- **`plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `--pr-design-chain-skip-reason` flag forward.
- **plugin.json version bump** `1.6.1 → 1.6.2` — patch jump per CLAUDE.md §3.7 (M2 단독 ship, M3 별도 cycle).

### Codex Plan-Codex R1 absorption

4 HIGH finding 모두 plan body에 fully resolved (R2 미escalate, `MCCP_GATE_ROUND_CAP=1`):

- **F1** (SKILL first-step still depends on detector false-negative) → 3-axis trigger (detector / 좁은 whitelist / audited override) + impeccable-detect.js DESIGN_SURFACE_PATHS 3 path 확장.
- **F2** (decideCritique uppercase exact match silently CONVERGED) → SEVERITY_ALIASES + normalizeSeverity + UNKNOWN=fail-closed + 9 fixture 회귀.
- **F3** (PR-scope verdict=divergent warning-only) → PR scope critique invoke 제거 + chain-check 강제 + `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape.
- **F4** (Task 10 retroactive-confirm gap) → pre-ship gate로 승격, 합성 fixture + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` e2e test.

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
