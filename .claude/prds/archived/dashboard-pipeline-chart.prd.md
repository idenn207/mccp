# Dashboard Pipeline Chart + Visual Refresh

## Problem

mccp 진행 현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)의 단계/활동 표현이 텍스트 나열이라 "지금 어느 단계이고 무엇이 수렴·진행·차단됐는지"를 한눈에 스캔하기 어렵다. status-grid의 게이트 수렴 상태와 timeline의 receipt 활동 로그 모두 형태가 아닌 글자로만 상태를 전달해, GitHub Actions/Vercel 같은 파이프라인 상태 화면 대비 인지 부하가 높다. 멀티 세션 dogfood에서 현황을 빠르게 훑어야 하는 순간마다 줄을 읽어 내려가야 한다. 더해, 마일스톤 기록 섹션은 용어가 "이정표"로 흩어져 있고 ship receipt 매칭 실패 시 완료 시점이 "날짜 미상"으로 떨어져 기록 신뢰도가 낮다.

## Evidence

- 사용자 직접 관찰: 대시보드 스크린샷에서 단계별 수렴 상태와 시간순 활동이 모두 텍스트 리스트로만 표시됨 — 형태/색 기반 즉시 구분이 불가.
- 사용자 직접 관찰: 마일스톤 기록("이정표 기록") 섹션에서 완료 시점이 "날짜 미상"으로 표시되는 항목 확인 — `pickShipReceipt`가 마일스톤↔`mccp-pr-codex` receipt 상관에 실패하면 `completedAt=null` 폴백(milestone-history.js).
- 사용자 직접 관찰: 섹션 제목·앵커가 "이정표"로 표기됨(markdown.js, html.js) — 사용자는 "마일스톤"을 고유명사로 통일하길 요청.
- 사용자가 Claude에게 디자인 레퍼런스를 직접 요청해 정리: GitHub Actions workflow run, Vercel Deployments, status page(Statuspage/Instatus/BetterStack), 터미널 미학 DevOps 대시보드("Signal") — 모두 "상태를 형태/색으로 전달하는 파이프라인·타임라인" 패턴.
- 구조적 증거: `status.html`은 단일 HTML로 chart/인터랙션을 추가하기 쉬움. 사용자가 외부 JS 사용을 폭넓게 허용 — chart 라이브러리뿐 아니라 jQuery, UI/collapse 컴포넌트 등 일반 JS 라이브러리도 사용 가능 (vendored-inline 또는 CDN — plan 단계 결정).

## Users

- **Primary**: skypark207 (mccp 단독 개발자). 멀티 세션 dogfood 중 "현재 어느 마일스톤이 진행 중이고 무엇이 수렴/차단됐나"를 1초 안에 훑으려는 상황에서 트리거됨.
- **Not for**: 외부 배포/공유 대상 사용자. 본 대시보드는 로컬 dogfood 전용이며 인증/원격 접근/멀티유저를 가정하지 않는다.

## Hypothesis

We believe **timeline·게이트 상태를 가로 파이프라인 chart(graph)로 시각화하고, 정보 계층·길찾기·점진적 공개를 GitHub Actions 미학 방향으로 재설계하면**
will **"현황을 텍스트를 정독하지 않고 형태·색·구조로 즉시 파악"하게** for **mccp 단독 개발자**.
We'll know we're right when **단계 진행/수렴/차단과 활동 흐름을 글자를 정독하지 않고 chart의 노드 색·형태로 식별하고, 필요한 상세만 펼쳐 보며, 마일스톤 기록의 완료 시점이 항상 정확히 표시된다**.

## Success Metrics

