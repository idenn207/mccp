# Plan: Dashboard Multi-Session — 멀티세션 대시보드 섹션 (M2)

**Source PRD**: `.claude/prds/dashboard-multi-session.prd.md`
**Selected Milestone**: 2 — 멀티세션 대시보드 섹션 (UI consumer)
**Complexity**: Medium

## Summary

M1이 ship한 derive `model.sources.worktrees`(live cross-worktree 진행 모델)를 소비하는 **신규 전용 렌더 섹션** `sections/multi-session.js`를 추가한다. worktree당 1행(진행 요약 + 차단 강조 + self 마커), 행 클릭 시 우측 드로어 상세, 단일 worktree(또는 scan off)면 graceful hide(null), STATUS.md plain-text 동등본 포함. 기존 `active-sessions.js`(세션 존재 ledger, v1.4.0)는 무손상 유지 — 신규 섹션은 worker-fanout/active-sessions의 additive·graceful-hide·`s-{kind}` 색 cascade 패턴을 그대로 mirror하므로 신규 CSS 색 클래스·format-utils 변경 0.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Section shape | `sections/worker-fanout.js:34,43` | `render*(model, formatUtils) → {md, html, details?}` 또는 `null`(graceful hide). `s-{kind}` tr 색 cascade + 상태 셀 span(색+아이콘+텍스트 3중) |
| Graceful hide | `sections/active-sessions.js:41` | 데이터 0이면 `return null` — 단일 worktree 콘솔 조용함 보존 |
| self 마커 | `sections/active-sessions.js:59-70` | `is_self` → `<tr class="self">` + "**이 worktree**" 텍스트 마커(비-색, a11y-safe), 정확히 1행 |
| 상태 색 cascade | `html.js:385-390` (`.s-blocked`/`.s-in-progress`/`.s-stale`) | 신규 색 클래스 없이 기존 `.s-{kind}` 재사용. 차단=`s-blocked`(red, ≤1 우선), 진행=`s-in-progress`(accent), degraded=`s-stale`(amber) |
| 드로어 detail | `parsers/drawer-detail.js:170-187` (`buildMilestoneDetail`) + `sections/milestone-history.js:240-263` | `detailId(kind, parts)` 안정 키 + `addDetail` 충돌 hard-surface + `data-detail-id` 행 부여 + `renderDetailMd`로 STATUS.md 동등 |
| 드로어 KIND 등록 | `html.js:630` (`DRAWER_SCRIPT` KIND map) + `html.js:1024` (drawerMap 집계) | 신규 kind prefix(`wt:`) → KIND map 라벨 + 섹션 details를 drawerMap 집계 목록에 추가 |
| 섹션 배선 | `index.js:9,127,135` + `markdown.js:8` + `html.js:868,892-899` | import → `safeSection` → `sections` 배열 append → md/html 양쪽 destructure 끝에 추가 → 활동 route 패널 + 앵커 |
| 상대시각·escape | `format-utils.js:42` (`formatRelativeTime`) + `formatUtils.escapeHtml` | masked 값은 섹션이 재마스킹 안 함(model이 이미 마스킹) — escape만 |
| Tests | `tests/active-sessions.test.js`, `tests/milestone-history.test.js`, `tests/drawer.test.js` | `node:test` + graceful-hide/self/escape/drawer-detail 단위 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/multi-session.js` | CREATE | 섹션 본체 — `renderMultiSession` worktree당 1행 테이블 + 상태 kind + self 마커 + 드로어 detail + graceful hide + STATUS.md md |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATE | `buildWorktreeDetail(item, formatUtils)` 빌더 + `detailId` `wt` case(`wt:<path>`) 추가 |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | `renderMultiSession` import + `safeSection('multi-session', …)` + `sections` 배열 끝에 append |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | destructure 끝에 `multiSession` + 활동 영역에 `## 멀티세션 진행` 섹션(워커 다음, 최근 활동 앞) + 앵커 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | destructure 끝에 `multiSession` + `activityPanels`에 패널 추가(맨 앞, span2) + drawerMap 집계 목록에 `multiSession` + `DRAWER_SCRIPT` KIND map에 `wt:'worktree'` + `panelIcon` `/멀티세션|worktree/`→`ic-branch` + `.multi-session tr.self` 미세 CSS |
| `plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js` | CREATE | graceful-hide / 2+행 / self / 차단 강조 / degraded 행 보존 / 드로어 detail / escape / STATUS.md 동등 / masked 통과 |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` | UPDATE | `wt:` kind detail + KIND map 라벨 회귀 가드 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | patch bump `1.18.12 → 1.18.14`(§3.7 단일 milestone ship) |
| `plugins/mccp/scripts/lib/renderer/html.js`(footer) · `markdown.js`(footer) | UPDATE | page-foot / derived 줄 `v1.18.12 → v1.18.14` 동기화(§3.7 surface drift 방지) |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | 멀티세션 섹션의 read-side 소비 계약(소스·graceful-hide·상태 kind·드로어 kind) 1항목 추가 |
| `CHANGELOG.md` | UPDATE | v1.18.14 행 추가 |

## Tasks

### Task 1: `renderMultiSession` 섹션 본체 + graceful hide
- **Action**: `sections/multi-session.js` 신규 — `renderMultiSession(model, formatUtils, options)`:
  - 소스 read: `const wt = (model.sources||{}).worktrees`. **graceful hide(분리 규칙, Codex F1)**:
    - `wt` 없음 또는 `wt.scanned !== true` → `return null`(scan off 경로 조용).
    - `scanned === true && items.length === 0`:
      - `wt.degraded && wt.error` → **작은 degraded 알림 렌더**(`⚠ worktree 스캔 실패: <scrubbed error>` — scanned=true·count=0인 broken-scan의 진단 텍스트를 대시보드에 loud 노출). 정상 테이블은 아님(헤더/행 없음, 단일 notice md+html).
      - else → `return null`.
    - `scanned === true && items.length === 1`:
      - **healthy single** (`!item.degraded && !item.blocked && !item.error`) → `return null`(정상 단일 worktree = self, 공통 경로 조용).
      - **unhealthy single** (degraded OR blocked OR error 중 하나라도) → **테이블 렌더**(1행 — `items.length>=2`와 동일 경로). self의 STATE 손상·차단·per-worktree error가 verdict generic collapse에 묻히지 않게 loud 노출(Codex Impl-F1).
    - `items.length >= 2` → 정상 멀티세션 테이블 렌더.
    - 렌더 게이트 요약: `render := (items.length>=2) OR (items.length===1 && !healthy(item))`; `degraded-notice := (count===0 && degraded && error)`; 그 외 `null`.
    - **근거(Codex Plan-F1 + Impl-F1 흡수)**: graceful-hide가 0-item degraded scan(Plan-F1) **또는** 1-item degraded/blocked self(Impl-F1)까지 숨기면 scrubbed error/차단 사유가 대시보드에서 사라지고 "스캐너/STATE 고장 ↔ 조용한 단일 worktree"가 구별 불가(loud-fail-open 위반, [memory: feedback-loud-fail-open]). verdict의 generic collapse는 actionable 텍스트를 잃으므로 섹션이 직접 noticed/행으로 보존. hide는 **healthy일 때만**.
  - 컬럼: `worktree | 브랜치 | 진행 | 상태 | 활동`. worktree=경로 basename(self면 "이 worktree" 마커 prepend), 브랜치=`branch || (detached ? '(detached)' : '(no branch)')`, 진행=`milestone_hint`(truncate ~48자) + 게이트 보조(`current_gate`), 상태=상태 kind 뱃지(Task 2), 활동=`formatRelativeTime(last_activity)` 또는 '활동 없음'.
  - self 행: `is_self===true` → `<tr class="self">` + md `**이 worktree**` 마커. 정확히 0|1행(source가 self_path 단일 보장).
  - md/html 양쪽 생성(worker-fanout 구조 mirror: `mdRows`/`htmlRows` 누적).
  - 빈 htmlRows면 null.
- **Mirror**: `worker-fanout.js:34-122`(테이블 골격, s-kind tr, graceful hide), `active-sessions.js:49-91`(md/html rows + self).
- **Validate**: 2+ worktree model → md+html 5컬럼 테이블, 1 worktree/scanned=false → null.

### Task 2: 상태 kind oracle (색+아이콘+텍스트 3중, 차단 우선)
- **Action**: 섹션 내부 순수 helper `worktreeStatusKind(item)` + `kindLabel(kind)`:
  - 우선순위: `blocked` → `degraded` → `active` → `idle`. (차단이 degraded보다 우선 — 더 actionable.)
  - 매핑(기존 `.s-*` 색 재사용, 신규 색 클래스 0):
    | kind | tr class | 아이콘 | 한국어 | 색 |
    |---|---|---|---|---|
    | blocked | `s-blocked` | 🚫 | 차단됨 | --status-blocked (red, ≤1 우선 강조) |
    | degraded | `s-stale` | ⚠ | 오류 | --status-stale (amber, red와 구분) |
    | active | `s-in-progress` | ◐ | 진행 중 | --accent |
    | idle | (none) | · | 대기 | --muted |
  - `blocked` 행은 `blocked_reason`을 진행 셀 또는 드로어에 노출(loud). 상태색은 **상태 셀 span에만**(worker-fanout line 3 계약 — 행 전체 색칠 금지, 색 단독 의미 금지: 아이콘+텍스트 병행 = a11y-severity-non-color 통과). format-utils `STATUS_BADGES` 미사용(literal span, worker-fanout "envelope corrupt" 선례) → format-utils.js + a11y badge test 무변경.
- **Mirror**: `worker-fanout.js:12-32`(`envelopeStatusKind`/`kindClass`), `html.js:385-390`(`.s-*` 색).
- **Validate**: blocked item → html에 `s-blocked` + 🚫 차단됨; degraded item → `s-stale` + ⚠ 오류; active → ◐ 진행 중.

### Task 3: 드로어 detail (`wt:` kind)
- **Action**:
  - `drawer-detail.js`: `detailId`에 `case 'wt': return 'wt:' + (p.ordinal != null ? p.ordinal : 0) + ':' + (p.path || '?')` 추가. **ordinal 우선(Codex Impl-F3)** — masked path는 outside-root 동일-basename 두 worktree가 `<outside-repo:foo>`로 collapse하므로 detail-id로 부적합. items 배열 index(deterministic·main-first·render-stable)를 1차 disambiguator로 두어 충돌 0·path-leak 0. path는 가독성 보조로 suffix 유지. `buildWorktreeDetail(item, formatUtils)` 신규 — `buildMilestoneDetail` shape mirror:
    - `title`=worktree basename(renderProseHtml 불요 — `escapeHtml(normalizeProse(basename))` defense-in-depth), `titleText`=평문.
    - `tags`: 상태 kind 라벨 1개(tone: blocked→high, degraded→med, active/idle→low).
    - `rows`(mono 표시): 경로(masked path, mono), 브랜치, HEAD(short 8), 현재 게이트(`current_gate` + 수렴/미수렴), receipts(count), 마지막 활동(relative). 차단 시 차단 사유 행. **degraded/error 시 `오류` 행에 scrubbed `item.error` 노출(Codex Impl-F2)** — M1이 보존한 actionable 복구 텍스트(state-unreadable / receipt-read 실패 / per-worktree 예외)가 generic `⚠ 오류` 뱃지로 collapse되지 않게 detail+STATUS.md에 surface.
    - `sections`: `milestone_hint` 있으면 `['진행', renderProseHtml(hint), normalizeProse(hint)]`(OPTIONAL degrade).
  - `multi-session.js`: 각 행에 `data-detail-id="<id>"` 부여 — `detailId('wt', { ordinal: index, path: item.path })`(index=items.forEach 인덱스, F3 안정 키) + `addDetail(detailMap, rawId, detail)` + 섹션 반환에 `details: detailMap` 포함.
  - `html.js`: `DRAWER_SCRIPT` KIND map에 `wt:'worktree'` 추가(드로어 헤더 라벨). drawerMap 집계 루프(`[questions, risks, timeline, milestoneHistory]`)에 `multiSession` 추가.
- **Mirror**: `drawer-detail.js:170-187`(빌더) + `:41-62`(detailId) + `milestone-history.js:240-263`(data-detail-id 배선) + `html.js:1024,630`(집계·KIND).
- **Validate**: 2 worktree → details Map size=2, 키 `wt:<path>`; html에 `data-detail-id` 부여; serialize 후 JSON.parse 복원; KIND map에 `wt` 존재.

### Task 4: STATUS.md plain-text 동등본
- **Action**: 각 행 md = `| {worktree} | {브랜치} | {진행} | {아이콘 한국어} | {활동} |`(self는 `**이 worktree**` prepend) + (선택) drawer-detail의 md-누락 행을 `renderDetailMd(detail, formatUtils, {omit})`로 인라인 append(milestone-history `:259-262` 미러 — 진행/차단 사유 plain-text 동등). 테이블 헤더 `| worktree | 브랜치 | 진행 | 상태 | 활동 |`.
  - `markdown.js`: destructure 끝에 `multiSession` + 워커 다음/최근 활동 앞에 `## 멀티세션 진행` + `multiSession.md` + 앵커 `if (multiSession) anchors.push('[멀티세션](#멀티세션-진행)')`.
