# Plan: Dashboard Readability M3 — 판정 어휘 사용자 친화화

**Source PRD**: `.claude/prds/dashboard-readability.prd.md`
**Selected Milestone**: M3 — 판정 어휘 사용자 친화화
**Complexity**: Small

## Summary
대시보드 전 섹션에 흩어진 dual-review 판정 라벨을 사용자 친화 어휘로 일관 치환한다 — `수렴→통과`, `진행→진행 중`, `divergent`/`미수렴→보류`. HIGH 리스크(일부 site 누락)를 막기 위해 세 어휘를 단일 소스 모듈(`verdict-label.js`)로 뽑아 5개 렌더 파일이 이를 소비하게 하고, 잔여 `수렴`/`미수렴`/`divergent` 0을 강제하는 metric 테스트를 추가한다. 아이콘(✓/◐/⚠)·톤(low/med/high) 정합은 유지(코드값 변경 없음, PRD Design Direction).

## Scope (Codex R1 F2 absorbed)
M3의 대상은 **대시보드(renderer surface = `status.html` + `STATUS.md`)** 의 dual-review 판정 라벨로 명시 한정한다(PRD Users=대시보드 운영자, Success Metric=렌더러 grep). 비-renderer user-facing emitter는 **out-of-scope**로 backlog 이월:
- `state/fix-task.js:63` — `Codex divergent — review concerns` (fix-task.md, agent 연속성 아티팩트)
- `hooks/stop-review-loop.js:357` — `mccp Stop-loop: Codex divergent (3R)…` (CLI stderr)

이들은 `.claude/plans/codex-findings-backlog.md`에 DEFER 등재 — 추후 별도 cycle에서 동일 `verdict-label.js` helper로 라우팅(대시보드 밖 표면 통일). M3에서 확장하지 않는 이유: PRD scope 준수 + YAGNI(대시보드 metric과 무관 표면).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `parsers/jargon-dictionary.js:3` | `Object.freeze({...})` 상수 dictionary — SSoT 라벨 맵 동형 |
| Frozen map 소비 | `sections/pipeline.js:16` `NODE_MARK` / `sections/multi-session.js:83` `STATE_META` | status→{label,cls} 정적 맵을 섹션이 lookup |
| Tests | `tests/i18n-surface.test.js:60` | `assert.match`/`assert.doesNotMatch(r.html|r.md, /…/)` 로 사용자 노출 문자열 존재/부재 단언 |
| 시각 정합 | `sections/audit-timeline.js:197` | `tone: isBad?'high':(converged?'low':'med')` — 통과/진행 중/보류 톤 매핑 유지 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/verdict-label.js` | CREATE | 판정 어휘 SSoT — `VERDICT = { PASS:'통과', IN_PROGRESS:'진행 중', HOLD:'보류' }` frozen 맵 |
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | UPDATE | `NODE_MARK.done/converged-frontier/active` label + `STAGE_CONVERGED`(계획/구현/PR 통과) + 게이트 통과 fallback을 `VERDICT` 참조로 치환 |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | `convText`(blocked→보류, converged→통과 R{n}, else→진행 중 R{n}) + `mdMark`(⚠ 보류) + sr-only(보류) + 주석 line 14 |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATE | `buildReceiptDetail` 기본 conv(line 184) + worktree 게이트 `(미수렴)/(수렴)`(line 250-251) 치환 |
| `plugins/mccp/scripts/lib/renderer/parsers/next-action.js` | UPDATE | blocked prose/description(`Codex 미수렴`→`Codex 보류`) + plan-frontier description(`수렴 진행 중`→`진행 중`) 치환 |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | `blockedIntent` 툴팁(line 210) `미수렴`→`보류` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | CSS 주석(line 578) `수렴`→새 어휘 리워드(emit되는 `<style>` 오염 제거) + footer 버전 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer 버전(line 154) |
| `plugins/mccp/scripts/lib/renderer/tests/verdict-label.test.js` | CREATE | VERDICT 값 단위 + metric grep-0 테스트(md 기준 잔여 0, html visible 라벨 present) |
| `plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js` | UPDATE | `구현/계획 수렴`→`통과`, `plan 수렴`(sr-only)→`통과` 단언 갱신 |
| `plugins/mccp/scripts/lib/renderer/tests/timeline-chart.test.js` | UPDATE | `수렴 R1`→`통과 R1`, `divergent`→`보류`, `✓ 수렴`→`✓ 통과` 갱신 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer `v1.19.2`→새 버전 4개 단언 |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js`, `tests/markdown-equivalence.test.js` | UPDATE | convLabel/verdictText **라벨 fixture**만 새 어휘로(briefing_summary 등 receipt 데이터 문자열은 유지 — 라벨 아님) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.19.2` → `1.20.0` (PRD 마지막 milestone = minor, §3.7) |
| `CHANGELOG.md` | UPDATE | `[1.20.0]` row 추가 |
| `.claude/prds/dashboard-readability.prd.md` | UPDATE | M3 row `pending`→`in-progress` + Plan 셀(이 plan 경로) — /mccp:plan 규약 |

## Tasks

### Task 1: 판정 어휘 SSoT 모듈 생성
- **Action**: `parsers/verdict-label.js` 신설 — `module.exports = { VERDICT: Object.freeze({ PASS:'통과', IN_PROGRESS:'진행 중', HOLD:'보류' }) }`. 상단 주석에 매핑(converged→PASS, active/first-round→IN_PROGRESS, divergent/escalated 미수렴/blocked→HOLD)과 "아이콘·톤은 각 섹션이 유지" 명시.
- **Mirror**: `jargon-dictionary.js:3` frozen dictionary.
- **Validate**: `node -e "console.log(require('./plugins/mccp/scripts/lib/renderer/parsers/verdict-label').VERDICT.PASS)"` → `통과`.

### Task 2: pipeline.js 라벨 치환
- **Action**: `verdict-label` require. `NODE_MARK.done.label`/`['converged-frontier'].label` → `VERDICT.PASS`; `.active.label` → `VERDICT.IN_PROGRESS`(현재 리터럴 `진행 중`과 동값, 상수화). `STAGE_CONVERGED` = `{ plan:'계획 '+VERDICT.PASS, impl:'구현 '+VERDICT.PASS, pr:'PR '+VERDICT.PASS }`. line 47 fallback `'게이트 '+VERDICT.PASS+' · 다음 대기'`. **foot-stat `진행`(line 138)은 완료/차단과 병렬 count 라벨이라 변경하지 않음**(판정 어휘 아님 — 명시적 out).
- **Mirror**: 기존 `NODE_MARK` 정적 맵 구조 유지.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js` (Task 8 갱신 후 green).

