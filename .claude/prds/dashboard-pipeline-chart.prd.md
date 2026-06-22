# Dashboard Pipeline Chart + Visual Refresh

## Problem
mccp 진행 현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)의 단계/활동 표현이 텍스트 나열이라 "지금 어느 단계이고 무엇이 수렴·진행·차단됐는지"를 한눈에 스캔하기 어렵다. status-grid의 게이트 수렴 상태와 timeline의 receipt 활동 로그 모두 형태가 아닌 글자로만 상태를 전달해, GitHub Actions/Vercel 같은 파이프라인 상태 화면 대비 인지 부하가 높다. 멀티 세션 dogfood에서 현황을 빠르게 훑어야 하는 순간마다 줄을 읽어 내려가야 한다.

## Evidence
- 사용자 직접 관찰: 대시보드 스크린샷에서 단계별 수렴 상태와 시간순 활동이 모두 텍스트 리스트로만 표시됨 — 형태/색 기반 즉시 구분이 불가.
- 사용자가 Claude에게 디자인 레퍼런스를 직접 요청해 정리: GitHub Actions workflow run, Vercel Deployments, status page(Statuspage/Instatus/BetterStack), 터미널 미학 DevOps 대시보드("Signal") — 모두 "상태를 형태/색으로 전달하는 파이프라인·타임라인" 패턴.
- 구조적 증거: `status.html`은 단일 HTML로 chart/인터랙션을 추가하기 쉬움. 사용자가 외부 JS 사용을 폭넓게 허용 — chart 라이브러리뿐 아니라 jQuery, UI/collapse 컴포넌트 등 일반 JS 라이브러리도 사용 가능 (vendored-inline 또는 CDN — plan 단계 결정).

## Users
- **Primary**: skypark207 (mccp 단독 개발자). 멀티 세션 dogfood 중 "현재 어느 milestone이 진행 중이고 무엇이 수렴/차단됐나"를 1초 안에 훑으려는 상황에서 트리거됨.
- **Not for**: 외부 배포/공유 대상 사용자. 본 대시보드는 로컬 dogfood 전용이며 인증/원격 접근/멀티유저를 가정하지 않는다.

## Hypothesis
We believe **timeline·게이트 상태를 가로 파이프라인 chart(graph)로 시각화하고 GitHub Actions 미학 방향으로 대시보드 전반의 비주얼을 리프레시하면**
will **"현황을 텍스트를 읽지 않고 형태·색으로 즉시 구분"하게** for **mccp 단독 개발자**.
We'll know we're right when **단계 진행/수렴/차단과 활동 흐름을 글자를 정독하지 않고 chart의 노드 색·형태만으로 식별할 수 있다**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| 단계 상태 식별 방식 | 형태/색 (텍스트 정독 불필요) | status-grid가 가로 파이프라인 스테퍼로 렌더, 노드 색이 수렴/진행/대기/차단 구분 |
| 활동 흐름 시각화 | 시간순 step chart | audit-timeline이 시간순 노드/스텝 chart로 렌더 |
| 비주얼 일관성 | GitHub Actions 절제된 중립 미학 단일 토큰 세트 | 중립 회색조 base + 상태색만 절제 사용, 전 섹션 통일 |
| 외부 JS 사용 정책 | 명시적 + 산출물에 audit | chart 라이브러리 + jQuery/UI/collapse 등 일반 JS 라이브러리 허용. CDN vs vendored-inline은 plan 결정, 선택 근거를 plan/PR에 기록 |

## Scope
**MVP** — status-grid(게이트 수렴 스테이지)와 audit-timeline(receipt 활동 로그)을 각각 가로 파이프라인 스테퍼 / 시간순 step chart로 변환하고, GitHub Actions 미학으로 대시보드 전체 비주얼을 리프레시한다. chart 및 인터랙션(collapse 등)은 외부 JS 라이브러리(chart lib, jQuery, UI 컴포넌트 등) 또는 커스텀 JS로 구현 가능(사용자 허용).

