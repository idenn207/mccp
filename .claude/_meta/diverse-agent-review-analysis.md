# Cross-Model → Diverse-Agent Review 전환 분석

> 작성일: 2026-08-06
> 목적: mccp의 dual-review 게이트가 의존하는 Codex(외부 cross-model reviewer)를, 다양한 관점을 가진 다수 agent 리뷰로 대체(또는 병행)할 수 있는지에 대한 근거 수집 + 타사 사례 분석.
> 상태: **분석 단계 (미결정)**. 결정 시 CLAUDE.md 반영 검토 필요.
> 범위: (1) 현행 mccp 동작 코드 경로, (2) 학술 근거 6+편, (3) diverse-perspective 기법 카탈로그, (4) 타사 11개 사례 + maturity, (5) 종합 결론.

---

## 0. 배경 — 왜 이 분석을 하나

**원 동기 (운영자 진술):**
1. Codex(멀티모델) 리뷰를 도입한 이유는 plan을 다양한 관점으로 재검토해 오류를 줄이고 신뢰를 높이기 위함이었다.
2. 최근 연구상 "다양한 관점/시점을 가진 여러 agent로 plan을 검토하면 멀티모델 방식과 차이 없거나 오히려 더 나은 결과"라는 근거를 확인했다 → 굳이 멀티모델 의존 구조를 유지하지 않으려 한다.
3. Codex 리뷰가 평균 **10~15분** 걸려, 전체/반복 plan 작성 시 시간 비용이 과다하다.
4. 부차적으로 Codex가 미인증/미가용일 때 receipt가 skip되는 상황도 있어, 그 공백을 무언가로 메우고 싶다.

**용어 교정:** "claude 인증 불가"는 receipt와 무관하다. 세션의 `claude --version probe failed (ENOENT)`는 [session-spawner.js](../../plugins/mccp/scripts/state/session-spawner.js)(auto-handoff)와 [hook-caps.js](../../plugins/mccp/scripts/lib/hook-caps.js)(L2c minimum-spec)만 트리거한다. receipt를 skip/미작성으로 만드는 축은 **Codex(외부 cross-model reviewer)**이다.

**이 머신 환경 실측(2026-08-06):** `codex` 설치됨(느림), `gemini` PATH 부재, `claude`/`node` 설치됨. → "다른 외부 모델로 갈아타기"는 비현실적이고, 실효 대안은 **이미 있는 Claude 기반 다관점 agent 인프라**뿐.

---

## 1. 현행 mccp 동작 — Codex 미가용 시 receipt 경로

### 1.1 Codex 미가용 → receipt 매트릭스

근거: [codex-invoke.js](../../plugins/mccp/scripts/lib/codex-invoke.js) (14종 classification), [codex-runner.js](../../plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js), [pr-ship-gate.js](../../plugins/mccp/scripts/lib/pr-ship-gate.js)

| 상황 | classification | receipt | codex_verdict | dedupe skip | ship |
|---|---|---|---|---|---|
| 인증 실패 (기본 fail-closed) | `not-authenticated`, blocking=true | **미작성** (runner exit 12) | — | ❌ | ❌ |
| 인증 실패 + `MCCP_ALLOW_CODEX_UNAVAILABLE=1` | `not-authenticated`, blocking=false | 미작성(PR) / plan·impl은 `unavailable` 가능 | `unavailable` | ❌ | ❌ |
| `MCCP_CODEX_DISABLED=1` | `disabled`, blocking=false | ✅ 작성 | `skipped` + `meta.codex_disabled=true` | ✅ | ✅ (skip proof 有) |
| `MCCP_PR_SKIP_CODEX_REVIEW="reason"` | 호출 안 함 | ✅ 작성 | `skipped` + reason | ✅ | ✅ (skip proof 有) |

**핵심 함정 2가지:**
- **advisory mode의 무력함**: `MCCP_ALLOW_CODEX_UNAVAILABLE=1`은 `blocking`만 false로 바꾸고 `classification`은 그대로다. codex-runner는 `classification !== 'ok'`면 여전히 exit 12로 죽어, **인증 실패에선 advisory가 receipt를 살리지 못한다.**
- **`skipped` vs `unavailable`은 하늘과 땅**: [pr-ship-gate.js](../../plugins/mccp/scripts/lib/pr-ship-gate.js) `SHIP_VERDICTS = ['converged','skipped']`. 단 `skipped`는 반드시 `meta`의 skip-proof(`codex_disabled`/`codex_dedupe_at_pr`/`codex_skipped_at_pr`)가 있어야 ship. `unavailable`은 무조건 no-ship. **"미가용"은 절대 자동 통과하지 않고, "의도적 비활성"만 통과.**

