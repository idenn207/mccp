# Diverse-Agent Review — cross-model 의존 전환

## Problem
mccp의 plan/implement/pr 게이트는 dual-review를 위해 Codex(외부 cross-model) 리뷰에 의존한다. 이 리뷰가 게이트당 **평균 10-15분 blocking**이고 자주 미가용이라, 반복 plan 작성과 연속 milestone ship에서 대기가 누적되고 review 공백이 생긴다. 방치 비용: 운영 속도 저하 + Codex 미인증/companion 실패 시 dual-review 안전망 붕괴(receipt skip).

> 상세 설계 근거는 `.claude/meta/` 3문서 참조: [diverse-agent-review-analysis.md](../meta/diverse-agent-review-analysis.md)(논문+사례+R2 결론) · [converged-redefinition-design.md](../meta/converged-redefinition-design.md)(verdict 재정의 + 소비처 계승) · [verification-layer-design.md](../meta/verification-layer-design.md)(L1/L2/L3 3층 verification).

## Evidence
- **정량 pain**: Codex adversarial review 게이트당 평균 10-15분 blocking (운영자 실측). 반복·연속 ship 시 대기 누적.
- **미가용 빈도**: durable-evidence-substrate cycle `implement-codex advisory로 막힘`, 최근 `/mccp:pr` cache stale + exit 127, companion `exit-nonzero` advisory 강등 반복 (프로젝트 기록).
- **학술 근거(지지)**: [Correlated Errors, ICML 2025 (arXiv:2506.07962)](https://arxiv.org/abs/2506.07962) — 350+ LLM, 두 모델이 둘 다 틀리면 60%가 같은 답(cross-model 합의 = 공유 맹점) · [More Agents (arXiv:2402.05120)](https://arxiv.org/abs/2402.05120) · self-consistency +17.9% · [Verification-Aware Planning (arXiv:2510.17109)](https://arxiv.org/html/2510.17109).
- **학술 근거(주의)**: [Temperature·Persona (arXiv:2507.11198)](https://arxiv.org/abs/2507.11198) — same-model persona 상관 0.4 vs cross-model 0.08. model diversity의 blind-spot 회피 가치는 남음 → hybrid opt-in 근거.
- **타사 사례**: Claude Code PR review 자체가 same-model 5병렬로 **<1% false positive** (Anthropic 프로덕션 — same-model 다관점이 충분한 품질을 낸다는 직접 증거) · Devin Fusion(frontier+sidekick) = hybrid 선례 · mccp의 Opus↔Codex는 "가장 진전된 cross-model 사례"로 평가.
- **기존 인프라**: plan-fanout(4 read-only 관점) · mccp-implement-verify(verify.js) · Stop-loop(lint→typecheck→test→e2e) 이미 존재 → 재조합 문제.

## Users
- **Primary**: mccp를 운영하며 `/mccp:plan`·`/mccp:prp-implement`·`/mccp:pr` 게이트를 매번 통과해야 하는 단일 운영자(skypark207). trigger: 게이트 진입 시 Codex 리뷰 대기.
- **Not for**: 팀 협업 다중 사용자 시나리오 — 현재 개인용 plugin monorepo.

## Hypothesis
We believe **diverse-agent 다관점 리뷰 + 계층적 verification(L1 deterministic backbone / L2 self-consistency / L3 hybrid opt-in)으로 `converged`를 재정의**하는 것이 **게이트 리뷰 대기(10-15분)를 크게 줄이면서 blind-spot 안전판과 dual-review 불변식을 보존**하는 데 유효하다 — for **mccp 운영자**.
We'll know we're right when **대상 게이트 리뷰 wall-clock이 10분 이내로 단축되면서, `converged` 봉인이 여전히 fail-closed(proof 없으면 no-ship)·tamper-protect·provenance를 유지하고 기존 dedupe/ship-gate 회귀가 0**일 때.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| plan-codex 게이트 리뷰 wall-clock | ≤ 10분 (현 10-15분) | 게이트 실행 시간 계측 |
| `converged` 봉인 무결성 | proof 없으면 no-ship, 회귀 0 | dedupe/ship-gate 회귀 test |
| dual-review 불변식 | 무손상 | 기존 게이트 test suite green |
| L3(cross-model) 발동 비율 | 계측 확보 (M2 튜닝 근거) | receipt L3-stamp 집계 |
| git-tracked ship corpus hash | 무변경 | present-only 필드 hash 안정성 test |

## Scope
**MVP (M1)** — plan-codex 게이트 하나를 **multi-agent(L1+L2)로 전환**. `review_verdict`/`review_source`/`review_proof` verdict 재정의를 배선하고, 기존 소비처(dedupe·ship-gate·ledger·convergence)를 단일 helper로 계승. L3(Codex)는 **수동 opt-in** + **발동 계측 stamp**(M2 자동 트리거의 관측 인프라). plan은 코드 diff가 없어 L1은 "plan 내부 일관성 mechanical check", 무게중심은 L2(다관점 self-consistency).

**Out of scope**
- Codex **완전 제거** — hybrid opt-in으로 존속 (blind-spot 안전판). *이유*: correlated-errors 근거상 model diversity의 고유 가치가 high-stakes에 남음.
- **모든 게이트 동시 전환** — 점진적(MVP는 plan-codex 1개).
- **Gemini 등 다른 외부 모델 도입** — 이 머신 미설치 + scope 팽창.
- **receipt schema version bump** — present-only 필드라 불필요.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | plan-codex multi-agent 전환 (MVP) | plan 게이트가 diverse-agent L1+L2로 `converged`를 발급 · wall-clock ≤10분 · Codex 수동 opt-in · L3 발동 계측 stamp · dedupe/ship-gate 회귀 0 | complete | `.claude/plans/diverse-agent-review-m1.plan.md` |
| 2 | L3 자동 트리거 | 불확실성(A: L2 divergent/quorum 경계) ∨ 위험영역(B: auth·API·migration·schema·gate-self·ledger) ∨ ship지점(C: terminal PR) 신호 시 cross-model 자동 발동 · M1 계측으로 조건 튜닝 · 과발동↔지연 균형 관측 | pending | — |
| 3 | implement-verify 3층 확장 | `mccp-implement-verify`를 L1(강한 test/typecheck backbone)+L2+L3로 generalize · 코드 diff 게이트의 verification 가치 극대화 | pending | — |

## Open Questions
- [ ] L1/L2 각 층의 정확한 구성 — L1 스텝 범위(plan 일관성 check 무엇), L2 refute rubric(invariant erosion 체크리스트)
- [ ] quorum 파라미터 — N(관점 수)/M(통과 임계)/K(최소 역할 종류), self-consistency 샘플 수. plan-fanout 4관점 재사용 여부
- [ ] `review_proof` 위조 방지 강도 — dispatch envelope 존재만 vs 각 agent verdict 내용까지 hash-bind
- [ ] L3 자동 트리거 조건 임계값 (M2) — "L2 divergent" 판정 기준, risk-signal 파일 패턴, 관측 후 보수적 튜닝
- [ ] 목표 10분 달성을 위한 병렬도 — L2 관점 병렬 실행 wall-clock 실측

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| same-model L2가 correlated → self-approval (작성자=리뷰어 blind spot 재도입) | Medium | High | L1 deterministic backbone을 gatekeeper로 앞세움 + `review_proof` fail-closed(역할 다양성·독립 verification 강제) + L3 hybrid 안전판 ([verification-layer §7](../meta/verification-layer-design.md)) |
| L3 자동 트리거 과발동 → 10-15분 지연으로 회귀 | Medium | Medium | M1에서 발동 비율 계측 → M2에서 보수적 튜닝 + risk-signal(mechanical, L2 독립)로 트리거 상관 완화 |
| `converged` 재정의가 dedupe/ship-gate 불변식 손상 | Low | High | `resolveEffectiveVerdict` 단일 helper로 소비처 계승(M1 receipt-convergence 패턴 mirror) + 회귀 test ([converged §4](../meta/converged-redefinition-design.md)) |
| 기존 git-tracked ship corpus의 receipt_hash 변경(재봉인 사고) | Low | High | present-only 필드 + skeleton 미materialize(§3.12 no-rehash) + hash 안정성 test |
| plan 게이트 L1 공백(코드 diff 없음) → verification 약화 | Medium | Medium | plan verification은 L2 중심 + L1은 plan 내부 일관성 mechanical check(경로 존재·참조 정합) |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-06.*
