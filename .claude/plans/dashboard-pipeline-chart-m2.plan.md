# Plan: Dashboard Activity Step Chart (M2)

**Source PRD**: .claude/prds/dashboard-pipeline-chart.prd.md
**Selected Milestone**: 2 — 활동 로그 step chart. audit-timeline(receipt 활동 로그)을 시간순 step chart로 변환. (M1 게이트 스테이지 파이프라인은 complete, commit `dfdeee2`. M3 GitHub Actions 전체 리프레시는 후속 cycle.)
**Complexity**: Medium

## Summary
대시보드 `status.html`의 `audit-timeline` 섹션을 평범한 `<ul>` 텍스트 로그에서 **시간순 세로 step chart(타임라인 rail)**로 변환한다 — 각 receipt가 세로 connector 라인 위 노드 마커(✓ 수렴 / ◐ 진행)로 표시되고, GitHub Actions job-run timeline 미학을 따른다. **데이터 로직(snapshot read, MAX_ROWS caps, 정렬, footnote, briefing blockquote)은 일절 변경하지 않고 시각 레이어만 재구성**한다. 연결선은 absolute `::before` 세로 라인(`border-left` 미사용 → H4 회피, M1 D3 mirror), 노드 마커는 원형 pill(`border-radius` → H3 carve-out `tl-node` 추가). markdown은 기존 텍스트 표현 유지(정보 동치). 미학 리드는 M1과 동일하게 GitHub Actions 절제(중립 base + 상태색, 신규 강조색 0, 기존 OKLCH 토큰 재사용).

## Key Decisions (plan 확정)

### D1 — 세로 step chart (timeline rail), 가로 아님 (PRD Open Question 2 해소)
audit-timeline은 7일 live 최대 20행 + 보관 10행 = 최대 30+ 노드. **가로 step chart는 30 노드를 담을 수 없다** → 세로 rail이 유일하게 밀도를 감당. GitHub Actions job-run timeline / commit graph 미학 = 세로 connector 라인 위 노드 마커. 각 receipt 한 step. (가로 step + 세로 노드 혼합은 over-engineering — YAGNI.)

### D2 — 연결선 absolute `::before` 세로 라인, `border-left` 미사용 (H4 회피, M1 D3 mirror)
세로 timeline rail의 connector는 전통적으로 `border-left`로 그리지만 그것은 design-lint H4(side-stripe ban, `border-left ≥2px`)에 걸린다. M1 pipeline이 가로 connector를 `border-left` 대신 background 라인으로 회피한 선례를 mirror — **rail 라인은 `.tl-rail::before { position:absolute; width:2px; background:var(--border) }` (또는 `.tl-step::before` per-node 세로 stub)로 그린다**. `border-left`/`border-right` 사용 0 → H4 carve-out 불필요가 목표. 노드 마커(`.tl-node`)는 원형(`border-radius`) → H3 carve-out 대상.

### D3 — 데이터 로직 불변, 시각 레이어만 변환 (회귀 가드)
`renderAuditTimeline`의 control flow(snapshot read path, `MAX_ROWS_LIVE=20`/`MAX_ROWS_ARCHIVED=10` cap, `liveInWindow`/`archivedInWindow` 정렬, `rowKey` de-dup, footnote: archived/+N older/missing-day/mask hits/was_stale, briefing blockquote, 빈 입력 placeholder)는 **한 줄도 바꾸지 않는다**. 변경 범위는 (a) `renderRow`가 생성하는 `<li>` HTML 문자열 구조, (b) `<ul class="timeline">` wrapper 태그, (c) footnote `<li>` 클래스뿐. footnote는 step이 아니므로 노드 마커 없는 `tl-note` 클래스로 구분.

### D4 — 노드 상태 = 색 + 아이콘 + sr-only 병행, **흔한 상태는 quiet · 예외만 loud** (critique F1 흡수)
노드 마커는 색 단독 금지. **강조색 ≤ 1 viewport(Output Constraint 2) + "scan for 개입 필요" 가설을 위해 emphasis를 반전한다**: 20행 timeline에서 converged(✓)는 흔한 상태이므로 **quiet(ink/check)** — accent를 쓰지 않는다. pending(◐ 진행)은 **예외이자 개입 후보**이므로 **accent/stale(loud)** 로 눈에 띄게. archived(보관 복원)는 `muted` 한 단계 desaturate(기존 `from-snapshot` 토큰 계승). 결과적으로 화면에서 "지금 진행 중/대기인 활동"만 색이 튀고, 완료된 다수는 차분하다(GitHub Actions 미학: 성공=조용한 체크, 진행=눈에 띔).
- **M1 pipeline과의 의도적 divergence**: pipeline 섹션은 노드 3개짜리 소수 결정 행이라 converged=accent로 진행을 보여줬지만, timeline은 20행 log → 같은 매핑이면 accent 벽이 된다. cardinality + scan 목적 차이로 본 섹션만 converged=quiet 채택(DESIGN.md에 근거 명문화).
- 각 마커는 `<span class="tl-icon" aria-hidden>` + `<span class="sr-only">수렴|진행</span>` 병행. 2-상태 map(icon/cls/label) — `converged: {icon:'✓', cls:'tl-done'(ink/muted), label:'수렴'}`, `pending: {icon:'◐', cls:'s-stale'(loud), label:'진행'}`.

