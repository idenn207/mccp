# Dashboard Truthfulness — 영속 이력 + 개요 재구성 + 항목 정리

> PRD ① / 3 (dashboard 기능 추가 묶음, 2026-06-24 co-created). 형제 PRD: [`dashboard-multi-session.prd.md`](dashboard-multi-session.prd.md) · [`dashboard-data-exploration.prd.md`](dashboard-data-exploration.prd.md). 선행 PRD: [`dashboard-console-redesign.prd.md`](dashboard-console-redesign.prd.md)(콘솔 셸 M1~M4 ship 완료).

## Problem

mccp 진행 현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)는 콘솔 셸 재설계(M1~M4, PR #57~#60)로 보기는 좋아졌지만, 보여주는 *내용*이 호스트 프로젝트의 현실과 어긋난다. 개요는 stale 버전(v0.3.5)과 불투명한 "진행 4"(무엇이 진행중인지 알 수 없음)를 표시하고, 위험 약 230건과 미해결 질문 다수가 이미 해결됐는데도 은퇴되지 않아 누적되며, 완료 마일스톤은 "날짜 미상"으로 떨어진다. 근본 원인은 완료 산출물의 이력이 영속·정리되지 않는 데 있다 — receipt는 gitignore + worktree-local이라 worktree에서 작업 후 merge하면 영영 사라지고(post-merge amnesia), 위험/질문은 모든 plan/PRD 본문에서 무한 누적될 뿐 은퇴 메커니즘이 없다.

## Evidence

- 사용자 직접 관찰: 개요가 v0.3.5 고정 표시 — 호스트 프로젝트는 v1.18.2까지 진행했고 최신 plan은 `dashboard-console-redesign-m4`. 대시보드는 플러그인이 *소비 프로젝트* 안에서 도는 구조이므로, 플러그인 자신의 버전이 아니라 **호스트 프로젝트의 최신 개발 신호**를 표시해야 한다(사용자 명시).
- 사용자 직접 관찰: 개요 "진행 4" — 카운트만 있고 무엇이 진행중인지 식별 불가. 실제 진행중은 1개(이 작업)여야 함("이게 최신 마일스톤이고 진행 중 1").
- 사용자 직접 관찰: 위험 약 230건 표시 — 해결됐으나 완료 처리가 안 돼서 남거나, 더 이상 추론할 필요 없는 질문이 누적. "최신화해서 없애라"는 요청.
- 구조적 증거: receipt gitignore(CLAUDE.md §3.8) + worktree workflow(`.worktrees/`) → merge + `git worktree remove` 후 receipt 소멸 → `milestone-history.js`의 `pickShipReceipt` 매칭 실패 시 `completedAt=null`("날짜 미상").
- 설계 합의(2026-06-24): 영속화는 git-tracked completion ledger(접근법 B)로 수렴 — Claude 독립 분석 + 2차 분석 모두 전역 저장소(A)·이중검증(C)을 과다설계로 판정. 진짜 GPT-Codex 교차검증은 `/mccp:plan` 게이트에서 받는다.

## Users

- **Primary**: skypark207(mccp 단독 개발자, PM 모드). 임의 mccp-installed 프로젝트에서 "지금 무엇이 진행/차단/위험이고 다음 행동(명령)이 뭔지"를 개요 한눈에 **정확히** 확인하려는 상황에서 트리거됨.
- **Not for**: 외부 배포/공유 대상, 멀티유저, 모바일. 로컬 데스크톱 dogfood 전용 불변.

## Hypothesis

We believe **git-tracked completion ledger로 수렴·완료 이력을 영속화하고, 개요를 호스트-프로젝트 신호 기반 위젯(진행중 '무엇'/차단/위험/다음 command)으로 재구성하며, 위험/질문을 평가 기반 소스 최신화(해결 마커)로 은퇴시키면**
will **대시보드가 호스트 프로젝트의 현재 상태를 정확히 말하게** for **mccp 단독 개발자**.
We'll know we're right when **개요 버전이 호스트 프로젝트 최신 신호와 일치하고, 진행중 위젯이 실제 진행 항목의 이름을 명시하며, 해결된 위험/질문이 메인에서 사라지고, 완료 마일스톤의 완료 시점이 merge + worktree 제거 후에도 항상 정확하며, pending/dropped 마일스톤이 토글로 노출된다**.

## Success Metrics

| Metric | Target | How measured |
| --- | --- | --- |
| 버전 정확성 | 호스트 프로젝트 최신 신호와 일치(플러그인 버전 비표시) | 개요 버전이 derive한 host-project 신호와 일치 — mccp repo에선 v1.18.2 + 최신 plan |
| 진행중 식별성 | "진행 N"이 항목 이름까지 명시 | 진행중 위젯이 실제 in-progress decision/마일스톤 이름 노출, 카운트=실제(이 작업 1건) |
| 위험/질문 정리 | 해결 항목 메인 노출 0 | 평가 기반 해결 마커(`/mccp:dashboard-audit` human-gate)가 달린 risk/OQ가 메인에서 사라짐(접힘으로만, 되돌리기 가능) — 활성만. resolved 신호는 명시 마커뿐(추정 0) |
| 완료 이력 영속성 | "날짜 미상" 0건, merge 후에도 유지 | git-tracked ledger 기반 완료 시점 표시율 100%, worktree 제거 후 회귀 테스트 |
| 마일스톤 lifecycle | pending/dropped 표시 + 토글 | PRD Status 열(pending\|in-progress\|complete\|dropped) 읽어 렌더 + '미진행 표시' 토글(default off) |
| 다음 행동 실행성 | 복사 가능한 `/mccp:*` command | 다음 행동 위젯이 STATE.md Next Step 기반 + 가능하면 실행 command 형태 + 복사 버튼 |

## Scope

**MVP** — gate 수렴 시 git-tracked completion ledger(`decision_id, gate, verdict, version, completed_at, commit_sha, plan_file_hash, risks_closed[], oq_closed[]`)에 요약을 append하여 완료 이력을 영속화하고, 대시보드가 이 ledger를 durable history source로 소비한다. 그 위에서 개요를 '대시보드'로 재명명하고 호스트-프로젝트 버전 신호 + 진행중/차단/위험/다음 위젯(각 '무엇'인지 항목 명시)으로 재구성하며, **위험/질문을 평가 기반 소스 최신화(해결 마커)로 은퇴**시키고(M3 재설계 2026-06-24 — render-side 추정이 아니라 `/mccp:dashboard-audit` agent 평가+human-gate가 소스 `.md`에 비파괴 `<!--mccp:resolved …-->` 마커를 달고 render는 결정적 마커 reader로 메인에서 collapse), PRD Delivery-Milestones Status 열을 확장해 pending/dropped를 토글로 노출하며, 메인 표현(타임라인 더보기·질문 복사버튼-only·위험 복사버튼)을 정리한다.

**Out of scope**

- 그룹핑·필터·정렬·검색 — PRD③(`dashboard-data-exploration`) 소관.
- cross-worktree **live** 진행 집계(`git worktree list` 스캔) — PRD②(`dashboard-multi-session`) 소관. 본 PRD는 *완료 이력의 영속화*(ledger)까지만 다루고, ②가 그 위에 live 스캔을 얹는다.
- 콘솔 셸·토큰·드로어 재설계 — 이미 `dashboard-console-redesign`에서 ship. 본 작업은 내용/데이터 surface만.
- 전역 receipt 저장소(`~/.claude/`)로의 이전 + 이중 cross-check — 과다설계로 기각(B 채택). receipt 자체는 gitignore + worktree-local 유지.
- derive correlation 알고리즘 전면 재설계 — 기존 7 source/6 correlation 재사용. 확장은 ledger source + 은퇴 매칭에 한정.

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete | dropped -->

| # | Milestone | Outcome | Status | Plan |
| --- | --- | --- | --- | --- |
| 1 | 완료 이력 영속화 레지스터 (foundation) | gate 수렴 epilogue가 git-tracked ledger에 요약 1건 append(receipt_hash carve-out 계승, detached/uncommitted 시 안전 skip) → merge + worktree 제거 후에도 완료 이력·완료 시점이 살아남고 대시보드가 durable history로 읽음. "날짜 미상" 해소. | complete | `.claude/plans/dashboard-truthfulness-m1-completion-ledger.plan.md` |
| 2 | 개요 → '대시보드' 재구성 + 호스트 버전/위젯/다음 command | 개요를 '대시보드'로 재명명 + 버전을 호스트-프로젝트 최신 신호에서 derive + 진행중/차단/위험/다음을 각 위젯으로 나열(카운트가 아닌 '무엇'인지 항목 명시) + 다음 행동을 STATE.md Next Step 기반 실행가능 `/mccp:*` command + 복사 버튼으로. | complete | `.claude/plans/dashboard-truthfulness-m2-overview-rebuild.plan.md` |
| 3 | 위험·질문 은퇴 + 마일스톤 lifecycle + **진실성 표현** | **평가 기반 소스 최신화(해결 마커)** — 위험/OQ 라인에 비파괴 해결 마커(`<!--mccp:resolved …-->`)를 달아 render가 메인에서 빼고 "해결됨" 접힘으로만 노출(되돌리기 가능). 마커는 `/mccp:dashboard-audit`(agent 평가+증거 인용→human-gate→결정적 applier)가 단다 — resolved 신호는 명시 마커뿐(추정 0). + PRD Status 열 확장(pending\|in-progress\|complete\|dropped) → pending/dropped '미진행 마일스톤 표시' 토글(default off) + stale in-progress status 최신화로 진행중=실제. **+ M3-b(2026-06-25): 데이터는 truthful하나 *표현*이 오해 유발("해결됨 243건" 큰 숫자가 위험 250개 착시, 결정 로그가 미해결 질문으로 오노출) → 위험/OQ를 GitHub-PR식 active/resolved 탭으로 분리(미해결만 기본, resolved 카운트는 탭 label로만), empty state 문구("발견된 위험이 없습니다"), `## Open Questions`의 `(결정)`/`(해소)`/`(defer)` 결정 로그를 미해결에서 제외, 좌측 nav에 '미해결 질문' 전용 entry + 각 섹션 카운트 뱃지. 디자인은 impeccable shape→layout→critique→audit/polish.** | complete | `.claude/plans/dashboard-truthfulness-m3-stale-audit.plan.md` |
| 4 | 메인 표현 정리 | 타임라인 '더보기'(상위 N expanded + 나머지 접힘) + 미해결질문은 메인에 복사 버튼만(상세는 드로어) + 위험에 복사 버튼 추가. | complete | `.claude/plans/dashboard-truthfulness-m4-surface-cleanup.plan.md` |
| 5 | 데이터 의미론 정합 (진행중·위험/차단·Hero·라우팅) | derive 모델의 의미론 결함 7건: 진행중=실제(완료 자동감지 — terminal-receipt/M1 ledger 닫힘 마일스톤 제외 + 신선도 가드 + 완료 PRD 표 데이터 정리) / rail '위험'을 위험 섹션과 동일 소스(plan risks)로 통일 + backlog는 '이월 finding' 분리 + '차단' 라벨·툴팁(게이트 미수렴 의미) / Hero를 현재 작업 다음액션+요약 중심으로(backlog-deferred 강등, 잘림 방지) / verdict 라벨 분화(neutral≠'대기') / hero-version 줄 제거 / 더보기→기존 :target route 전체보기 링크. 콘솔 셸 계약 불변. (M5a #2 진행중 진실성 ship v1.18.8 / M5b 표현·Hero ship v1.18.9.) | complete | `.claude/plans/dashboard-truthfulness-m5-semantics.plan.md` |
| 6 | 표현 재구성 + Hero/파이프라인 진실성 | Vercel 카드 2컬럼 + 아래-화살표 확장(위젯 4종을 hero-panel 밖 개별 카드로 분해) / Hero h1을 마일스톤명+요약 subtext로(verbose Summary 잘림 해소) / next-action에 "무엇을 하는지" 설명 / impl 게이트 수렴≠완료 진실성(converged-frontier 신규 상태 — receipt-only supersession) / 라벨 정합(미해결 위험·게이트 파이프라인·미해결 질문·개요로 → 위험·파이프라인·질문·대시보드로) / 마일스톤 lifecycle 토글을 위험·질문과 동일 buildTabs(완료/미진행)로 통일. 콘솔 셸·route 식별자 불변. | complete | `.claude/plans/dashboard-truthfulness-m6-vercel-restructure.plan.md` |
| 8 | 위험 lifecycle-scope (보관됨 분리) | 위험 active 필터가 출처 plan lifecycle을 무시해 완료 plan의 미마커 historical 위험(실측 36건)이 live count를 부풀린다. 각 위험에 parse-time `sourceClosed`(planStatuses complete/dropped · terminal-receipt-fresh · ledgerCloseFresh strict) 스탬프 → 3-버킷(미해결 18 · 해결됨 243 · 보관됨 47, 보관됨=해결 마커 없으나 출처 plan 종료)으로 분리, rail/섹션/md가 동일 active 필터 공유(reconcile). 위험-숨김은 fresh 증거만 인정(reopened plan under-claim 안전, Codex F1). follow-up: PRD 마일스톤 표 파서가 escaped pipe(`\|`)를 리터럴로 처리하도록 수정(m3 등 완료 plan lifecycle 미검출 → 위험 오집계 근본 원인 제거). | complete | `.claude/plans/dashboard-truthfulness-m8-risk-lifecycle.plan.md` |
| 7 | 다음-행동 진실성 + 잘림 제거 | 핵심 기능(다음 행동 추천)을 truthful하게: next-action을 in-progress 마일스톤의 실제 게이트 frontier에서 derive(STATE.md stale/hollow echo 차단 — hollow filter + frontier-primary 재정렬 + ledger-aware decision-state freshness-guard) + genuine handoff(`last_event==='handoff_spawn'`)에서만 resume 추천. Hero 설명·진행중 위젯의 문장 중간 잘림 제거(첫 완결 문장 + 위젯 2줄 wrap, "그만 잘라"). 콘솔 셸·route 식별자 불변. (②lifecycle 스코핑·③글자-ID strip은 M8로 분리.) | complete | `.claude/plans/dashboard-truthfulness-m7-next-action.plan.md` |

## Design Direction

- **기준(canonical)**: 콘솔 셸·토큰·드로어·copy 톤은 이미 승인된 `.claude/cache/dashboard-sample.html` + DESIGN.md를 계약으로 따른다(미감 재탐색 없음). 본 PRD는 그 셸 위의 *내용/데이터*를 다룬다.
- **M1은 데이터 레이어** — UI 변경 없음(렌더러는 ledger를 읽기만). impeccable 워크플로 비대상.
- **M2~M4는 UI 변경** — 개요 위젯·은퇴 표현·더보기·복사 버튼은 `frontend-design-direction` SKILL Output Constraints(정보 위계 3단계 / 강조색 viewport당 ≤1 / raw marker 금지 / 한 화면 항목 상한)를 따르고, ship 전 impeccable `audit`/`polish`로 a11y·반응형 검증. 위젯은 색+아이콘 이중표기(비-색 severity 마커 계승).
- **STATUS.md 동등본**: 개요 위젯·은퇴 상태·마일스톤 lifecycle은 plain-text로도 동등 노출(SSH/스크린리더 fallback 불변).

## Open Questions

- [ ] ledger 위치 — `.claude/state/STATE.md` 확장 vs 신규 `.claude/state/milestone-ledger.json`. schema + `receipt_hash` carve-out(v1.3.0-m2 briefing 선례) 적용 범위 (plan 결정).
- [ ] ledger append 안전성 — detached HEAD / dirty working tree 시 skip + `meta.ledger_write_skipped` 신호 + `/mccp:pr` pre-flight가 dirty ledger 감지 시 stage 0 경고/강제 stage. 두 worktree 동시 append 시 merge 정책(append-only array → 양쪽 보존, 충돌 해석은 사용자 pull/rebase) (plan 결정).
- [ ] 호스트-프로젝트 버전 신호의 canonical 소스 — 최신 plan 버전 / CHANGELOG / git tag / 프로젝트 meta 중 무엇을 우선할지. 프로젝트마다 다를 수 있으므로 폴백 사다리 정의 (plan 결정).
- [ ] 위험/OQ 은퇴 매칭 키 — ledger 스냅샷과 현재 plan 본문을 텍스트로 매칭할지 안정 ID로 할지 + 부분 해결(일부 row만 close) 처리 + plan 본문 revise 후 재매칭 (plan 결정).
- [ ] 다음 행동 command surface — STATE.md Next Step이 `/mccp:*` command가 아닌 서술형일 때의 폴백(서술 + 추론된 command 후보) (plan 결정).
- [ ] ledger ↔ 실제 receipt drift 감지 — ledger 항목의 hash가 working-tree receipt과 mismatch 시 `⚠ Ledger mismatch` 배너 노출 범위 (plan 결정).
- [ ] (M3-b) OQ 진실성 — `## Open Questions` 헤딩 아래 결정 로그(`(결정)`/`(해소)`/`(defer)` 접두)가 "미해결 질문"으로 오노출됨(관측: 8 active OQ 전부 결정 로그, 진짜 미해결 ≈0). 접근 A(audit로 결정-로그 마커링, marker-only 원칙 유지) vs B(접두 render-side 인식, 원칙 일부 완화) — Codex 검토 후 결정. A를 보수적 default 추천.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| ledger 커밋 누락(수렴은 됐으나 commit 빼먹음) | 중 | 중 | receipt write epilogue가 auto-append + `/mccp:pr` pre-flight가 dirty ledger 감지 시 경고/명시 stage. append는 git status check 후. |
| ledger append가 receipt chain-of-custody(hash) 훼손 | 중 | 고 | ledger는 별도 파일(receipt 비변경) + receipt stamp 필요 시 `receipt_hash` carve-out(deep-clone) 계승 + 마이그레이션 dry-run. |
| 위험/OQ 은퇴 오판(미해결을 해결로 숨김) | 중 | 고 | ledger 스냅샷 ⊆ 현재 본문 **명시 매칭**만 은퇴 + 작성자 본문이 authoritative + 은퇴는 제거 아닌 접힘(되돌리기 가능). |
| 호스트 버전 신호가 프로젝트마다 부재/상이 | 중 | 중 | 폴백 사다리(plan 버전→CHANGELOG→git tag→"미상") + 미상 시 정직 표기. |
| 두 worktree 동시 ledger append merge 충돌 | 저 | 저 | append-only array + commit_sha 포함 → 양쪽 기록 보존, 자동 resolve 불필요. |
| M2~M4 UI 변경이 기존 렌더러 테스트 대량 회귀 | 중 | 중 | 섹션별 단위 테스트 유지 + 단계별 ship + STATUS.md 동등본 회귀 가드. |
| (M3-b) resolved 큰 숫자/결정 로그가 위험·미해결 착시 유발(신뢰 저하) | 고 | 고 | active/resolved 탭 분리(미해결만 기본, resolved는 탭 label 카운트) + empty state 문구 + 결정 로그를 미해결에서 제외 + 섹션 뱃지로 active 수 정직 표기. |
| (M3-b) CSS-only 탭/route 분리 a11y·routing 회귀 | 중 | 중 | radio+label+ARIA + impeccable audit + default-route/topbar-title 동반 갱신 + STATUS.md plain-text fallback 동등. |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-24.*