**Out of scope**
- 대시보드 서빙·갱신 경로 변경(localhost serve, live-reload) — 별도 작업(dashboard-serve-refresh)이며 본 작업은 렌더 산출물의 *시각 surface*만 다룬다.
- 인증/원격 접근/멀티유저 — 로컬 dogfood 전용 불변.
- derive 모델·receipt 스키마 변경 — 본 작업은 read-side 렌더링만, 데이터 소스 surface는 불변.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 게이트 스테이지 파이프라인 chart | receipt를 decision별로 묶은 가로 파이프라인 스테퍼 신규 섹션 — plan/implement/pr가 연결된 노드로, 색/형태로 수렴·진행·대기·차단 구분 | complete | .claude/plans/dashboard-pipeline-chart.plan.md (report: .claude/PRPs/reports/dashboard-pipeline-chart-report.md) |
| 2 | 활동 로그 step chart | audit-timeline이 시간순 step chart로 렌더 — receipt 활동이 형태/색 기반 노드 흐름으로 표시 | pending | — |
| 3 | GitHub Actions 미학 전체 리프레시 | 상단 배너 + chart + 마일스톤 기록 + 테마 토큰이 절제된 중립톤 + 상태색 단일 세트로 통일 | pending | — |

## Design Direction
- **차트 형태**: 가로 파이프라인 스테퍼 — 단계를 가로로 연결된 노드로 표시하고, 노드 사이 연결선이 진행 흐름을 나타낸다. 노드 색/아이콘으로 수렴(✓)·진행(◐)·대기(○)·차단(✗)을 구분. (레퍼런스 ① GitHub Actions, ② Vercel Deployments)
- **미학 리드**: GitHub Actions — 중립 회색조 base 위에 상태색만 절제해서 사용. 정보 밀도 높고 차분함. 네온/장식 최소화. (status page의 앰버 경고 배너 강조와 Signal의 네온 그린은 보조 참고로만, 리드는 GitHub Actions 절제.)
- **타이포그래피/팔레트**: 기존 다크 테마 + 모노스페이스 유지. 색은 상태 의미 전달 용도로만 — 강조색은 viewport당 최소.
- **제약**: 외부 JS 라이브러리 사용 가능(사용자 허용) — chart 라이브러리뿐 아니라 jQuery, UI/collapse 컴포넌트 등. vendored-inline(오프라인 self-contained 유지) vs CDN 링크는 plan 단계 결정. 선택 시 offline 동작·로드 신뢰성·번들 크기 tradeoff를 plan/PR에 명시. 미학 리드(GitHub Actions 절제)는 라이브러리 기본 테마가 아닌 프로젝트 토큰으로 override.
- **접근성**: 색에만 의존하지 않는 상태 구분(아이콘/형태 병행). 현재 대시보드의 비-색 severity 마커(v1.4.2 M3) 패턴 계승.

## Open Questions
- [ ] 가로 파이프라인이 좁은 viewport에서 줄바꿈/스크롤 처리 — 반응형 정책 (plan 단계 결정).
- [ ] audit-timeline의 30개+ receipt를 가로 step chart로 표현할 때 밀도 처리 — 가로 step vs 세로 step + 가로 노드 혼합 (plan 단계 결정).
- [ ] 기존 STATUS.md(markdown) 출력과 status.html(HTML) 출력의 chart 표현 분기 — markdown은 ASCII 근사 vs 텍스트 유지 (plan 단계 결정).
- [ ] 외부 JS 라이브러리 선택 + 전달 방식 — chart(uPlot/Chart.js/ApexCharts 등) + 인터랙션(jQuery/UI/collapse) 라이브러리 채택 여부, vendored-inline(offline self-contained 유지) vs CDN 링크 (plan 단계 결정). 라이브러리 최소화 vs 개발 속도 tradeoff.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 가로 chart가 좁은 화면에서 깨짐 | 중 | 중 | 반응형 wrap/스크롤 + 노드 최소폭 정의, plan 단계에서 viewport 정책 확정 |
| CDN chart 라이브러리가 offline/네트워크 실패 시 미로드 | 중 | 중 | vendored-inline 우선 검토 또는 CDN 실패 시 graceful fallback(텍스트 표현) — plan 단계 정책 확정 |
| 전체 리프레시가 기존 섹션 렌더 회귀 유발 | 중 | 중 | 섹션별 단위 테스트 유지 + 기존 renderer 테스트 회귀 가드 |
| STATUS.md(markdown)에서 chart 표현 불가로 정보 손실 | 중 | 저 | markdown은 기존 텍스트 표현 유지 또는 ASCII 근사, HTML만 chart (plan 분기) |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-22.*
