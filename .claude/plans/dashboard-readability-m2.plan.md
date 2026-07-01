# Plan: Dashboard Readability — M2 (위험/질문 리스트 평탄화 + 출처 + 시각)

**Source PRD**: `.claude/prds/dashboard-readability.prd.md`
**Selected Milestone**: M2 — 위험/질문 리스트 평탄화 + 출처 + 시각
**Complexity**: Medium

## Summary
위험·질문 패널을 PRD 그룹 chrome(`<details class="prd-group">`) 없이 **전체 평탄 `<ul>`** 로 렌더해 사용자가 켠 정렬(위험도순·시간순)이 그룹 경계에 가리지 않게 한다. 그룹용 "모두 펼치기/접기" 토글을 제거하고, 각 항목 **상단**에 출처 plan 문서명 + 출처 plan의 최근 활동 시각(사람이 읽기 쉬운 형식)을 작은 회색 메타 줄로 표시한다. 필터(PRD/plan select)와 정렬은 **유지** — `data-prd`/`data-plan`/`data-sev`/`data-ord` 속성은 그대로 두고, 그룹 *분배 로직*(`groupByPrd`)은 `data-prd`·필터옵션 파생 목적으로 남기되 *그룹 렌더링*만 평탄화한다. 시각은 plan 단위 `lastActivityMs` 근사(PRD Out-of-scope: 항목별 정밀 시각 제외).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| 출처 메타 cue | `sections/open-questions.js:44-51,112-118` (`metaCueParts`) | `출처 <span class="mono">basename</span>` + `<span class="cue-sec">` — 위험 패널을 동일 markup 으로 통일(PRD Open Q 1) |
| plan 활동 시각 thread | `parsers/plan-body.js:428-452` (`planPrd` Map 빌드/반환) | `planActivity` Map(canonicalPlanPath → ms)을 동형으로 surface + 섹션에 thread |
| relative-time 헬퍼 | `format-utils.js:42-65` (`formatRelativeTime`) | 단일 공유 헬퍼(PRD Open Q 2 권장 "예") — >60일 절대일자 bin 추가, ≤60일 동작 불변 |
| flat vs 그룹 분기 | `sections/risks.js:203-208` (`panelInnerHtml`) | 분기 제거 → 항상 flat `<ul class="stack-list">` |
| 결정적 now 원천 | `parsers/plan-body.js:584` (`opts.now != null ? opts.now : Date.now()`) | 시각 라벨 결정성 — 섹션에 `opts` thread해 동일 now 사용 |
| 섹션 opts thread | `sections/status-grid.js`/`pipeline.js` 호출(`index.js:125-126`) | `renderRisks`/`renderOpenQuestions`에도 `opts` 4번째 인자 추가 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | `planActivity` Map(canonicalPlanPath → lastActivityMs, **전 plan**) 빌드 + return (현재 `lastActivityMs`는 in-progress staleness 계산에만 쓰고 버려짐). `planPrd` loop 와 동형 |
| `plugins/mccp/scripts/lib/renderer/parsers/prd-group.js` | UPDATE | `prdKeyFor(item, planPrd)` + `prdMetaFor(item, planPrd)` 단일-item export 추가(groupByPrd 의 per-item 분기 로직 추출 — risks/OQ 가 data-prd + filterOptions 에 재사용, Codex F1 권장). `groupByPrd` 는 내부에서 동일 헬퍼 호출(DRY, 동작 불변) |
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | UPDATE | `formatRelativeTime` >60일 절대일자 bin 추가(`M월 D일`, 다른 연도면 `YYYY년 M월 D일`). ≤60일 분기 불변(단일 헬퍼, PRD Open Q 2) |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | (a) 그룹 chrome 제거 → 항상 flat `<ul>` (html·md 양쪽) (b) 항목 상단 출처+시각 meta-cue 추가 (c) `data-prd`/필터옵션/탭·버킷은 유지 (d) `opts` 인자 수용 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | (a) 그룹 chrome 제거 → flat (b) 기존 출처 cue 를 상단 이동 + 시각 추가(plan 출처 한정; STATE.md OQ 는 시각 생략) (c) `opts` 수용 |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | `renderRisks`/`renderOpenQuestions` 호출에 `opts` 전달(now 결정성) |
| `plugins/mccp/scripts/lib/renderer/client/explore.js` | UPDATE | (2) "모두 펼치기/접기" 토글 블록 제거 + `.prd-group` 의존 dead 머신(`refreshGroups`/`ex-first-visible`/`prd-count` 갱신) 정리. 탭 카운트/빈상태/정렬/검색/세션 바는 보존 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | emit-gate 의 dead `hasPrdGroups` 정리(now-always-false; `hasSearchTargets`/`exploreBarRendered`가 gate 유지) + `.prd-group`/`.prd-toggle`/`.prd-sum`/`.prd-count`/`ex-first-visible` CSS dead rule 제거. footer `v1.19.1→v1.19.2` |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 footer `v1.19.1→v1.19.2` 동기 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 milestone=patch bump `1.19.1→1.19.2` |
| `CHANGELOG.md` | UPDATE | `1.19.2` row — 위험/질문 평탄화 + 출처/시각 |
| `plugins/mccp/scripts/lib/renderer/tests/prd-grouping.test.js` | UPDATE | (b) "섹션 html 에 .prd-group" 단언을 flat 구조 단언으로 교체(`groupByPrd` 순수 (a) 테스트는 불변 — 함수 유지). md 그룹 라벨 단언도 flat 로 |
| `plugins/mccp/scripts/lib/renderer/tests/explore-controls.test.js` | UPDATE | 토글 제거 회귀 + flat 정렬 가시성 |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | UPDATE | >60일/연도-경계 bin 단언 추가 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 스냅샷 `v1.19.1→v1.19.2` |
| `plugins/mccp/scripts/lib/renderer/tests/risks-source-time.test.js` | CREATE | 위험 항목 출처 라벨 + 시각 존재 + flat 구조(no `prd-group`) + **cross-PRD 정렬 보존**(Codex F1 — PRD-A low-sev/PRD-B CRITICAL → CRITICAL 먼저, html·md 양쪽) 단언 |

