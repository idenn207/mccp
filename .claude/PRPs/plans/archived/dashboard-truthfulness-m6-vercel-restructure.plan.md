# Plan: Dashboard Truthfulness M6 — Vercel 카드 재구성 + Hero/파이프라인 진실성

**Source 피드백**: `.claude/notes/dashboard-m6-design-feedback.md` (2026-06-25 사용자 육안 검토 8건)
**Vercel 참조**: `.samples/vercel.com_parkdongmins-projects.png`
**Cycle**: Dashboard Truthfulness PRD (`.claude/prds/dashboard-truthfulness.prd.md`) — M1~M5 complete, 본 plan = M6
**Complexity**: Medium

## Summary

M5b까지 데이터는 truthful하나 *표현*이 미흡하다는 사용자 육안 피드백 8건을 닫는다. 핵심 두 축은 (1) **Hero·파이프라인 진실성 잔여 결함** — Hero h1이 verbose Summary로 잘리고 `/mccp:resume` prompt가 "무엇을 하는지" 없이 무의미하며, `/mccp:prp-implement` 진행 *중*인데 impl 노드가 ✓ 완료로 거짓 표시되는 결함 — 과 (2) **Vercel식 카드 재구성** — 단일 hero-panel에 뭉친 위젯 4종을 개별 카드 2컬럼 + 아래-화살표 확장으로 분해. 나머지는 라벨 정합(위험/질문/파이프라인/대시보드로)과 마일스톤 토글의 탭 패턴 통일이다. 콘솔 셸 계약(`OKLCH_DARK` 토큰 + 사이드바 + `:target` 라우팅 + route id 식별자)은 불변.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 탭(active/resolved) | `parsers/tabs.js:24` `buildTabs` | hidden radio + `order` + 인접 `:checked` 형제, JS 0. open-questions/risks가 SSoT 공유 — milestone-history도 동일 빌더로 통일(항목 3) |
| 위젯 카드 anatomy | `html.js:773` `renderPanel` (head/body/foot) | 비중첩 `.panel`(H17) — hero 위젯 4종을 이 anatomy의 개별 카드로(항목 2) |
| 결정 상태 SSoT | `parsers/decision-state.js:56` `nodeStatus`/`buildDecisionState` | 노드/decision 상태 단일 판정. impl-진행중 진실성을 여기에 추가(항목 8) |
| 신선도 가드 | `sections/status-grid.js:101` `planStatuses`/`staleness` | plan in-progress 신호. 항목 8의 "진행 중" 판정 가드로 재사용 |
| Hero 요약체 cap | `verdict.js:29` `capIntent` / `parsers/intent-extractor.js` | 마일스톤명 우선 + 요약 subtext로 교체(항목 1a) |
| next-action provenance | `parsers/next-action.js:64` `resolveNextAction` (`source`/`prose`) | source→설명 매핑으로 "무엇을 하는지" 노출(항목 1b) |
| 더보기 확장 | `html.js:405` `details.more` chevron | Vercel 아래-화살표 확장 버튼으로 위젯 카드 overflow 표현(항목 2) |
| STATUS.md 동등 | `markdown.js` 섹션 헤딩 + footer | HTML 라벨 변경 시 markdown.js 동기(항목 5/6 + footer version) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATE | 항목 1a — Hero h1을 마일스톤명 우선 + 요약 subtext(잘림 해소) |
| `plugins/mccp/scripts/lib/renderer/parsers/next-action.js` | UPDATE | 항목 1b — source→설명 라벨 노출(executable + "무엇을 하는지") |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | 항목 4 — cell label '미해결 위험'→'위험'; 항목 1b next-action 설명 전달; 항목 2 위젯 데이터 구조 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | 항목 1(hero subtext+설명 렌더), 2(카드 2컬럼+아래-화살표 CSS/마크업), 5/6(nav·tb-title·route page-title·KIND 라벨), footer version |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | 항목 3 — '미진행 마일스톤 N건 표시' `<details>` → `buildTabs`(완료/미진행 탭) |
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | UPDATE | 항목 7(foot-link '개요로'→'대시보드로'), 8(impl 진행중 마커/status) |
| `plugins/mccp/scripts/lib/renderer/parsers/decision-state.js` | UPDATE | 항목 8 — converged 비-terminal stage의 진행중 진실성(plan in-progress 가드) |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | 항목 5 — empty-state/탭 라벨 '질문' 정합(route 식별자 불변) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | 항목 5/6 헤딩('파이프라인'/'질문') + footer version 동기 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.18.9`→`1.18.10` (patch — 단일 milestone, §3.7) |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | Delivery Milestones에 M6 row 추가(in-progress) |
| `plugins/mccp/scripts/lib/renderer/tests/*.test.js` | UPDATE | 라벨/구조 변경에 따른 단언 갱신(아래 Task별 명시) |

## Tasks

### Task 1: 라벨 정합 — '위험'/'질문'/'파이프라인'/'대시보드로' (항목 4·5·6·7)

가장 mechanical·저위험. route 식별자(`data-route`/`id="route-*"`/`:target` selector/`tb-title data-t`)는 **절대 불변** — 표시 텍스트만 변경.

- **Action**:
  - 항목 4 — `status-grid.js:195` cell label `'미해결 위험'` → `'위험'`; `status-grid.js:224` `widgetMd('미해결 위험', …)` → `'위험'`. (nav-link는 이미 '위험'.)
  - 항목 5 — `html.js` nav-link(`:868`), tb-title(`:896`), route aria-label(`:931`), page-title(`:932`), `renderPanel('미해결 질문', …)`(`:934`)의 표시 텍스트 `'미해결 질문'` → `'질문'`. drawer `KIND.oq`(`:591`) `'미해결 질문'`→`'질문'`. open-questions.js empty-state(`:134`,`:159`)는 active 탭 맥락 유지하되 '질문' 정합(`'질문이 없습니다'`). 패널 내부 active/resolved 탭 라벨('미해결'/'해결됨')은 **유지**(패널명 '질문' 하위에서 active/resolved 구분 역할). `markdown.js:98` 헤딩 `'## 미해결 질문'`→`'## 질문'`.
  - 항목 6 — `html.js` nav-link(`:872`), tb-title(`:894`), route aria-label(`:915`), page-title(`:916`)의 `'게이트 파이프라인'` → `'파이프라인'`. `markdown.js:56` 헤딩 동기. (`panelIcon`/`renderPanel('decision 별 게이트', …)` 내부 제목은 불변 — 패널 자체 제목.)
  - 항목 7 — `pipeline.js:121` foot-link 텍스트 `'개요로'` → `'대시보드로'` (route href `#route-overview` 불변).
- **Mirror**: route 식별자 불변 규칙(`.claude/notes/dashboard-m6-design-feedback.md` §라벨 변경 시 주의).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js tests/header-hoist.test.js tests/dashboard-overview.test.js tests/markdown-equivalence.test.js tests/a11y-aria-labels.test.js` — 단언 갱신 후 PASS. `grep -rn "게이트 파이프라인\|미해결 질문\|미해결 위험\|개요로" plugins/mccp/scripts/lib/renderer/ --include=*.js | grep -v tests/` 이 주석 외 0건.

### Task 2: Vercel 카드 재구성 — hero 1칼럼 유지 + 위젯 개별 카드 2컬럼 + 아래-화살표 확장 (항목 2)

사용자 결정(2026-06-25): **상단 hero 영역은 1칼럼 유지, 그 하위로 위젯을 개별 카드 2컬럼으로 분해, 확장은 Vercel식 아래-화살표 버튼.** Vercel 참조: 각 카드 자체 header+body, ~9px radius, hairline border, 비중첩, 카드 하단 중앙 `⌄` 확장.

- **Action**:
  - `renderHeroPanel`(`html.js:703`) 재구성: hero-panel 카드에는 **hero-status + verdict h1(+subtext, Task 4) + next-action prompt(+설명, Task 5)** 만 남긴다(1칼럼 상단 밴드). `hero-widgets` 그리드(`:753`)를 hero-panel **밖**으로 빼서 별도 `<div class="card-grid">` 2컬럼으로.
  - 위젯 4종(진행중/차단/이월/위험)을 각각 `renderPanel` anatomy의 개별 `.panel` 카드로 — head(아이콘+라벨+count) / body(top-3 항목 + 아래-화살표 확장). 기존 `heroWidget`(`:654`)을 카드형 `renderWidgetCard`로 리팩터(머지 아닌 분리, H17 비중첩).
  - **아래-화살표 확장(신규 CSS)**: overflow(>3) 항목을 `<details class="card-expand">` + 하단 중앙 `<summary>`(아래 chevron `ic-chev-d`)로. 위험처럼 route 있는 위젯은 기존 `hw-more` 전체보기 링크 유지 가능(택1, 카드 footer 정렬). reduced-motion 가드 계승(`html.js:553`).
  - **강조색 경쟁 방어(critique F1 흡수, Constraint 2)**: 4 카드를 개별화하면 카드별 상태색(진행중 accent-blue / 차단 bad-red / 이월 mute / 위험 amber)이 한 viewport에서 경쟁할 위험. **카드 컨테이너(`.panel` border/배경)는 전부 neutral 유지** — 상태색은 작은 dot + count 숫자에만 한정하고, **viewport당 loud는 차단(>0)만**(red), 위험은 amber count, 진행중/이월은 muted. 카드 head 아이콘도 muted. 색 단독 의미 금지(dot+라벨 병행).
  - `route-overview`(`:910`) 마크업: `renderHeroPanel`(1칼럼) + `card-grid`(2컬럼) 순서.
  - `LAYOUT` CSS: `.card-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap}` + 880px 반응형 1-col(`:547` 패턴 미러) + `.card-expand summary`(중앙 정렬 아래-화살표) 추가.
  - STATUS.md 동등: `status-grid.js` `widgetsMd`(`:220`)는 구조 유지(plain-text는 카드 무관).
- **Mirror**: `renderPanel` head/body anatomy(`html.js:773`), `details.more` chevron 회전(`:411`), 반응형 grid collapse(`:539`).
- **Validate**: `node --test tests/dashboard-overview.test.js tests/responsive-layout.test.js tests/design-invariants.test.js tests/output-constraints.test.js tests/console-shell.test.js` PASS. 산출 후 `node plugins/mccp/scripts/derive/cli.js render` → 사용자 육안(`.claude/cache/status.html`)으로 카드 분해·확장 확인.

### Task 3: 마일스톤 기록 토글 → 탭 통일 (항목 3)

`milestone-history.js:306` '미진행 마일스톤 N건 · 표시' `<details>` 토글을 risks/questions의 `buildTabs`(완료 default + 미진행 N) 패턴으로 통일.

- **Action**:
  - `milestone-history.js` 완료 목록(`:289`)과 lifecycle 목록(`:306` `<details>`)을 `buildTabs`로 교체 — `{name:'tab-milestones', tabs:[{id:'done', label:'완료', count:merged.length, panelHtml, checked:true}, {id:'lifecycle', label:'미진행', count:lifecycle.length, panelHtml}]}`. lifecycle 0건이면 탭 없이 완료 직접 노출(open-questions의 resolved 0 분기 미러, `:152`).
  - 완료 목록의 expanded/collapsed `details.more` 더보기는 done 탭 panel 내부에 유지(MAX_EXPANDED=5).
  - `buildTabs` import 추가. STATUS.md md는 기존 `<details>` plain-text 유지(탭은 HTML CSS 전용 — md 동등본은 `<details>`가 적합).
- **Mirror**: `parsers/tabs.js:24` `buildTabs` spec, `open-questions.js:143` 탭 조건부 분기.
- **Validate**: `node --test tests/milestone-history.test.js tests/milestone-lifecycle.test.js tests/tabs.test.js tests/sections.test.js` PASS. 탭 radio `name="tab-milestones"`가 기존 `tab-questions`/위험 탭과 충돌 없음 확인.

### Task 4: Hero h1 잘림 해소 — 마일스톤명 우선 + 요약 subtext (항목 1a)

`verdict.js:136` fresh-in-progress 분기의 `'현재 작업: ' + capIntent(intent)`가 verbose `## Summary` 추출로 잘림. **마일스톤명을 primary**로, 요약을 **2줄 subtext**로 분리(잘림 대신 line-clamp).

- **Action**:
  - `verdict.js`: fresh-in-progress 시 h1 text를 **마일스톤명**(slug→readable 라벨; v-prefix·비-v-prefix 양쪽 처리하는 formatter, `status-grid.js:46` `formatPlanLabel` 일반화/재사용)으로. verbose Summary intent는 h1에서 제거.
  - verdict 객체에 optional `subtext`(요약 prose — 기존 `extractIntent` 결과, cap 완화)를 추가. `computeVerdict` 반환 shape 확장(기존 `{tone,icon,text}` + `subtext?`).
  - `renderHeroPanel`(`html.js:762`): h1 아래 `subtext` 있으면 `<p class="verdict-sub">` 렌더 — CSS `-webkit-line-clamp:2`(2줄, 단어 중간 깨짐 0, 전체는 드로어/route 위임). reduced-motion 무관. **subtext는 `renderProseHtml` 경유(critique F2 흡수 — raw `**bold**`/MD0xx 누출 방지, Constraint 3·H10/H16, known debt H16 동류).**
  - `markdown.js` Verdict 동등: subtext는 md에 한 줄 보조로 append(plain-text 동등).
- **Mirror**: `verdict.js:29` `capIntent` codepoint-aware, `status-grid.js:46` `formatPlanLabel`.
- **Validate**: `node --test tests/verdict.test.js tests/dashboard-overview.test.js tests/markdown-equivalence.test.js` PASS. 긴 Summary plan fixture에서 h1=마일스톤명, subtext=2줄 clamp 확인.

### Task 5: next-action prompt에 "무엇을 하는지" 설명 (항목 1b)

`/mccp:resume` 같은 명령이 설명 없이 무의미. 미해결 질문 action-prompt처럼 **명확한 실행 지시(명령 + 무엇을)**로.

- **Action**:
  - `next-action.js` `resolveNextAction` 반환에 `description`(짧은 "무엇을 하는지") 추가 — `source` 기반 매핑: `resume-state`→'STATE.md 핸드오프 신호로 다음 작업 이어가기', `in-progress-plan`→해당 plan intent(`extractIntent`) 또는 '진행 중 plan 구현 계속', `state-command`→`prose`(STATE.md Next Step 첫 줄), `idle`→없음. fail-open(추출 실패 시 description 생략).
  - `renderHeroPanel`(`html.js:716` action-prompt 분기): executable prompt에 `description` 있으면 명령 옆/아래 muted 보조 텍스트로(`.action-prompt .desc`, `renderProseHtml` 경유 — critique F2 흡수, raw marker 0). Constraint 2(강조색 ≤1) 준수 — 설명은 muted, 복사 버튼 neutral.
  - `status-grid.js` `nextActionMd`(`:81`) 동등: md에도 설명 한 줄 append.
- **Mirror**: `open-questions.js:97` action-prompt(복사 + 드로어 설명) 구조, `next-action.js:62` source provenance.
- **Validate**: `node --test tests/next-action.test.js tests/dashboard-overview.test.js tests/markdown-equivalence.test.js` PASS. resume-state/in-progress-plan/state-command 3 source에서 description 노출 확인.

### Task 6: 파이프라인 stage 진실성 — "게이트 수렴" ≠ "stage 완료" (항목 8)

**진짜 버그**(사용자 정정): `/mccp:prp-implement` 중 impl 노드가 ✓(done-green '완료')로 표시 → 마일스톤 완료로 오해. 원인 — `nodeStatus`(`decision-state.js:56`)가 `converged===true → 'done'`. implement-codex 수렴은 *게이트 통과* 사실일 뿐, stage 완결(커밋/PR)도 아니고 "현재 실행 중"도 아니다.

**Codex Plan-Codex R1 흡수 (F1 HIGH + F2 MEDIUM)**: 대시보드는 receipt+plan-status만으로 "실행 중" vs "구현 완료·PR 대기"를 구분할 수 없다(F1). 그러므로 (a) "구현 중"이라는 입증 불가 주장과 (b) plan in-progress / decision↔plan 매칭 기반 status-flip(F2 — 모호)을 **둘 다 폐기**한다. 대신 **receipt-only supersession**으로 "게이트 수렴·다음 미시작"을 done-green '완료'와 시각 분화한다 — '완료'도 '진행 중'도 아닌, 사실 그대로 "게이트 수렴 · 다음 단계 대기".

- **Action** (receipt-only — plan 매칭·liveness·in-progress 입력 의존 0):
  - `decision-state.js` `buildDecisionState`/`nodeStatus`: done-green '완료'(✓)는 **superseded 입증된 stage에만** — 즉 *downstream stage에 receipt 존재*(다음 게이트가 시작됨 = 이 stage 종료 입증)이거나 decision이 closed(terminal pr-codex / ledger, `isMilestoneClosed`)일 때. 그 외 **최신 converged 비-terminal stage(frontier)이고 downstream receipt 無 + decision active**면 `'done'`이 아니라 신규 상태 **`'converged-frontier'`**.
  - supersession은 순수 존재 판정: `nodes[i]`의 downstream `nodes[i+1..]` 중 status≠'missing'(receipt 존재)이 하나라도 있으면 superseded → converged면 done-green. frontier = superseded 아닌 최신 converged 비-terminal 노드. **plan-status / decision↔plan 매칭 / liveness 일절 미사용** (F2 해소 — status를 바꾸는 입력은 receipt 존재/시간뿐).
  - `NODE_MARK`(`pipeline.js:15`) 신규 엔트리 `'converged-frontier' → { dot:true, label:'수렴', cls:'is-converged' }` — **check(✓) 아닌 neutral 마커**(◉/half-dot, done-green과 CSS 분화; ✓=완료 오독 차단). `NODE_MD` 신규 글리프(예 `◉`). `statusOf`(`:29`)는 frontier가 impl이면 "구현 게이트 수렴 · 다음 PR" 같은 **사실 텍스트**(NOT "구현 중"). `html.js` LAYOUT에 `.pipe-node.is-converged` CSS(neutral 톤).
  - `pipeline.js`·`status-grid.js`(blocked count)·`audit-timeline`(is-bad) 동일 SSoT — 신규 상태는 active도 blocked도 아님 → **blocked/done 카운트·판정 무영향**(회귀 0) 확인.
  - pr-codex receipt 등장 또는 milestone closed 시 frontier→done-green 자동 전이(시간 흐름 정합).
- **Mirror**: `decision-state.js:84` latestConvergedTime supersede 가드(시간/존재 판정 패턴), `:97` frontier `find(n=>n.status!=='done')`, `:152` `isMilestoneClosed`.
- **Validate**: `node --test tests/pipeline.test.js tests/completion-detect.test.js tests/sections.test.js` PASS. fixture(입력은 receipt 셋만): (a) plan✓(superseded)+impl converged+pr無+decision active → impl=◉'수렴'(NOT done-green ✓), 상태 "구현 게이트 수렴·PR 대기"; (b) plan✓+impl✓+pr✓ → 전부 done-green; (c) pr-codex 등장 → impl→done 전이; (d) blocked decision → is-block 무변경(회귀 0); (e) plan converged+impl無 → plan=◉'수렴'(frontier). **plan-status·liveness 입력 없이 동일 결과**(receipt-only 입증 — F1·F2 해소).

### Task 7: 버전 bump + PRD M6 row + 통합 회귀

- **Action**:
  - `plugin.json` version `1.18.9`→`1.18.10`. `html.js:949` footer `v1.18.9`→`v1.18.10`, `markdown.js:112` `v1.18.9`→`v1.18.10` 동기(surface drift 0, §3.7).
  - `.claude/prds/dashboard-truthfulness.prd.md` Delivery Milestones에 M6 row 추가: `| 6 | 표현 재구성 + Hero/파이프라인 진실성 | Vercel 카드 2컬럼 + 아래-화살표 확장 / Hero 마일스톤명+요약 / next-action 설명 / impl 진행중 진실성 / 라벨 정합(위험·질문·파이프라인·대시보드로) / 마일스톤 탭 통일 | in-progress | (본 plan 경로) |`.
  - 전체 렌더러 스위트 회귀: `node --test plugins/mccp/scripts/lib/renderer/tests/`.
  - 산출 + 사용자 육안: `node plugins/mccp/scripts/derive/cli.js render` → `.claude/cache/status.html`.
- **Mirror**: §3.7 version bump 의무 체크리스트(plugin.json + footer 동기), M5 row 형식.
- **Validate**: 전 스위트 PASS(0 회귀), `grep`로 version drift 0.

## Validation

```bash
# 단계별 (Task 순)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js \
  plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js \
  plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js
# 전체 렌더러 스위트 (최종)
node --test plugins/mccp/scripts/lib/renderer/tests/
# derive 회귀
node --test plugins/mccp/scripts/derive/tests/ 2>/dev/null || true
# 산출 (사용자 육안 검증)
node plugins/mccp/scripts/derive/cli.js render && echo "→ .claude/cache/status.html 확인"
# 라벨 잔재 0 / version drift 0
grep -rn "게이트 파이프라인\|미해결 질문\|미해결 위험\|개요로\|v1\.18\.9" \
  plugins/mccp/scripts/lib/renderer/ --include=*.js | grep -v tests/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| route 식별자 오변경 → CSS `:target` 라우팅 깨짐 | 중 | route id/`data-route`/`tb-title data-t`/selector **불변** 규칙 — 표시 텍스트만. i18n-surface/header-hoist 단언으로 가드 |
| 카드 재구성이 console-shell/design-invariant 테스트 대량 회귀 | 중 | 단계별 ship + 섹션별 단위 테스트 + STATUS.md 동등본 가드. H17(비중첩)·Constraint(강조색 ≤1) 준수 |
| 항목 8이 "impl 완료-후-PR대기"를 거짓 in-progress로 오판 (Codex F1 HIGH) | — | **설계로 해소** — "구현 중" 주장 자체를 폐기. converged-frontier는 receipt-only("게이트 수렴·다음 대기")라 실행중/완료대기 어느 쪽도 거짓 주장 안 함 |
| 항목 8 decision↔plan 매칭 모호 (Codex F2 MEDIUM) | — | **설계로 해소** — status 변경 입력을 receipt 존재/시간으로만 한정. plan-status·매칭·liveness 일절 미사용 |
| 항목 8 신규 converged-frontier 상태가 blocked/done 카운트에 부수효과 | 낮 | 신규 상태는 active도 blocked도 아님 — blocked/done 카운트·supersede 가드 무변경. status-grid blocked·timeline is-bad 회귀 테스트 |
| verdict shape 확장(subtext)이 기존 소비자 깨짐 | 낮 | `subtext` optional, 기존 `{tone,icon,text}` 불변. verdict.test.js 갱신 |
| 디자인 surface 변경이 design-gate critique divergent | 중 | impeccable shape→layout→critique→audit 워크플로(노트 권장). implement 단계 critique 수렴까지 |

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료 (4 anchor in-context).
- 라운드 수: 1 (R0)
- Verdict: **CONVERGED** (`decideCritique` — HIGH/CRITICAL/UNKNOWN 0)
- Findings (plan 디자인 방향 평가, Vercel 참조 기준):
  | Finding | Severity | Section | 흡수 |
  |---|---|---|---|
  | F1 카드 개별화 시 상태색(blue/red/amber/mute) viewport 경쟁 → Constraint 2 위반 위험 | MEDIUM | Task 2 | 흡수 — 카드 컨테이너 neutral, 상태색은 dot+count 한정, loud는 차단(>0)만 |
  | F2 Hero subtext + next-action description raw text 노출 → marker 누출 | LOW | Task 4/5 | 흡수 — `renderProseHtml`/`renderProseMd` 경유 명시 |
- 4 Output Constraints 정합: 위계 3단계(hero→카드 status→확장 detail, heading ≤3) / 강조색 ≤1(F1 흡수) / raw marker 0(F2 흡수) / 항목 상한(top-3 + 아래-화살표 확장).
- 구현 위임: `/mccp:prp-implement` 진입 시 design-gate(§3.9)가 동일 critique loop을 rendered surface(`.claude/cache/status.html`)에 재실행. Vercel 참조(`.samples/vercel.com_parkdongmins-projects.png`)를 layout/critique 기준으로 사용.

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI 없음 → invoke 없이 checklist만. implement 단계에서 design-gate가 stage-appropriate impeccable 명령을 라우팅(content-detectable 명령은 diff signal 있을 때만 invoke).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Acceptance

- [ ] 8개 피드백 항목 전부 반영 (1a Hero / 1b next-action 설명 / 2 카드 / 3 마일스톤 탭 / 4 위험 / 5 질문 / 6 파이프라인 / 7 대시보드로 / 8 impl 진행중)
- [ ] route 식별자 불변 — `:target` 라우팅 무손상 (i18n-surface/header-hoist PASS)
- [ ] 전체 렌더러 스위트 0 회귀
- [ ] STATUS.md ↔ status.html 정보 동등 유지 (markdown-equivalence PASS)
- [ ] plugin.json + footer(html.js/markdown.js) version `1.18.10` 동기, drift 0
- [ ] PRD Delivery Milestones M6 row 추가(in-progress)
- [ ] 사용자 육안 검증 (`.claude/cache/status.html`) — Vercel 카드 분해·아래-화살표·Hero 명확성·impl 진행중 마커
- [ ] 패턴 재사용(buildTabs/renderPanel/decision-state), 재발명 금지

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1 — item 8 receipt-only 재설계, 카드 재구성, 라벨 정합 모두 adversarial review 통과·흡수). No new implement-time decisions detected — 구현은 plan에 file:line + 신규 `converged-frontier` 상태/`renderWidgetCard`/`card-expand` 마크업까지 완전 명세, architectural 신규 결정 0. Cross-gate dedupe applied.

> base-mismatch 주: `git diff origin/main..HEAD`는 43 file이나 이는 unmerged 선행 milestone(M4/M5a/M5b) 커밋이지 본 plan의 implement-time 확장이 아니다. 실제 base는 HEAD(M5b, 383309e). 본 plan의 구현 diff는 Phase 4에서 Files to Change ⊆ 검증.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1)
- 합치 결론: NEEDS-ATTENTION (HIGH 1 + MEDIUM 1) — 둘 다 항목 8(impl 진실성) 겨냥. R1 재설계(receipt-only supersession)로 양측 흡수 → ACCEPT_NOW·resolved. 항목 1~7·디자인은 무지적.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 converged impl + missing PR ≠ active implementation; plan-in-progress 가드로도 "구현 완료·PR 대기"를 거짓 `구현 중` 표시 | HIGH | ACCEPT_NOW (R1 resolved) | "구현 중" 주장 자체를 폐기. converged-frontier는 receipt-only "게이트 수렴·다음 대기" — 실행중/완료대기 어느 쪽도 거짓 주장 안 함. Task 6 재작성 |
  | F2 decision↔plan 매칭이 status-flip 좌우하기엔 모호 | MEDIUM | ACCEPT_NOW (R1 resolved) | status 변경 입력을 receipt 존재/시간으로만 한정. plan-status·매칭·liveness 일절 미사용. Task 6 재작성 |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0 — F1/F2는 design correctness, secret/data-loss/auth/irreversible 아님. R1 absorption이 fully resolve, Claude self-attest)
- Codex session 참조: threadId `019efc83-a80e-7e72-8802-72d9e68f97be` · durationMs 238167