### Task 3: audit-timeline.js conv 라벨 치환
- **Action**: line 163 `convText = VERDICT.HOLD`; line 165 `VERDICT.PASS + (round…' R'+round)`; line 167 `VERDICT.IN_PROGRESS + (round…' R'+round)`; line 169 `mdMark = isBad ? '⚠ '+VERDICT.HOLD : (converged ? '✓ '+convText : '◐ '+convText)`; line 228 sr-only `(isBad ? ' '+VERDICT.HOLD : '')`. 주석 line 14 `수렴 R{n} / divergent / 진행 R{n}` → 새 어휘. verdictText/convLabel 은 이 convText 를 그대로 buildReceiptDetail 로 전달하므로 드로어 `판정` 행도 자동 정합.
- **Mirror**: 기존 conv 분기 구조 유지(isBad/converged/else 3분기).
- **Validate**: `node --test .../tests/timeline-chart.test.js` (Task 9 갱신 후 green).

### Task 4: drawer-detail.js 기본/워크트리 conv 치환
- **Action**: line 184 `const conv = rc.convLabel || (rc.isBad ? VERDICT.HOLD : VERDICT.PASS)`. worktree line 250-251 `it.gate_converged === false ? ' ('+VERDICT.HOLD+')' : it.gate_converged === true ? ' ('+VERDICT.PASS+')' : ''`.
- **Mirror**: 기존 3-state 삼항 유지.
- **Validate**: `node --test .../tests/drawer.test.js .../tests/multi-session.test.js`.

### Task 5: next-action.js prose/description 치환
- **Action**: line 183 `prose: prose || 'Codex '+VERDICT.HOLD+' · 개입 필요'`; line 185 `description: 'Codex 검토 '+VERDICT.HOLD+' — 사람 개입 필요'`; line 208 description `ctx.planIntent || 'plan 게이트 진행 중'`(기존 `수렴 진행 중`에서 모순 어휘 제거, line 206 prose 와 정합).
- **Mirror**: 기존 반환 객체 shape 유지.
- **Validate**: `node --test .../tests/next-action.test.js`.

### Task 6: status-grid.js 툴팁 치환
- **Action**: line 210 `'Codex 검토 ' + blockedCount + '건 '+VERDICT.HOLD+' · 사람 개입 필요'`.
- **Validate**: `node --test .../tests/sections.test.js .../tests/section-fidelity.test.js`.

### Task 7: html.js CSS 주석 리워드 + 양 footer 버전 bump
- **Action**: html.js line 578-579 CSS 주석의 `수렴`을 `통과`(또는 "게이트 통과했으나…")로 리워드 — emit되는 `<style>` 이 잔여 `수렴` 을 안 갖도록. html.js line 1417 footer + markdown.js line 154 footer `v1.19.2`→새 버전.
- **Mirror**: M2(1.19.2) footer 동기 패턴(§3.7 "양 footer 동기").
- **Validate**: `grep -R "수렴\|미수렴\|divergent" plugins/mccp/scripts/lib/renderer/*.js plugins/mccp/scripts/lib/renderer/sections plugins/mccp/scripts/lib/renderer/parsers` → 남은 hit는 내부 enum(`converged`)/영어 식별자/의도된 주석뿐인지 검토.