## Tasks

### Task 1: `planActivity` Map surface (데이터 레이어)
- **Action**: `plan-body.js`에 `planActivity = new Map()` 추가. plan loop(현 staleness loop 또는 `planPrd` loop 부근)에서 **전 plan**에 대해 `lastActivityMs(decisionId, basename, receiptItems, ledgerItems)` 계산 → `planActivity.set(canonicalPlanPath(p.path), ms)` (ms null 이면 미설정). `parsePlanBody` return 에 `planActivity` 추가.
- **Mirror**: `planPrd` Map 빌드(plan-body.js:428-452).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js`. 신규 단언 — 활동 신호 있는 plan 은 ms, 없으면 키 부재(fail-open).

### Task 2: `formatRelativeTime` >60일 절대일자 bin (opt-in, Codex F2 흡수)
- **Action**: `formatRelativeTime(isoOrDate, now, opts)` 3번째 인자 추가 — `opts.absoluteAfterDays`(number) 가 주어지고 `days > opts.absoluteAfterDays` 이면 ms 의 `Date`를 now 의 `Date`와 연도 비교: 같은 연도 → `M월 D일`, 다른 연도 → `YYYY년 M월 D일`. **opt-in이 핵심** — `opts` 미전달(기존 전 caller: footer/audit-timeline/milestone-history/multi-session/worker-fanout/drawer)은 `days + '일 전'` 경로 **byte-identical 유지**(blast radius 0, Codex F2). ≤임계 경로(초/분/시간/일)·invalid/미래/방금 가드 불변. 위험/질문 섹션만 `{ absoluteAfterDays: 60 }` opt-in. 결정성: `now`(섹션이 thread 한 `opts.now`)를 절대일자 `Date` 양변에 동일 적용 — render-date 흔들림 차단. timezone 은 단일 데스크탑 사용자 로컬(PRODUCT.md 환경 가정) — 경계 테스트로 고정 now/로컬 일관 검증.
- **Mirror**: 기존 bin 계단 패턴 + opt-in 확장(기존 시그니처 backward-compatible).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js`. (a) opts 없는 기존 ≤2일·N일전 단언 green **불변**(회귀 0). (b) `{absoluteAfterDays:60}` 신규: 90일 전(같은 연도) → `M월 D일`, 400일 전(다른 연도) → `YYYY년 M월 D일`, 경계(60일/61일) + 연도-경계(12/31↔1/1) fixed-now 단언.

