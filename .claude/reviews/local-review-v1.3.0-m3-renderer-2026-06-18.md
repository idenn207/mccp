# Local Review: v1.3.0-m3 STATUS.md + HTML renderer

**Reviewed**: 2026-06-18
**Branch**: v1-3-0-observability-m3-renderer
**Decision**: APPROVE with comments (no CRITICAL, no HIGH)
**Mode**: Local Review Mode (no PR yet — advisory pre-commit review)

## Summary

매우 thorough하게 작성된 renderer 모듈. M1 derive model + M2 briefing fields를 pure function으로 소비해 `.claude/cache/STATUS.md` + `status.html`을 산출. 3-layer fail-open (per-section + per-composer + outer facade) + HTML self-injection 방어 4종 payload 테스트 + 63개 테스트 전부 통과 + 기존 retrieval(629/629)에 회귀 없음. Codex R1 F1–F4 + impeccable P1–P3 absorption 전부 plan body와 구현에 반영됨. Security/correctness blocking issue 없음.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

#### M1 — `cmdRender`의 `--out` flag 인자 누락 시 unhandled `TypeError`

- 위치: `plugins/mccp/scripts/derive/cli.js:134` (`cmdRender`)
- 재현: `node plugins/mccp/scripts/derive/cli.js render --out --md` → `TypeError [ERR_INVALID_ARG_TYPE]: paths[1] must be of type string. Received type boolean (true)` + 스택 트레이스 노출 + exit 1.
- 원인: `parseFlags` (cli.js:38-57)이 `--out` 다음 인자가 `--`로 시작하면 `out = true` (boolean)으로 설정. `cmdRender`는 `rest.out || path.join(...)`로 truthy check만 하므로 `path.resolve(cwd, true)` 호출 → TypeError. 동일 패턴이 `cmdRun`에도 있지만 cmdRun은 string flag를 받지 않아 무관.
- 영향: user error에 대한 fail-loud 자체는 합리적이지만, fail-open 원칙으로 작성된 renderer 표면과 톤이 어긋남(spec §8 "renderStatus() is never permitted to throw"). dashboard-surface.md §6의 "manual + on-demand"로서 user-facing CLI인 점도 고려.
- 제안: `cmdRender` 진입부에서 `if (rest.out !== undefined && typeof rest.out !== 'string')` 검증 + stderr loud message + exit 1. 또는 `parseFlags`에 known string-flags 집합을 옵션으로 받는 옵션.
- 우선순위: MEDIUM (UX nit이지만 surface invariant와 일관성 어긋남). v1.3.x patch 또는 M4 wiring 이전 흡수 권장.

#### M2 — `index.js` `safeFallback`의 escape 함수 중복

- 위치: `plugins/mccp/scripts/lib/renderer/index.js:37-38`
- 관찰: `safeFallback`이 `&`, `<`, `>` 3개만 in-place replace로 escape. 같은 파일이 이미 `format-utils.js`를 require 중인데 `escapeHtml`(6글자: `& < > " ' \``)를 사용하지 않음. 결과 HTML 컨텍스트는 element content이라 3글자만으로도 XSS 차단에는 충분하지만, codebase-wide invariant(`dashboard-surface.md §9`)와 inconsistent.
- 위협 모델: `err.message`가 외부 input이 아니라 dev-controlled exception 메시지이므로 실효 위험은 0. 일관성 issue.
- 제안: `escapeHtml(msg.slice(0, 200))` 단일 호출로 교체. format-utils.js의 require가 module load 시점에 이미 일어났으므로 catch-all 동선에서 안전.
- 우선순위: MEDIUM (정합성 maintenance; security impact 없음).

### LOW

#### L1 — Stale-threshold magic number `60_000` 4개 파일에 분산

- 위치:
  - `lib/renderer/markdown.js:11` (`(now - derivedMs) > 60_000`)
  - `lib/renderer/html.js:89` (`STALE_SCRIPT` inline: `a>60000?'1':'0'`)
  - audit-timeline.js의 `SEVEN_DAYS_MS`는 단독 상수로 잘 추출됐지만 60s stale 임계는 미추출.
- 영향: M4가 hook-triggered refresh + freshness policy를 조정할 때 4 곳을 동기화해야 함.
- 제안: `format-utils.js`에 `const STALE_THRESHOLD_MS = 60_000;` export 후 markdown/html에서 import. inline STALE_SCRIPT은 string template 시 `+ STALE_THRESHOLD_MS +`로 주입.
- 우선순위: LOW (refactor; no behavior change).

#### L2 — `(unknown-gate)` placeholder가 실제 cache에 노출됨

- 관찰: 실제 `node ... cli.js render` 실행 시 timeline에 `(unknown-gate)/-m3-renderer · ✓ 수렴` 항목 다수 표시. report v1-3-0-observability-m3-renderer-report.md:113이 이미 "Not an M3 regression — minor axis for v1.3.x patch cycle"로 분류.
- 위치: `audit-timeline.js:41` (`r.gate_id || '(unknown-gate)'`)
- 영향: PM dashboard 가독성. 동시에 receipt scanner의 schema gap을 가시화하는 honest signal이기도 함.
- 우선순위: LOW (M3 외부 — v1.3.x M0+M1 schema axis로 후속). 본 PR로는 손대지 않는 게 옳다.

#### L3 — Decision ID truncation이 `-` prefix를 그대로 노출

- 관찰: `audit-timeline.js:41` `tail(decision_id, 12)` → `-m3-renderer`처럼 leading dash가 그대로. 시각적으로 list bullet과 혼동.
- 제안: `'…' + tail(s, 12)` 또는 leading-dash trim. cosmetic.
- 우선순위: LOW.

