# Codex Review Intent-Context Preservation

## Problem

mccp의 `/mccp:plan`(및 `/mccp:pr`) 게이트는 Codex adversarial review에 **단독 의존**한다. 세 가지 결함이 겹친다:

1. **리뷰어가 의도를 못 본다** — Codex는 `spawnSync`로 뜬 out-of-process(`codex-invoke.js`)라 Claude↔사용자 대화(제약·예외·의도적 방향)에 물리적으로 접근하지 못한다. 게이트가 넘기는 `--focus`는 `"challenge the following plan decisions"`뿐이고, plan 아티팩트에도 그 의도를 명시하는 전용 섹션이 없다.
2. **심판이 저자와 같다** — finding 수용을 판단하는 arbiter가 plan을 쓴 저자(같은 Claude 세션)와 동일하다. 자기 작업에 대한 자기심판이다.
3. **자신감에 굴복한다** — arbiter가 자신감 있게 서술된 Codex finding에 sycophancy로 굴복해, 사용자의 명시 의도를 조용히 뒤집은 plan을 산출한다.

결과적으로 사용자의 요구가 변형된 채 게이트를 통과하며, 이는 "adversarial dual-review가 신뢰를 보증한다"는 mccp의 핵심 가치를 훼손한다. 직접 겪지 않으면 발견이 어렵다.

## Evidence

- **실측 사례**: multi-session 오케스트레이션 plan에서 초기엔 오케스트레이션의 구조적 형태가 완성됐으나, Codex 검증을 거치며 "현실적 답변"·"요점 이탈 수정"을 수용하다가 **"Anthropic 네이티브 기능을 최대한 따르라"는 명시 지시를 Codex가 무시하고 개별 판단** → 요구가 변형돼 원래 의도에서 벗어난 plan이 산출됨. (정량 지표 부재 — 현재 게이트는 아무것도 측정하지 않음.)
- **메타 증거**: 이 PRD를 위한 실증 조사에서 4개 리서치 agent **전부**가 실존 논문·실제 주제는 맞히면서 **초록에 없는 수치를 지어냈다**(예: sycophancy "63.7% flip", CriticGPT "3배 버그", Self-Correction Bench "Opus 4.6 65.36%"). 직접 arXiv 검증으로 걸러냈다. 검증 없이 수용했으면 그대로 문서에 박혔을 것 — "리뷰 결과를 무비판 수용하면 안 된다"는 본 문제의 실재성을 그 자체로 실연한다.
- **문헌**: `## References` 참조. 자기심판 blind-spot 64.5%(Tsui), 컨텍스트 분리 검토 이득(Song, F1 28.6 vs 24.6), 별도 critic 우월(CriticGPT 63% 선호), 이종 peer의 harmful-revision 89%→35%(Nilayam).

## Users

- **Primary**: mccp의 `/mccp:plan`·`/mccp:pr` 게이트를 운용하며 대화로 제약·예외·원하는 방향을 제시하는 운영자(skypark207, 유일 사용자이자 개발자).
- **Not for**: `/mccp:prp-implement`의 Implement-Codex 사용 맥락 — 코드 패턴 검토라 대화 의도 의존도가 낮음(사용자 판단으로 scope 제외).

## Hypothesis

우리는 **(a) 사용자의 명시 의도를 plan 아티팩트에 reference로 표면화하고 리뷰어 focus에 주입하는 것**과 **(b) 수용 판단(arbiter)을 저자 컨텍스트에서 분리해 intent-conflict를 구조적 gate로 먼저 대조하는 것**이 **sycophancy·anchoring으로 인한 의도 이탈**을 **게이트 운영자**에게 막아줄 것이라 믿는다.
의도-충돌 finding이 무근거로 수용(silent-accept)되지 않고 모두 명시 판정을 받으며, 최종 plan이 사용자의 명시 의도를 보존하는 것으로 우리가 옳음을 안다.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 의도-충돌 finding의 silent-accept | **0건** | 모든 intent-conflict finding이 receipt에 `accepted` / `rejected-by-design` 판정 + 근거와 함께 기록. **달성 milestone은 M1.5** — M1의 커버리지 강제만으로는 이 지표가 동어반복이 된다(저자가 충돌을 `none`으로 표시하면 그 finding이 intent-conflict 모집단에서 빠져 분모가 줄 뿐이다). 리뷰어가 독립적으로 충돌을 주장하는 신호가 있어야 모집단이 저자 라벨과 무관해진다 |
| 의도 보존 | 최종 plan이 명시 의도를 보존 | 게이트 종료 시 intent-preservation 자기점검 플래그 |
| 측정 가능성 자체 | finding 판정 카운트가 존재 | `receipt.meta`에 판정 카운트 stamp (baseline: 현재 **측정값 0 — 아무것도 안 셈**) |

> 1차 성공기준은 **"의도-충돌 finding의 silent-accept 0건"** — sycophancy(무비판 수용)를 직접 겨냥하며 mechanical하게 측정 가능하다.