### Task 3: risks 평탄화 + 출처/시각 meta-cue (Codex F1 흡수 — 정렬 순서 보존)
- **Action**:
  - `renderRisks(model, formatUtils, planBody, opts)` 시그니처 추가. `const now = opts && opts.now != null ? opts.now : Date.now();`
  - `renderItem` li-main 상단에 출처+시각 meta-cue 삽입: `출처 <span class="mono">basename(r.source)</span>` + (planActivity 에 ms 있으면) ` · <span class="cue-sec">` + `formatRelativeTime(ms, now, { absoluteAfterDays: 60 })` + `</span>`. DOM 순서상 title(`qHtml`) **앞**(PRD "항목 상단"). **위계 불변(Design Critique F-DC1, MEDIUM)**: 메타는 DOM 상단이지만 시각적으로 제목보다 **후퇴**해야 한다 — `.meta-cue`/`.cue-sec` 의 font-size 가 `.li-q` 제목보다 작고 `--muted` 토큰이라 제목이 primary tier 유지(위계는 DOM 순서가 아닌 타입 스케일로 enforce, Output Constraint 1). 기존 `.meta-cue` 토큰 재사용으로 자동 충족 — 신규 강조 스타일 금지. 정밀 시각 처리/최종 시각 표현은 impeccable 위임(아래 Design Critique).
  - **flat 렌더는 이미 `bySev` 정렬된 `active`/`resolved`/`historical` 배열에서 *직접* 방출(Codex F1 — HIGH)**: `groupByPrd` 결과(prdKey 버킷 순서)를 flatten하면 earlier-PRD low-sev 가 later-PRD CRITICAL 앞에 와 전역 severity 순서가 깨진다(md·no-JS HTML 핵심 위반). 따라서 `panelInnerHtml(active.map(r => renderItem(r, prdKeyFor(r, pb.planPrd))))` 형태로 정렬 배열을 그대로 단일 `<ul class="stack-list">`/평문 줄에 매핑. 각 항목 `data-prd` 는 신규 `prdKeyFor(item, planPrd)` 헬퍼(groupByPrd 의 per-item 로직)로 부여 — 버킷팅 일치.
  - **`groupByPrd` 는 filterOptions 수집 전용으로만 유지**(Codex F1 권장 — "keep for filter option collection"). `collectOptions` 는 groupByPrd 그룹 순회로 prds/plans 옵션 빌드(순서 무관). `filterOptions`·`data-prd`(prdKeyFor)·탭(미해결/해결됨/보관됨)·버킷·정렬·필터 축은 **전부 유지** — dead code 0.
  - `groupDetailsHtml`/`mdGroupBlock`/`shouldShowGroups`/`renderGroups`(렌더용) 는 미사용화 → 삭제(filterOptions 수집은 별도 경량 순회로).