### D5 — markdown 텍스트 유지 (정보 동치, PRD Open Question 3 해소)
markdown은 SVG/rail 불가 → 기존 `- {rel} · \`gate\`/\`decision\` · ✓ 수렴` 형태 유지. 이미 ✓/◐ 형태(shape)를 병행하므로 정보 동치. chart/rail은 HTML 전용. **`audit-timeline.js`의 md 출력 라인은 변경 없음** (briefing/footnote md도 그대로).

### D6-항목수 — timeline은 collapse-to-3 미적용, flow log 근거 (critique F2 흡수)
Output Constraint 4(top 3 + `<details>+N more`)는 **list-of-N 결정 surface(Open Questions/action items/risk table)** 대상이다. timeline은 시간순 활동 flow log — 노드를 3개로 collapse하면 PRD Success Metric "활동 흐름 시각화: 시간순 step chart"가 깨진다(흐름은 contiguity 필요). 대신 **"quiet by default"는 기존 메커니즘이 이미 충족**: `MAX_ROWS_LIVE=20` cap + `+N older` footnote + archived 행 desaturate + 보관 footnote. 즉 무한 확장이 아니라 상한·축약이 이미 존재. 이 근거를 DESIGN.md에 명문화해 lint(H15 등)와 충돌하지 않음을 기록.

(원 D6은 아래 progressive enhancement 항목 — 식별자 충돌 없도록 본 항목은 "D6-항목수"로 표기.)

