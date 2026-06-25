# Dashboard 디자인 피드백 — 다음 cycle (M6 후보, 2026-06-25 사용자 육안 검토)

> M5b(v1.18.9 data-semantics) ship 후 사용자가 렌더된 status.html 육안 검토로 제시한 8개 개선 요청. 새 cycle에서 `/mccp:plan-prd` 또는 `/mccp:plan`부터 진입. 디자인 surface 변경이므로 design-gate(§3.9) + impeccable shape→layout→critique→audit 워크플로 권장.

## Vercel 참조

사용자 참조 이미지: `<repo-parent>/.samples/vercel.com_parkdongmins-projects.png` (워크트리 밖). Vercel 대시보드 패턴:
- 좌측 sidebar nav(Projects 강조 / Deployments / Logs / Analytics …)
- main: "All Projects ▾" | "Overview" 헤더 + 검색바
- **개별 카드** 2컬럼 그리드: **Usage**(좌 wide, Last 30 days + Edge Requests/Data Transfer 행 + Upgrade) + **Projects**(우 narrow, project-idenn 카드) / **Alerts**(full, "Get alerted for anomalies" + Upgrade to Pro) / **Recent Previews**
- 카드마다 자체 header + body, 둥근 모서리(~8-10px), subtle border. 한 카드에 다 뭉치지 않음.

## 8개 피드백 항목

1. **Hero 잘림 + prompt 무의미** (`html.js` renderHeroPanel / `verdict.js`): Hero h1 "현재 작업: M1~M4가 데이터 영속화…derive…"가 잘려 내용 확인 불가(capIntent 72도 김 + Summary 추출이 verbose). 마일스톤명 우선 또는 2줄+명확 요약으로. next-action prompt "다음 /mccp:resume"이 무의미 — 미해결 질문 prompt처럼 **명확한 실행 지시**(구체 명령 + 무엇을 하는지)로.

2. **카드 뭉침 → Vercel 재구성** (`html.js` route-overview): 현재 hero-panel 단일 카드에 verdict+prompt+4위젯 다 뭉침. Vercel처럼 **개별 카드 2컬럼**(예: 현재작업/다음액션 카드 + 상태 위젯 카드 + 위험/이월 카드 분리)으로 재구성. `.card`/`.panel` carve-out으로 H3/H17 내 가능.

3. **마일스톤 기록 탭 통일** (`sections/milestone-history.js`): "→ 미진행 마일스톤 N건 표시" 토글을 risks/questions의 `buildTabs`(active/resolved 탭) 패턴으로 통일.

4. **'미해결 위험' → '위험'** (`sections/status-grid.js` label + `html.js` nav `미해결 위험`/`위험` 표기 통일). nav는 이미 '위험'. grid 셀 label만 '위험'으로.

5. **'미해결 질문' → '질문'** (`html.js` nav-link `미해결 질문` + route aria-label + tb-title + page-title + `sections/open-questions.js` 패널 title '미해결'). route id `route-questions` 식별자는 불변.

6. **'게이트 파이프라인' → '파이프라인'** (`html.js` nav-link + tb-title + route page-title `게이트 파이프라인`). route id `route-pipeline` 식별자 불변.

7. **파이프라인 '개요로 →' → '대시보드로 →'** (`sections/pipeline.js` foot-link 텍스트 `개요로`. route 명이 '대시보드'로 바뀐 것과 정합).

8. **파이프라인 노드 상태 — 진행중 파란 마커** (`sections/pipeline.js` `NODE_MARK`): 조사 결과 **impl ✓는 정상**(plan-codex/implement-codex receipt 둘 다 converged = 게이트 완료, pr-codex만 없어 decision='active'). 진짜 개선점: **현재 진행 단계(active stage, 예 pr)가 "미시작"과 같은 회색 점**이라 구분 안 됨. `NODE_MARK.missing`(회색 dot)과 `NODE_MARK.active`(진행중)를 시각 분화 — 현재 작업 중 단계는 **파란 in-progress 마커**. active stage 판정: `statusOf`의 `started`(activeNode.status==='active') vs pending. 단, 현재 m5는 pr 노드가 receipt 없어 status='missing'(아직 PR 시작 안 함)이라 회색이 맞을 수도 — "다음 할 단계"를 파란색으로 강조할지 결정 필요(plan 단계 사용자 확인).

## 라벨 변경 시 주의 (route 식별자 불변)
- nav-link `data-route` / `<section id="route-*">` / CSS `:target` selector / `tb-title data-t` 식별자(overview/pipeline/risks/questions/activity)는 **절대 불변**(CSS 라우팅 깨짐). **표시 텍스트만** 변경.
- 라벨 변경 시 영향 테스트: header-hoist / render-integration / dashboard-overview / i18n-surface / a11y-aria-labels. nav aria-label, page-title, tb-title 단언 갱신 필요.

## M5b 상태 (선행)
- M5b(v1.18.9) 구현 완료·586 test PASS. commit `<this commit>` (dashboard-truthfulness-m4 branch). PRD M5 row=complete. report: `.claude/PRPs/reports/dashboard-truthfulness-m5b-semantics-report.md`.
- known debt: H16 advisory(드로어 요약 `**bold**`, pre-existing) / 위험 45 lifecycle scope(Codex F4 → M6 backlog).
