# Implementation Report: Dashboard Truthfulness M6 — Vercel 카드 재구성 + Hero/파이프라인 진실성

## Summary

M5b까지 truthful한 데이터를 *표현* 층에서 닫는 사용자 육안 피드백 8건을 구현했다. 두 핵심 축:
(1) **Hero·파이프라인 진실성** — Hero h1 잘림 해소(마일스톤명 primary + 요약 subtext), `/mccp:resume` 같은 next-action에 "무엇을 하는지" 설명, `/mccp:prp-implement` 진행 *중* impl 노드가 ✓완료로 거짓 표시되던 결함을 `converged-frontier` 신규 상태(receipt-only supersession)로 해소.
(2) **Vercel식 카드 재구성** — hero-panel에 뭉쳐있던 위젯 4종을 hero-panel 밖 개별 `.panel` 카드 2컬럼 + 아래-화살표 확장으로 분해.
나머지는 라벨 정합(위험·파이프라인·질문·대시보드로)과 마일스톤 토글의 `buildTabs` 통일.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 12 (source) + tests | 10 source + 1 PRD + 11 test files |
| 회귀 | 0 | 0 (483 renderer + 87 derive PASS) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 라벨 정합 (위험/질문/파이프라인/대시보드로) | 완료 | route 식별자(`data-route`/`id`/`:target`/`tb-title data-t`) 전부 불변, 표시 텍스트만 변경 |
| 2 | Vercel 카드 재구성 (위젯 2컬럼 + 아래-화살표) | 완료 | `renderWidgetCards`/`renderWidgetCard` 신규, `widget-grid`/`widget-card`/`card-expand` CSS. 강조색 경쟁 방어(카드 neutral, 상태색=dot+count) |
| 3 | 마일스톤 토글 → `buildTabs`(완료/미진행) | 완료 | risks/questions와 동일 SSoT. md는 `<details>` plain-text 유지 |
| 4 | Hero h1 잘림 해소 (마일스톤명 + subtext) | 완료 | `computeVerdict` 반환에 optional `subtext`. `formatPlanLabel` 일반화(maxLen + 비-v humanize) |
| 5 | next-action "무엇을 하는지" 설명 | 완료 | `resolveNextAction` 반환에 `description`(source 기반 매핑). hero `.desc` + md 한 줄 |
| 6 | 파이프라인 stage 진실성 (converged-frontier) | 완료 | receipt-only supersession. plan-status/liveness 일절 미사용(Codex F1·F2 설계 해소) |
| 7 | 버전 bump + PRD M6 row + 회귀 | 완료 | plugin.json 1.18.9→1.18.10 + footer(html/md) 동기, drift 0 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 렌더러 스위트 | 통과 | 483/483 (baseline 481 + converged-frontier 신규 2) |
| derive 스위트 | 통과 | 87/87 |
| design-lint | 통과 | M6 변경 위반 0 (H14/H17/H3/H6 clean). 잔존 H16(advisory)은 **HEAD에서도 동일**한 기존 결함(risk mitigation의 `**bold**`) — M6 무관 |
| 라벨 잔재 | 통과 | rendered surface 0건 (grep 매칭은 전부 주석) |
| version drift | 통과 | 소스 1.18.9 잔재 0 |
| 산출 렌더 | 통과 | `.claude/cache/status.html` — widget-grid×4 / verdict-sub / desc / 탭 / is-converged 전부 present |

## Files Changed (source)

| File | Action | Why |
|---|---|---|
| `sections/status-grid.js` | UPDATE | `formatPlanLabel` 일반화, cell/widget 라벨 '위험', `nextActionMd` 설명, `resolveNextAction` planIntent |
| `parsers/next-action.js` | UPDATE | `description`(source 기반) |
| `verdict.js` | UPDATE | Hero h1 마일스톤명 + `subtext` |
| `parsers/decision-state.js` | UPDATE | `converged-frontier` receipt-only supersession |
| `sections/pipeline.js` | UPDATE | `NODE_MARK`/`NODE_MD` is-converged, `statusOf` 수렴 텍스트, foot-link '대시보드로' |
| `html.js` | UPDATE | 라벨, hero 재구성(widget-grid/카드/subtext/desc), is-converged CSS, footer |
| `sections/open-questions.js` | UPDATE | empty-state '질문' 정합 |
| `sections/milestone-history.js` | UPDATE | `buildTabs`(완료/미진행) 통일 |
| `markdown.js` | UPDATE | 헤딩 '파이프라인'/'질문' + 앵커, subtext, footer |
| `.claude-plugin/plugin.json` | UPDATE | version 1.18.10 |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M6 row(in-progress) |

## Deviations from Plan

- **CSS 클래스명**: 플랜은 `card-grid`를 명시했으나 H17(`\bcard\b` 중첩 가드)이 `<div class="card-grid">`를 "card"로 인식해 그 안의 `widget-card`와 중첩 오탐을 발생시키므로, 컨테이너를 `widget-grid`로 명명(visual/구조 동일, H17 정합). `card-expand`(details)는 H17 미스캔 대상이라 유지.
- **Hero h1 선행어 유지**: 플랜은 "h1=마일스톤명"이나 H14(slug-only h1 금지)가 v-prefix 마일스톤명("v1.4.2 …")을 slug로 판정해 발화하므로 "현재 작업: " PM-voice 선행어를 유지(마일스톤명이 주 내용, verbose Summary는 subtext로 분리 — 잘림 해소 목적 달성).

## 사용자 육안 검증 후속 (M6 followup, 2026-06-25)

사용자 육안 검증에서 추가 피드백 → contained 렌더러 수정 4건 반영 (483 tests green):

| # | 수정 | 파일 |
|---|---|---|
| #1 | next-action 설명을 STATE.md 원문 echo → 명령→용도 clean 매핑 | `next-action.js` |
| #2 | Hero subtext full-width + cap 220 + 4줄 clamp(잘림 해소) | `intent-extractor.js`, `verdict.js`, `html.js` |
| #4 | 파이프라인 status 단일 라벨("구현 수렴") + `complete`→`완료`(per-row + foot) | `pipeline.js` |
| #7 | 타임라인 decision(main)/gate(sub) 역할 교체 + `/` prefix 제거 | `audit-timeline.js`, `html.js` |

### M7로 분리한 설계·데이터 결정 항목 (사용자 결정 2026-06-25)

- **① ledger-aware 파이프라인 완료 표기** — m4/m5/m6은 receipt 동일(`plan✓/impl수렴/pr없음`). m4/m5 "완료"는 completion-ledger에만 존재. 파이프라인 receipt-only 설계(Codex F2)를 ledger 통합으로 확장하는 결정 필요.
- **② lifecycle 마일스톤 재설계** — "미진행" 항목이 오래된/폐기 PRD(`v0-4-0-orchestrator` 등) 행. 데이터 소스 스코프(어느 PRD가 활성) + 예정/폐기 구분 + 드로어 정보 추가.
- **③ 마일스톤명 글자-ID(`B —`/`I —`) strip** — ②와 동일 lifecycle 영역, 함께 처리.

## Next Steps

- [x] 사용자 육안 검증 + followup 수정 4건
- [ ] 커밋(M6 본체 + followup) → `/mccp:pr` (fresh 세션 권장 — 비용 리셋 + Codex gate)
- [ ] M7 plan: ①②③ (lifecycle/ledger 재설계)
- [ ] PRD M6 row complete 전환 + worktree cleanup (PR merge 후)
