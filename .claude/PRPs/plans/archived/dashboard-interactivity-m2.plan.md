# Plan: Dashboard Interactivity — M2 개요 진행중 마일스톤 + worktree

**Source PRD**: `.claude/prds/dashboard-interactivity.prd.md`
**Selected Milestone**: M2 — 개요(기본 라우트)에서 worktree별 진행중 마일스톤을 한눈에 본다 (진행중 판정 소스·정렬·상한 plan 결정)
**Complexity**: Medium

## Summary

개요(`route-overview`)는 현재 hero-panel + widget-grid(in-progress/blocked/deferred/risks 카운트 카드)만 보여주고, **worktree별** 진행 정보는 `route-activity`의 "멀티세션 진행" 표에만 있다. in-progress 위젯은 *이 repo*의 plan-body status를 집계할 뿐 — 멀티-worktree dogfood에서 "어느 worktree가 지금 어느 마일스톤에 있나"는 개요에서 안 보인다. M2는 derive `worktrees` source(이미 worktree별 `milestone_hint`/`active`/`blocked`/`current_gate`/`last_activity`/`is_self` 산출)를 **재스캔 없이** 재사용해, `renderMultiSession`이 in-progress worktree projection(`result.overview`)을 추가로 방출하고, 개요에 "진행 중 마일스톤" 패널을 신규 노출한다. STATUS.md `## 대시보드`에 동등 plain-text를 동기. 전부 read-only 렌더 변경 — 신규 스캔·서버 mutation·derive correlation 재설계 없음.

## Open Questions 해소 (PRD M2 plan-결정 위임 항목)

- **"진행중" 판정 소스** = derive `worktrees` source(worktree-scoped). worktree가 in-progress ⟺ **(i) `item.active === true`**(worktrees source의 14일-내-활동 freshness gate, worktrees.js:253-256) **AND (ii)** 마일스톤 신호 존재(`milestone_hint` OR `current_gate`) **AND (iii) NOT just-shipped**(`current_gate === 'mccp-pr-codex' && item.gate_converged === true` = 직전 ship 게이트 수렴 = 마일스톤 *완료*, 진행중 아님). 마일스톤 라벨 = `milestone_hint`(STATE.md `goal`/`inProgress`/`plan[0]` firstLine, worktrees.js:187-190), 보조 = `current_gate`. **repo-wide PRD body `status: in-progress` row는 채택 안 함** — in-progress 위젯이 이미 커버 + worktree 축 아님. <!--mccp:resolved reason="verified: worktrees 3-gate in multi-session.js:298-306, tests ov7/ov8/ov9 pass" at="2026-07-01T05:17:22.483Z"-->
  - **Codex F1 (HIGH, ACCEPT_NOW) 흡수 — lifecycle-fresh gate**: 원안의 `worktreeStatusKind !== 'idle'` 단독은 stale STATE.md / 이미 ship된 마일스톤을 "진행중"으로 표시할 수 있었다(PRD Risk "거짓 진행중" 재현). 조건 (i) `active` gate가 **stale worktree**(활동 없는 오래된 goal)를 제외하고, 조건 (iii) just-shipped 제외가 **완료된 마일스톤**(pr-codex 수렴)을 제외한다 — worktrees source가 이미 제공하는 freshness + closure 신호로 PRD의 "milestone-history 완료 cross-check" 의도를 만족. milestone_hint 자유텍스트 ↔ plan basename 완전 매칭은 worktrees source가 plan 경로를 노출 안 해 fuzzy → per-worktree latest-receipt closure(pr-codex 수렴)를 tractable closure 신호로 채택(전체 문자열 cross-check는 fuzzy, defer). <!--mccp:resolved reason="이미 처리됨" at="2026-07-01T05:12:46.652Z"-->
  - **degraded/error 분리**: degraded/error 행은 milestone 신호(조건 ii)가 없으면 이미 제외(순수 error 행은 milestone 패널 비대상 — 멀티세션 표가 별도 surface). degraded **AND active AND milestone_hint** 인 행만 "stuck-in-progress"로 포함(error는 드로어가 surface). degraded-only가 진짜 active를 outrank하던 경로는 (i) active gate가 stale degraded를 제외하므로 차단. <!--mccp:resolved reason="verified: eligibility excludes pure-error rows (needs milestone signal), kindMeta degraded rank 2" at="2026-07-01T05:17:22.483Z"-->