### 1.2 santa-loop의 실체 (3가지 반전)

근거: [santa-loop.md](../../plugins/mccp/commands/santa-loop.md), santa-method SKILL, [schema.js](../../plugins/mccp/scripts/receipt/schema.js), [write.js](../../plugins/mccp/scripts/receipt/write.js)

- **반전 ① santa-loop도 Codex를 1순위로 쓴다** — Reviewer A = Claude Opus(내부 code-reviewer, 항상), Reviewer B = **Codex(GPT-5.4) → Gemini(2.5 Pro) → Claude Opus fallback** 우선순위 사슬. Codex 미가용 시 Gemini가 있으면 여전히 cross-model, 없으면 Claude 두 개(same-model, context isolation만).
- **반전 ② santa-loop는 receipt를 발행하지 않는다** — [schema.js](../../plugins/mccp/scripts/receipt/schema.js) `GATE_IDS`에 santa-loop 없음. review-only 유틸리티. escalate_pending 소비 + fix-task 안내만. "receipt skip을 santa-loop로 메운다"는 별도 브릿지가 필요.
- **반전 ③ 자동 호출은 정책상 out-of-scope** — v0.3.2 escalate 정책이 "자동 invoke 안 함(false-positive quota 낭비 회피)"으로 명시. 자동화하려면 이 결정을 뒤집어야 함.

### 1.3 santa-loop 결과를 gate로 봉인하면 깨지는 4축

`codex_verdict='converged'`로 봉인 시: (1) **dedupe 무력화**([dedupe.js](../../plugins/mccp/scripts/receipt/dedupe.js) `codexConverged`), (2) **ship gate 거짓 증명**, (3) **completion ledger provenance 오염**([completion-ledger/index.js](../../plugins/mccp/scripts/lib/completion-ledger/index.js)), (4) **DD2 / ai-regression-testing 철학 위반**. verdict enum 중 `converged` 불가·`skipped` 부적절(미호출 의미)·`unavailable`이 그나마 정직하나 곧 no-ship. → santa-loop를 "gate 통과용 대체 승인"으로 쓰는 길은 사실상 막혀 있음.

---

## 2. 학술 근거 — 정직한 양면

### 2.1 사용자 논지를 **지지**하는 축