- **Mirror**: `markdown.js:69-85`(워커/활동 섹션 골격), `milestone-history.js:253-262`(detailMd 인라인).
- **Validate**: `markdown-equivalence.test.js` green — html 행 정보 ↔ md 행 정보 동등(진행/차단 사유 누락 0).

### Task 5: html 활동 route 패널 배선 + 아이콘 + self CSS
- **Action**:
  - `html.js` destructure(`:868`)와 `markdown.js` destructure(`:8`)에 `multiSession`을 `sections` 배열 순서와 동일하게 9번째 추가.
  - `activityPanels`(`:892`) 맨 앞에 `{ title: '멀티세션 진행', section: multiSession, present: !!multiSession, span2: true }`(5컬럼 → full-width, 워커/최근 활동 앞 headline).
  - `panelIcon`(`:652`)에 `if (/멀티세션|worktree/.test(title)) return 'ic-branch';`(worktree≈branch, sprite 기존 심볼).
  - `LAYOUT` CSS에 `.multi-session tr.self { ... }` 미세 highlight(left border 또는 bg tint — 비-색 텍스트 마커가 primary, tint는 보조). `.multi-session` 테이블은 generic `table`/`th`/`td` 스타일 상속 → 추가 색 클래스 불요.
  - truncated 시 `multiSession.foot`(panel foot)로 "N개 중 cap개 표시(truncated)" loud 노출(no silent cap).