- **Mirror**: OQ `metaCueParts` markup + `planActivity` thread + `prdKeyFor`(groupByPrd 내부 per-item 로직 재사용, DRY).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js plugins/mccp/scripts/lib/renderer/tests/risks-source-time.test.js`. html 에 `class="prd-group"` 0, `class="li-item"` 보존, 출처 라벨 + 시각 존재, 단일 `stack-list`. **cross-PRD 정렬 테스트(Codex F1)**: PRD-A low-sev + PRD-B CRITICAL 픽스처에서 flat html·md 모두 CRITICAL 이 먼저 방출(prdKey 순서 아님).

### Task 4: open-questions 평탄화 + 출처 상단 이동 + 시각
- **Action**: risks 와 대칭 — `opts` 수용, 그룹 chrome 제거하고 **이미 정렬된 `active`/`resolved` 배열(merge 순서 = chronology)에서 직접 flat 방출**(Codex F1 — groupByPrd 버킷 순서로 flatten 금지, OQ도 동일 위반 경로). `data-prd` 는 `prdKeyFor(q.source, pb.planPrd)`. `groupByPrd` 는 filterOptions 수집 전용. 기존 `metaCueParts` cue 를 li-main **상단**으로 이동 + plan 출처면 `· formatRelativeTime(planActivity ms, now, {absoluteAfterDays:60})` 추가(STATE.md OQ 는 plan 시각 없음 → 출처/섹션/line 만, 시각 생략 — 정직 표기). 탭(미해결/해결됨)·버킷·필터옵션 유지.
- **Mirror**: Task 3 risks(`prdKeyFor` + 정렬 배열 직접 방출).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js plugins/mccp/scripts/lib/renderer/tests/drawer.test.js`. flat 구조 + 출처 상단 + merge 순서 보존(prdKey 순서 아님).

### Task 5: explore.js 토글 + dead 그룹 머신 제거
- **Action**: 클라이언트 (2) "모두 펼치기/접기" 토글 주입 블록(`var groups = ... parent.insertBefore(btn ...)`) 제거. `.prd-group` 의존 dead 로직 정리 — `refreshGroups`(그룹 카운트/hidden/`ex-first-visible`) 제거하고 `refreshRouteUI`에서 호출 제외. `refreshTabCounts`/`emptyState`/`activePanelEl`/필터·정렬(`wireBar`)·검색(`wireSearch`)·세션 바(`wireSessionBar`)는 보존. 정렬은 이제 단일 `stack-list` 전체에 적용(그룹 경계 사라짐 = PRD 핵심).
- **Mirror**: 기존 PE 불변(JS off 전체 가시).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/explore-controls.test.js plugins/mccp/scripts/lib/renderer/tests/explore-search.test.js plugins/mccp/scripts/lib/renderer/tests/explore-sort.test.js`. 토글 마크업 부재 + 정렬/검색/필터 green.

### Task 6: html.js emit-gate + CSS dead rule 정리, footer, version bump
- **Action**: html.js emit-gate `hasPrdGroups`(now-always-false) 제거 — `hasSearchTargets || exploreBarRendered || sessionBarRendered` 로 EXPLORE_JS gate 유지(회귀 0 확인). `.prd-group`/`.prd-sum`/`.prd-label`/`.prd-count`/`.prd-toggle`/`.ex-first-visible` CSS dead rule 제거. footer(`html.js:1442` + `markdown.js:154`) `v1.19.1→v1.19.2`. `plugin.json` `1.19.1→1.19.2`. `CHANGELOG.md` row. `i18n-surface.test.js` 스냅샷 동기.
- **Mirror**: §3.7 milestone PR 체크리스트 + footer drift 경고.
- **Validate**: `grep -rn "1\.19\.1\|v1\.19\.1" plugins/mccp/.claude-plugin/plugin.json plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js` → 0. `grep -rn "prd-group\|prd-toggle\|ex-first-visible" plugins/mccp/scripts/lib/renderer/html.js` → 0 (CSS+gate dead 제거 확인).

### Task 7: 스냅샷/회귀 일괄 갱신
- **Action**: 평탄화·출처·시각·footer 의도 변경으로 churn 나는 스냅샷(`prd-grouping.test.js` (b)/(c), `sections.test.js`, `i18n-surface.test.js`, design-invariant H 계열) 갱신 + diff 리뷰로 회귀 아님 확인. `groupByPrd` 순수 (a) 테스트는 불변 유지(함수 미변경).
- **Mirror**: PRD Risk "스냅샷 대량 갱신 = 의도된 변경".
- **Validate**: 전체 렌더러 스위트 green (아래 Validation §).

## Validation
```bash
# (worktree cwd 기준)
# 1) 평탄화 — 위험/질문 html 에 PRD 그룹 chrome 0
node plugins/mccp/scripts/derive/cli.js render >/dev/null 2>&1 || true
grep -c 'class="prd-group"' .claude/cache/status.html   # 0