### D6 — progressive enhancement는 기존 vendored jQuery 재사용, baseline-first
baseline(CSS rail + 노드 마커)이 **JS 없이 완전 동작**. 선택적 enhancement(노드 hover/focus highlight)는 M1이 이미 inline한 vendored jQuery 블록에 additive로 얹는다 — **외부 script URL 0 invariant 유지(M1 F2 보안)**. jQuery 로드 게이트(`html.js`의 `if (pipeline && JQUERY_SLIM)`)는 timeline이 항상 렌더되므로 그대로 두거나 `(pipeline || timeline)`로 좁게 확장 — enhancement는 best-effort, 미로드 시 baseline 유지.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Section module 시그니처 | `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js:62` | `renderAuditTimeline(model, formatUtils, now, opts)` → `{ md, html }` |
| 노드 상태 map (icon/cls/label) | `plugins/mccp/scripts/lib/renderer/sections/pipeline.js:21-25` `NODE` | 색+아이콘+sr-only 병행 |
| HTML 노드 마커 조립 | `plugins/mccp/scripts/lib/renderer/sections/pipeline.js:117-132` `rowHtml` | `<span class="...">` + `aria-hidden` icon + `.sr-only` label |
| 세로/connector CSS (border-left 회피) | `plugins/mccp/scripts/lib/renderer/html.js:184-204` `.pipe-*` | background 라인, `border-radius`는 노드만 |
| design-lint carve-out | `plugins/mccp/scripts/lib/renderer/output-constraints.js:18-20` `H3_CARVEOUT` | 컴포넌트 클래스 한정 추가 + 주석 근거 |
| enhancement inline script (외부 src 0) | `plugins/mccp/scripts/lib/renderer/html.js:22-25,302-308` `PIPELINE_SCRIPT` | vendored-inline, additive |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js` | node 상태 매핑/escape/a11y/빈 입력 fixture → render → assert |
| 비-색 severity | `plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js` | 색 외 아이콘/형태 병행 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | `renderRow` HTML을 step-chart rail 구조(`<li class="tl-step">` + 노드 마커 + `.tl-body`)로 재구성, wrapper `<ul class="timeline tl-rail">`, footnote li → `tl-note`. **데이터 로직·md 출력 불변(D3/D5).** 2-상태 노드 map 추가 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `.tl-rail`/`.tl-step`/`.tl-node`/`.tl-icon`/`.tl-body` CSS — 세로 connector `::before` background 라인(border-left 미사용), 노드 원형 마커. (선택) enhancement 스크립트에 `.tl-step` hover 추가 |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | `H3_CARVEOUT`에 `tl-node` 추가(노드 마커 한정). H4는 background 라인이라 carve-out 불필요가 목표 — 구현 후 위반 0 확인 |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H3 carve-out 행에 `tl-node` 추가 + timeline step-chart design intent + 세로 rail(::before, border-left 미사용) 결정 근거 |
| `plugins/mccp/scripts/lib/renderer/tests/timeline-chart.test.js` | CREATE | 노드 상태 매핑(converged→✓, pending→◐), archived desaturate 노드, footnote는 노드 없는 tl-note, 빈 입력 fail-open, 색+아이콘+sr-only 병행, escape. M1 `pipeline.test.js` mirror |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | carve-out이 tl-node 통과 + timeline rail H4 위반 0(background 라인) + 일반 chrome H3/H4 위반은 여전히 검출 |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | 합성 HTML에 timeline step-chart(tl-rail/tl-step) 포함 + raw/masked 렌더 모두 외부 script URL 0(M1 F2 invariant 유지) |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATE(필요 시) | 기존 audit-timeline assert(md 내용 + blockquote)는 회귀 가드로 유지, 신규 tl-step 구조 assert 추가 |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js` | UPDATE | timeline 노드가 색 외 아이콘/sr-only 병행하는지 assert 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.13.0` → `1.14.0` (minor — 섹션 시각 변환) |
| `CHANGELOG.md` | UPDATE | [1.14.0] 행 추가 |

## Tasks

### Task 1: audit-timeline.js step-chart 변환 (데이터 로직 불변)
- **Action**:
  - 2-상태 노드 map 추가(module 상단, **emphasis 반전 — critique F1**): `{ converged: {icon:'✓', cls:'tl-done', label:'수렴'}, pending: {icon:'◐', cls:'s-stale', label:'진행'} }`. converged는 quiet(`tl-done` = ink/muted, accent 미사용), pending만 loud(`s-stale`). archived는 row 클래스로 한 단계 더 desaturate.
  - `renderRow(r, isArchived)`의 **HTML 출력만** 재구성:
    - `<li class="tl-step audit-row[ from-snapshot]">` →
      - 노드 마커: `<span class="tl-node {cls}"><span class="tl-icon" aria-hidden="true">{icon}</span><span class="sr-only">{label}</span></span>`
      - body: **`<div class="tl-body">`**(block container — Codex F2: phrasing `<span>`은 flow content인 `<blockquote>`를 감쌀 수 없음 → non-conforming HTML)`<span class="rel">{rel}</span>, <code>{gate}</code>/<code>{decision}</code>, <span class="conv[ pending]">{verdictMark}</span>{briefing blockquote 그대로}</div>`. inline 요약은 nested `<span>`로 유지, blockquote는 `<div>` 직속 자식.
    - 노드 status = `r.converged === true ? 'converged' : 'pending'`.
  - wrapper: `return { ..., html: '<ol class="timeline tl-rail">' + htmlLines.join('') + '</ol>' }`. (순서 의미 있는 시간순 → `<ol>`; `<ul>` 유지해도 무방하나 의미상 `<ol>` 권장 — 단 기존 CSS `.timeline`/`ul` 셀렉터 영향 확인.)
  - footnote `<li>`(archived footnote, +N older, missing-day, mask hits, was_stale)는 step이 아니므로 `class="tl-note muted ..."`로 — 노드 마커 미부착(rail에 가짜 step 안 생기게).
  - **md 출력 라인은 일절 변경 금지(D5).** snapshot/cap/정렬/footnote/briefing/placeholder 제어 흐름 변경 금지(D3).
- **Mirror**: `pipeline.js` `NODE`/`rowHtml`, 기존 `renderRow` 구조.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/timeline-chart.test.js plugins/mccp/scripts/lib/renderer/tests/sections.test.js plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js`

