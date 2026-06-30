# Plan: Dashboard Truthfulness M5 — 데이터 의미론 정합 (진행중·위험/차단·Hero·라우팅)

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Selected Milestone**: M5 — 데이터 의미론 정합 (신규)
**Complexity**: Large

## Summary

M1~M4가 데이터 영속화·표현을 truthful하게 만든 위에서, 사용자 육안 검토로 드러난 **derive 모델의 의미론(무엇을 세는가) 결함 7개**를 닫는다. 공통 원인은 "진행 중", "위험", "다음"이 각각 다른 소스를 세고 현실과 어긋난다는 것 — 표현이 아니라 **데이터·개념 정합** 작업이다. 콘솔 셸 계약(oklch 토큰·드로어·비-색 마커·카드 비중첩, PR #57~#63)은 불변.

확정된 설계 결정(사용자 정렬, 2026-06-25):

1. **#2 진행중 진실성** — 데이터 정리 + 신선도 가드 + **완료 자동감지** 셋 다. M1 completion-ledger / terminal receipt 가 닫힌 마일스톤은 PRD 표가 in-progress 여도 자동 complete 간주.
2. **#3+#7 위험/차단** — rail '위험'을 위험 섹션과 같은 소스(plan body risks)로 **통일**, backlog HIGH/CRIT 은 '**이월 finding**'으로 분리 명명, '**차단**'은 라벨/툴팁 개선(게이트 미수렴 의미 노출).
3. **#4 Hero** — 현재 진행 작업의 **다음 액션 1줄 + 요약** 중심. backlog-deferred 우선순위 강등, 텍스트 잘림 방지(요약체).
4. **#1 / #5 / #6** — verdict 라벨 정확화(neutral≠'대기') / hero-version 줄 제거 / "더보기"를 기존 `:target` route 링크로 교체(신규 페이지 거의 불요).

> **"차단" 정의 (감사 anchor)**: `decision-state.js` `state==='blocked'` = 한 decision 의 게이트 receipt chain 에서 Codex review 가 round≥2 미수렴(divergent)으로 끝나고 이후 더 최근 converged 가 없는 상태. "사람 개입 필요한 dual-review 충돌". 마일스톤 차단 아님.

## Milestone Split (M5a shipped / M5b remaining)

비용·세션 범위로 M5 를 두 ship 으로 분리(사용자 결정 2026-06-25, plan Risk "범위 과대" + Open Question "범위 분할" 발동).

- **M5a (이 PR) — 데이터 의미론 #2 진행중 진실성** (Task 1 + 그 데이터 정리). SHIPPED:
  - `parseDeliveryMilestones` backtick bare-path 버그 수정(dashboard-truthfulness 마일스톤이 비로소 집계).
  - 완료 자동감지 `isMilestoneClosed`(plan_hash-fresh terminal receipt OR ledger, Codex F1 fail-closed) + plan-body.js override 레이어.
  - 신선도 가드(`MCCP_DASHBOARD_STALE_DAYS` 기본 14, 활동기반) + status-grid in-progress=fresh only.
  - stale cross-cycle PRD 7건 데이터 정리(v0.3.5/v0.4.0/v1.4.2-m1·m2/v0.3.6/v1.0.1-axis-k-m2/serve-refresh/console-redesign-m4 → complete). 결과 진행중=1(M5).
  - 신규 `completion-detect.test.js` 15케이스(Codex F1 negative e/f/g/h 포함), 기존 스위트 0 회귀.
- **M5b — 표현/Hero** (Task 2~7). SHIPPED (v1.18.9):
  - Task 2 위험/차단 정합(rail 위험 소스 통일 + 이월 finding 셀 + 차단 툴팁).
  - Task 3 Hero 재설계(verdict 우선순위 + next-action + 요약체).
  - Task 4 verdict 라벨 분화(neutral≠'대기'). Task 5 hero-version 줄 제거.
  - Task 6 더보기→route 링크(F2 full-render 모드 — 시각 검증 유익). Task 7 문서/version/PRD/impeccable audit·polish.
- M5 PRD row 는 M5a 동안 in-progress, M5b ship 으로 `complete` 전이 — 진행중=1 invariant 와 정합.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| decision 상태 SSoT | `parsers/decision-state.js:56-107` | `nodeStatus`/`buildDecisionState` — blocked/active/done/missing 단일 판정. 진행중/차단 모두 여기서 derive |
| 마일스톤 완료 이력 | `sections/milestone-history.js#pickShipReceipt` + M1 completion-ledger | ship receipt/ledger 가 완료 시점·완료 여부 durable source. 진행중 필터가 이를 소비해야 함 |
| 위젯 카운트 vs 항목 | `sections/status-grid.js:55-69, 144-157` | `widgetMd`/cells — count + named items(top-N). 소스가 '무엇'을 세는지 일관해야 함 |
| verdict 우선순위 체인 | `verdict.js:27-157` | 11-step priority. backlog 분기(123)가 in-progress 분기(140)보다 앞 → 재정렬 대상 |
| Hero 라벨 매핑 | `html.js:621-688 (HERO_STATUS/renderHeroPanel)` | tone→{dot,label}. neutral/muted 둘 다 '대기' → 의미 분화 |
| `:target` 멀티 route | `html.js:255-269` | `#route-{overview,pipeline,risks,questions,activity}` + nav-link `data-route`. 더보기는 이 route 로 link |
| top-N + route 링크 | `sections/risks.js` 더보기 + nav anchor | "+N 더보기" `<details>` → `<a href="#route-risks">전체 보기</a>` |
| 신선도(stale) 표기 | `verdict.js:115-121 (planStaleness)` + status-grid `nextStale` | 기존 stale 메커니즘 재사용해 오래된 in-progress 강등 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | #2 진행중=PRD표 in-progress ∖ (ledger/terminal-receipt 완료) + stale 강등 / #3 위험 소스 통일(plan risks) + 이월 finding 분리 셀 / #7 차단 라벨·툴팁 / #4 Hero next-action 소스 |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATE | #1 라벨 의미 분화(neutral 진행중 톤) / #4 우선순위 재정렬(fresh in-progress > backlog-deferred) + 요약체·잘림 방지 |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | #2 완료 자동감지 — PRD 표 status 위에 ledger/terminal-receipt override(in-progress→complete) 레이어 |
| `plugins/mccp/scripts/lib/renderer/parsers/decision-state.js` | UPDATE(소폭) | #2 terminal-receipt 완료 판정 helper 노출(pr-codex/code-reviewer converged = 마일스톤 닫힘) — 신규 derive 아닌 기존 SSoT 확장 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | #1 HERO_STATUS 라벨 분화 / #4 Hero 렌더(요약+다음액션) / #5 hero-version 줄 제거 / #6 widget·timeline 더보기→route 링크 / CSS(이월 finding 셀, 차단 툴팁, 신규 색 토큰 0) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | md 동등(Hero 요약·진행중·위험/이월/차단·version 줄 제거 미러) |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | #6 "+N 더보기" → `#route-risks` 전체보기 링크(위험 route 이미 존재) |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | #6 "+N 더보기" → `#route-questions` 링크 |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | #6 타임라인 "+N 더보기" `<details>` → `#route-activity` 전체보기 링크(M4 더보기 대체) |
| `plugins/mccp/scripts/lib/renderer/tests/*.test.js` | UPDATE | 7결함 회귀(아래 Validation) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.7 → 1.18.8`(단일 milestone patch, §3.7) |
| `CHANGELOG.md` | UPDATE | M5 row |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M5 row 추가(in-progress + Plan cell) + M4 row `complete`(이미 ship) + **완료 PRD 표 데이터 정리 체크리스트**(#2 데이터 축) |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | 진행중/위험/이월/차단/Hero/라우팅 의미론 문서화 |

## Tasks

### Task 1: #2 진행중 진실성 — 데이터 정리 + 완료 자동감지 + 신선도 가드
- **Action (3축)**:
  1. **완료 자동감지(코드, fail-closed 상관)** — `plan-body.js`의 `planStatuses`(PRD 표 status) 위에 override 레이어: 해당 마일스톤 Plan cell→plan basename→decision 의 terminal receipt(`mccp-pr-codex` 또는 `code-reviewer` converged) 또는 M1 completion-ledger 완료 기록이 있으면 status 를 `complete` 로 간주. `decision-state.js`에 `isMilestoneClosed(decisionId, receipts)` helper 추가(기존 SSoT 확장). status-grid `inProgressItems` 가 이 override 후 status 를 읽음.
     - **상관 엄격화 (Codex Plan-F1 + Implement-F1 흡수)**: receipt schema 에 `is_stale` 플래그는 **없다** — freshness 신호는 `plan_hash`다(Implement-Codex F1). 따라서 terminal-receipt 단독 close 는 **(a) 정확한 decision_id 일치 + (b) plan_hash freshness** 둘 다 필수:
       - (a) Plan cell 의 plan basename 에서 derive 한 decision_id == receipt 의 `decision_id` (정확 일치). generic/legacy receipt 이름(`default`/`main`/`*.legacy.json`)은 **거부**.
       - (b) receipt 의 `plan_hash` == 현재 Plan cell 파일의 `planAwareMarkdownHash` (즉 `correlate.js` Kind 4 `receipt-anchored-to-plan` 링크가 **존재**할 때만 fresh). plan body 가 receipt 이후 변경됐으면 plan_hash 불일치 → **stale → close 안 함**(편집된 plan 의 옛 converged receipt 가 active 작업을 숨기는 것 방지).
       - **ledger 기록은 corroboration** — terminal-receipt(a+b) + ledger 둘 다면 high-confidence close. **worktree 제거로 terminal receipt 가 소멸한 경우엔 ledger 단독 close 허용**(M1 completion-ledger 가 durable 완료 기록이므로). ledger 매칭 키는 milestone/decision 식별자.
       - 매핑 모호(Plan cell 없음/basename 충돌/plan 파일 unreadable) 시 **fail-closed = in-progress 유지**(active 작업 숨김 금지).
  2. **신선도 가드** — override 후에도 in-progress 인 항목 중 마지막 receipt/ledger 활동이 N일(기본 14, env 토글 가능) 초과면 `stale` 표기(기존 `nextStale`/staleness 재사용). 진행중 카운트는 fresh 만, stale 은 별도 muted 표기.
  3. **데이터 정리(운영)** — 완료된 PRD(v0.3.5/v0.4.0/v1.4.2 등) Delivery Milestones 표 status 를 `complete` 로 닫는 체크리스트를 PRD M5 노트에 명시(코드 아닌 데이터; 자동감지가 이미 가리지만 SSoT 정합). **M4 row 는 auto-detect 에 의존하지 않고 PRD 표에서 명시적으로 `complete` 로 데이터 수정**(Codex F3 — auto-detect 는 안전망, 1차 신호는 명시 데이터).
- **Mirror**: `decision-state.js:84-107`(supersede 가드 동형 시간순 판정) + `milestone-history.js#pickShipReceipt`(ledger source).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/status-grid.test.js` — (a) terminal-receipt 있는 마일스톤은 PRD 표 in-progress 여도 진행중 카운트 제외, (b) ledger 완료분 제외, (c) fresh in-progress 만 카운트·stale 은 강등, (d) 현재 작업(M5) 1건만 진행중. **negative (Codex F1)**: (e) decision_id 불일치 receipt 는 close 안 함(in-progress 유지), (f) generic/legacy receipt 이름(`default`/`*.legacy.json`)은 close 안 함, (g) **plan_hash 불일치(receipt 이후 plan body 편집됨) terminal-receipt 는 close 안 함**, (h) Plan cell 없는/basename 충돌/unreadable 행은 fail-closed(in-progress 유지). **positive**: (i) plan_hash 일치 terminal-receipt 는 close, (j) terminal receipt 부재 + ledger 완료 기록만 있어도 close(worktree-removed 케이스).

### Task 2: #3+#7 위험/차단 개념 정합
- **Action**:
  1. **위험 소스 통일** — rail '미해결 위험' 카운트를 `codex-findings-backlog` HIGH/CRIT(현 `risksOpen`) 대신 **위험 섹션과 동일 소스**(plan body risks, active=미마커)로 변경. rail 38 = 섹션 38 정합.
  2. **이월 finding 분리** — 기존 backlog HIGH/CRIT 은 '**이월 finding**'(deferred backlog) 셀로 별도 명명. 위험과 구분.
  3. **차단 라벨·툴팁** — '차단' 셀 라벨에 의미 노출: 툴팁/부제 "Codex 검토 N라운드 미수렴 · 사람 개입 필요"(`title` attr, decision-state 판정 그대로). 0건이면 "검토 충돌 없음" empty-state.
- **범위 경계 (Codex F4 — DEFER)**: M5 Task 2 는 rail↔섹션 **표시값 일관**(같은 소스를 세므로 사용자가 보는 두 숫자가 일치)까지만 닫는다. 위험 섹션 자체의 lifecycle scope(완료 plan 의 unmarked historical risk 가 live 위험으로 집계되는 문제)는 **M6 후보로 backlog 이월**(`codex-findings-backlog.md` 2026-06-25 MEDIUM). rail 을 섹션과 통일하는 것은 이미 진실성 향상(현 rail=backlog 와 섹션=plan-risks 가 서로 다른 숫자를 보이던 모순 해소)이므로 M5 scope 로 충분.
- **Mirror**: `risks.js`의 active risk enumerate(stale-audit 마커 reader) + `status-grid.js:144-157`(cells 구조).
- **Validate**: `node --test .../tests/status-grid.test.js .../tests/section-fidelity.test.js` — rail 위험 카운트 == 위험 섹션 active 카운트 / 이월 finding 셀이 backlog 소스 / 차단 셀 title 툴팁 present.

### Task 3: #4 Hero 재설계 — 현재 작업 다음액션 + 요약
- **Action**: `verdict.js` 우선순위 재정렬 — **fresh in-progress plan 분기를 backlog-deferred 분기보다 앞으로**. Hero h1(verdict.text)는 "현재 작업: {현재 마일스톤 요약}" + 다음 액션은 STATE.md 기반 `resolveNextAction`(이미 존재) 실행가능 명령. backlog-deferred 는 Hero 가 아니라 '이월 finding' 셀에서만 노출. 긴 intent 자동추출 잘림 → **요약체**(첫 문장/마일스톤명, 길이 cap + 말줄임은 드로어/route 로 위임). neutral '대기' 톤 분리(Task 4 연동).
- **Mirror**: `verdict.js:140-155`(in-progress 분기) + `next-action.js#resolveNextAction`(STATE.md 다음액션 SSoT) + `html.js:683-712`(renderHeroPanel).
- **Validate**: `node --test .../tests/render-integration.test.js .../tests/verdict.test.js`(있으면) — in-progress 존재 시 Hero 가 backlog 아닌 현재 작업 가리킴 / 텍스트 길이 cap / 다음액션 = STATE.md command.

### Task 4: #1 verdict 라벨 의미 분화 (neutral ≠ '대기')
- **Action**: `html.js` `HERO_STATUS` 의 `neutral`/`muted` 가 둘 다 '대기'인 것을 분화. in-progress 진행 톤(neutral/◐)은 '**진행 중**', 진짜 idle(muted, no in-flight signal)만 '대기'. verdict.js 가 in-progress 분기에서 적절한 tone 부여(Task 3 와 동일 변경 묶음).
- **Mirror**: `html.js:621-630 (HERO_STATUS)`.
- **Validate**: in-progress 모델 → Hero status 라벨 '진행 중' / 빈 모델 → '대기'.

### Task 5: #5 hero-version 줄 제거
- **Action**: `html.js` `renderHeroPanel` 에서 `hero-version` 줄('mccp · v1.18.7 · CHANGELOG') 제거. md 동등(`status-grid.js` `versionMd`) 도 Hero 표면에서 제거(footer 버전은 유지 — page-foot 가 이미 version 노출). host_version provenance 가 필요하면 드로어/footer 로 위임.
- **Mirror**: `html.js:311-314 (.hero-version)` + `status-grid.js:174-176 (versionMd)`.
- **Validate**: Hero html 에 hero-version 미노출 / footer version 불변.

### Task 6: #6 더보기 → 전체 route 링크 (신규 페이지 0 — 기존 :target 재사용)
- **선결 검증 (Codex F2 흡수 — 도달성이 전제)**: route(`#route-risks/questions/activity`)가 **해당 섹션 전체(overflow 포함)를 렌더하는지** 먼저 확인. 현재 route 가 overview 와 동일한 top-N 캡 섹션 렌더러를 재사용한다면, 더보기 `<details>` 를 route 링크로 단순 교체하는 것은 overflow 항목을 여전히 도달 불가로 만든다(route 도 top-N + self-link 만 표시). 이 경우 **섹션 렌더러에 `mode: 'summary'|'full'` 분기**를 도입 — overview = summary(top-N + route 링크), route view = full(전체 항목, 캡 없음). route 가 이미 full 렌더 중이면 분기 불요(확인만).
- **Action**: overview 의 위젯(진행중/이월 finding/위험) 및 위험·질문·타임라인 섹션의 "+N 더보기" `<details>` 를 **기존 route 링크**로 교체: 위험→`#route-risks`, 질문→`#route-questions`, 타임라인→`#route-activity`. 각 route 는 해당 섹션 **전체(full mode)** 를 렌더하므로 신규 페이지 불요. 링크 문구 "전체 보기 →"(스크린샷의 '활동 기록에서 전체 보기' 패턴 계승). M4 타임라인 더보기 `<details>` 는 이 링크로 대체.
- **Mirror**: `html.js:255-269 (:target route)` + 스크린샷 footer '활동 기록에서 전체 보기' 링크.
- **Validate**: `node --test .../tests/render-integration.test.js .../tests/markdown-equivalence.test.js` — 더보기 `<details>` 미존재 / `href="#route-*"` 전체보기 링크 present / md 동등(route 링크 텍스트). **도달성 (Codex F2)**: top-N 을 초과하는 항목(예: N+1번째 위험/질문/타임라인 항목)의 고유 텍스트가 **target route HTML 안에 실제로 존재**함을 단언(링크 존재만이 아니라 overflow 콘텐츠 도달성). summary view 는 top-N 만, full route view 는 전체 — 두 단언 모두.

### Task 7: 테스트 전체 + 디자인 + 문서 + version + PRD
- **Action**: 갱신 테스트(status-grid/section-fidelity/render-integration/markdown-equivalence/four-part/output-constraints) + 신규 단언. impeccable `audit`/`polish`(Hero 요약 a11y·차단 툴팁·route 링크 키보드 도달·반응형). `dashboard-surface.md` 의미론 문서화. plugin.json `1.18.7→1.18.8` + footer 동기화. CHANGELOG row. PRD M5 row(in-progress) + M4 row complete + 데이터정리 체크리스트.
- **Mirror**: §3.7(단일 milestone patch) + §3.10(implement stage-aware routing).
- **Validate**: 전체 스위트 0 회귀 + output-constraints 0 신규 위반 + version/footer grep.

## Validation

```bash
# 개별 (Node 24 — glob 필수, 디렉토리 인자 금지)
node --test plugins/mccp/scripts/lib/renderer/tests/status-grid.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/section-fidelity.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js

# 전체 스위트 (M4 ship 후 baseline, 0 회귀)
node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js plugins/mccp/scripts/derive/tests/*.test.js plugins/mccp/scripts/lib/stale-audit/tests/*.test.js

# end-to-end — 진행중 1건·위험 정합·Hero·route 링크 확인
node plugins/mccp/scripts/derive/cli.js render
grep -c 'href="#route-' .claude/cache/status.html       # 더보기 → route 링크
grep -c 'hero-version' .claude/cache/status.html         # 0 (제거)
grep -oE '진행 중[^<]*[0-9]+' .claude/cache/status.html  # 진행중 카운트 = 실제

# version/footer
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"   # 1.18.8
grep -c "v1.18.8" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 완료 자동감지가 decision↔마일스톤 매핑 오류로 진행중 작업을 잘못 완료처리 (Codex F1) | 중 | **exact decision_id 일치 필수**(generic/legacy/stale receipt 거부) + 매핑 모호 시 fail-closed(in-progress 유지) + terminal-receipt 단독은 정확매칭, ledger 는 corroboration + negative test (e)-(h) (불일치/legacy/stale/충돌이 close 안 함) + fresh in-progress 분기 우선 |
| PRD 에 in-progress 마일스톤 2개(M4+M5) 전이 중 double-count (Codex F3) | 중 | M4 row 를 **명시적 데이터로 `complete`** 수정(auto-detect 의존 아님) + acceptance 회귀 단언(in-progress=1=M5 only) + auto-detect 는 안전망 2차 신호 |
| 위험 소스 통일이 rail/섹션 외 다른 소비자(verdict/pin-alert) 카운트 모순 재발(H1류) | 중 | decision-state/risks 단일 소스 정합 + 기존 H1 fix 주석(status-grid:94) 패턴 따름 + cross-section 카운트 일치 테스트 |
| Hero 우선순위 재정렬이 backlog-deferred 신호를 완전히 숨겨 정보 손실 | 저 | backlog 는 '이월 finding' 셀로 이전(숨김 아닌 이동) + Hero 는 현재작업, 셀은 backlog — 둘 다 노출 |
| route 링크 교체가 STATUS.md(md) 동등 깨뜨림(md엔 :target 없음) | 중 | md 는 route 링크 대신 전체 항목 인라인 유지(접힘 `<details>` md 보존) — html만 route 링크, md-equivalence 테스트로 보증 |
| 7결함 동시 변경이 렌더러 테스트 대량 회귀 | 중 | task별 단위 테스트 + 단계 커밋 + 전체 스위트 0 회귀 게이트 + 콘솔 셸 계약 불변(신규 색 토큰 0) |
| 범위 과대(Large) — 비용/세션 초과 | 중 | task 독립적 → 부분 ship 가능(예: Task 1-2 데이터 정합 먼저, Task 3-6 표현 후속). 필요 시 M5a/M5b 분할(사용자 결정) |

## Acceptance
- [ ] 모든 task 완료 / Validation 0 회귀
- [ ] **#2**: 진행중 카운트 = 실제 진행 작업(현 1건). 완료 마일스톤(terminal-receipt/ledger 닫힘)은 자동 제외 + stale in-progress 강등
- [ ] **#2 fail-closed (Codex F1)**: decision_id 불일치/legacy/stale receipt 는 close 안 함 + 매핑 모호 시 in-progress 유지(negative test (e)-(h) green)
- [ ] **#2 전이 (Codex F3)**: M4 row 명시적 `complete` 데이터 수정 → PRD 표 in-progress 1개(M5 only), 회귀 단언 green
- [ ] **#6 도달성 (Codex F2)**: top-N 초과 항목이 target route HTML 에 실제 존재(링크 존재만이 아님). overview=summary / route=full 양 단언 green
- [ ] **#3+#7**: rail '위험' == 위험 섹션 active 카운트(38 정합) / 이월 finding 별도 셀 / 차단 라벨·툴팁이 게이트 미수렴 의미 노출
- [ ] **#4**: Hero 가 현재 작업 다음액션 중심(backlog 아님) + 요약체(잘림 0)
- [ ] **#1**: verdict 라벨 in-progress='진행 중' / idle='대기' 분화
- [ ] **#5**: hero-version 줄 제거(footer version 유지)
- [ ] **#6**: 더보기 `<details>` 제거 → 기존 route 전체보기 링크(신규 페이지 0) + md 동등
- [ ] 콘솔 셸 계약 불변(신규 색 토큰 0) + STATUS.md 동등 + output-constraints 0 신규 위반
- [ ] plugin.json + footer v1.18.8 + PRD M5/M4 row + 데이터정리 체크리스트 + CHANGELOG

## Open Questions

- [x] **완료 자동감지의 "완료" 신호** — terminal receipt(pr-codex/code-reviewer converged) 단독 vs M1 completion-ledger 단독 vs 둘 중 하나(OR). 제안: **OR**(둘 중 하나라도 닫힘=완료, 보수적이되 worktree 제거로 receipt 소멸한 케이스를 ledger 가 보완). implement 에서 derive correlation 확인 후 확정.
  - **확정(M5a SHIPPED)**: **OR** 채택. `decision-state.js#isMilestoneClosed` = (a) terminal-receipt **OR** (b) ledger. 제안의 "보수적"을 강화 — (a)는 naive OR 이 아니라 exact `decision_id` 일치 **AND** `plan_hash` freshness 필수(generic/`*.legacy.json`/stale-hash 거부, Codex F1/Implement-F1). (b) ledger 는 worktree-removed 로 receipt 소멸한 durable 케이스를 단독 close(via=`ledger`). wiring: `plan-body.js:465-493` override 레이어. 회귀: `completion-detect.test.js` positive (i)(j) + negative (e)-(h). 파이프라인 표면은 더 엄격한 `ledgerCloseFresh`(id+basename+hash) 사용.
- [x] **신선도 가드 임계** — in-progress stale 판정 일수(제안 14일, `MCCP_DASHBOARD_STALE_DAYS` env 토글). 활동 피드 특성상 plan 마지막 receipt 기준.
  - **확정(M5a SHIPPED)**: 제안대로 채택 — `plan-body.js#staleDaysThreshold` 기본 **14일** + `MCCP_DASHBOARD_STALE_DAYS` env override. `lastActivityMs`(receipt `created_at` + ledger `completed_at` 최신) 초과 시 `planStaleness='stale'` 강등(진행중 카운트 제외). 활동 신호 없으면 cycle-based fallback(receipt-less 신규 작업 미은폐, fail-open). 회귀: `completion-detect.test.js` stale/not-stale 케이스.
- [x] **차단 라벨 문구** — '차단' 유지 + 툴팁 vs '검토 차단'/'검토 미수렴'으로 개명. 제안: 라벨 '차단' 유지(짧음) + 툴팁/부제로 의미 보강(기존 nav 폭 영향 최소). 사용자 확인.
  - **확정(M5b SHIPPED v1.18.9)**: 제안대로 라벨 **'차단' 유지 + 툴팁 보강**(개명 안 함). `status-grid.js:207-216` — blocked 셀 `intent='Codex 검토 N건 미수렴 · 사람 개입 필요'` `title` 툴팁(0건이면 생략), 소스는 decision-state SSoT(round≥2 미수렴) 그대로. 기존 backlog HIGH/CRIT 은 `label='이월 finding'` 별도 셀로 분리(rail↔섹션 위험 소스 통일과 한 묶음).
- [x] **범위 분할** — Large. Task 1-2(데이터 의미론) + Task 3-6(Hero/표현)을 단일 M5 로 ship vs M5a/M5b 분리. 제안: 단일 M5(상호 연관 — Hero 가 진행중/위험 셀 소비). 비용 초과 시 분할.
  - **확정**: 비용·세션 범위로 **분할 채택** — M5a(#2 진행중 진실성, v1.18.8) + M5b(Task 2~7 표현/Hero, v1.18.9) 2-ship. 둘 다 SHIPPED, PRD Delivery Milestones M5 row `complete`(양 ship 반영). 본 plan 상단 `## Milestone Split` 섹션이 결정 기록.

## Design Critique

- 트리거: detector `design_signal=true`(Files to Change 에 html.js/status-grid/verdict/sections rendered surface 다수 → whitelist hit). SKILL first-step Read 완료(`skills/frontend-design-direction/SKILL.md` `## Output Constraints`).
- verdict: **CONVERGED**(round 1/cap 2). 승인된 콘솔 셸(PR #57~#63) 위 데이터 의미론·Hero content 정합 — 신규 시각 시스템·신규 색 토큰 0. 4 Output Constraints anchor:
  1. **정보 위계 3단계** — Hero 다음액션(primary) → 진행중/이월/위험/차단 셀(status) → route 전체보기/드로어(detail). 신규 heading depth 0. ✓
  2. **강조색 ≤1** — 이월 finding/차단 셀은 기존 grid 토큰 재사용(신규 accent 0). route 링크 quiet(neutral). ✓
  3. **raw marker 금지** — 위험 소스 통일은 stale-audit 마커 reader 경유(active만), Hero 요약은 `renderProseHtml`/cleanArg. ✓
  4. **한 화면 항목 상한** — 더보기→route 링크가 Constraint 4 를 직접 충족(접힘 대신 전체 페이지). 위젯 top-N 불변. ✓
- HIGH/CRITICAL/UNKNOWN finding 0 → R1 종료. 실측 rendered surface 검증(Hero 요약 a11y, 차단 툴팁 focus, route 링크 키보드 도달, 반응형)은 implement 단계 impeccable `audit`/`polish`.

## Design Routing Guide

routing mode: auto (effective at implement stage). 본 plan 은 rendered UI 가 아직 없어 plan 단계 invoke 0. implement 단계 design surface 체크리스트:

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` |
| polish | `/impeccable polish` |

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble 활성)
- 라운드 수: 1 (cap=1, R1 plan 편집으로 HIGH 3건 전부 흡수 → escalate 조건 (b) 미충족, R2 불요)
- Codex verdict: `needs-attention` (3 HIGH + 1 MEDIUM) — "No-ship: plan can still hide active work, drop overflow data from HTML, PRD diff contradicts truthfulness invariant"
- 합치 결론: HIGH 3건(F1 완료자동감지 OR 상관, F2 route overflow 도달성, F3 PRD double in-progress)은 **plan body 편집으로 완전 흡수**(ACCEPT_NOW). F4(MEDIUM, 위험 lifecycle scope)는 M5 표시값 일관 scope 밖 → backlog 이월. Auto-CRITICAL 카탈로그 해당 0.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 완료 자동감지 OR-기반 상관 오류로 active 작업 은폐 가능 | HIGH | ACCEPT_NOW | Task 1: exact decision_id 일치 필수(generic/legacy/stale 거부) + 매핑 모호 시 fail-closed + negative test (e)-(h) 추가. plan 편집으로 해소. |
  | F2 route 링크가 overflow 항목을 HTML 에서 여전히 도달 불가 | HIGH | ACCEPT_NOW | Task 6: route full-render 모드(summary/full 분기) 선결 검증 + top-N 초과 항목이 route HTML 에 실존하는 도달성 테스트. plan 편집으로 해소. |
  | F3 PRD 에 in-progress 마일스톤 2개(M4+M5) double-count | HIGH | ACCEPT_NOW | Task 1 action 3 + Risks + Acceptance: M4 를 auto-detect 의존 아닌 **명시 데이터로 complete** + in-progress=1 회귀 단언. plan 편집으로 해소. |
  | F4 위험 소스 lifecycle scope 부재(완료 plan historical risk 가 live 집계) | MEDIUM | DEFER_TO_BACKLOG | M5 는 rail↔섹션 표시값 일관까지. 위험 섹션 자체의 lifecycle scoping 은 M6 후보. Task 2 범위 경계 명시 + backlog 이월. |
- Deferred to backlog: 1 (F4) → `.claude/plans/codex-findings-backlog.md` (2026-06-25 MEDIUM)
- Open Questions: 없음 (plan body 기존 Open Questions 4건은 design/scope 결정 — auto-CRITICAL 아님). Codex next_steps 4건은 F1-F4 recommendation 과 동치로 흡수됨.
- Codex session 참조: threadId `019efbf6-ff0d-7d40-8e30-2ebb792497f7` (durationMs 342891, classification=ok)

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (cap=1, HIGH 2건 전부 R1 plan/data 편집으로 흡수 → escalate 조건 (b) 미충족)
- Codex verdict: `needs-attention` (2 HIGH) — implement-time 결정(helper 추상화/내부 구조) 검토. 새 결정 도입 아님(plan-codex 흡수의 realization 검토).
- 합치 결론: F1(완료 override 의 freshness 키)을 **plan_hash 상관**으로 교정(receipt schema 에 is_stale 부재 — 내 plan-codex 흡수가 부정확했음), F2(PRD M4 미수정 working-tree 모순)를 **즉시 데이터 수정**으로 해소. 둘 다 plan/data 편집으로 완전 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 완료 override 가 decision_id 만 키로 써 편집된 plan 의 옛 receipt 로 active 작업 은폐 | HIGH | ACCEPT_NOW | Task 1 상관 엄격화 교정: terminal close = exact decision_id **AND** plan_hash freshness(`correlate.js` Kind 4 재사용). is_stale 의존 제거. negative test (g) plan_hash 불일치 close 거부. |
  | F2 PRD working-tree 가 M4+M5 둘 다 in-progress(M5 invariant 위반) | HIGH | ACCEPT_NOW | PRD M4 row 를 **지금 즉시** `complete` 데이터 수정(plan 약속을 working-tree 에 실현). in-progress=1=M5 회귀 단언 유지. |
- Deferred to backlog: 0 (모두 ACCEPT_NOW)
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 0 — 표시 정확성 이슈, data-loss/secret/auth 아님)
- 디자인 게이트: SKILL_AVAIL=1·SIGNAL=1. design-critique CONVERGED(reuse — M5 는 승인된 콘솔 셸 위 data-semantics, 신규 시각 시스템/색 토큰 0). 실측 rendered surface 의 impeccable `audit`/`polish` 는 Task 7(코드+렌더 후)에서 수행(plan Design Critique 명시).
- Codex session 참조: implement-time review (durationMs ~수분, classification=ok, blocking=0)