## Scope

**MVP** — 두 축을 최소 단위로 검증:
- **L1 (의도 표면화)**: plan 템플릿에 사용자의 명시 의도(제약·예외·의도적 배제)를 담는 필수 섹션을 추가하고, 그 섹션을 리뷰어 `--focus`에 **reference로 주입**한다. 주입하는 것은 "사용자가 무엇을 요구했나"뿐 — "저자가 왜 이렇게 했나"(저자 정당화)는 넣지 않는다(anchoring 회피).
- **L2 (arbiter intent-conflict gate)**: finding 수용 전 "명시 의도와 충돌하는가?"를 대조하는 구조적 단계. 판정을 **빠뜨릴 수 없게** mechanical하게 강제하되, 판정 내용은 LLM이 수행. 충돌 시 사용자 의도 우선 + 근거 기록.

**Out of scope**
- `/mccp:prp-implement`의 Implement-Codex — 코드 패턴 검토, 의도 의존 낮음.
- Codex 자체 교체.
- **"완벽한 리뷰어 독립성" 추구** — frontier 모델은 pretraining을 공유해 오류가 상관되므로 원리상 불가(문헌 근거). 완벽이 아니라 완화가 목표.
- 게이트 성능/비용 최적화.
- 독립 cross-vendor 2차 리뷰어 복원 — Milestone 2로 분리.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 의도 표면화 + 판정 커버리지 + 측정 인프라 | 대화 의도가 plan에 남고 리뷰어 focus에 reference로 전달됨; **모든 finding이 실제 리뷰 payload에 bind된 명시 판정을 받지 않으면 receipt가 써지지 않음**(누락·payload 불일치 차단 + 판정 카운트 측정 개시) | complete | `.claude/plans/codex-intent-context-m1.plan.md` |
| 1.5 | 오심(mislabelling) 탐지 — **UI10 달성 milestone** | 저자가 충돌을 `none`으로 잘못 표시한 것이 **탐지 가능**해짐(리뷰어 per-finding `INTENT:` 계약과 저자 판정의 비대칭 대조). 이때 비로소 "의도-충돌 finding의 silent-accept 0건"이 실질적으로 성립 | pending | — |
| 2 | arbiter 컨텍스트 분리 + cross-vendor 독립 2차 리뷰어(opt-in) | 심판이 저자 컨텍스트에서 완전 분리(fresh subagent); 중요 plan에 한해 이종 리뷰어 다양성 복원 | pending | — |

> **M1.5 분리 근거 (2026-07-31)**: M1 plan에 대한 santa-loop 3라운드(Opus + GPT-5.4)가 비수렴으로 종료했고, 미해소 지적의 무게중심이 **오심 탐지 축 하나**에 몰려 있었다. 그 축은 리뷰어가 preamble 지시를 자발적으로 따르는지에 의존해 계약(per-finding `INTENT:` 필수)·데이터 바인딩·불응 시 처리(all-absent → block)를 자체 설계 라운드로 다뤄야 한다. M1이 그것까지 안고 가면 **이미 검증된 나머지**(의도 표면화·판정 누락 불가·측정·단일 프로세스 runner)가 함께 묶여 못 나간다. M2(arbiter 분리 + cross-vendor)는 성격이 다른 축이므로 여기 합치지 않고 M1.5로 **별도 명명**한다.
>
> **M1이 닫지 않는 것(정직 표기)**: 저자가 모든 finding을 `intent_conflict: 'none'`으로 표시하면 M1의 완전성 검사는 전부 통과한다. 즉 M1은 **누락**을 막고 **오심**은 막지 못한다. 오심 탐지는 M1.5, 심판 분리는 M2가 소유한다.

## Open Questions

- [ ] **arbiter 분리 깊이** — M1은 "세션 내 역할 분리 + 구조적 gate"로 시작한다. Cross-Context 근거상 완전한 이득은 fresh subagent(M2)에서만 나오므로, M1의 부분 완화(의도 대조 gate)가 sycophancy의 가장 큰 구멍(무근거 수용)을 닫기에 충분한지 실측이 필요하다.
- [ ] **gate 강제 방식** — intent-conflict 판정을 mechanical하게 "빠뜨릴 수 없게" 강제하되 판정 내용은 LLM이 하는 hybrid가, anchoring 문헌이 경고한 "무시하라 프롬프트 무효" 저항에 충분한지.
- [ ] **독립 리뷰어 트리거** — M2의 cross-vendor 2차 리뷰어를 항상 돌릴지, 중요 plan만 opt-in할지(error correlation 한계 + 비용).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| frontier 모델 error correlation → dual-review도 완벽 독립이 아님 | 中 | 中 | dual-review를 1차 안전장치가 아닌 **보조**로 위치; 1차 방어는 의도 표면화 + arbiter gate |
| M1의 arbiter가 세션 내라 컨텍스트 분리 이득이 부분적 | 中 | 中 | M2에서 fresh subagent로 완전 분리; M1은 의도 대조 gate로 부분 완화 |
| 의도 섹션이 형식적으로만 채워져 실효 없음 | 中 | 中 | reference-only 주입 + gate가 실제 대조를 강제(형식적 섹션은 gate에서 걸림) |
| 리뷰어에게 저자 정당화까지 주면 오히려 anchoring 악화 | 低 | 中 | reference = 사용자 요구만, 저자 추론은 배제(Cross-Context 근거) |