| Metric | Target | How measured |
| --- | --- | --- |
| 단계 상태 식별 방식 | 형태/색 (텍스트 정독 불필요) | status-grid가 가로 파이프라인 스테퍼로 렌더, 노드 색이 수렴/진행/대기/차단 구분 |
| 활동 흐름 시각화 | 시간순 step chart | audit-timeline이 시간순 노드/스텝 chart로 렌더 |
| 마일스톤 기록 정확성 | "날짜 미상" 0건 + 용어 단일("마일스톤") | ship receipt 매칭 보강 후 완료 시점 표시율 측정, 섹션/앵커 용어 grep |
| 정보 계층 | primary→status→detail 3단계 | 한 화면에서 1차 정보가 즉시, 상세는 펼침으로만 노출 |
| 길찾기 | 섹션 점프 + 현재 위치 표시 | 스크롤 없이 섹션 이동 + active 섹션 시각 표시 |
| 비주얼 일관성 | GitHub Actions 절제된 중립 미학 단일 토큰 세트 | 중립 회색조 base + 상태색만 절제 사용, 전 섹션 통일, 토큰 스타일가이드 문서화 |
| 외부 JS 사용 정책 | 명시적 + 산출물에 audit | chart 라이브러리 + jQuery/UI/collapse 등 일반 JS 라이브러리 허용. CDN vs vendored-inline은 plan 결정, 선택 근거를 plan/PR에 기록 |

## Scope

**MVP** — status-grid(게이트 수렴 스테이지)와 audit-timeline(receipt 활동 로그)을 각각 가로 파이프라인 스테퍼 / 시간순 step chart로 변환하고, 마일스톤 기록의 용어 통일·"날짜 미상" 버그를 수정한 뒤, 대시보드 전반의 정보 계층·길찾기·점진적 공개·스타일 토큰을 GitHub Actions 미학으로 재설계한다. chart 및 인터랙션(collapse/툴팁/드롭다운/모달 등)은 외부 JS 라이브러리 또는 커스텀 JS로 구현 가능(사용자 허용). 컴포넌트는 단일 화면 status 대시보드에 실제로 의미 있는 것만 채택하고 outcome 중심으로 정의한다(아래 Design Direction 참조).

**Out of scope**

- 대시보드 서빙·갱신 경로 변경(localhost serve, live-reload) — 별도 작업(dashboard-serve-refresh)이며 본 작업은 렌더 산출물의 *시각 surface*만 다룬다.
- 인증/원격 접근/멀티유저 — 로컬 dogfood 전용 불변.
- derive 모델·receipt 스키마 변경 — 본 작업은 read-side 렌더링만, 데이터 소스 surface는 불변. (예외: 마일스톤↔ship receipt *매칭 로직* 보강은 read-side 상관 수정이므로 포함, 스키마 변경 아님.)
- 캐러셀·다중 페이지 GNB/LNB 같은 멀티페이지 내비게이션을 글자 그대로의 컴포넌트로 구현하는 것 — 단일 화면에 부적합. 해당 의도는 "길찾기" outcome으로 흡수.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
| --- | --- | --- | --- | --- |
| 1 | 게이트 스테이지 파이프라인 chart | receipt를 decision별로 묶은 가로 파이프라인 스테퍼 신규 섹션 — plan/implement/pr가 연결된 노드로, 색/형태로 수렴·진행·대기·차단 구분 | complete | .claude/plans/dashboard-pipeline-chart.plan.md (report: .claude/PRPs/reports/dashboard-pipeline-chart-report.md) |
| 2 | 활동 로그 step chart + 마일스톤 기록 정확성·용어 통일 | audit-timeline이 시간순 step chart로 렌더 + "이정표"→"마일스톤" 용어 전면 통일(섹션 제목·앵커·prose) + "날짜 미상" ship-receipt 매칭 버그 수정(완료 시점 표시율 100%) | complete | .claude/plans/dashboard-pipeline-chart-m2-milestone-accuracy.plan.md (report: .claude/PRPs/reports/dashboard-pipeline-chart-m2-milestone-accuracy-report.md, activity step-chart: .claude/plans/dashboard-pipeline-chart-m2.plan.md commit 6cf75b6) |

> **M3~M6 재범위화 (2026-06-23):** 레이아웃·길찾기·필터·스타일 마일스톤은 점진적 디자인 작업이었으나, impeccable craft로 승인된 기준 샘플 `.claude/cache/dashboard-sample.html`이 확정되면서 "샘플 = 명세" 기반 재설계 + derive 데이터 추출로 재범위화되었다. 후속 작업은 신 PRD [`dashboard-console-redesign.prd.md`](dashboard-console-redesign.prd.md)로 이관. 본 PRD는 M1·M2 ship으로 종료(CLOSED).