### Task 2: html.js CSS rail + 노드 + enhancement
- **Action**:
  - `LAYOUT`에 추가:
    - `.tl-rail { list-style:none; padding-left:0; margin:0; position:relative; }`
    - `.tl-step { position:relative; display:flex; gap:0.5rem; align-items:flex-start; padding:0.35rem 0; }`
    - 세로 connector: `.tl-rail::before { content:''; position:absolute; left:{노드 중심}; top:0; bottom:0; width:2px; background:var(--border); }` — **border-left 절대 미사용(H4)**. (per-step stub 방식 택1.)
    - `.tl-node { position:relative; z-index:1; display:inline-flex; align-items:center; justify-content:center; width:1.4rem; height:1.4rem; border-radius:999px; background:var(--surface); flex-shrink:0; }` (border-radius → H3 carve-out 대상)
    - `.tl-node .tl-icon { font-size:0.9rem; }`. **상태색(critique F1 반전)**: converged=`.tl-done { color:var(--ink); }` 또는 `var(--muted)`(quiet, accent 미사용), pending=기존 `.s-stale`(loud). **신규 강조색 0**(기존 토큰만). accent(`--accent`)는 timeline 노드에 미사용 → viewport당 accent ≤ 1 보존.
    - `.tl-body { flex:1; min-width:0; }`, `.tl-note { color:var(--muted); list-style:none; }`(노드 없음 → rail 위 빈 step 방지: `.tl-note { padding-left:1.9rem; }` 등으로 정렬).
    - archived: 기존 `.from-snapshot` 토큰이 desaturate 적용되게 노드도 포함.
  - (선택) enhancement: M1 `PIPELINE_SCRIPT` 블록에 `.tl-step` hover/focus highlight 추가(jQuery 존재 시). 외부 script URL 0 유지. 미로드 시 baseline.
  - `prefers-reduced-motion` 기존 블록이 이미 transition/animation 차단 — rail에 애니메이션 도입 시 존중.
- **Mirror**: `html.js` `.pipe-*` 블록 + `PIPELINE_SCRIPT`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js`

### Task 3: output-constraints.js carve-out + DESIGN.md
- **Action**: `H3_CARVEOUT` 정규식에 `tl-node` 추가(`pipe-node` 옆). H4는 background 라인이라 carve-out 추가 불필요가 목표 — `output-constraints.test.js`로 timeline rail H4 위반 0 확인. 불가피하게 걸리면 그때만 carve-out. DESIGN.md H3 carve-out 행에 `tl-node` + 근거(타임라인 step 노드 affordance) 추가, timeline step-chart design intent + 세로 rail(::before background, border-left 미사용) 절 추가.
- **Mirror**: `output-constraints.js:18-20`, `DESIGN.md` v1.13.0 pipe-node 행.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js`

### Task 4: 테스트 (신규 + 회귀)
- **Action**: `timeline-chart.test.js` 신규(노드 상태 매핑/archived desaturate/footnote tl-note 비-step/빈 입력/색+아이콘+sr-only/escape). **briefing 행 containment 검증(Codex F2)**: `briefing_summary` 있는 fixture를 렌더 후 `<blockquote class="briefing">`가 `tl-step` 행 안(`.tl-body` 직속)에 남는지 — 단순 substring이 아닌 구조 검증(정규식으로 `<li class="tl-step[^"]*">[\s\S]*?<blockquote` 포함 + `<span class="tl-body"` 부재 assert로 span-wrap 회귀 차단). `render-integration`/`a11y-severity-non-color`/`output-constraints`/`sections` 업데이트. **전체 renderer 스위트 회귀 통과 필수**(snapshot/cap/footnote 로직 보존 증명).
- **Mirror**: `pipeline.test.js`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/`

### Task 5: plugin.json + CHANGELOG
- **Action**: version `1.13.0` → `1.14.0`. CHANGELOG [1.14.0] 행(활동 로그 step chart + 세로 rail + tl-node H3 carve-out + 데이터 로직 보존).
- **Mirror**: CHANGELOG [1.13.0] 행 포맷.
- **Validate**: `node -e "process.exit(require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.14.0'?0:1)"`

## Validation
```bash
# 전체 renderer 스위트 (회귀 가드 — snapshot/cap/footnote 로직 보존)
node --test plugins/mccp/scripts/lib/renderer/tests/
# 신규 + carve-out
node --test plugins/mccp/scripts/lib/renderer/tests/timeline-chart.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js
# 실제 렌더 산출물
node plugins/mccp/scripts/derive/cli.js render
grep -q 'class="timeline tl-rail"' .claude/cache/status.html && echo "timeline step-chart OK"
# 외부 script URL 0 (M1 F2 보안 invariant)
grep -qE 'https?://[^"]*"[^>]*></script>|<script[^>]*src=' .claude/cache/status.html && echo "EXTERNAL SCRIPT FOUND (FAIL)" || echo "no external script OK"
# 버전
node -e "process.exit(require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.14.0'?0:1)"
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| renderRow 재구성이 snapshot/footnote/briefing 로직 회귀 | 중 | HTML 문자열·wrapper·footnote 클래스만 변경, 제어 흐름 불변(D3). 전체 스위트 회귀 통과 필수 |
| 세로 rail `::before`가 H4(border-left)에 걸림 | 중 | background 라인으로 구현(D2), output-constraints.test.js로 H4 위반 0 assert |
| tl-node carve-out 과확장으로 일반 chrome H3 누락 | 중 | carve-out을 `tl-node` 클래스 한정 + "일반 chrome H3 위반 여전히 검출" assert |
| footnote li가 rail 위 빈 가짜 step으로 보임 | 중 | footnote는 `tl-note`(노드 미부착) + 들여쓰기 정렬, render-integration 시각 확인 |
| 30+ 노드 세로 rail 길이 과다 | 저 | 기존 `MAX_ROWS_LIVE=20`+archived 10 cap이 이미 제한, +N older footnote |
| markdown 정보 손실 | 저 | md 출력 불변(D5), ✓/◐ 형태 병행 유지 |