## References

> 이 프로젝트의 self-host 조사(4-agent fan-out)로 수집하고, **각 인용을 arXiv에서 직접 검증**했다. 아래는 실존·주장 확인된 것만 남긴 것이며, subagent가 지어낸 수치(초록에 없던 값)는 제거했다.

**채택 — 실존 + 핵심 주장 검증됨:**
- **Cross-Context Review: Improving LLM Output Quality by Separating Production and Review Sessions** (Tae-Eun Song, 2026, [arXiv:2603.12123](https://arxiv.org/abs/2603.12123)) — 컨텍스트 분리 검토 F1 **28.6%** vs 자기검토 24.6%; 반복 검토(21.7%)·컨텍스트-보유 subagent(23.8%)는 이득 없음 → **분리 자체가 이득**. *한계: 단일 저자 preprint, n=30 소규모 — 강한 방향지지·약한 통계력.*
- **Self-Correction Bench** (Ken Tsui, 2025, [arXiv:2507.02778](https://arxiv.org/abs/2507.02778)) — **64.5% self-correction blind-spot**(14개 모델); "Wait" 프롬프트로 **89.3% 감소** → 자기심판은 구조적으로 신뢰 불가.
- **LLM Critics Help Catch LLM Bugs (CriticGPT)** (McAleese et al., OpenAI, 2024, [arXiv:2407.00215](https://arxiv.org/abs/2407.00215)) — 별도 critic 비평이 인간 비평보다 **63% 선호**, 더 많은 버그 적발 → 별도 critic > 자기검토.
- **Heterogeneous LLM Debate Under Adversarial Peers** (Nilayam et al., 2026, [arXiv:2606.19826](https://arxiv.org/abs/2606.19826)) — 동종 패널 harmful-revision **89%** → 이종(honest) peer **35%**; adversarial/동종 peer는 **90%로 방어 실패** → 독립 리뷰어는 **cross-vendor 이종성**이어야 의미.

**보조 — 실존·유명, 현상은 확실(개별 수치는 정성적으로만 사용):**
- **Large Language Models Cannot Self-Correct Reasoning Yet** (Huang et al., ICLR 2024, [arXiv:2310.01798](https://arxiv.org/abs/2310.01798)) — 외부 피드백 없는 내재적 자기수정은 실패.
- **Towards Understanding Sycophancy in Language Models** (Sharma et al., Anthropic, 2023, [arXiv:2310.13548](https://arxiv.org/abs/2310.13548)) — 모델이 설득력 있게 서술된 아첨 응답을 정답보다 선호하는 현상 실증. *(subagent가 인용한 "63.7% flip rate"는 초록에 없어 제외.)*
- **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena** (Zheng et al., NeurIPS 2023, [arXiv:2306.05685](https://arxiv.org/abs/2306.05685)) — position/verbosity/self-enhancement bias.
- **Improving Factuality and Reasoning through Multiagent Debate** (Du et al., 2023, [arXiv:2305.14325](https://arxiv.org/abs/2305.14325)) — multi-agent debate가 추론·factuality 개선. *(GSM8K "81→89" 구체 수치는 초록 미확인.)*
- **Reference-Guided Verdict: LLMs-as-Judges** (Badshah & Sajjad, 2024, [arXiv:2408.09235](https://arxiv.org/abs/2408.09235)) — judge에 reference를 주는 것이 평가를 개선 → 리뷰어에게 사용자 의도(reference)를 주는 MVP 방향 지지. *("3~6%" 수치는 초록 미확인.)*
- **Constitutional AI: Harmlessness from AI Feedback** (Bai et al., Anthropic, 2022, [arXiv:2212.08073](https://arxiv.org/abs/2212.08073)) — 명시 원칙 기반 critique-revision 루프.

**한계(반증) — 정성적으로만, 블로그·미검증 수치 배제:**
- frontier 모델은 pretraining을 공유해 오류가 상관됨(Condorcet Jury Theorem 전제 위배) → dual-review의 유효 독립성에 상한이 있고 wrong-consensus로 함께 틀릴 수 있음. 따라서 독립 리뷰어는 완벽한 안전장치가 아니라 보조. *(구체 "r=0.77", "8배 효율", "23.9% 수렴" 등은 출처가 블로그이거나 검증 불가라 본문 근거에서 제외.)*

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-30. 방향의 기술적 세부는 사용자 위임으로 검증된 문헌 근거에 기반해 확정.*
