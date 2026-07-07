# Dashboard Data Exploration — 그룹핑·필터·정렬·검색

> PRD ③ / 3 (dashboard 기능 추가 묶음, 2026-06-24 co-created). 형제 PRD: [`dashboard-truthfulness.prd.md`](dashboard-truthfulness.prd.md) · [`dashboard-multi-session.prd.md`](dashboard-multi-session.prd.md). 본 PRD는 ①(정확한 항목)·②(worktree 진행)이 만든 데이터를 *탐색* 대상으로 소비한다.

## Problem

대시보드의 항목(마일스톤·위험·미해결질문·타임라인·worktree)이 많아질수록 묶거나(그룹핑) 좁히거나(필터·검색) 정렬할 수단이 없어, 원하는 것을 찾으려면 전체를 스크롤해 정독해야 한다. 위험만 230건 누적되는 상황에서 PRD 단위로 묶어 보거나 특정 plan/진행상태/worktree로 좁힐 수 없고, 정렬은 시간 고정이라 "위험도순"·"진행순" 같은 관점 전환이 불가하다. 검색 입력은 UI에 *형태만* 있고 실제로는 동작하지 않는다(미구현). 현재 대시보드가 JS-0(CSS `:target` 라우팅) 자랑이라 이런 인터랙션이 빠져 있다.

## Evidence

- 사용자 직접 요청: 그룹핑(PRD 수준), 필터(PRD/plan/진행사항/worktree), 정렬(위험도순/시간순/작업범위순/진행순), 검색 활성화(현재 미구현·형태만, 단축키 불필요).
- 사용자 직접 관찰: 위험 약 230건 등 대량 항목 — 묶기/좁히기 없이는 탐색 불가.
- 구조적 증거: 검색 입력 UI는 존재하나 핸들러 없음 — "형태만" 상태.
- 설계 합의(2026-06-24): 필터/정렬/검색은 JS 필요 → 현재 JS-0 invariant를 **progressive enhancement**로 개정(JS 가용 시 동작, 없으면 전체 표시 — 정보 손실 0). 콘솔의 native `<dialog>` 드로어·copy 버튼이 이미 PE라 일관됨.

## Users

- **Primary**: skypark207(mccp 단독 개발자, PM 모드). 항목이 많은 대시보드에서 특정 PRD/plan/worktree/진행상태로 좁히거나 위험도·진행순으로 정렬해 "지금 주목할 것"만 추려 보려는 상황에서 트리거됨.
- **Not for**: 외부 공유, 멀티유저. 로컬 데스크톱 dogfood 전용.

## Hypothesis

We believe **progressive-enhancement JS로 그룹핑(PRD 수준)·필터(PRD/plan/진행상태/worktree)·정렬(위험도/시간/작업범위/진행순)·검색을 활성화하면(JS 없으면 전체 표시로 graceful degrade)**
will **대량 항목에서 원하는 것만 빠르게 묶고 좁혀 보게** for **mccp 단독 개발자**.
We'll know we're right when **항목을 소속 PRD별로 묶어 보고, 필터로 특정 plan/진행/worktree만 남기고, 정렬 기준을 전환하며, 검색 입력이 실제로 항목을 좁히고, JS 비활성 환경에서도 전체 정보가 손실 없이 보인다**.

## Success Metrics

| Metric | Target | How measured |
| --- | --- | --- |
| 그룹핑 | PRD 수준 묶음 | 항목이 소속 PRD별 접힘 그룹으로 묶여 표시 |
| 필터 | 4축(PRD/plan/진행/worktree) | 각 축으로 항목 좁히기 동작, 조합 가능 |
| 정렬 | 4기준(위험도/시간/범위/진행) | 정렬 기준 전환 시 항목 재정렬 |
| 검색 | 형태만 → 실제 동작 | 검색 입력이 클라이언트 측에서 항목 필터(미구현 핸들러 wiring) |
| graceful degrade | JS off 시 정보 손실 0 | JS 비활성 시 전체 항목 표시(기능만 숨김), 스크린리더/SSH plain-text 동등 |
| 단축키 없음 | 키보드 단축키 미도입 | 명시적 컨트롤만(사용자 요청 — 단축키 불요) |

## Scope

**MVP** — self-contained vendored JS(progressive enhancement)로 (1) PRD 수준 그룹핑, (2) 필터(PRD/plan/진행상태/worktree), (3) 정렬(위험도/시간/작업범위/진행순), (4) 형태만 있던 검색의 실제 wiring을 추가한다. JS 비활성 시 전체 항목이 손실 없이 보이고(기능만 숨김), 컨트롤은 명시적 UI만(단축키 없음). 필터/정렬/검색은 ①의 정확한 항목 + ②의 worktree 진행을 대상으로 동작한다.

**Out of scope**

- 저장된 뷰/프리셋/URL 상태 공유 — 세션 내 인터랙션만(영속 안 함). 후속 가능.
- 키보드 단축키 — 사용자가 명시적으로 불요 요청.
- 서버측 검색/인덱싱 — 단일 HTML 클라이언트 측 필터만.
- 데이터 소스 변경 — ①·②가 만든 항목을 소비만. 새 derive 필드 추가 없음(필요 시 ①/② 범위).
- CSS-only 구현 — progressive enhancement JS 채택으로 기각.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete | dropped -->