- **정렬** = `KIND_META.rank` 내림차순(blocked 3 > degraded 2 > active 1; idle 0은 (i) active gate + 필터로 제외) → 동률은 `last_activity` recency desc(multi-session.js의 `activityRank` 재사용). **포함된 모든 행이 active(fresh)이므로** blocked>degraded>active outrank는 fresh 행들 간 정당한 actionability 우선순위(stale 비교 아님 — Codex F1 우려 해소). self는 마커("이 worktree")로 식별, 별도 pin 안 함(순서는 status/recency 결정 — 결정성 우선). <!--mccp:resolved reason="verified: rank desc + activityOrd recency sort in multi-session.js:341, tests ov2/ov3 pass" at="2026-07-01T05:17:22.483Z"-->
- **상한** = `OVERVIEW_CAP = 3` worktree 표시(Output Constraint 4 "top 3 expanded" anchor 정합 — Critique F3 흡수). 초과 시 foot affordance "활동 · 기록에서 +N개 더 보기"(`#route-activity` 링크, pin-alert affordance 미러). canonical 전체 목록은 활동 route 멀티세션 표 = loud-on-demand(개요에 `<details>` 중복 회피). silent cap 금지 — total/shown을 projection에 보존하고 foot에 명시. <!--mccp:resolved reason="verified: OVERVIEW_CAP=3 slice + overflow foot link to route-activity, test ov4 pass" at="2026-07-01T05:17:22.483Z"-->
- **개요 패널 visibility = 멀티세션 *표* visibility와 분리**(Codex F2, MEDIUM, ACCEPT_NOW 흡수). 원안은 overview를 `multiSession` present에 gating했으나 `renderMultiSession`은 `count===1 && healthy`에서 null 반환 → **단일 worktree(가장 흔한 케이스)의 active 마일스톤이 개요에 안 뜨는** 결함. 해소: `renderMultiSession`이 scanned 시 **모든** item에 대해 projection(+detail)을 *표 early-return 앞에서* 1회 계산하고, healthy-single이어도 eligible overview item이 있으면 `{ overview, details }`(표 md/html 없음)를 반환. 표 자체는 기존대로 healthy-single에서 hidden(md/html 미생성). html.js/markdown.js는 멀티세션 *표 패널*을 `multiSession.html`/`multiSession.md` 존재로 gating(`!!multiSession` 아님), 개요는 `multiSession.overview`를 독립 소비. scan off / eligible 0 → `null`(완전 부재). <!--mccp:resolved reason="verified: html/md visibility gating separated (multiSession.html/.md vs .overview), test ov10 pass" at="2026-07-01T05:17:22.483Z"-->

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Producer SSoT | `multi-session.js:195-276` | worktree per-item loop(kind/meta/milestone_hint/activity/detailId 1회 계산). overview projection은 **같은 loop**에서 파생 — 재스캔/재계산 0 |
| Status SSoT | `multi-session.js:67-74` `KIND_META` | icon/label/tone/**rank** 단일 출처. overview 정렬·표시 모두 이 테이블 소비(색/아이콘/라벨/rank 한곳) |
| Marker strip | `multi-session.js:43-53` `plainSummary` | `milestone_hint`는 truncate 전 inline 마커 strip(짝 잃은 `**` raw 누출 = H16 금지). 개요 셀도 동일 |
| Overview block 빌더 | `html.js:905-915` `renderWidgetCards` / `html.js:921` `renderHeroPanel` | route-overview 안 커스텀 블록 빌더. 신규 `renderActiveMilestones`는 동일 위치·동일 시그니처 컨벤션 |
| Graceful hide | `multi-session.js:153-172` | `scanned!==true` → null. healthy-single은 **표** hidden이되 eligible overview 있으면 `{overview, details}` 반환(F2 분리). 표 패널은 `multiSession.html` 존재로 gating |
| Lifecycle-fresh | `worktrees.js:253-256`(active) + `:224-238`(gate_converged) | overview eligibility는 active(freshness) + NOT pr-codex-converged(closure)로 거짓 진행중 차단(F1) |
| Overflow affordance | `html.js:1258-1264` pin-alert `<a href="#route-pipeline">` | 초과분 → route 링크 foot. "활동 · 기록에서 보기" 미러 |
| Drawer 재사용 | `html.js:1351` drawerMap aggregate(`multiSession.details`) | overview 행이 **동일 `detailId`** 참조 → 기존 worktree 드로어 재사용(신규 detail 0) |
| Tests | `tests/multi-session.test.js`(wtModel/item 픽스처) · `tests/dashboard-overview.test.js`(renderFull 동등) | `node --test` 렌더러 스위트. projection은 multi-session.test, 개요 패널은 dashboard-overview.test 확장 |
| Design-lint | `output-constraints.js` H10/H15/H16/H17 | em-dash 금지(H10)·h4+ 금지(H15)·raw 마커 금지(H16)·non-nested panel(H17) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/multi-session.js` | UPDATE | 표 early-return 앞에서 per-item detail+projection 1회 계산 → `result.overview = { items, total, shown }` 부착(healthy-single이어도 eligible 시 `{overview, details}` 반환 — F2). eligibility = active(F1 freshness) + milestone 신호 + NOT just-shipped(F1 closure). idle/stale 제외 + rank/recency 정렬 + `OVERVIEW_CAP=3` slice. 기존 5컬럼 표/filterOptions **불변** |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `renderActiveMilestones(multiSession, formatUtils)` 추가(route-overview용 `.panel`). route 1 조립(`html.js:1290-1293`)에서 `renderWidgetCards` 뒤 inject. 멀티세션 표 패널 present 판정 `!!multiSession` → `!!(multiSession && multiSession.html)`(F2, html.js:1193). near-monochrome + status는 icon+label+소형 dot(widget-card dot discipline). footer `v1.18.19 → v1.18.20` |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | `## 대시보드` 섹션(markdown.js:55-58)에 `grid.md` 뒤 overview 진행중 worktree 라인 append(plain-text 동등). `## 멀티세션 진행` 가드 `if (multiSession)` → `if (multiSession && multiSession.md)`(F2, markdown.js:79 + anchor:32). footer `v1.18.19 → v1.18.20` |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.19 → 1.18.20`(PRD 내 단일 milestone = patch, §3.7) |
| `plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js` | UPDATE | Task 1 validate — `result.overview` projection: idle 제외 · rank/recency 정렬 · `OVERVIEW_CAP` slice · self 마커 · detailId 재사용 · healthy-single hide 시 overview 부재 |
| `plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js` | UPDATE | Task 2/3 validate — route-overview에 "진행 중 마일스톤" 패널 html + overflow foot 링크 + STATUS.md `## 대시보드` plain-text 동등 + design-lint clean(H10/H16) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 단언 `v1.18.19 → v1.18.20`(i18n-surface.test.js:123) |

## Tasks

### Task 1: in-progress overview projection + visibility 분리 (`multi-session.js`)
- **Action (구조)**: `renderMultiSession`을 재구조화 — scanned 확인 + 0-item degraded notice(불변) 뒤, **healthy-single early-return 앞에서** items를 1회 순회해 (a) per-worktree detail(`buildWorktreeDetail` + `addDetail` → `id`)과 (b) overview 후보를 모두 계산한다. 이후:
  - `healthy-single`(count===1 && isHealthy): 표 md/html 미생성. eligible overview 있으면 `{ overview, details }` 반환, 없으면 `null`(완전 부재).
  - `count>=2` 또는 unhealthy: 기존 5컬럼 표 loop 산출 + `result.overview` 부착(표/filterOptions/foot 불변).
  - detail/projection 계산을 표 loop와 공유(단일 pass, 재스캔/중복계산 0).
- **Action (eligibility)**: worktree가 overview 후보 ⟺ **(i) `it.active === true` AND (ii) (`it.milestone_hint` OR `it.current_gate`) AND (iii) NOT (`it.current_gate==='mccp-pr-codex' && it.gate_converged===true`)**(F1 lifecycle-fresh gate). 후보 push 형태: `{ label, isSelf, kind, icon: meta.icon, statusLabel: meta.label, milestoneHint: plainSummary(it.milestone_hint), gate, activity, rank: meta.rank, activityOrd, detailId: id }`. 정렬 `rank` desc → `activityOrd` asc → `total=후보.length` → `slice(0, OVERVIEW_CAP)` → `overview = { items: shown, total, shown: shown.length }`(후보 0 → overview 미부착). `OVERVIEW_CAP = 3` 모듈 상수.
- **Constraint**: 기존 표 행/`filterOptions`/foot 출력은 불변. healthy-single이 **eligible overview 없을 때** `null` 유지(기존 test (b) 픽스처는 milestone_hint/current_gate 없음 → 후보 0 → null, 회귀 없음). `detailId`는 `addDetail` 반환 `id` 재사용(신규 detail 0).
- **Mirror**: `multi-session.js:153-172`(graceful-hide/early-return) + `:182-186`(activityRank 1회 스캔) + `:215-220`(addDetail id) + `:43-53`(plainSummary)
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js`

### Task 2: 개요 "진행 중 마일스톤" 패널 (`html.js`)
- **Action**: `renderActiveMilestones(multiSession, formatUtils)` 추가 — `multiSession && multiSession.overview && overview.items.length` 아니면 `''` 반환(graceful hide). 그 외 `.panel`("진행 중 마일스톤") 안 worktree 행 목록: 각 행 = status icon + 라벨(self면 `<strong>이 worktree</strong>`) + milestoneHint(`escapeHtml`, plain) + gate/activity 보조 + `data-detail-id`(드로어 재사용). `total > shown` 이면 `panel-foot`에 `<a href="#route-activity">활동 · 기록에서 +N개 더 보기</a>`(escapeHtml count). route 1 조립(`html.js:1290-1293`)에서 `renderWidgetCards(...)` 뒤에 concat.
- **Design (Constraint 2, 강조색 ≤1)**: status는 **icon(KIND_META) + label 텍스트 + 소형 dot**(widget-card `dot-bad`/`dot-warn`/`dot-mute` discipline 재사용) — 행 전체 색칠/colored-text span 금지. hero verdict가 viewport 유일 loud. near-monochrome 토큰만(신규 accent 0).
- **Design (Constraint 1, 정보 위계)**: 개요 = hero(primary) → widget-grid(status) → 진행 중 마일스톤(detail). 패널 제목 `<h3>`(H17 non-nested, h4+ 미방출 H15).
- **F2 visibility 분리**: 활동 route 멀티세션 *표* 패널 present 판정을 `!!multiSession` → **`!!(multiSession && multiSession.html)`**로 변경(`html.js:1193`). healthy-single이 `{overview}`(html 없음) 반환 시 표 패널은 hidden 유지하되 개요 패널은 `multiSession.overview`로 독립 렌더. drawerMap aggregate(`html.js:1351`)는 `multiSession.details`를 그대로 소비(healthy-single도 details 존재 → 드로어 동작).
- **Mirror**: `html.js:905-915` renderWidgetCards · `html.js:1001` renderPanel · `html.js:1190-1200` activityPanels present 판정 · `html.js:1258-1264` pin-alert foot 링크
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js`

### Task 3: STATUS.md `## 대시보드` 동등 (`markdown.js`)
- **Action**: `## 대시보드` 섹션(markdown.js:55-58)에서 `grid.md` push 뒤, `multiSession && multiSession.overview && overview.items.length` 이면 소제목 라인(예 `**진행 중 마일스톤 (worktree별)**`은 H10/H16 위반 위험 — plain 라벨 `진행 중 마일스톤 (worktree별):`)과 worktree당 한 줄(`- {icon} {label} · {milestoneHint} · {gate/activity}`) append. overflow 시 `- … 외 +N (활동 · 기록 참조)`. icon/label/hint는 projection의 이미-plain 필드 소비(html과 동일 소스 = 정보 동등).
- **Constraint**: 멀티세션 표(`## 멀티세션 진행`, markdown.js:79-86)와 일부 중복되나 의도적 — 개요는 in-progress 컴팩트 요약, 멀티세션은 전체 표. STATUS.md 동등 불변 충족.
- **F2 visibility 분리**: `## 멀티세션 진행` 섹션 가드를 `if (multiSession)` → **`if (multiSession && multiSession.md)`**(markdown.js:79)로 변경 — healthy-single이 `{overview}`(md 없음) 반환 시 빈 멀티세션 섹션 미방출. anchor 줄(markdown.js:32) 동일 가드. 개요 overview 라인은 `multiSession.overview` 독립 소비.
- **Mirror**: `markdown.js:55-58`(대시보드 섹션) + `markdown.js:79-86`(멀티세션 가드) + `multi-session.js` md 행 컨벤션
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js`

### Task 4: 회귀 가드 테스트 확장
- **Action**:
  - `multi-session.test.js`: (1) 2 active + 1 idle(active:false) → overview.items에 idle 제외(active 2만). (2) blocked+active & active → blocked 먼저(rank). (3) 동률 rank → activity 최신 먼저. (4) `OVERVIEW_CAP` 초과(5 active in-progress) → `items.length===3` + `total===5`. (5) self 항목 label "이 worktree". (6) overview item.detailId === 해당 표 행 detailId(재사용). **(7, F1) stale 제외**: active:false + milestone_hint 존재 → overview 후보 아님(idle gate). **(8, F1) just-shipped 제외**: active + `current_gate:'mccp-pr-codex'` + `gate_converged:true` → 후보 아님. **(9, F1) milestone 신호 없음**: active + milestone_hint·current_gate 모두 null → 후보 아님. **(10, F2) healthy-single + active + milestone_hint** → `r.overview.items.length===1` & 표 html 미생성(`r.html` falsy/empty), 기존 test (b)(milestone 없는 healthy-single)는 `r===null` 유지.
  - `dashboard-overview.test.js`: renderFull 픽스처에 worktrees source(scanned:true, 2+ active in-progress items) 추가 → route-overview에 "진행 중 마일스톤" 패널 + 행 + (초과 시) foot 링크. **healthy-single + milestone → 패널 present(F2)** + 활동 route 멀티세션 표 패널 부재. worktrees 부재 → 패널 부재(graceful). STATUS.md `## 대시보드`에 worktree 라인 동등. `r.design_constraint_violations` deepEqual `[]`.
- **Mirror**: `tests/multi-session.test.js:22-35`(wtModel/item) · `tests/dashboard-overview.test.js:148-177`(renderFull)
- **Validate**: 아래 Validation 전체 스위트

### Task 5: version bump + footer 동기
- **Action**: `plugin.json` `1.18.19 → 1.18.20`. `html.js:1344` page-foot + `markdown.js:127` derived 줄 footer `v1.18.19 → v1.18.20` 동기. `i18n-surface.test.js:123` 단언 갱신.
- **Mirror**: §3.7 milestone PR 의무 체크리스트(plugin.json + footer 2곳 + 테스트 동기)
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 렌더러 전 스위트 (회귀 0 게이트)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 핵심 계약 집중
node --test \
  plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js \
  plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js \
  plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js \
  plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js \
  plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 산출물 육안 확인 (멀티 worktree 스캔 on, design-lint 0 포함)
MCCP_MULTI_SESSION_SCAN=1 node plugins/mccp/scripts/derive/cli.js render
```

## Design Critique

본 plan은 디자인 surface(개요 route-overview)를 건드린다. §3.9 Output Constraints 4축 준수:

1. **정보 위계 3단계** — 개요 = hero(primary) → widget-grid(status) → 진행 중 마일스톤(detail). 패널 제목 `<h3>`(H15 h4+ 미방출, H17 non-nested).
2. **강조색 viewport당 ≤1** — hero verdict가 유일 loud. 진행 중 마일스톤은 status를 icon+label+소형 dot(widget-card dot discipline)으로만 — colored-text span/행 색칠 0, 신규 accent 토큰 0.
3. **raw markdown 마커 금지** — `milestone_hint`는 `plainSummary` 마커 strip 후 `escapeHtml`. md 라벨도 plain(`(worktree별):` ASCII, em-dash 없음 H10).
4. **한 화면 항목 수 상한** — `OVERVIEW_CAP=3`("top 3 expanded" anchor) + 초과 시 `#route-activity` foot 링크(canonical full view = loud-on-demand, `<details>` 중복 회피; silent cap 금지, total/shown 보존).

**Critique 결과** (§3.9 retry loop): round 1, verdict **CONVERGED**. R0에서 3 finding — F1 MEDIUM(Constraint 2: 개요 hero 외 두 번째 loud accent 위험 → Task 2 widget-card dot discipline 흡수) · F2 LOW(Constraint 3: md 소제목 raw 마커 누출 → Task 3 plain ASCII 라벨 흡수) · F3 MEDIUM(Constraint 4: cap 수치 anchor 불일치 → `OVERVIEW_CAP` 4→3 정정 + route-link overflow 정당화 흡수). HIGH/CRITICAL/UNKNOWN 0 → oracle CONVERGED. 3 finding 모두 Task 1/2/3에 흡수(escalate 불요). PRODUCT.md 정합: Calm/Decisive/Compact + "Quiet by default, loud on demand"(개요 = quiet 요약, 활동 route = loud-on-demand 전체).

impeccable 워크플로(§3.10): plan stage는 렌더 UI 없음 → routing GUIDE recommend-only. 실제 layout/audit/clarify는 prp-implement에서(항목 14 = M3 워크플로, 본 M2는 critique loop만).

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only (plan stage never invokes).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable adapt` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` |
| polish | `/impeccable polish` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 개요에 worktree 진행 추가가 hero 외 두 번째 loud accent 생성(강조색 ≤1 위반) | 중 | status를 widget-card dot discipline(icon+label+소형 dot, colored-text 0)으로 — near-monochrome 토큰만. design-invariants/output-constraints 테스트로 가드 |
| projection 추가가 기존 multi-session 표/filterOptions/graceful-hide 회귀 | 중 | projection은 순수 additive(기존 경로 미변경). 기존 multi-session.test 전부 green 유지 단언 + 신규 projection 케이스 분리 |
| **(Codex F1, HIGH)** "진행중" 오판정(stale STATE.md / 완료 마일스톤을 진행중 표시) | 중 | eligibility 3중 gate — **active**(freshness, stale 제외) + milestone 신호 + **NOT pr-codex-converged**(closure, 완료 제외). milestone_hint/gate 없으면 후보 제외(보수적). multi-session.test (7)/(8)/(9) 회귀 픽스처 |
| 개요 md 추가가 STATUS.md plain-text 소비자 정보 손실/중복 혼란 | 낮 | projection 동일 plain 필드를 html/md 양쪽 소비(정보 동등) + 멀티세션 표는 별 섹션 유지(요약 vs 전체 명확) |
| **(Codex F2, MEDIUM)** 단일 healthy worktree active 마일스톤이 개요에서 누락 | 중 | overview projection을 표 visibility에서 분리 — healthy-single도 `{overview}` 반환, 표 패널만 `multiSession.html`로 gating. multi-session.test (10) + dashboard-overview.test healthy-single 케이스 |
| 단일 worktree(scan off/eligible 0)에서 패널이 빈 chrome 노출 | 중 | multiSession null OR overview.items 0 → `renderActiveMilestones` `''` 반환(graceful hide). dashboard-overview.test에 부재 케이스 |

## Acceptance

- [ ] `renderMultiSession`이 `result.overview`(in-progress projection: **active+milestone+NOT-just-shipped** eligibility, stale/완료 제외 — F1 · rank/recency 정렬 · `OVERVIEW_CAP=3` slice · detailId 재사용) 방출
- [ ] **(F2)** 개요 패널 visibility가 멀티세션 표 visibility와 분리 — healthy-single + active milestone도 개요에 노출(표 패널은 hidden), `multiSession.html`/`multiSession.md` gate
- [ ] route-overview에 "진행 중 마일스톤" 패널이 worktree별 진행중 마일스톤(라벨 + milestone_hint + status icon/label) 노출, self 마커, 초과 시 `#route-activity` foot 링크
- [ ] STATUS.md `## 대시보드`가 동일 worktree 진행중 라인을 plain-text 동등 노출
- [ ] graceful hide — scan off / eligible in-progress 0 → 패널 부재(빈 chrome 0)
- [ ] design-lint violations 0(H10/H15/H16/H17 통과) — 강조색 ≤1, status는 icon+label+dot
- [ ] 기존 multi-session 표/filterOptions/드로어 경로 회귀 0
- [ ] 렌더러 전 스위트 `node --test` green
- [ ] plugin.json + footer 2곳 version 1.18.20 동기
- [ ] Patterns mirrored, not reinvented(worktrees source/KIND_META/plainSummary/detailId 재사용, 신규 스캔 0)

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.17/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope 적용)
- 라운드 수: 1 (R1, `MCCP_GATE_ROUND_CAP` default=1)
- 합치 결론: Codex verdict=`needs-attention` — 2 finding(F1 HIGH lifecycle-freshness, F2 MEDIUM healthy-single 누락). 둘 다 R1에서 plan 변경으로 완전 흡수(code-level 불확실성 0) → 미해소 ACCEPT_NOW HIGH/CRITICAL 0이므로 R2 미escalate.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 in-progress projection이 lifecycle-fresh 아님 — stale STATE.md/완료 마일스톤을 진행중 표시, degraded가 active outrank | HIGH | ACCEPT_NOW | 정당 — PRD Risk "거짓 진행중" 재현. eligibility를 **active**(freshness gate) + milestone 신호 + **NOT pr-codex-converged**(closure)로 강화. worktrees source가 이미 제공하는 active/gate_converged 신호 재사용(신규 스캔 0). Open Questions 해소 + Task 1 + test (7)/(8)/(9)에 흡수. |
  | F2 healthy single-worktree active 마일스톤이 개요에서 silently hidden(overview를 표 visibility에 결합) | MEDIUM | ACCEPT_NOW | 정당 — PRD primary user "멀티 worktree" + 단일 worktree도 worktree-scoped 진행 노출 의도. overview projection을 표 visibility에서 분리(`renderMultiSession`이 healthy-single도 `{overview}` 반환, 표 패널만 `multiSession.html` gate). Open Questions 해소 + Task 1/2/3 + test (10)에 흡수. |
- Deferred to backlog: 0 → (없음)
- Open Questions: milestone_hint 자유텍스트 ↔ plan basename 전체 cross-check는 worktrees source가 plan 경로 미노출로 fuzzy → per-worktree latest-receipt closure(pr-codex 수렴)를 tractable 신호로 채택. 전체 문자열 매칭 cross-check는 defer(severity LOW, blocking 아님)
- Codex session 참조: threadId `019f082b-cfab-7050-bfb2-44fc7a36bb0b`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