# 2) li-item·필터 속성 보존 (회귀 0)
grep -o 'data-prd="[^"]*"' .claude/cache/status.html | head   # 존재 (필터축 유지)
grep -o 'data-sev="[0-9]"' .claude/cache/status.html | head    # 존재 (정렬축 유지)

# 2b) cross-PRD 정렬 보존 (Codex F1) — flat 리스트가 prdKey 버킷 순서 아닌
#     severity/merge 전역 순서. unit 테스트가 1차 검증, 렌더 출력은 data-sev 단조성 확인.
node --test plugins/mccp/scripts/lib/renderer/tests/risks-source-time.test.js 2>&1 | tail -2

# 3) 토글 제거
grep -c "모두 펼치기\|모두 접기\|prd-toggle" plugins/mccp/scripts/lib/renderer/client/explore.js  # 0

# 4) version + footer 동기
grep -rn "1\.19\.1\|v1\.19\.1" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js   # 0 (전부 1.19.2)

# 5) 어휘 무변경 경계 — M2 는 '수렴' 치환 안 함(그건 M3). 사전 측정만(M3 baseline)
grep -rc "수렴" plugins/mccp/scripts/lib/renderer/sections plugins/mccp/scripts/lib/renderer/html.js | grep -v ':0' | head  # 변동 없어야

# 6) 전체 렌더러 테스트 green
node --test plugins/mccp/scripts/lib/renderer/tests/ 2>&1 | tail -3
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| `formatRelativeTime` >60일 bin 확장이 다른 시각 표면(audit-timeline·milestone-history·multi-session·drawer)의 오래된 ts 스냅샷을 변동 | MEDIUM | ≤60일 경로 불변이라 최근 ts 표면은 무영향. >60일 fixture 만 churn → 전 스위트 실행 후 의도 변경만 갱신. 우려 시 위험/질문 한정 별도 헬퍼로 후퇴 가능(plan 결정: 단일 헬퍼 우선) |
| 평탄화로 정렬이 단일 `stack-list` 전체 적용되며 `sortList`(그룹별 loop)가 빈 그룹 가정 | LOW | `wireBar` 의 `root.querySelectorAll('.stack-list')` 는 그룹 유무 무관 — flat 도 1개 list 로 정상 정렬. 회귀 테스트 `explore-sort` |
| no-JS 베이스라인 회귀 | MEDIUM | flat `<ul>` 는 전 항목 가시(grouped `open` details 와 동등 이상). `data-prd/plan/sev/ord` 보존. design-invariant H 계열 + sections 테스트 |
| STATE.md OQ 에 plan 시각 없어 일부 항목만 시각 표시(불균질) | LOW | PRD Out-of-scope(항목 정밀 시각 제외) + plan 근사 채택과 일치. STATE.md OQ 는 출처만 — 정직 표기 |
| dead CSS/gate 제거가 다른 route 참조를 끊음 | LOW | `.prd-group` 은 risks/OQ 두 섹션에만 존재(grep 확인). 제거 전 repo-wide grep 으로 잔여 참조 0 검증 |
| 평탄 active 리스트가 길어져 그룹이 주던 시각적 청킹 상실(Design Critique F-DC2, LOW) | LOW | 의도된 trade-off — 정렬 가시성(PRD 핵심)이 청킹보다 우선. severity 뱃지 + 무방해 정렬이 per-item scannability 보강, 해결/보관 탭이 lifecycle 청킹 유지. Output Constraint 4 신규 위반 아님(전용 route 는 기존 full-mode "전체 보기") |