## Acceptance
- [ ] 모든 Task 완료
- [ ] 전체 renderer 테스트 스위트 통과 (신규 + 회귀)
- [ ] 데이터 로직(snapshot/cap/footnote/briefing/md) 보존 — 시각 레이어만 변경(D3/D5)
- [ ] 세로 rail이 JS 없이 동작 (baseline-first, progressive enhancement)
- [ ] 외부 script URL 0 (M1 F2 보안 invariant 유지)
- [ ] design-lint carve-out이 `tl-node` 한정 — 일반 chrome H3/H4 위반 여전히 검출, timeline rail H4 위반 0
- [ ] 노드 색 + 아이콘 + sr-only 병행 (a11y, 색 단독 금지)

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` Output Constraints Read 완료.
- impeccable: full-skill은 NO_PRODUCT_MD(init 요구)로 미실행 → §3.9 fallback으로 4 Output Constraints + 일반 규칙 직접 critique.
- 라운드: 2회 (R0 ESCALATE → R1 CONVERGED). verdict=**converged**.
- R0 findings → 해소:
  | Finding | Severity | 해소 |
  |---|---|---|
  | 20행 timeline converged=accent → accent-green 벽, "개입 필요" scan 무너짐 | MEDIUM-HIGH | D4 — emphasis 반전: converged=quiet(tl-done, ink/muted, accent 미사용), pending(◐)만 loud(s-stale). viewport당 accent ≤ 1 보존. M1과 의도적 divergence(cardinality 차이) |
  | timeline 20행 expanded가 "top 3 + collapse"(OC4)와 충돌 | LOW | D6-항목수 — timeline은 flow log(list-of-N 아님), collapse-to-3은 step chart 흐름 파괴. 기존 MAX_ROWS_LIVE=20 cap + +N older + archived desaturate가 이미 "quiet by default" 충족. DESIGN.md 명문화 |

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.11.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 absorption, MCCP_GATE_ROUND_CAP=1)
- 합치 결론: Codex verdict=`needs-attention` (1 HIGH + 1 MEDIUM) → 2건 모두 R1 absorb → STATE.md reconcile + plan 수정 완료
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 STATE.md `chain_aborted=true`+`session_end_imminent=true`가 in-progress M2 chain을 short-circuit (auto-chain.js 조기 abort) | HIGH | ACCEPT_NOW | 실제 결함 — 이전 v1.4.2 세션 stop_loop_pass 잔재. state-writer.update()로 두 flag false 복원, dashboard/automation 정합. |
  | F2 `<span class="tl-body">`가 `<blockquote>`(flow content) 감싸 non-conforming HTML (briefing 행 한정) | MEDIUM | ACCEPT_NOW | 실제 결함 — phrasing span은 flow blockquote 못 감쌈. Task 1 `<div class="tl-body">`로 전환 + Task 4에 briefing containment 구조 검증 추가. |
- Deferred to backlog: 0
- Open Questions: 없음 (2건 모두 R1 absorb, DIVERGENT_UNRESOLVED 없음)
- Codex thread 참조: `019eef83-dcf4-7d33-b35b-0c1be670b5ab`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (시각-only 변환 + ::before background connector(H4 회피) + tl-node H3 carve-out + emphasis 반전 + 데이터 로직 보존 모두 plan-codex R1에서 absorb, F1 STATE.md reconcile + F2 div 전환 포함). No new implement-time architectural decision (CSS 값·node map 구조는 구현 detail). Cross-gate dedupe applied. 구현 산출물의 design 품질은 renderer output-constraints lint(H1-H16) + 테스트로 mechanical 강제.