| 논문 | 출처 | 핵심 |
|---|---|---|
| **Correlated Errors in LLMs** (Kim, Garg, Peng, Garg) | ICML 2025, PMLR 267 · [arXiv:2506.07962](https://arxiv.org/abs/2506.07962) | 350+ LLM. 두 모델이 둘 다 틀리면 **60%가 같은 틀린 답**. 더 크고 정확한 모델일수록(다른 벤더여도) 오류 상관 ↑. **모델 합의 = 검증이 아니라 공유 맹점.** cross-model 프리미엄이 과대평가돼 있음을 실증. |
| **More Agents Is All You Need** (Li et al., Tencent) | [arXiv:2402.05120](https://arxiv.org/abs/2402.05120) | 같은 LLM agent 수 ↑ + sampling-and-voting → 성능 scale. multi-step 작업에서 누적 오류 보상. **멀티모델 없이 same-model 다중으로 향상.** |
| **Self-consistency (CoT-SC)** | [learnprompting](https://learnprompting.org/docs/intermediate/self_consistency), [Confidence Improves Self-Consistency (arXiv:2502.06233)](https://arxiv.org/pdf/2502.06233) | sampling + majority vote로 GSM8K **+17.9%**, SVAMP +11.0%, AQuA +12.2%. confidence variant는 46% 비용 절감. |
| **Mixture-of-Agents (MoA)** | ICLR 2025 · [arXiv:2406.04692](https://arxiv.org/html/2406.04692v1) | multi-agent 협업으로 AlpacaEval/MT-Bench/FLASK 큰 향상(win rate ~65%). |
| **Verification-Aware Planning** | [arXiv:2510.17109](https://arxiv.org/html/2510.17109) | 검증을 planning에 통합하면 single/multi-agent baseline **모두** 능가. "reward complexity가 아니라 verification quality에 투자하라." |
| **Estornell & Liu** | NeurIPS 2024 | 오류 상관 하에서 voting/consensus 보장이 수학적으로 붕괴함을 형식 증명. |

### 2.2 사용자 논지에 **주의/반대**하는 축 (숨기면 설계가 무너짐)

| 논문 | 출처 | 핵심 |
|---|---|---|
| **Temperature and Persona Shape LLM Agent Consensus** | [arXiv:2507.11198](https://arxiv.org/abs/2507.11198) | **same-model persona/temperature 다양성은 정확도 향상 미미.** 오류 상관 **same-model ≈ 0.4 vs different model families ≈ 0.08.** → model diversity가 오류 상관 축소엔 여전히 압도적. |
| **LLM-as-judge panel 신뢰도 표준** | [galileo](https://galileo.ai/blog/llm-as-a-judge-vs-human-evaluation) 외 | 신뢰도 표준 = **vendor-diverse panel** + 3-of-5 consensus + Fleiss' κ. 단일 judge는 불안정. 3-judge macro F1 97-98%, κ≈0.95. |
| **ICLR 2025 Blogposts Track** | (multi-agent debate 평가) | multi-agent debate 5종이 **단순 single-agent test-time compute를 일관되게 이기지 못함.** "multi-agent면 낫다"는 거짓 — 핵심은 verification. |

### 2.3 두 축의 화해 (핵심 결론)

- **정확도(accuracy)** 관점: same-model 다관점(self-consistency/More Agents)이 실증적으로 향상 → **사용자 논지 지지**.
- **오류 상관(blind-spot 회피)** 관점: model diversity가 same-model persona diversity보다 상관을 훨씬 더 낮춤(0.4→0.08) → **Codex 도입의 원 목적(blind-spot 회피)에는 model diversity의 고유 가치가 남음**.
- ICML Correlated Errors는 "cross-model조차 완벽히 독립은 아니다(60%)"를 경고하지만, 2507.11198은 "그래도 cross-model이 same-model보다 압도적으로 덜 상관(0.08 vs 0.4)"을 정량화 — **두 논문 방향 일치**: model diversity > same-model persona diversity (blind-spot 축).

> **정밀 결론**: "cross-model → same-model 다관점 완전 대체"는 정확도로는 정당하나 blind-spot 회피로는 위험. 근거에 맞는 착지는 **하이브리드** — 빠른 same-model 다관점(role diversity + self-consistency + verification)을 주력 critical path로, model diversity(Codex 등)를 critical path에서 뺀 **opt-in 다양성 소스**로. Codex 10-15분 지연 제거라는 실익은 이 하이브리드로 온전히 획득.

---

## 3. Diverse-Perspective 기법 카탈로그 (mccp 적용 관점)

| 기법 | 요지 | mccp 적용처 | 비용/속도 |
|---|---|---|---|
| **Self-consistency (sampling+vote)** | 같은 질문 N회 샘플 → majority vote. GSM8K +17.9% | plan의 핵심 판단(위험/설계 선택)에 N-way 투표 | 중 (N배 호출, 병렬 가능) |
| **Role/Persona diversity** | architect/security/test/explorer 등 상이 역할로 상관↓ | **이미 존재**: [plan-fanout.js](../../plugins/mccp/scripts/workflows/plan-fanout.js) 4관점 | 저 (병렬, effort:low) |
| **Generate-then-verify (critic/verifier)** | 생성 후 독립 critic이 검증. Self-Refine/Reflexion/N-Critics | review 위에 얹는 verification 단계 | 저~중 |
| **LLM-as-judge panel + consensus rule** | 다수 judge, 3-of-N + κ 신뢰도 | verdict 판정을 panel consensus로 | 중 |
| **Reflexion/Self-Refine loop** | verbal feedback으로 반복 개선 | bounded retry(이미 design-critique loop 존재) | 저 |

**주의(2507.11198):** persona diversity만으로는 정확도 향상이 미미하고 상관 축소도 제한적. 따라서 role diversity는 **verification + sampling과 결합**해야 효과. persona만 갈아끼우는 것은 함정.

**핵심 인프라 자산:** mccp에는 이미 `plan-fanout`(4 read-only 관점), santa-method(context isolation), code-reviewer(다관점 rubric), design-critique bounded retry loop이 있다 — white space가 아니라 **재조합** 문제.

---

## 4. 타사 사례 분석 (maturity)

### 4.1 대상별 요약

| 대상 | 역할 분할 | 모델 조합 | 검증 패턴 | 성숙도 |
|---|---|---|---|---|
| **MetaGPT** | SOP: PM/Architect/Engineer/QA | Same-model | QA agent | 중~상 |
| **ChatDev** | Dual-role phases (ChatChain) | Same-model | 테스터 mutual review | 상 |
| **MS AutoGen** | Agent+Reviewer+Critic nested | Multi-model 지원 | Reflection | 중 (유지보수 모드) |
| **CrewAI** | Role-Goal-Backstory | Multi-model | Hierarchical manager | 상 (Fortune 500 60%) |
| **LangGraph** | Supervisor-Worker + Critic | Multi-model | Critic node + gate | 중~상 |
| **Claude Code** | 격리 subagents, **PR review 5 병렬**(bug/security/compliance/git/comment) | Multi-model(Opus↔Codex) + same-model 병렬 | 병렬 consensus, **<1% FP** | 상 |
| **Devin (Cognition)** | **Fusion: Lead(frontier)+Sidekick(cheap)** | Multi-model 분리 | Lead-owned review | 상 |
| **Cursor / Windsurf** | Composer / Cascade(투명 계획) | Same-model | diff approval | 중 |
| **GitHub Copilot** | task-scoped, Spec→Plan→Impl | Same-model(GPT-4o) | agentic review(60M reviews, 71% actionable) | 상 |
| **Amazon Kiro** | SDD IDE, EARS notation | Bedrock | **formal SMT 모순검출** | 상 |
| **GitHub Spec Kit** | SDD CLI, agent-agnostic | Multi-model(선택) | spec consistency | 중~상 |
| **OpenAI Agents SDK** | hierarchical routing | Multi-model | approval gate + allowlist | 중 |

### 4.2 횡단 트렌드

- **Role-based multi-agent = 완성된 업계 표준.** Role-Goal-Backstory(CrewAI) / SOP(MetaGPT) / Supervisor-Worker(LangGraph) 수렴.
- **Spec-Driven Development(SDD) 급부상** — "vibe coding" 실패 회피 동기. 2025 emergent → 2026 mainstream. Kiro/Spec Kit/Copilot/Cursor/Claude Code 전부 지원. **mccp의 PRD→plan→implement→PR가 정확히 이 축의 성숙한 구현.** (운영자가 말한 "PDD"를 SDD/Plan-driven로 해석 시, mccp는 이미 이 축에서 앞서 있음.)
- **모델 조합**: 프로덕션은 **multi-model + 명확한 역할분업**으로 수렴. 비용-품질은 **Devin Fusion(frontier lead + cheap sidekick)**이 최적해로 평가. 단, **same-model 다관점도 강력**: Claude Code PR review는 same-base-model 5 병렬로 <1% FP.
- **Cross-model adversarial review는 아직 초기 단계** — **mccp의 Opus↔Codex 방식이 업계에서 가장 진전된 사례로 평가됨.** 대부분 same-model 다관점에 머묾.
- **Verification 자동화는 더 이상 선택 아님** — critic node, approval gate, parallel consensus, formal verification(Kiro SMT)이 표준화.

### 4.3 mccp에 주는 직접 함의

1. **Claude Code PR review(5 병렬 same-model, <1% FP)** = 사용자님 논지의 실제 프로덕션 증거. "다관점 Claude 리뷰로 충분한 품질"이 이미 입증됨.
2. **그러나 그 Claude Code조차 cross-model(Opus↔Codex)을 별도로 병행** — 즉 업계 최전선의 선택은 "same-model 다관점을 기본, cross-model을 얹기". → **하이브리드(R2)와 정확히 일치.**
3. **Devin Fusion**의 "frontier lead가 소유, cheap sidekick에 위임" = mccp가 "Claude 주력 + Codex를 opt-in 다양성 소스"로 두는 구조의 검증된 선례.
4. mccp는 이미 SDD 축에서 성숙 → 남은 개선은 **review 계층의 다관점화 + verification 강화 + cross-model의 critical-path 제거**.

---

## 5. 종합 결론 — mccp 방향 옵션

| | R1 — Codex 유지 + fanout 병행 | **R2 — diverse-agent 주력 + Codex opt-in (권장)** | R3 — Codex 완전 대체 |
|---|---|---|---|
| 구조 | 현행 유지 + plan-fanout advisory | plan/impl 리뷰를 다관점 Claude + self-consistency + verification. Codex는 지연 뺀 opt-in | receipt chain의 cross-model 전제를 재작성 |
| 근거 정합 | correlated-errors 무시 | **정확도(More Agents)+blind-spot(model diversity 보존)+속도 균형** | More Agents엔 정합, blind-spot 축은 위험 |
| 속도 이득 | 없음 | **큼** (Codex를 critical path에서 제거) | 최대 |
| 불변식 재설계 | 없음 | 중 (`converged` 정의 재검토) | 큼 (전면) |
| 위험 | 낮음 | 중 (관리 가능) | 높음 |
| 업계 정합 | — | **Claude Code / Devin Fusion과 일치** | — |

**권장: R2.** 근거·속도·위험·업계 정합 모두에서 균형점. cross-model을 "느리고 과대평가된 유일 gate"에서 "약한 상관을 더 낮추는 opt-in 다양성 소스"로 강등하고, 주력을 빠른 다관점 Claude 리뷰 + 명시적 verification 단계로 둔다.

---

## 6. 결정에 남은 변수 + 다음 단계

**미결정 변수:**
1. **"converged(승인)"의 새 정의** — cross-model 합의 대신 "N관점 중 M 통과 + verification clean"을 어떻게 mechanical하게 봉인할지. dedupe/ship-gate의 `codex_verdict==='converged'` 술어를 어떻게 계승할지.
2. **다양성 소스 조합** — 역할(architect/security/test/…) × rubric/시점 × sampling(vote) 중 무엇을.
3. **Codex 잔여 역할** — 완전 제거 vs opt-in vs high-stakes PR 한정.
4. **verification 단계** — 다관점 리뷰 위에 얹을 독립 검증을 무엇으로(논문 공통 강조 = 진짜 레버).
5. **속도 목표** — plan 반복 시 목표 wall-clock(현 Codex 10-15분 → ?).

**다음 단계 후보:**
- `/mccp:plan-prd`로 "cross-model 의존 → diverse-agent review 전환" PRD 착수 (본 문서를 근거 자료로).
- 또는 위 변수 중 (1) `converged` 재정의를 먼저 설계 심화.

---

## Sources

**학술:**
- [Correlated Errors in LLMs (ICML 2025, arXiv:2506.07962)](https://arxiv.org/abs/2506.07962)
- [More Agents Is All You Need (arXiv:2402.05120)](https://arxiv.org/abs/2402.05120)
- [Mixture-of-Agents (arXiv:2406.04692)](https://arxiv.org/html/2406.04692v1)
- [Verification-Aware Planning (arXiv:2510.17109)](https://arxiv.org/html/2510.17109)
- [Temperature and Persona Shape LLM Agent Consensus (arXiv:2507.11198)](https://arxiv.org/abs/2507.11198)
- [Confidence Improves Self-Consistency (arXiv:2502.06233)](https://arxiv.org/pdf/2502.06233)
- [Demystifying Multi-Agent Debate (arXiv:2601.19921)](https://arxiv.org/html/2601.19921v3)
- [Cross-model review consensus 한계 해설 (digitalapplied)](https://www.digitalapplied.com/blog/cross-model-review-consensus-verification-2026)

**타사 사례:**
- [MetaGPT (GitHub)](https://github.com/FoundationAgents/MetaGPT) · [ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/file/6507b115562bb0a305f1958ccc87355a-Paper-Conference.pdf)
- [ChatDev (ACL 2024)](https://aclanthology.org/2024.acl-long.810/)
- [Microsoft AutoGen](https://github.com/microsoft/autogen)
- [CrewAI 2026](https://cybernews.com/ai-tools/crewai-review/)
- [LangGraph Supervisor](https://reference.langchain.com/python/langgraph-supervisor)
- [Claude Code Subagents (Tembo)](https://www.tembo.io/blog/claude-code-subagents) · [Claude Code PR Review (Pravin)](https://www.pravin.solutions/posts/claude-code-pr-review-agents-agentic-ai-developer-tools-2026)
- [Devin (BuildFastWithAI)](https://www.buildfastwithai.com/ai-tools/devin)
- [Cursor vs Windsurf (Descope)](https://www.descope.com/blog/post/cursor-vs-windsurf)
- [GitHub Copilot Workspace (Synthedia)](https://synthedia.substack.com/p/github-copilot-workspace-moves-beyond)
- [SDD Comprehensive Guide (Medium)](https://medium.com/@visrow/comprehensive-guide-to-spec-driven-development-kiro-github-spec-kit-and-bmad-method-5d28ff61b9b1)
- [Thoughtworks Radar: SDD](https://www.thoughtworks.com/en-us/radar/techniques/spec-driven-development)