## Acceptance
- [ ] 위험·질문 패널이 PRD 그룹 chrome 없이 전체 평탄 리스트(렌더 출력 `class="prd-group"` 0)
- [ ] "모두 펼치기/접기" 토글 제거(explore.js 토글 블록 + 마크업 0)
- [ ] 각 항목 상단에 출처 plan 문서명(작은 회색) 표시 — 위험·질문 동일 패턴
- [ ] plan 출처 항목에 최근 활동 시각(사람이 읽기 쉬운 형식; >60일 절대일자) 표시
- [ ] 필터(PRD/plan)·정렬(위험도순·시간순)·탭(미해결/해결됨/보관됨) 회귀 0 — `data-*` 속성 보존
- [ ] no-JS 베이스라인 전 항목 가시(graceful degrade)
- [ ] `plugin.json` `1.19.2` + footer(html.js/markdown.js) + CHANGELOG 동기(version drift 0)
- [ ] 어휘('수렴' 등) 무변경(M3 scope) — M2 diff 에 어휘 치환 0
- [ ] 전체 렌더러 테스트 green(의도된 스냅샷 갱신 포함)
- [ ] 패턴(OQ metaCueParts · planPrd Map · 단일 relative-time 헬퍼)을 따름

## Design Routing Guide
<!-- /mccp:plan re-derives + stamps --impeccable-routing-mode on its mccp-plan-codex receipt. plan stage 는 recommend-only(invoke 0). -->

위험/질문 리스트 평탄화·출처/시각 메타는 사용자 노출 디자인 표면 — implement 단계에서 stage-aware impeccable 라우팅(§3.10) + produced-diff grounding lint(§3.9)로 mechanical 보강한다. SKILL `frontend-design-direction`의 `## Output Constraints` 4축을 implement 진입 즉시 Read:

1. 정보 위계 3단계(primary action → status → detail) — 출처/시각 meta-cue 는 detail 위계(제목보다 후퇴).
2. 강조색 viewport당 ≤1 — 출처/시각은 중립 회색 토큰(`--muted`/`.cue-sec`), 강조색 미사용.
3. raw markdown marker 미surface — 출처 basename/시각은 평문, `normalizeProse`/`stripMarker` 경유.
4. 한 화면 항목 수 상한 — 평탄 리스트는 전용 route(전체 보기)라 캡 없음(기존 full-mode 유지); 탭이 resolved/historical 분리.

| stage | command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` |
| simplify | `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| polish | `/impeccable polish` |

## Design Critique

- detect: `skill_available=true · design_signal=true` (renderer 파일 8종 signal) → SKILL first-step Read(`frontend-design-direction/SKILL.md ## Output Constraints`) + critique loop 발화.
- routing mode: `auto` (plan stage 는 recommend-only — 위 Design Routing Guide, invoke 0).
- impeccable critique (R0, plan-stage 4-constraint 평가, PRODUCT.md register=product 컨텍스트): 방향 **SOUND**.
  | Finding | Severity | Verdict | 흡수 |
  |---|---|---|---|
  | F-DC1 — 출처/시각 메타를 항목 상단 배치 시 detail-tier 가 DOM 상 primary 위로 → 위계 혼선 가능(Constraint 1) | MEDIUM | ACCEPT_NOW | Task 3 에 "위계는 타입 스케일로 enforce(제목보다 작은 글씨 + `--muted` 후퇴), 신규 강조 스타일 금지" 명문화 |
  | F-DC2 — 평탄 active 리스트가 그룹 청킹 상실(Constraint 4 인접) | LOW | ACCEPT_NOW | Risks 에 의도된 trade-off(정렬 가시성 우선) + severity 뱃지/lifecycle 탭 보강 기록 |
  | 평탄화 자체(group chrome 제거) | — | 개선 | 위계 4단→3단 축소 + quiet-by-default 정합(PRODUCT.md Design Principle 3). Constraint 2/3 위반 0 |
