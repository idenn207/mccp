# Dashboard Readability + Codex Timeout 점검

## Problem
mccp 상태 대시보드(`status.html`)의 위험/질문 패널은 PRD 단위로 그룹화되어 있어, 사용자가 켠 정렬(위험도순·시간순)이 그룹 경계에 가려 한눈에 안 보인다. 또 위험 항목은 어느 문서에서 왔는지 출처가 표시되지 않고, 항목별 시각도 없다. 그리고 dual-review 상태 라벨 '수렴'은 개발자 내부 용어라 대시보드를 보는 사용자에게 의미가 잘 전달되지 않는다. 별개로, codex adversarial review가 "2분 timeout"으로 알려져 있어 시간이 부족하다는 의심이 있었다 — 이 전제 자체의 검증이 필요했다.

## Evidence
- 사용자 직접 관찰(요청 16): "위험에서 위험도 순으로 정렬했는데, 그룹화 때문에 정렬이 잘 보이지 않아." → 그룹 경계가 정렬 인지를 방해.
- 사용자 직접 관찰(요청 17): "'수렴'이라는 문자는 웹 사이트를 사용하는 유저한테 보여주는 명칭으로는 잘 쓰이지 않아."
- 코드 조사(요청 15, 2026-06-30): codex review timeout은 mccp 전체에서 **이미 15분(900s)** 으로 설정됨 (`codex-invoke.js` `DEFAULT_TIMEOUT_MS = 900_000`, 근거 주석 lines 47-54 — "90s was too short ... 900s aligns with codex team's STOP_REVIEW_TIMEOUT_MS = 15min"). 명령 본문(`plan.md`/`prp-implement.md`)도 `--timeout-ms 900000` 명시. PR 단계 `codex-runner.js` 기본 900000. **"2분(120s)" 값은 현재 코드 어디에도 없음.** 과거 90s(약 1.5분)였고 "너무 짧다"는 문서화된 근거로 이미 상향됨.
- 코드 조사: 위험/질문 항목은 자체 타임스탬프가 없음. 현재 "시간순" 정렬은 실제 시각이 아니라 문서 내 등장 순서(`data-ord`) 기반. plan 단위 최근 활동 시각(`lastActivityMs`)만 존재.
- 부수 발견: CLAUDE.md §3.3 분류표(line 197)가 아직 "timeout | 90s 초과"로 stale — 실제 코드(900s)와 불일치.

## Users
- **Primary**: mccp 대시보드를 직접 보는 운영자(= 본 플러그인 사용자 본인). PRD/plan/receipt 진행 상황을 `status.html`로 확인하며, 위험·질문·게이트 판정을 빠르게 훑는다.
- **Not for**: 외부 사용자 / 대시보드를 쓰지 않는 CLI-only 사용자(이들에겐 표면 변경 영향 없음).

## Hypothesis
We believe **위험/질문 리스트의 그룹화 제거 + 출처·시각 표시, 그리고 판정 어휘의 사용자 친화화** will **사용자가 정렬·우선순위·출처를 한눈에 파악하고 게이트 상태를 직관적으로 이해**하게 만든다 for **대시보드 운영자**.
We'll know we're right when **(a) 위험 패널에서 정렬이 그룹 경계 없이 전체 리스트에 적용되어 위험도/시각 순서가 즉시 보이고, (b) 각 항목이 출처 문서를 명시하며, (c) 게이트 상태가 '통과/진행 중/보류'로 표기되어 별도 설명 없이 읽힌다**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| 위험/질문 리스트 그룹 chrome | 0개 (전체 평탄 리스트) | `status.html` 육안 + 렌더러 스냅샷 테스트 |
| 출처 미표시 위험 항목 | 0개 (모든 항목 상단 출처 라벨) | 렌더러 출력 검증 |
| 사용자 노출 '수렴'/'미수렴'/'divergent' 문자열 | 0개 (통과/진행 중/보류로 치환) | 렌더러 전 섹션 grep + 스냅샷 테스트 |
| codex timeout 문서 정확성 | CLAUDE.md §3.3 = 실제 코드(900s)와 일치 | 문서 diff |

## Scope
**MVP** — 세 요청을 각각 독립 마일스톤으로 처리한다. 위험/질문 평탄화 + 출처 + 시각(M2)이 가장 사용자 체감이 크므로 핵심. codex timeout(M1)은 조사 결과 코드 변경 불필요로 확정 — 근거 기록 + stale 문서 정정만. 어휘 리네임(M3)은 공유 판정 어휘 cross-cutting 치환.