### Task 8: metric 테스트 신설 (Codex R1 F1 absorbed)
- **Action**: `tests/verdict-label.test.js` 신설. (a) 단위: `VERDICT.PASS/IN_PROGRESS/HOLD === 통과/진행 중/보류`. (b) metric: 세 상태(converged 통과·first-round 진행 중·round≥2 divergent 보류) + **드로어 detail을 실제로 만드는** receipt(converged/divergent) + worktree(`gate_converged` true/false) fixture로 `renderStatus` 호출 — briefing_summary/decision_id/milestone_hint 등 fixture 데이터에 `수렴`/`미수렴`/`divergent` 를 **심지 않음**. `r.md`(CSS/JS 없음)에 `수렴`/`미수렴`/`divergent` 0 + `통과`/`진행 중`/`보류` present 단언.
- **F1 absorption — 드로어 JSON은 strip 금지**: `r.html` grep-0 시 `<style>…</style>` 와 **실행 가능 `<script>`(=`type="application/json"` 아닌 것)만** strip한다. 사용자가 클릭 시 여는 드로어 데이터(`<script type="application/json" id="drawer-data">`, `html.js:1435`)는 **보존한 채** grep-0에 포함 — 드로어 title/tags/`판정` 행의 stale 어휘를 blanket-strip으로 놓치지 않게. 추가로 `#drawer-data` JSON을 파싱해 receipt/worktree detail의 verdict 표시 필드(title/tags[].label/rows '판정')가 새 어휘(통과/보류)로 나오는지 직접 단언(false-negative 차단).
- **Mirror**: `i18n-surface.test.js:60` render+assert 패턴 + `drawer.test.js` detail fixture 패턴.
- **Validate**: `node --test .../tests/verdict-label.test.js`.

### Task 9: 기존 테스트 어휘 갱신
- **Action**: `pipeline.test.js`(`구현 수렴`→`구현 통과`, `계획 수렴`→`계획 통과`, sr-only `plan 수렴`→`plan 통과`, 주석), `timeline-chart.test.js`(`수렴 R1`→`통과 R1`, `divergent`→`보류`, `✓ 수렴`→`✓ 통과`), `i18n-surface.test.js`(footer 버전 4곳), `drawer.test.js`·`markdown-equivalence.test.js`(convLabel/verdictText **라벨** fixture만; briefing_summary 데이터 문자열은 유지). `data-state`/CSS class(`is-converged`/`is-bad`)·decision-state enum(`blocked`) 단언은 내부값이라 유지.
- **Validate**: 전체 `node --test plugins/mccp/scripts/lib/renderer/tests/` green.

### Task 10: 버전/CHANGELOG/PRD 동기
- **Action**: `plugin.json` `1.19.2`→`1.20.0`. `CHANGELOG.md` `[1.20.0]` row(Keep-a-Changelog, M2 row 형식 mirror). PRD Delivery Milestones M3 `pending`→`in-progress` + Plan 셀 = 이 plan 경로(/mccp:plan 규약). M2 row(shipped인데 `in-progress`) status drift 는 별도 housekeeping 로 노트만(이번 selected row 아님).
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json'))"` + footer 테스트 green.