#### L4 — `worker-fanout.js` markdown 테이블 셀의 raw `|` 문자

- 위치: `lib/renderer/sections/worker-fanout.js:57, 74`
- 관찰: `env.error`(60자 slice 후), `env.worker_subagent_type` 등이 markdown table cell에 raw 삽입. 만약 envelope의 error 메시지에 파이프 문자가 있으면 markdown 테이블이 깨질 수 있음.
- 영향: visual only — XSS 없음. STATUS.md는 PM이 직접 보기 때문에 시각 오류 정도.
- 제안: `replace(/\|/g, '\\|')` 한 줄(risks.js:32-35가 이미 적용한 패턴과 일관).
- 우선순위: LOW (degenerate input 시 visual issue).

## Validation Results

| Check | Result |
|---|---|
| Renderer unit tests (`node --test ".../tests/*.test.js"`) | ✓ Pass — 63/63 |
| CLI smoke (`render --out /tmp/...`) | ✓ Pass — STATUS.md 5.9KB + status.html 11.1KB 생성 |
| CLI edge (`render --out --md`) | ✗ TypeError unhandled (M1) |
| Build | N/A — pure Node, no transpile |
| Lint | N/A — repo has no eslint config |
| Regression suites | not run locally (report v1-3-0-observability-m3-renderer-report.md cites 629/629 across derive/receipt/state/briefing/renderer) |

## Files Reviewed

| File | Change Type |
|---|---|
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | Modified (M2 → complete, M3 → in-progress + plan/report link) |
| `CLAUDE.md` | Modified (§1.4 v1.3.0-m3 row + §5 entry 7) |
| `docs/v1.3.0-observability/schema-surface.md` | Modified (§7 dashboard rendering surface stub) |
| `docs/v1.3.0-observability/dashboard-surface.md` | Added (9 §, 114 lines — canonical spec) |
| `plugins/mccp/scripts/derive/cli.js` | Modified (+55: `cmdRender` + help) |
| `plugins/mccp/scripts/lib/renderer/index.js` | Added (124 lines — facade) |
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | Added (109 lines — badges + escape + relative time) |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | Added (102 lines — 11-step priority chain) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | Added (87 lines — md composer) |
| `plugins/mccp/scripts/lib/renderer/html.js` | Added (145 lines — html composer + OKLCH) |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | Added (186 lines — PRD/plan body parser) |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | Added (74 lines) |
| `plugins/mccp/scripts/lib/renderer/sections/worker-fanout.js` | Added (108 lines) |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | Added (75 lines) |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | Added (44 lines) |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | Added (59 lines) |
| `plugins/mccp/scripts/lib/renderer/tests/*.test.js` | Added (9 files) |
| `.claude/PRPs/plans/completed/v1-3-0-observability-m3-renderer.plan.md` | Added (archived plan) |
| `.claude/PRPs/reports/v1-3-0-observability-m3-renderer-report.md` | Added (implementation report) |

## Strengths (notable design choices worth retaining)

1. **3-layer fail-open** — per-section + per-composer + outer `safeFallback`. `renderStatus()`가 절대 throw하지 않는 invariant가 테스트로 강제됨(`index-outer-fail-open.test.js` 5/5).
2. **HTML self-injection 방어** — 4종 payload (script tag, attribute breakout, onerror, backtick)을 escaping.test.js로 명시. dashboard-surface.md §9에 invariant 본문화.
3. **Verdict 우선순위 chain** — 11-step deterministic + LLM-free. step 7.5 (controller-active + envelopes empty) Codex F3 absorption은 race 가시화 측면에서 PM dashboard surface의 결정적인 quality bump.
4. **WCAG AA + color-blind safe** — `STATUS_BADGES.appliesTo='icon'`로 amber 토큰에서 body text 색 차단(impeccable P1). icon+text+color triple invariant이 grep-friendly Korean label을 보존함.
5. **Pure function 경계** — M3는 model을 mutate 안 함, derive를 직접 호출 안 함(CLI 진입점만). M4/M5 책임 분리 깔끔.
6. **Atomic write** — `cli.js:108-112` writeAtomic이 `.tmp` + rename으로 partial cache 방지. 같은 파일을 두 reader가 동시에 읽는 시나리오에 robust.

## Pre-PR Recommendations

1. **M1, M2 흡수 후 PR**: cli.js의 `--out` boolean guard + safeFallback escapeHtml 호출. 둘 다 ~3줄 변경, 테스트 1개씩 추가하면 됨.
2. **M0–M2 plugin.json version bump 누락 확인**: CLAUDE.md §3.7에 따르면 M3 ship 시 `plugin.json` version bump도 PR에 포함돼야 함. 현재 working tree에서 plugin.json은 변경 없음. report:111이 "version bump decision deferred to cycle close"로 언급했으나 cycle close PR이 별도라면 명시적 follow-up axis 등록 필요.
3. **L1–L4는 backlog 후보**: 본 PR에 포함하지 말고 v1.3.x patch cycle 또는 M4 wiring에 묶기.

## Next Steps

- M1 + M2 흡수 후 `/mccp:prp-commit "v1.3.0-m3 renderer + cli --out guard + safeFallback escape"`
- `/mccp:pr`로 전체 chain (디자인 + 보안 + Codex review) 진입
- Post-ship: M4 hook wiring axis 등록 (`SessionStart`/`receipt-write`/`envelope move-or-write` 3 trigger)