- **Mirror**: `html.js:892-899`(activityPanels), `:856-861`(renderPanel foot), `:652-661`(panelIcon).
- **Validate**: render html에 `<section ... aria-label="멀티세션 진행">` 패널 + ic-branch use + self tr; `responsive-layout.test.js`/`section-fidelity.test.js` 회귀 0.

### Task 6: 테스트 + 회귀 가드
- **Action**: `tests/multi-session.test.js` 신규:
  - (a) `wt` 없음 / `scanned:false` → null; (b) `scanned:true` 1 worktree(healthy) → null(graceful hide);
  - (c) 2+ items → md+html 5컬럼; (d) `is_self` → `<tr class="self">` + "이 worktree" 정확히 1;
  - (e) `blocked:true` → `s-blocked`+🚫 차단됨 + blocked_reason 노출; (f) `degraded:true`(state-unparseable) row in 2+ scan → `s-stale`+⚠ 오류 **행 보존**(드롭 아님, PRD OQ#5);
  - (g) 드로어 detail Map size·키 `wt:<path>`·`data-detail-id`; (h) 브랜치/경로 `<>` escape;
  - (i) masked path(`<outside-repo:…>`) verbatim 렌더(섹션 재마스킹 0); (j) STATUS.md md ↔ html 정보 동등(진행/차단 사유);
  - **(k, Codex Plan-F1)** `scanned:true, degraded:true, error:<scrubbed>, count:0, items:[]` → null 아님, 작은 degraded 알림(md+html에 scrubbed error 텍스트 노출); 대비로 `scanned:true, count:0, degraded:false` → null(정상 0-item).
  - **(l, Codex Impl-F1)** `scanned:true, count:1, items:[{is_self:true, degraded:true, blocked_reason:'state-unparseable'}]` → null 아님, 1행 테이블 렌더(self의 손상 STATE loud); 대비로 `count:1, items:[{is_self:true, healthy}]` → null(정상 단일 조용). blocked-only single(`blocked:true`)도 동일 렌더.
  - **(m, Codex Impl-F2)** degraded item with `error:'<outside-repo:x> open ENOENT'` → 진행셀/드로어 detail/STATUS.md md에 scrubbed error 텍스트 노출(generic '오류' 뱃지로 collapse 금지).
  - **(n, Codex Impl-F3)** 동일 masked basename 2 worktree(`path:'<outside-repo:foo>'` ×2) → detail Map size=2(충돌 0), 키 `wt:0:…`/`wt:1:…` ordinal 구분; `data-detail-id` 2개 distinct.
  - `tests/drawer.test.js`에 `wt:` kind + KIND map 라벨 가드 + ordinal-keyed detailId 가드 추가.
- **Mirror**: `active-sessions.test.js`(graceful/self/escape 구조), `milestone-history.test.js`(detail), `drawer.test.js`.
- **Validate**: 아래 Validation 블록 전체 green + 전체 renderer suite 회귀 0.

### Task 7: 문서 + 버전 동기화
- **Action**: `dashboard-surface.md`에 멀티세션 섹션 항목(소비 소스 `sources.worktrees`, graceful-hide 조건, 상태 kind 표, 드로어 `wt:` kind) 추가. `plugin.json` `1.18.12→1.18.14`. footer 2곳(`html.js` page-foot, `markdown.js` derived) `v1.18.14` 동기화. `CHANGELOG.md` 행 추가.
- **Mirror**: 기존 dashboard-surface.md 섹션 항목 톤, §3.7 footer 동기화.
- **Validate**: footer grep 일치 + `node plugins/mccp/scripts/derive/cli.js render` 산출 html/md에 v1.18.14.

### Task 8: impeccable audit/polish (PRD 워크플로 — ship 전)
- **Action**: M2는 렌더 UI surface → §3.10 stage-aware routing(evaluate=critique/audit)이 prp-implement에서 발화. PRD Design Direction "M2(UI)는 ship 전 impeccable `audit`/`polish`" 준수: 구현 후 audit(WCAG/대비/정보위계) + polish(간격/타이포). 4 Output Constraints 검증: ① 정보위계 3단(worktree→상태→상세 드로어) ② 강조색 ≤1/viewport(차단 red만, degraded는 amber로 분리) ③ raw markdown marker 0(renderProseHtml 경유) ④ 한 화면 항목 상한(cap=20 + truncated foot).
- **Mirror**: §3.9/§3.10 design-critique + routing.
- **Validate**: design-critique CONVERGED + output-constraints lint 0 violation.

## Validation

```bash
# 신규 섹션 + 드로어 가드 (Git Bash)
node --test plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js \
            plugins/mccp/scripts/lib/renderer/tests/drawer.test.js

# 전체 renderer + derive 회귀 (0 regression 목표)
node --test plugins/mccp/scripts/lib/renderer/tests/ plugins/mccp/scripts/derive/tests/

# 도그푸드 — render 경로(worktreeScan opt-in)가 멀티세션 섹션을 채우는지
MCCP_MULTI_SESSION_SCAN=1 node plugins/mccp/scripts/derive/cli.js render
node -e 'const fs=require("fs");const h=fs.readFileSync(".claude/cache/status.html","utf8");console.log("멀티세션 패널:", /aria-label="멀티세션 진행"/.test(h));console.log("self 마커:", /tr class="self"/.test(h)||/이 worktree/.test(h))'

# footer/version 동기화
node plugins/mccp/scripts/derive/cli.js version
grep -n "v1.18.14" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `sections` 배열 위치 변경이 md/html destructure와 어긋나 섹션 mis-wire | 중 | 배열 **끝에 append** + 양쪽 destructure 9번째 동일 추가. render-integration/four-part 테스트가 가드 |
| 단일 worktree에 불필요 섹션 노출(graceful hide 미스) | 중 | `scanned!==true` OR **healthy** single → null. unhealthy single은 렌더. 단위 테스트 (a)(b)(l)가 가드 |
| **0-item degraded scan이 진단 텍스트 유실(Codex Plan-F1)** | 중 | hide 규칙 분리 — `scanned&&degraded&&count===0`이면 scrubbed error notice 렌더(verdict generic collapse 우회, loud-fail-open). 테스트 (k)가 가드 |
| **단일 degraded/blocked self가 무음 hide(Codex Impl-F1)** | 중 | hide는 healthy single만 — unhealthy single(degraded/blocked/error)은 1행 테이블 loud 렌더. 테스트 (l)가 가드 |
| **per-worktree scrubbed error가 generic 뱃지로 collapse(Codex Impl-F2)** | 중 | degraded 행이 진행셀/드로어/STATUS.md에 `item.error` 노출. 테스트 (m)이 가드 |
| 차단 강조색이 viewport ≤1 원칙 위반(다행 red) | 중 | 색은 상태 셀 span에만(worker-fanout 계약), degraded=amber 분리. output-constraints lint(②)가 가드 |
| degraded worktree가 absent로 위장(드롭) | 저 | M1 source가 이미 degraded 행 보존(error row). 섹션은 ⚠ 오류로 가시화 — 테스트 (f) |
| masked path를 섹션이 재마스킹/leak | 저 | model 값 그대로 escape만(재마스킹 0). 테스트 (i)가 `<outside-repo:…>` verbatim 검증 |
| 드로어 detail-id 충돌(동일 masked basename, Codex Impl-F3) | 중 | detailId가 items index를 1차 키로 — `wt:<ordinal>:<path>`. outside-root 동일-basename collapse에도 충돌 0·leak 0. `addDetail` hard-surface(H18) 2차 방어. 테스트 (n)이 가드 |
| active-sessions와 시각 중복(세션 vs worktree) | 저 | 신규 섹션=진행 축, active-sessions=세션 존재 축. 사용자 결정 "양보 없이 병치"(신규 전용 섹션). 컬럼/제목 구분 |
| STATUS.md md ↔ html 정보 비동등 | 저 | `renderDetailMd` 인라인(milestone-history 선례) + `markdown-equivalence.test.js` |

## Open Questions (PRD M2-관련 — plan 결정)

1. **section 구조**: 사용자 결정(2026-06-26) — **신규 전용 섹션** `multi-session.js`(active-sessions 무손상 병치). 진행 축 vs 세션 존재 축 분리.
2. **graceful-hide 조건(분리 규칙, Codex F1)**: `scanned!==true` → null. `scanned&&count===0&&degraded&&error` → 작은 degraded 알림(진단 보존). healthy `items.length<=1` → null(단일=공통 경로 조용). `items.length>=2` → 테이블. 즉 worktree ≥2 또는 broken-scan일 때만 노출, 정상 단일은 조용 → 100% 가시성 + loud-fail-open 양립. `active`/`has_signal`은 행별 표현(idle=muted)에만, hide 게이트엔 미사용.
3. **drawer 매핑 범위**: 기존 native dialog 드로어 **재사용**(신규 드로어 0). 신규 kind prefix `wt:` + `buildWorktreeDetail`로 detail SSoT에 합류. KIND map 1줄 추가.
4. **route 배치**: 별도 사이드바 route 신설 안 함 — 기존 "활동 · 기록" route 패널(맨 앞, span2 full-width). 사용자 "신규 전용 섹션" 선택과 정합(전용 route는 over-engineering).
5. **상태 표현**: 기존 `.s-{kind}` 색 cascade 재사용(신규 CSS 색 0, format-utils 무변경). 차단=red(≤1 우선), degraded=amber 분리, 진행=accent, idle=muted. 색+아이콘+텍스트 3중(비-색 마커 보존).
6. **verdict/blocked-count 피드**: M2 범위 밖 — hero blocked-count는 review-conflict 축(status-grid), worktree 차단은 섹션 내 강조. verdict 미변경(scope discipline). 향후 cross-feed 후보.

## Acceptance

- [ ] `multi-session.js` 섹션 — worktree당 1행 + 상태 kind(차단 강조) + self 마커 + 드로어 detail + graceful hide 완성
- [ ] index/markdown/html 3-point 배선 — `sections` 배열 append + 양쪽 destructure + 활동 route 패널 + 앵커 일관
- [ ] 드로어 `wt:` kind — `buildWorktreeDetail` + `detailId` + KIND map + drawerMap 집계, 행 `data-detail-id`
- [ ] graceful hide(분리) — scanned≠true OR **healthy** single → null; unhealthy single은 1행 테이블(Codex Impl-F1); **0-item degraded scan → scrubbed error notice 렌더(Codex Plan-F1, 진단 보존)**
- [ ] per-worktree scrubbed `item.error`가 진행셀/드로어/STATUS.md에 노출(Codex Impl-F2, generic 뱃지 collapse 0)
- [ ] 드로어 detail-id ordinal-우선(`wt:<ordinal>:<path>`) — 동일 masked basename 충돌 0(Codex Impl-F3)
- [ ] 차단 강조 색 ≤1/viewport(상태 셀 span 한정) + degraded amber 분리 + 색+아이콘+텍스트 3중
- [ ] degraded worktree 행 보존(⚠ 오류, 드롭 아님)
- [ ] STATUS.md plain-text 동등본 — 진행/차단 사유 정보 동등(`markdown-equivalence` green)
- [ ] masked path verbatim(섹션 재마스킹·leak 0)
- [ ] 전체 renderer + derive suite 회귀 0
- [ ] impeccable audit/polish 통과(4 Output Constraints) + plugin.json 1.18.14 + footer 동기화
- [ ] 패턴 재사용(worker-fanout/active-sessions/drawer-detail), 신규 dep 0, 신규 CSS 색 클래스 0

## Design Critique

- detector: `skill_available=true`, `design_signal=true` (signal_files = renderer/sections·html·markdown·drawer-detail — 실제 렌더 UI surface 변경).
- SKILL first-step: `frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료(4 anchor).
- 판정 — plan stage 평가(렌더 surface는 implement에서 생성, plan은 그 설계 결정을 검증):
  1. **정보 위계 3단계** — worktree 행(primary) → 상태 뱃지(status) → 드로어 상세(detail). 패널/테이블 heading depth ≤ 3. ✔
  2. **강조색 ≤1/viewport** — 차단=`s-blocked`(red) 단일 강조, degraded=`s-stale`(amber)로 분리, 색은 상태 셀 span에만(worker-fanout 계약 — 행 전체 색칠 금지). ✔
  3. **raw markdown marker 0** — 모든 prose는 `renderProseHtml`/`escapeHtml` 경유, drawer-detail serialize가 `</script>` break-out 차단. ✔
  4. **한 화면 항목 상한** — cap=20(M1 source) + `truncated` foot loud 노출, 단일 worktree graceful hide. ✔
- 결과: round=1, findings=0 → `decideCritique` → **CONVERGED**. verdict=`converged`. 실제 UI audit/polish는 implement 게이트(§3.10 evaluate stage)에서 발화.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan stage는 렌더 UI 미생성 → 아래는 implement 구현자용 체크리스트(plan은 invoke 안 함).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

> M2는 렌더 UI surface(멀티세션 섹션) → implement에서 evaluate(critique/audit) 발화. content-detectable refine(animate/colorize/typeset/adapt)은 diff signal positive 시에만 invoke. PRD Design Direction "M2(UI)는 ship 전 impeccable audit/polish" 준수.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available`(design-scope preamble → security/correctness/performance 집중)
- 라운드 수: 1 (R1 — 단일 finding이 MEDIUM·R1 plan 수정으로 흡수, ACCEPT_NOW HIGH/CRITICAL 미해소 0 → R2 불필요, cap=1)
- 합치 결론: verdict=`needs-attention` → 1 finding을 plan에 흡수 후 수렴. "graceful-hide가 0-item degraded scan의 진단 텍스트를 유실시켜 loud-fail-open 위반" 핵심 지적 수용.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 0-item degraded scan이 actionable 진단 유실 | MEDIUM | ACCEPT_NOW | loud-fail-open 위반([memory: feedback-loud-fail-open]). hide 규칙을 분리 — `scanned&&degraded&&count===0`이면 scrubbed error notice 렌더, verdict generic collapse 우회(Task 1/6/Risks/OQ2 흡수) |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` (append 없음)
- Open Questions: 없음 (단일 finding ACCEPT_NOW·R1 흡수 완료, DIVERGENT_UNRESOLVED 없음)
- Codex session 참조: threadId `019f007b-f79d-7891-b496-1dc9b0e735b6`

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available`(design-scope preamble → security/correctness/performance 집중)
- 라운드 수: 1 (R1 — 3 finding 모두 MEDIUM, ACCEPT_NOW × {HIGH,CRITICAL} 미해소 0 → R2 escalation 게이트 미충족, cap=1)
- 합치 결론: verdict=`needs-attention` → 3 finding 모두 R1 plan 수정으로 흡수 후 수렴. 핵심: loud-fail-open 진단 보존(단일 degraded self·per-worktree error)과 detail-id 정체성 안정성.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | Impl-F1 단일 degraded/blocked worktree 무음 hide | MEDIUM | ACCEPT_NOW | Plan-F1과 동일 loud-fail-open 계열을 1-item에 확장. hide는 **healthy single만** — unhealthy single은 1행 테이블(Task 1/6(l)/Risks/Acceptance 흡수) |
  | Impl-F2 per-worktree scrubbed `item.error` 유실 | MEDIUM | ACCEPT_NOW | model에 `item.error`(scrubAbsPaths) 존재 확인. degraded 행 진행셀/드로어/STATUS.md에 노출(Task 3/6(m)/Risks/Acceptance 흡수) |
  | Impl-F3 masked path detail-id 충돌 | MEDIUM | ACCEPT_NOW | M1 변경(worktree_id 신설=overshoot, M1 ship됨) 대신 M2-scope ordinal-우선 키(`wt:<ordinal>:<path>`). 충돌 0·leak 0(Task 3/6(n)/Risks/Acceptance 흡수) |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` (append 없음)
- Open Questions: 없음 (3 finding ACCEPT_NOW·R1 흡수 완료, ACCEPT_NOW HIGH/CRITICAL 0, DIVERGENT_UNRESOLVED 없음)
- Security Reviewer: 비-게이트(read-only 렌더러). 유일 보안 표면=untrusted 문자열(branch/path/STATE) → HTML escape. 기존 escapeHtml/renderProseHtml/drawer serialize break-out 계약 verbatim mirror + 테스트 (h) `<>` escape 가드. 별도 security-reviewer pass는 Phase 4 실코드 검증으로 이관(M1이 동일 scrub/escape 머신을 이미 CLEAN 판정).
- Codex session 참조: threadId `019f008b-2fdb-7da3-93b6-24d86548b318`