**Out of scope**
- codex review timeout 코드값 변경 — 이미 15분(codex 최대 허용치)이라 변경 안 함. 사용자 결정(현 15분 유지). 추후 "5분 상한"이 필요해지면 별도 cycle.
- 위험/질문 항목별 *실제* 타임스탬프 데이터 모델 신설 — 이번엔 plan 단위 `lastActivityMs` 근사로 충분. 정밀 항목 시각이 필요해지면 별도 PRD.
- `codex-invoke.js`가 companion에 `--timeout-ms`를 forward하는 개선 — foreground review 경로는 완료까지 실행되어 spawnSync 900s가 실효 상한이라 현재 영향 없음. 관찰만 기록.
- 위험/질문 *필터* 동작 변경 — 평탄화 후에도 기존 PRD/plan 필터축은 유지(제거 아님).

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Codex timeout 근거 확인 + 문서 정정 | codex review timeout이 이미 15분임을 근거와 함께 확정하고, stale 문서(CLAUDE.md §3.3 "90s")를 실제 값과 일치시킨다. 코드 timeout 동작 변경 없음. | complete | .claude/plans/dashboard-readability.plan.md |
| 2 | 위험/질문 리스트 평탄화 + 출처 + 시각 | 위험·질문 패널을 PRD 그룹화 없이 전체 평탄 리스트로 표시하고(필터는 유지), "모두 펼치기/접기" 토글을 제거하며, 각 항목 상단에 출처 문서를 작은 회색 글씨로 표시하고, 출처 plan의 최근 활동 시각을 사람이 읽기 쉬운 형식으로 표시한다. | complete | .claude/plans/dashboard-readability-m2.plan.md |
| 3 | 판정 어휘 사용자 친화화 | 대시보드 전 섹션의 dual-review 판정 라벨을 '수렴→통과', '진행→진행 중', 'divergent/미수렴→보류'로 일관 치환한다. | in-progress | .claude/plans/dashboard-readability-m3.plan.md |

## Open Questions
- [ ] M2 출처 라벨 + 시각의 정확한 시각적 배치/위계는 impeccable 디자인 위임으로 결정 (작은 회색 글씨, 항목 상단이라는 제약 안에서). 질문 패널은 이미 출처를 표시하므로 위험 패널과 동일 패턴으로 통일.
- [ ] M2 시간 포맷 규칙(>60일→월/일, 연도 변경 시→년/월/일)을 공유 relative-time 헬퍼에 두어 다른 시각 표면(세션 목록·활동 기록)에도 일관 적용할지 — 권장: 예(단일 헬퍼). 단 이번 요청의 1차 대상은 위험/질문 리스트.
- [ ] M3 영어 라벨 'divergent'와 한국어 '미수렴'을 둘 다 '보류'로 통일하되, sr-only/접근성 텍스트와 드로어 '판정' 행까지 빠짐없이 치환되는지 — 누락 site 방지가 핵심 리스크.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| M3 어휘가 여러 섹션(audit-timeline·pipeline·status-grid·drawer-detail·next-action·decision-state·multi-session)에 흩어져 있어 일부 site 누락 | HIGH | MEDIUM | grep 전수 audit + 가능하면 라벨 단일 소스화. 스냅샷/유닛 테스트로 잔여 '수렴'/'미수렴'/'divergent' 0 검증 |
| M2 시각이 plan 단위 `lastActivityMs` 근사라, 같은 plan 출신 항목들이 동일 시각으로 보임 | MEDIUM | LOW | 사용자 수용 완료(plan 근사 채택). 항목 단위 정밀 시각은 out-of-scope로 명시 |
| M2 그룹 제거 시 no-JS 베이스라인/필터/정렬 회귀 | MEDIUM | MEDIUM | 평탄 `<ul>`로 전 항목 가시 보장(graceful degrade), 기존 `data-prd`/`data-plan`/`data-sev`/`data-ord` 속성 유지, 렌더러 테스트로 필터·정렬 회귀 검증 |
| 스냅샷 테스트가 기존 그룹 chrome/'수렴' 라벨에 고정되어 대량 갱신 필요 | MEDIUM | LOW | 의도된 변경이므로 스냅샷 갱신 + diff 리뷰로 회귀 아님 확인 |

## Design Direction
M2(위험/질문 리스트 평탄화·출처 라벨·시각 표시)와 M3(판정 어휘)는 사용자 노출 디자인 표면 변경이다. 구현 단계에서 impeccable에 시각 처리를 위임한다([[feedback-impeccable-full-delegation]] 전면 위임 방침):
- 평탄 리스트의 항목 간 위계(severity 뱃지 + 제목 + 출처/시각 메타 cue)와 밀도.
- 출처 라벨: 항목 상단, 작은 글씨, 회색 계열(중립 토큰) — 강조색 viewport당 ≤1 제약 준수, 본문 대비 보조 정보로 후퇴.
- 시각 표시: 출처 라벨과 같은 메타 줄에 둘지 등 배치는 impeccable 판단.
- 어휘 라벨(통과/진행 중/보류)은 기존 아이콘(✓/◐/⚠)·톤(low/med/high)과 의미 정합 유지.

downstream `/mccp:plan` + `/mccp:prp-implement`가 stage-aware impeccable 라우팅(§3.10) + produced-diff grounding lint(§3.9)로 이를 mechanical 보강한다.

### Design Routing Guide
<!-- recommend-only at PRD stage (invokes nothing, writes no receipt). /mccp:plan re-derives + stamps --impeccable-routing-mode on its mccp-plan-codex receipt. -->

| stage | command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-30.*
