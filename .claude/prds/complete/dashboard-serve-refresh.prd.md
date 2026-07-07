# Dashboard Serve + Refresh Commands

## Problem
mccp의 진행 현황 대시보드(`.claude/cache/STATUS.md` + `status.html`)를 보려면 지금은 `node plugins/mccp/scripts/derive/cli.js render`를 손으로 실행한 뒤 `status.html` 파일을 직접 찾아 열어야 한다. 자동 refresh trigger(v1.3.0-m4)가 있지만 상태 변경 후에도 자주 stale로 남아(예: `이전 캐시 157115초 stale · 자동 갱신 안 됨`), "지금 현황 보여줘"가 두 단계 수동 작업이 된다. localhost로 접근하는 경로도 없어 브라우저 북마크/탭으로 상시 띄워두기 어렵다.

## Evidence
- 현재 `.claude/cache/STATUS.md` 헤더 실측: `이전 캐시 157115초 stale · 자동 갱신 안 됨` — v1.4.2 dashboard PR merge 이후 trigger가 안 돌아 ~43시간 stale.
- 대시보드를 보려면 CLI render → 파일 경로 탐색 → 브라우저 드래그앤드롭/`start`가 매번 필요 (관측된 dogfood 마찰).
- `status.html`은 278KB self-contained 단일 파일(inline CSS, 외부 의존 0) — 서빙이 단순하다는 구조적 증거.

## Users
- **Primary**: skypark207 (mccp 단독 개발자). 멀티 세션 dogfood 중 "현재 어느 milestone이 진행 중이고 무엇이 차단됐나"를 빠르게 확인하려는 상황에서 트리거됨.
- **Not for**: 외부 배포/공유 대상 사용자. 본 명령은 로컬 dogfood 전용이며 인증/원격 접근/멀티유저를 가정하지 않는다.

## Hypothesis
We believe **localhost로 대시보드를 서빙하면서 띄우기 직전 자동 render + 파일 변경 시 브라우저 자동 갱신(live-reload)을 묶은 `/mccp:dashboard` 명령과, 서버 없이 캐시만 다시 굽는 `/mccp:dashboard-refresh` 명령**이
**"render 수동 실행 + 파일 직접 열기 + stale 캐시"라는 3단 마찰을 제거**해 준다 for **mccp 개발자**.
We'll know we're right when **단일 `/mccp:dashboard` 호출로 최신 상태의 대시보드가 브라우저에 뜨고, 이후 상태가 바뀌면 페이지를 수동 새로고침하지 않아도 갱신된다**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| 현황 확인까지 필요한 수동 단계 | 1 (명령 1회) | `/mccp:dashboard` 호출 → 브라우저 표시까지의 user action 수 |
| 서빙 콘텐츠 freshness | 항상 ≤ 직전 render 시점 | serve 직전 자동 render 1회 보장 |
| 상태 변경 후 브라우저 반영 | 수동 새로고침 0회 | live-reload watch가 변경 감지 후 자동 갱신 |

## Scope
**MVP** — 두 개의 슬래시 명령:
1. `/mccp:dashboard` — derive render 1회 실행 → 로컬 HTTP 서버를 고정 포트로 기동 → `status.html` 서빙 + 브라우저 자동 오픈 → `.claude/cache/` watch로 파일 변경 시 브라우저 live-reload.
2. `/mccp:dashboard-refresh` — 서버 없이 `derive/cli.js render`만 호출해 `STATUS.md` + `status.html`을 다시 굽기.

**Out of scope**
- 인증 / 원격 접근 / 외부 노출 — 로컬 dogfood 전용, `127.0.0.1` 바인딩 고정.
- 대시보드 자체의 시각/레이아웃 변경 — 본 작업은 *서빙·갱신 경로*만 추가, 렌더 산출물(`status.html`)의 디자인은 v1.4.2에서 이미 확정됨.
- 멀티 프로젝트/멀티 캐시 동시 서빙 — 단일 repo의 단일 `.claude/cache/`만 대상.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | dashboard serve + refresh commands | `/mccp:dashboard`로 최신 대시보드가 localhost에 뜨고 live-reload, `/mccp:dashboard-refresh`로 캐시 재생성 | complete | .claude/plans/dashboard-serve-refresh.plan.md |

## Design Direction
> impeccable-detect가 `design_signal=true`를 반환했으나, 이는 PRD 본문의 `status.html`/`STATUS.md` 키워드 매칭에 따른 것이다. 본 작업은 *서빙·갱신 경로*만 추가하며 대시보드 렌더 산출물(`status.html`)의 시각/레이아웃/색/타이포그래피는 변경하지 않는다(v1.4.2에서 확정, 본 PRD Out-of-scope 명시). live-reload 스크립트 주입이 served HTML을 건드리는 유일한 접점이며, 이는 시각이 아닌 동작 surface다 — design critique는 downstream `/mccp:plan` 단계에서 receipt-backed로 재검출한다.

## Open Questions
- [ ] 고정 포트 충돌 시 정책 — 다음 빈 포트로 fallback할지, 점유 프로세스를 재사용할지 (plan 단계 결정).
- [ ] live-reload 메커니즘 — SSE vs 가벼운 polling meta-refresh 주입. 278KB 정적 HTML에 reload 스크립트를 어떻게 주입할지 (plan 단계 결정).
- [ ] 서버 생명주기 — foreground blocking vs background detached + 종료 명령 필요 여부 (plan 단계 결정).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 포트 점유로 기동 실패 | 중 | 중 | 빈 포트 자동 탐색 fallback + 명확한 stderr 안내 |
| Windows 환경 브라우저 자동 오픈 차이 | 중 | 저 | `start ""` (win32) 분기 + 실패해도 URL을 stdout으로 출력해 수동 오픈 가능 |
| live-reload watch가 OS별로 불안정 | 중 | 저 | watch 실패 시 폴백으로 정적 서빙만 유지(loud fail-open) — 자동 갱신은 best-effort |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-22.*