## Validation
```bash
# 렌더러 전체 스위트 (기대: 기존 통과 수 + 신규 verdict-label.test.js 만큼 증가, 0 fail)
node --test plugins/mccp/scripts/lib/renderer/tests/

# metric — 소스에 잔여 사용자 어휘 hit 검토 (남으면 내부 enum/주석/영어 식별자인지 확인)
grep -RnE "수렴|미수렴|divergent" plugins/mccp/scripts/lib/renderer/sections plugins/mccp/scripts/lib/renderer/parsers plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js

# 대시보드 렌더 후 육안 (통과/진행 중/보류 노출, 수렴/미수렴/divergent 0)
node plugins/mccp/scripts/derive/cli.js render
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 사용자 노출 site 일부 누락(HIGH — PRD 주 리스크) | HIGH | 세 어휘 SSoT(`verdict-label.js`) + `r.md` 잔여 0 metric 테스트 + `grep -RnE` 소스 audit. 5개 소비 파일 목록을 grep 결과와 대조 |
| emit되는 CSS 주석(html.js:578)이 `<style>` 에 `수렴` 잔류 → full-HTML grep false-positive | MEDIUM | Task 7 에서 주석 리워드 + Task 8 테스트가 `<style>`/`<script>` strip(방어 이중화) |
| briefing_summary 등 **receipt 데이터**에 우연히 `수렴` 포함 시 metric 테스트 오탐 | LOW | metric fixture 는 통제된 model — 데이터에 해당 어휘 미시드. 실데이터 grep-0 은 md 라벨 경로만 겨냥(데이터 문자열은 대상 아님을 plan·테스트 주석에 명시) |
| 버전 race — origin/main 이 이미 1.20.x 이상 선점(병렬 cycle 부채) | MEDIUM | 구현/PR 직전 `git fetch` 후 origin/main `plugin.json` 확인, 앞서 있으면 forward-only reconcile(§3.7). 1.19.3 patch 로 강등도 사용자 선택지(§3.7 "애매하면 patch") |
| 기존 스냅샷 테스트가 구 어휘에 고정 → 대량 갱신 | MEDIUM(LOW impact) | 의도된 변경 — Task 9 로 갱신 + diff 리뷰로 회귀 아님 확인(PRD Risks 표 4행) |

## Design Critique

- 단계: plan-stage design-direction critique (렌더 산출물 부재 → detector/browser Assessment B N/A)
- Round: R0 / verdict: **CONVERGED**
- 4 Output Constraints: 전부 PASS (heading depth·accent·raw marker·list-of-N 전부 불변 — 텍스트 라벨 스왑만)
- 개선 축: H2(Match Real World, jargon→PM voice) ↑ · H4(Consistency, `verdict-label.js` SSoT) ↑
- P2(advisory, non-blocking): '보류'(divergent verdict) vs '차단'(pipeline/grid node state) 이중어휘 인접. 두 축은 의미 상이(판정 라벨 vs 노드 상태) + tone=high/⚠ 아이콘이 긴급도 운반 + PRD pre-commit. 구현 시 audit-timeline `보류`에 sr-only/title 보조 설명(status-grid `blockedIntent` 패턴 정합) 유지 권장.

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI 부재로 아래 명령을 invoke하지 않고 implementer 체크리스트로만 기록.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` |
| polish | `/impeccable polish` |

> M3는 텍스트 라벨 리네임이라 refine content-signal(motion/color 등) 미발화 예상 — implement 단계에서 대부분 recommend로 강등. evaluate(critique/audit)·clarify(P2 라벨 카피)가 핵심 후보.

## Acceptance
- [ ] `verdict-label.js` SSoT 존재 + 5개 소비 파일이 참조
- [ ] `r.md` 에 `수렴`/`미수렴`/`divergent` 0, `통과`/`진행 중`/`보류` present (metric 테스트)
- [ ] `r.html` grep-0 시 드로어 JSON(`#drawer-data`) 보존 + 파싱 단언 — 드로어 verdict 필드 새 어휘(F1)
- [ ] 렌더러 전체 스위트 green (신규 포함, 0 fail)
- [ ] 아이콘(✓/◐/⚠)·톤(low/med/high) 변경 없음 — 어휘만
- [ ] plugin.json + 양 footer + CHANGELOG 버전 동기(drift 0)
- [ ] PRD M3 row in-progress + Plan 셀 갱신
- [ ] Patterns mirrored, not reinvented

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.19.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope preamble 적용)
- 라운드 수: 1 (R1 stop — HIGH finding이 plan-text absorption으로 완전 해소, R2 불필요 per Phase 5.4)
- 합치 결론: `needs-attention` (blocking=false) — coverage proof 자체 결함 1건 + scope 누락 1건. 둘 다 plan 단계에서 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — metric이 검증 대상 드로어 JSON을 strip | HIGH | ACCEPT_NOW | Task 8이 `<script>` 전부 strip → user-facing `#drawer-data`(`html.js:1435`) 드로어 verdict 필드의 stale 어휘가 grep 전에 제거돼 false-negative. Task 8 재설계로 흡수(application/json 보존 + 파싱 단언 + 드로어 fixture) |
  | F2 — renderer-only audit이 비-대시보드 emitter 누락 | MEDIUM | DEFER_TO_BACKLOG | `state/fix-task.js:63`·`hooks/stop-review-loop.js:357`의 `Codex divergent`는 대시보드 밖 recovery/CLI 표면. PRD scope=대시보드(renderer) 명시 한정 + backlog 이월(YAGNI) |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (2026-07-01 MEDIUM F2)
- Open Questions: 없음 (auto-CRITICAL 0)
- Codex session 참조: threadId `019f1c21-88d8-7170-ace5-c4ee144aa296`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

### Design Review

> impeccable available (skill_available=true) but design_signal=0 — renderer `.js` source is control-plane to the detector (no UI-ext/whitelist hit). silent-skip (reason=no-signal). Plan-stage design critique already CONVERGED (R0); this is a text-label swap with icons/tones unchanged. No critique retry loop, no grounding capture. Receipt forwards `--impeccable-silent-skip`.
