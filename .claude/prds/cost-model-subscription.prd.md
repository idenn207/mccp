# Cost Model — Subscription-Aware Gating

## Problem

mccp의 비용 게이트는 API 종량제(pay-as-you-go) 요금표 기반으로 `cost_usd`를 추정하는데, 구독권(Max/Pro plan, 정액제) 사용자에게 이 값은 **실제 지출과 무관한 부풀려진 가상 숫자**다. `cost-tracker.js`가 Stop hook에서 transcript 전체를 합산하면서 각 turn의 `cache_read`가 turn 수에 대해 N²로 누적되고(실측: 1억 토큰 → $226), `--resume` 경계를 double-count하며, `cost-state`가 user-level 단일 파일 + monotonic MAX라 한 번 튄 값이 모든 프로젝트에 걸쳐 영구 잔존한다($314.50 critical/hard_ceiling sticky). 이 단일 값이 N-worker 병렬·auto-chain·auto-handoff·briefing·plan-fanout **5개 자동화를 동시에 잠그며**, 방치하면 구독권 사용자는 mccp 자동화의 절반을 상시 쓸 수 없다.

## Evidence

- **cost-current.json 실측**: `{cost_usd: 314.50, threshold_tier: "critical", hard_ceiling_reached: true}` — user-level 단일 파일, comax·mccp 세션 혼재.
- **costs.jsonl 마지막 row**: `cache_read_tokens: 100,768,577` → opus rate 검산 시 $226.68로 `estimated_cost_usd`와 정확히 일치 (transcript-sum의 N² 누적 확증).
- **statusline 괴리**: harness 실비 `$45.47` vs cost-state `$314.50` — 6.9배. per-process 실비 vs 다중세션 monotonic-max 추정치.
- **M4 plan Summary(자기 증언)**: *"live harness 상관을 cost hard-ceiling($314.50 critical)으로 미실측 → disable-parallel로 병렬을 N=1 gate off"* — 이 값이 M2b/M3 두 milestone의 실측을 봉쇄.
- **M4 report Notes(자기 증언)**: *"dogfood을 위해 cost-state를 임시 green으로 리셋 후 원복"* — 정상 흐름이 아니라 hook 수동 무력화로만 milestone 완주.
- **이 세션 실측**: green(0) 리셋 후에도 transcript-sum이 즉시 $34.29로 재축적 (monotonic + N² 누적의 재발성 확인).

## Users

- **Primary**: mccp를 **구독권(Max/Pro plan, 정액제)**으로 사용하는 개발자. API 종량제가 아니라 "달러 지출" 개념 자체가 적용되지 않으며, $50/$80/$100 임계는 보호할 청구서가 없는 대상에게 오발화한다.
- **Not for**: API 종량제(pay-as-you-go) 사용자. 이들에게 USD 게이트는 실제 청구 폭주를 막는 유효한 보호 장치이므로 **현행 동작을 그대로 유지**한다 (opt-in 미설정이 기본).

## Hypothesis

We believe **구독권 인식 opt-in(USD 게이트를 context/turn 축으로 대체) + harness 실비 신뢰 + 시간 기반 리셋**이
**부풀려진 가상 비용이 5개 자동화를 오잠그는 문제**를 해결할 것이다 for **구독권 사용자**.
We'll know we're right when **구독권 모드에서 cost 기반 게이트 차단이 0건(병렬·체인·briefing·fanout 정상 발화)이면서도 context/turn 축으로 폭주 방지가 여전히 작동**할 때다.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 구독권 모드 cost-게이트 오잠금 | 0건 | `MCCP_SUBSCRIPTION=1` 상태에서 resolveFleet/auto-chain/briefing/plan-fanout가 cost 사유로 skip/abort하지 않음 (dogfood) |
| 추정치 ↔ harness 실비 괴리 | < 20% | harness-cost writer 배선 후 cost-state vs statusline 실비 비교 |
| hard_ceiling 재발 | 0 | 시간 리셋 + `COST_CRITICAL_USD` 하드코딩 제거 후 장기 세션 관찰 |
| 종량제 사용자 회귀 | 0 | opt-in 미설정 시 기존 $50/$80/$100 동작 완전 보존 (기존 test green) |

## Scope

**MVP** — `MCCP_SUBSCRIPTION` opt-in flag를 5개 소비처(resolveFleet·auto-chain·auto-handoff·briefing·plan-fanout)가 인식해 USD 비용 게이트를 우회하고, 폭주 방지를 context%/turn count 축으로 대체한다. auto-chain의 fail-safe 보수성(의심 시 중단)은 대체 축에서도 보존한다.

**Out of scope**
- **자동 구독권 감지** — harness가 plan type을 안정적으로 노출하는지 불확실. env opt-in이 MVP, 자동 감지는 별도 축으로 이연.
- **cost-tracker rate table 재작성** — cache_read 가중치를 손대는 대신 harness 실비를 신뢰하는 것으로 우회(정확도는 실비가 SSoT).
- **커스텀 statusline writer 강제** — 사용자가 `ccstatusline` 등 커스텀을 쓰면 mccp writer 경로가 끊김. 문서 가이드 + fallback(transcript-sum) 유지로 대응, writer 주입 강제는 out.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Subscription opt-in gate | `MCCP_SUBSCRIPTION=1` 시 5개 소비처가 USD 게이트를 우회하고 폭주 방지를 context/turn 축으로 대체 — 구독권 사용자의 자동화 잠금 즉시 해제 | pending | — |
| 2 | Harness-cost accuracy | cost-tracker가 harness 실비를 신뢰(transcript-sum 강등) + `ecc-context-monitor.js` `COST_CRITICAL_USD=100` 하드코딩을 `cost-thresholds.js`로 통일 — 추정치가 실비에 수렴, 임계 env가 hard_ceiling에도 유효 | pending | — |
| 3 | Time-based decay | cost-state가 mtime > N시간이면 monotonic MAX를 green으로 decay — 한 번 튄 값의 영구·전역 잔존 차단 | pending | — |

## Open Questions
- [ ] 구독권 자동 감지 경로가 존재하나? (harness가 plan type/subscription 신호를 hook stdin이나 env로 노출하는지) — MVP는 env opt-in, 확인되면 후속 축.
- [ ] context/turn 대체 축의 폭주 임계값 — context% 몇 %, turn/tool count 몇 개에서 auto-handoff/abort를 발화할지 (plan에서 결정).
- [ ] harness 실비(`cost.total_cost_usd`) 접근 경로 — 커스텀 statusline(`ccstatusline`) 환경에서 harness-cost cache writer를 어디에 심을지 (별도 Stop/statusline hook vs 문서 가이드).
- [ ] 시간 리셋 임계 N — mtime 몇 시간이 monotonic decay 지점으로 적절한지 (세션 경계 vs 고정 시간).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| opt-in 미설정 구독권 사용자는 여전히 오잠금 | 중간 | 중간 | SessionStart 배너로 구독권 감지 시 opt-in 안내; 문서화 |
| context/turn 축이 USD만큼 폭주를 못 잡음 | 중간 | 중간 | 보수적 대체 임계 + auto-chain fail-safe(의심 시 중단) 보존; 대체 축은 추가 신호이지 완화 아님 |
| harness 실비 경로가 statusline마다 상이 | 높음 | 낮음 | fallback으로 transcript-sum 유지(회귀 0); writer는 best-effort 배선 |
| 종량제 사용자 동작 회귀 | 낮음 | 높음 | opt-in 미설정 = 기존 경로 완전 보존; 기존 cost-thresholds/auto-chain test green 유지 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-09.*
