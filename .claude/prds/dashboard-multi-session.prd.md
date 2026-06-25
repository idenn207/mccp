# Dashboard Multi-Session — worktree별 진행 실시간 집계

> PRD ② / 3 (dashboard 기능 추가 묶음, 2026-06-24 co-created). 형제 PRD: [`dashboard-truthfulness.prd.md`](dashboard-truthfulness.prd.md) · [`dashboard-data-exploration.prd.md`](dashboard-data-exploration.prd.md). **선행 의존**: PRD①의 M1(완료 이력 영속화 레지스터) — 본 PRD는 그 위에 *live* 스캔을 얹는다.

## Problem

작업은 대부분 git worktree(`.worktrees/<branch>/`)에서 병렬로 일어나는데, 대시보드는 자신이 실행된 단일 worktree의 시야에 갇혀 다른 worktree의 진행(어느 마일스톤·게이트까지 갔는지, 차단됐는지)을 보지 못한다. receipt는 gitignore + worktree-local이라 부모 repo나 sibling worktree에서는 그 진행이 아예 안 보이고, merge 후엔 PRD①의 ledger가 *완료* 이력은 살리지만 *진행중(live)* cross-worktree 현황은 여전히 사각지대다. 그래서 멀티 세션 dogfood에서 "지금 어느 worktree가 무엇을 하고 있나"를 한눈에 볼 수 없다.

## Evidence

- 사용자 직접 제기(2026-06-23 세션): "receipt가 gitignore라 다른 worktree에서 작업하면 receipt가 안 쌓여 진행사항이 신뢰할 수 없는 상태가 된다 — 이래도 대시보드가 역할을 할 수 있나?"
- 사용자 직접 관찰: 보통 작업을 worktree에서 진행 — 단일 worktree 시야로는 병렬 작업 현황 파악 불가.
- 구조적 증거: 이미 `sections/active-sessions.js`가 `state.item.active_session_ledgers`(세션 ledger, global/repo-scope, v1.4.0 M1)를 읽어 활성 세션 목록을 surface 중 — 세션 *존재*는 추적하나 worktree별 *진행 단계*는 아직 아님. 본 PRD가 이 surface를 진행-집계로 확장.
- 설계 합의(2026-06-24): live cross-worktree 시야는 `git worktree list` 열거 → 각 worktree working-tree `.claude/` 직접 read(gitignore-agnostic, 미커밋 상태까지 실시간)로 확정.

## Users

- **Primary**: skypark207(mccp 단독 개발자, PM 모드). 2개 이상 worktree를 병렬 dogfood하며 "어느 worktree가 어느 마일스톤/게이트이고 무엇이 차단인지"를 한 화면에서 훑으려는 상황에서 트리거됨.
- **Not for**: 원격/멀티머신 집계, 외부 공유. 동일 로컬 머신의 worktree들만.

## Hypothesis

We believe **`git worktree list`로 활성 worktree를 열거해 각 worktree의 working-tree `.claude/`(STATE.md + receipts)를 직접 읽어 worktree별 진행(branch·현재 마일스톤/게이트·차단 여부·마지막 활동)을 한 섹션에 집계하면**
will **여러 worktree 병렬 작업의 현황을 한 화면에서 즉시 파악하게** for **mccp 단독 개발자**.
We'll know we're right when **부모 repo에서 대시보드를 열어도 모든 활성 worktree의 진행이 worktree별로 한 섹션에 나오고, 차단된 worktree가 시각 강조되며, 현재(self) worktree가 구분되고, 단일 worktree일 때는 조용히 숨는다**.

## Success Metrics

| Metric | Target | How measured |
| --- | --- | --- |
| cross-worktree 가시성 | 활성 worktree 100% 집계 | 부모/임의 worktree에서 렌더 시 `git worktree list`의 모든 활성 항목이 진행과 함께 표시 |
| 진행 단위 정확성 | worktree별 현재 마일스톤/게이트 + 차단 | 각 worktree의 working-tree STATE.md + receipts에서 derive한 진행 단계가 실제와 일치 |
| self 구분 | 현재 worktree 마커 | 자기 worktree row가 시각 구분(기존 self_session_id 패턴 계승) |
| gitignore-agnostic | 미커밋 진행도 surface | worktree의 uncommitted receipt/STATE까지 실시간 반영(커밋 불요) |
| graceful hide | 단일 worktree 시 무노출 | 활성 worktree 1개면 섹션 숨김(콘솔 조용함 유지) |

## Scope

**MVP** — 대시보드 렌더 시 `git worktree list`를 열거하고 각 worktree 경로의 working-tree `.claude/`(STATE.md + receipts)를 직접 읽어 worktree별 진행 모델(branch, 현재 마일스톤/게이트, 차단 여부, 마지막 활동 시각, self 여부)을 derive한 뒤, 기존 active-sessions surface를 확장한 멀티세션 섹션에 worktree당 1행으로 집계한다. 차단 worktree는 시각 강조, self worktree는 구분, 단일 worktree면 graceful hide. 행 클릭 시 해당 worktree 상세는 기존 드로어로.