- 라운드 수: 1 (R0; HIGH/CRITICAL/UNKNOWN 0 → decideCritique CONVERGED, retry 없음).
- verdict: **converged**. produced-diff grounding(§3.9 Phase 3.7) + stage-aware routing(§3.10)이 implement 단계에서 mechanical 보강.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; `--impeccable-available` design-scope preamble 적용)
- 라운드 수: 1 (R1; F1=ACCEPT_NOW×HIGH지만 R1 편집으로 *완전* 해소 → §5.4 (b) 미충족, R2 escalate 없음)
- 합치 결론: codex verdict `needs-attention` — 2 finding(1 HIGH + 1 MEDIUM) 모두 타당, R1에서 plan 흡수. 핵심 목표(평탄화 + 출처/시각)는 유지하되 *정렬 순서 보존*과 *시각 헬퍼 blast-radius*를 정밀화.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — flat 렌더를 `groupByPrd` 버킷 순서에서 flatten하면 전역 severity/merge 순서 깨짐(md·no-JS HTML 위반; 클라 정렬만 가림) | HIGH | ACCEPT_NOW | 정렬된 `active`/`resolved`/`historical` 배열에서 *직접* 방출 + `prdKeyFor` per-item lookup, `groupByPrd` 는 filterOptions 전용. Task 3/4 + Files(prd-group.js) + cross-PRD 정렬 테스트 흡수 완료. R1에서 완전 해소(설계 seam 명확) |
  | F2 — 공유 `formatRelativeTime` 절대일자화가 timezone/render-date 의존 + 무관 표면 오래된 ts 변동 | MEDIUM | ACCEPT_NOW | opt-in `{absoluteAfterDays}` 파라미터로 — default byte-identical(기존 caller 무변경, blast radius 0) + 위험/질문만 opt-in + threaded `now` 결정성 + 경계(60/61일·연도경계) 테스트. Task 2 흡수 완료 |
- Deferred to backlog: 0
- Open Questions: 없음 (CRITICAL 0, HIGH 1건은 R1 완전 해소, auto-CRITICAL 카테고리 해당 없음)
- Codex session 참조: threadId `019f183c-fd6e-7b43-aea0-2106e3dc05a4`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- 합치 결론: plan-codex(`## Codex Adversarial Review`)가 F1(정렬 순서 보존)·F2(formatRelativeTime opt-in blast-radius)를 ACCEPT_NOW로 흡수, file 구조/abstraction boundary(prdKeyFor·prdMetaFor·planActivity Map·formatRelativeTime opts)/external dep(0)/concurrency(없음) 전부 plan body에 pre-commit. implement-time 신규 결정 0.
- `git diff --name-only origin/main..HEAD` ⊆ Files to Change: 빈 diff (구현 미착수) — 0 ⊆ list, file 확장 없음.

### Design Review

> impeccable available, implement-mode detector `no-signal` (silent-skip): produced diff는 렌더러 `.js` 소스(control-plane)이고 렌더 출력 `.claude/cache/status.html`은 gitignore라 lintable diff에 미포함. 디텍터의 no-signal은 정직한 평가. 디자인 품질은 plan-codex critique(converged, R0) + Output Constraints 4축(Design Routing Guide) + Task 3/4 위계·정렬 단위 테스트로 보장. produced-diff grounding(Phase 3.7)은 rendered-surface 부재로 anchor_clean no-op 예상.