| # | Milestone | Outcome | Status | Plan |
| --- | --- | --- | --- | --- |
| 1 | PRD-수준 그룹핑 + PE 토대 | self-contained vendored JS 토대(JS off graceful degrade 불변) 위에서 항목을 소속 PRD별 접힘 그룹으로 묶어 표시. JS-0 invariant를 progressive-enhancement로 개정(H-invariant 충돌 정리). | complete | [`.claude/plans/dashboard-data-exploration.plan.md`](../plans/dashboard-data-exploration.plan.md) |
| 2 | 필터 + 정렬 (위험·질문) | 위험·질문 항목에 필터(**PRD축·plan축**, 조합 가능) + 정렬(**위험도순·시간순**) 컨트롤. JS off 시 전체 표시. *진행상태/worktree 필터·진행순/작업범위순 정렬은 M3으로 이관(범위 축소 — 2026-06-26 사용자 결정, plan F4 reconcile).* | complete | [`.claude/plans/dashboard-data-exploration-m2.plan.md`](../plans/dashboard-data-exploration-m2.plan.md) |
| 3 | 검색 + 잔여 탐색 축 | 형태만 있던 검색 입력을 실제 클라이언트 필터로 wiring(항목 텍스트 매칭, 단축키 없음) + **M2에서 이관된 잔여 축**: 진행상태/worktree 필터·진행순 정렬(멀티세션 표면 의존). 작업범위순 정렬은 'PRD 기준 작업 진행도'로 재기획 전까지 보류. JS off 시 입력 숨김 + 전체 표시. | complete | [`.claude/plans/dashboard-data-exploration-m3.plan.md`](../plans/dashboard-data-exploration-m3.plan.md) |

## Design Direction

- **기준(canonical)**: 콘솔 셸·토큰·드로어·copy 버튼은 승인된 `dashboard-sample.html` + DESIGN.md 계약. 필터/정렬/검색 컨트롤은 동일 토큰으로 절제되게 — 강조색 viewport당 ≤1 유지, 컨트롤은 중립.
- **Progressive enhancement**: vendored self-contained JS(오프라인 불변 — CDN 금지). JS 비활성/실패 시 전체 항목 표시(기능만 사라짐, 정보 손실 0). 기존 native `<dialog>`·copy 버튼과 동일한 PE 철학.
- **invariant 개정**: 기존 "JS 0" 자랑(H-invariant 일부)을 progressive-enhancement 허용으로 개정 — 개정 근거를 plan/DESIGN.md에 명문화. no-JS 시 개요 default 라우팅·전체 항목 노출은 불변.
- **접근성**: 필터/정렬/검색 컨트롤은 키보드 조작·focus 관리·aria(label, live-region for 결과 수). 단축키는 도입 안 함(사용자 요청). 검색 결과 0건 시 빈 상태 메시지.
- **워크플로**: 전 마일스톤 UI → ship 전 impeccable `audit`/`polish`로 a11y·반응형·기술 품질 검증.
- **STATUS.md**: 필터/정렬/검색은 HTML 전용 인터랙션 — STATUS.md는 전체 항목을 그룹핑 순서로 plain-text 노출(인터랙션 없이 동등 정보).

## Open Questions

- [ ] vendored JS 전달 — 단일 HTML inline `<script>` vs 별도 vendored 파일. 번들 크기 + offline 보장 tradeoff (plan 결정).
- [ ] 그룹핑·필터·정렬·검색을 하나의 컨트롤 바로 통합할지 섹션별로 둘지 — 단일 화면 과잉 회피 최소 형태 (plan 결정).
- [ ] 필터 축 데이터 소스 — '진행상태'/'worktree' 필터가 ①ledger·②스캐너 데이터에 의존 → 의존 순서(③은 ①·② 후) (plan 결정).
- [ ] "작업범위순" 정렬의 정의 — 마일스톤 수 / 파일 수 / LOC 중 무엇으로 범위를 측정 (plan 결정).
- [ ] 검색 매칭 범위 — 제목만 vs 본문 포함 + 대소문자/한글 정규화 (plan 결정).
- [ ] no-JS graceful degrade 검증 방법 — JS off 렌더 산출물 회귀 테스트 형태 (plan 결정).

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| JS 도입이 기존 JS-0 self-contained 불변 훼손 | 중 | 중 | vendored inline(CDN 금지) + JS off graceful degrade 회귀 테스트 + no-JS 라우팅 불변 유지. |
| 컨트롤 욕심(그룹+필터+정렬+검색 동시)이 단일 화면 복잡화 | 중 | 중 | outcome당 최소 형태 + 마일스톤 분리 + 강조 최소 원칙 + impeccable audit. |
| 인터랙티브 컨트롤 a11y 회귀(키보드/aria) | 중 | 중 | plan에서 키보드·focus·aria·live-region 정의 + v1.4.2 M3 a11y 패턴 계승. |
| ③이 ①·② 데이터에 의존해 순서 결합 | 중 | 저 | ③은 ①·② ship 후 진입(필터 축이 ①ledger/②스캐너 surface 소비) — 순서 명시. |
| 클라이언트 검색이 대량 항목에서 느림 | 저 | 저 | 단순 텍스트 매칭 + 디바운스. 단일 개발자 데이터 규모로 충분. |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-24.*