**Out of scope**

- 완료 이력 영속화(ledger) — PRD①의 M1. 본 PRD는 *live* 진행만 집계.
- 원격/멀티머신 worktree, 다른 머신의 clone 집계 — 동일 로컬 머신 한정.
- merged/제거된 worktree의 과거 이력 재현 — PRD① ledger가 완료 이력 담당. 본 PRD는 현재 활성 worktree만.
- worktree 생성/제거/전환 같은 **조작** 기능 — read-only 집계만.
- 그룹핑/필터(worktree 기준 포함)·검색 — PRD③ 소관(본 섹션의 데이터를 ③이 필터 대상으로 소비).

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete | dropped -->

| # | Milestone | Outcome | Status | Plan |
| --- | --- | --- | --- | --- |
| 1 | Worktree 진행 스캐너 | `git worktree list` 열거 → 각 경로 working-tree `.claude/`(STATE.md + receipts) 직접 read → worktree별 진행 모델(branch·현재 마일스톤/게이트·차단·마지막 활동·self) derive. read-only, gitignore-agnostic, fail-open(접근 불가 worktree는 error row 보존 + 신호). | complete | `.claude/plans/dashboard-multi-session.plan.md` |
| 2 | 멀티세션 대시보드 섹션 | 기존 active-sessions surface 확장 — worktree당 1행(진행 요약 + 차단 강조 + self 마커), 행 클릭 시 드로어로 상세, 단일 worktree면 graceful hide. STATUS.md plain-text 동등본 포함. | pending | — |

## Design Direction

- **기준(canonical)**: 콘솔 셸·토큰·드로어는 승인된 `dashboard-sample.html` + DESIGN.md 계약. 멀티세션 섹션은 기존 active-sessions 테이블 표현을 진행-집계로 확장하되 동일 토큰/아이콘.
- **상태 표현**: worktree 진행/차단은 색+아이콘 이중표기(비-색 severity 마커 계승). 차단 worktree는 강조색(viewport당 ≤1 원칙 — 차단이 우선순위).
- **graceful hide**: 단일 worktree(공통 경로)에서는 섹션을 숨겨 콘솔을 조용히 유지(기존 worker-fanout/active-sessions 패턴).
- **워크플로**: M2(UI)는 ship 전 impeccable `audit`/`polish`. M1(스캐너)은 데이터 레이어.
- **STATUS.md 동등본**: worktree별 진행을 plain-text 테이블로 동등 노출.

## Open Questions

- [ ] 어느 worktree까지 집계 — 모든 `git worktree list` 항목 vs 활성(최근 활동 N일/STATE 신호 있음)만. main/parent worktree 포함 여부 (plan 결정).
- [ ] worktree 스캔 성능 — N개 worktree × `.claude/` read 비용 + 렌더 latency 상한. lazy/cap 정책 (plan 결정).
- [ ] 진행 단위 derive 소스 우선순위 — worktree STATE.md(git-tracked, 신뢰) vs working-tree receipt(상세, 최신) 충돌 시 무엇을 권위로 (plan 결정).
- [ ] self worktree 식별 — 현재 cwd ↔ `git worktree list` 경로 매칭 방식(심볼릭/대소문자/UNC 경로 정규화) (plan 결정).
- [ ] 접근 불가 worktree(권한/삭제 중) 처리 — skip + 신호 vs 에러 row. fail-open 표현 (plan 결정).
- [ ] PRD① ledger와의 합류 — 완료된 worktree는 ledger(이력)로, 활성은 스캐너(live)로 — 한 화면에서 둘을 어떻게 구분/병치 (plan 결정).

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| worktree 다수 스캔이 렌더 latency 유발 | 중 | 중 | cap + 활성 필터 + fail-open(느린 worktree skip) + 렌더 캐시. plan에서 상한 정의. |
| 다른 worktree의 working-tree read가 race(작성 중 파일) | 중 | 저 | atomic read + parse 실패 시 해당 worktree degrade(전체 실패 아님). |
| self worktree 경로 매칭 실패(정규화 이슈) | 중 | 저 | 플랫폼 독립 basename + realpath 정규화(기존 cwd-mask 패턴 계승). |
| 단일 worktree 사용자에게 불필요한 섹션 노출 | 저 | 저 | graceful hide(활성 1개면 숨김). |
| live 스캔과 PRD① ledger가 같은 정보를 중복 표시 | 중 | 저 | 활성=스캐너, 완료=ledger로 역할 분리 + 시각 구분(plan에서 병치 정의). |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-24.*