## Design Direction

- **차트 형태**: 가로 파이프라인 스테퍼 — 단계를 가로로 연결된 노드로 표시하고, 노드 사이 연결선이 진행 흐름을 나타낸다. 노드 색/아이콘으로 수렴(✓)·진행(◐)·대기(○)·차단(✗)을 구분. (레퍼런스 ① GitHub Actions, ② Vercel Deployments)
- **미학 리드 (v1.16.0 M3 재설계로 갱신)**: **다크 파이프라인 콘솔** — Vercel 대시보드 베이스(깔끔한 목적 있는 카드, **card-in-card 금지**) + 좌측 섹션 nav 레일. 차분한 dev 다크(Linear/Vercel 톤, 형광/Bloomberg 아님), low-chroma neutral 위에 상태색만 절제. 사용자가 "기존 GitHub Actions 절제 방향은 디자인 스킬 없이 만든 약한 구현이라 reference 아님 — 새로 설계"로 미학 방향 신규 탐색에 confirm(impeccable shape, 2026-06-23). GitHub Actions/Vercel Deployments는 여전히 토폴로지 레퍼런스. PRODUCT.md anti-refs(hero-metric/AI-cream/Bloomberg 형광)는 유지.
- **타이포그래피/팔레트**: 다크 default(light는 `prefers-color-scheme: light` opt-in) + 단일 sans + 1 모노스페이스(식별자). 색은 상태 의미 전달 용도로만 — 강조색(accent)은 viewport당 ≤1(next-action/현재선택만). 토큰/레이아웃 canonical은 `plugins/mccp/scripts/lib/renderer/html.js` + DESIGN.md.
- **M3 인터랙션 비전(셸은 M3, 동작은 M4)**: 우측 **Drawer 상세**(Notion/Linear 패턴 — 모달 아닌 drawer로 detail 강조) + nav **active-섹션 추적** + Tailwind docs의 `설명 | 터미널` 복사형 prompt. M3는 이들이 얹힐 정적 콘솔 셸(다크 토큰 + 2D nav레일 + 카드 + 반응형)까지, 가시 컨트롤 + 동작은 M4.
- **컴포넌트 → outcome 매핑(단일 화면 status 대시보드 기준)**: 사용자가 나열한 컴포넌트는 글자 그대로의 멀티페이지 위젯이 아니라 단일 화면에 맞는 outcome으로 채택한다.
  - **길찾기(M4)**: GNB·LNB·햄버거 메뉴·브레드크럼 → 섹션 앵커 내비 + 현재 위치(active 섹션) 표시. 좁은 화면에서는 접히는 섹션 인덱스.
  - **점진적 공개(M4)**: 아코디언·모달·툴팁·드롭다운 → 1차 정보는 즉시, 상세/메타는 펼침·호버·오버레이로만.
  - **필터링·탐색(M5)**: 필터·태그·페이지네이션 → 게이트/활동 좁히기 + 다량 항목 "더보기" 단계 노출.
  - **레이아웃(M3)**: 그리드 시스템·반응형 → 섹션 재배치 + viewport 적응.
  - **스타일(M6)**: CTA·Tag·스타일가이드 → 액션/상태 토큰 일관화 + 토큰 문서화.
  - **제외**: 캐러셀(단일 화면 status에 부적합), 다중 페이지 라우팅(로컬 단일 HTML 불변).
- **제약**: 외부 JS 라이브러리 사용 가능(사용자 허용) — chart 라이브러리뿐 아니라 jQuery, UI/collapse 컴포넌트 등. vendored-inline(오프라인 self-contained 유지) vs CDN 링크는 plan 단계 결정. 선택 시 offline 동작·로드 신뢰성·번들 크기 tradeoff를 plan/PR에 명시. 미학 리드(GitHub Actions 절제)는 라이브러리 기본 테마가 아닌 프로젝트 토큰으로 override.
- **접근성**: 색에만 의존하지 않는 상태 구분(아이콘/형태 병행). 현재 대시보드의 비-색 severity 마커(v1.4.2 M3) 패턴 계승. 인터랙티브 컴포넌트(아코디언/모달/드롭다운/툴팁)는 키보드 조작·focus 관리·aria 속성을 plan 단계에서 정의.
- **디자인 워크플로(M3~M6)**: 디자인-구성 마일스톤(M3 레이아웃·M4 길찾기/점진적 공개·M5 필터링·M6 스타일 토큰)은 ad-hoc 편집이 아니라 **impeccable 워크플로**로 진행한다 — `shape`(UX/IA 설계)로 plan 단계를 구체화 → `craft`(end-to-end 구현)로 prp-implement 단계를 수행 → `audit`/`polish`(a11y·반응형·기술 품질)로 ship 전 검증. 미학 리드는 `frontend-design-direction` SKILL Output Constraints + 본 PRD의 GitHub Actions 절제 방향을 따른다. (M1 게이트 chart·M2 활동 chart·M2 잔여 기록정확성은 이미 완료/로직 작업이라 본 워크플로 대상이 아니며, M2 잔여는 design-critique CONVERGED로 통과.)

## Open Questions

- [ ] 가로 파이프라인이 좁은 viewport에서 줄바꿈/스크롤 처리 — 반응형 정책 (plan 단계 결정).
- [ ] audit-timeline의 30개+ receipt를 가로 step chart로 표현할 때 밀도 처리 — 가로 step vs 세로 step + 가로 노드 혼합 (plan 단계 결정).
- [ ] 기존 STATUS.md(markdown) 출력과 status.html(HTML) 출력의 chart/인터랙션 표현 분기 — markdown은 ASCII 근사·텍스트 유지, 인터랙션(아코디언/모달 등)은 HTML 전용 (plan 단계 결정).
- [ ] "날짜 미상" 매칭 보강 방식 — `pickShipReceipt` 외에 마일스톤 완료 시점을 보강할 추가 소스(plan body status, commit 시점 등) 채택 여부 (M2 plan 단계 결정).
- [ ] 외부 JS 라이브러리 선택 + 전달 방식 — chart(uPlot/Chart.js/ApexCharts 등) + 인터랙션(jQuery/UI/collapse) 라이브러리 채택 여부, vendored-inline(offline self-contained 유지) vs CDN 링크 (plan 단계 결정). 라이브러리 최소화 vs 개발 속도 tradeoff.
- [ ] 길찾기·필터링이 단일 화면에서 과잉이 되지 않는 최소 형태 — outcome을 만족하는 가장 가벼운 UI (M4/M5 plan 단계 결정).

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| 가로 chart가 좁은 화면에서 깨짐 | 중 | 중 | 반응형 wrap/스크롤 + 노드 최소폭 정의, plan 단계에서 viewport 정책 확정 |
| CDN chart 라이브러리가 offline/네트워크 실패 시 미로드 | 중 | 중 | vendored-inline 우선 검토 또는 CDN 실패 시 graceful fallback(텍스트 표현) — plan 단계 정책 확정 |
| 전체 리프레시가 기존 섹션 렌더 회귀 유발 | 중 | 중 | 섹션별 단위 테스트 유지 + 기존 renderer 테스트 회귀 가드 |
| STATUS.md(markdown)에서 chart/인터랙션 표현 불가로 정보 손실 | 중 | 저 | markdown은 기존 텍스트 표현 유지 또는 ASCII 근사, HTML만 chart/인터랙션 (plan 분기) |
| 컴포넌트 욕심(아코디언·모달·툴팁·필터 동시 도입)이 단일 화면을 복잡하게 만듦 | 중 | 중 | outcome 중심 마일스톤 분리 + 마일스톤당 최소 형태 채택, viewport당 강조 최소 원칙 유지 |
| 인터랙티브 컴포넌트가 접근성(키보드/aria) 회귀 유발 | 중 | 중 | M4/M5 plan에서 키보드·focus·aria 정의 + v1.4.2 M3 a11y 패턴 계승 |

---

_Status: CLOSED (2026-06-23) — M1·M2 shipped (PR #53). M3~M6 superseded by `dashboard-console-redesign.prd.md` ("샘플=명세" 재설계 + derive 추출)._
_Co-created with user on 2026-06-22._
