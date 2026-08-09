# Verification 단계 설계 — `review_proof.verification_verdict`를 무엇으로 채우나

> 작성일: 2026-08-06
> 상태: **설계 제안 (미구현·미결정)**. [converged-redefinition-design.md](converged-redefinition-design.md) §8 열린질문 (2)에 대한 심화.
> 목표: diverse-agent 다관점 리뷰가 발급하는 `review_verdict='converged'`가 신뢰를 얻는 근거 = `verification_verdict`. 논문이 공통으로 지목한 "진짜 레버"를 mccp 자산 위에 구체화한다.

---

## 1. 문제 — verification마저 same-model이면 correlated

현행 verification 층 [verify.js](../../plugins/mccp/scripts/lib/implement-dispatch/verify.js)(`mccp-implement-verify` gate)의 **DD2**가 정면 경고한다(L18-21):

> *"invoker는 Codex 유지. adversarial-verify 패턴은 worker-external 구조만 차용, **same-model Claude skeptic 치환 아님** — 그건 mccp의 Claude↔Codex dual-review가 막으려는 blind spot을 재도입한다."*

이건 [analysis §2.2](diverse-agent-review-analysis.md)의 correlated-errors(same-model ≈ 0.4)와 정확히 같은 우려다. **verification을 그냥 "또 다른 Claude critic"으로 바꾸면 R2의 핵심 목적(blind-spot 회피)을 스스로 무너뜨린다.**

**해소 열쇠 — verification은 단일 LLM 판정이 아니라 "correlated-error 면역도"로 계층화한다.** `verify.js`의 `buildVerifyFocus`가 Codex에게 시키는 challenge 5종을 뜯어보면(L84-88):

| challenge 항목 | 무엇이 가장 확실히 잡나 | correlated-error 면역? |
|---|---|---|
| public API / exported-symbol drift | **typecheck / build / export diff** | ✅ 면역 (mechanical) |
| import-graph breakage | **build / typecheck / test** | ✅ 면역 |
| shared config / manifest / schema divergence | **schema validate / version lint** | ✅ 면역 |
| test-impact (한 변경이 다른 동작 파괴) | **test 실행** | ✅ 면역 |
| invariant erosion (fail-closed gate, receipt anchoring, rollback safety) | **의미적 판단** (LLM/사람) | ❌ correlated |

**결정적 관찰: 5개 중 4개는 deterministic tool이 LLM보다 확실하고, correlated-error에 완전 면역이며, 빠르다.** 현재 mccp는 이 모두를 Codex 한 번의 LLM 판정(10-15분)으로 하는데, 무게중심이 잘못 놓여 있다.

---

## 2. 3층 verification 모델

`verification_verdict`를 **면역도 순서로 계층화**한다. 신뢰의 backbone은 LLM이 아니라 deterministic 층이다.

| 층 | 정체 | correlated-error | 속도 | mccp 자산 |
|---|---|---|---|---|
| **L1 Deterministic (필수·backbone)** | test·typecheck·lint·build·schema validate·mechanical anchor | **면역 (0)** | 빠름 | Stop-loop(lint→typecheck→test→e2e), design-grounding H15 lint, plan-conflict-detector, receipt schema validate |
| **L2 Adversarial semantic (same-model)** | diverse-agent critic + self-consistency voting. L1이 못 잡는 invariant/의미 회귀 | 완화 (0.4→↓, voting) | 중간 | plan-fanout 4관점, santa-method context isolation |
| **L3 Cross-model (hybrid·opt-in)** | Codex 한 겹. high-stakes에만 | 최저 (0.08) | 느림 (10-15분) | 현행 codex-invoke / verify.js |

**핵심 재배치**: 현재 "verification = L3(Codex) 단독"을 → **"verification = L1(backbone) + L2(의미) + L3(opt-in)"**. 무게중심을 mechanical로 옮겨 속도·면역을 얻고, cross-model을 high-stakes에만 남겨 blind-spot 안전판을 유지한다.

---

## 3. 각 층 상세

### L1 — Deterministic (backbone, 필수)

- **무엇**: `buildVerifyFocus` challenge 중 mechanical 가능한 4종을 실제 tool로 검증.
  - API drift / import-graph → `build` + `typecheck` (tsc / node --check) + 전체 `test`
  - config/schema divergence → receipt `schema.validate` + plugin.json version lint + manifest 일관성
  - test-impact → 통합 diff에 대한 `node --test` (verify.js DD 언급된 "integrated node --test"가 이미 이 방향)
  - mechanical anchor → design-grounding H15 lint(이미 LLM-free)
- **판정**: 하나라도 실패 → `verification_verdict = divergent` 즉시(fail-closed). LLM 판정 도달 전 short-circuit.
- **왜 backbone**: model에 무관하게 결정적 → correlated-error에 **완전 면역**. 논문 "verification quality에 투자하라"의 구체적 답. Kiro의 formal-verification(SMT)이 같은 계열의 극단.
- **mccp 자산**: Stop-loop(`stop-review-loop.js`)가 이미 lint→typecheck→test→e2e를 돈다. 이걸 verification_verdict의 L1로 승격/재사용.

### L2 — Adversarial semantic (same-model, self-consistency로 보강)

- **무엇**: L1이 구조적으로 못 보는 "invariant erosion"(fail-closed gate 약화, receipt anchoring 파손, rollback safety)을 diverse-agent가 판정.
- **correlated 완화 장치 (필수 — 안 하면 self-approval)**:
  1. **역할 다양성** — critic들이 서로 다른 관점(architect/security/test/invariant). 같은 role N개 금지([converged §7](converged-redefinition-design.md#L)의 review_proof 강제).
  2. **self-consistency voting** — 같은 verification 질문을 N회 독립 샘플 → majority. [More Agents / CoT-SC](diverse-agent-review-analysis.md) (GSM8K +17.9% 근거). single critic의 idiosyncratic 오류 희석.
  3. **refute-oriented framing** — Reflexion/N-Critics처럼 "승인"이 아니라 "이 통합 diff가 invariant를 깬 증거를 찾아라". 승인은 증거 부재로만 도출(v1.22.3 F3: "스캔은 승인을 증명 못 함" → **L2 단독으로는 converged 발급 금지**, L1 통과가 전제).
- **판정**: L1 통과 전제 하에, quorum(M-of-N) 미달 → `divergent`; 위조/누락 → `unavailable`.
- **mccp 자산**: plan-fanout이 이미 read-only 4관점 병렬. verification용으로는 "diff를 refute하라"로 framing 변경.

### L3 — Cross-model (hybrid, opt-in high-stakes)

- **무엇**: Codex 한 겹. **버리지 않고 opt-in**(R2, R3 기각의 이유).
- **언제**: terminal `/mccp:pr` 같은 high-stakes, 또는 L2가 경계적(quorum 아슬)일 때. plan 반복 작성 같은 저위험엔 미발동 → 10-15분 지연 제거.
- **판정**: 현행 `decideMergedVerify` 그대로 재사용. `review_source='hybrid'`로 기록.

---

## 4. `verification_verdict` 합성 규칙 (fail-closed)

```
verification_verdict =
  L1 실패                         → divergent   (mechanical, 즉시 short-circuit)
  L1 통과 ∧ L2 quorum 미달        → divergent
  L1 통과 ∧ L2 위조/누락          → unavailable (fail-closed)
  L1 통과 ∧ L2 통과 ∧ ¬hybrid     → converged   (multi-agent)
  L1 통과 ∧ L2 통과 ∧ hybrid:
      L3 converged                → converged   (hybrid — 최고 신뢰)
      L3 divergent/critical       → divergent
      L3 unavailable ∧ enforce    → unavailable
```

- **L1이 gatekeeper**: L2/L3는 L1 통과 후에만 의미. mechanical 실패를 LLM "괜찮아 보임"이 덮을 수 없음.
- **converged는 L1∧L2 최소** — deterministic backbone + 다관점 의미 검증 둘 다. 이게 [converged §7](converged-redefinition-design.md)의 `review_proof.verification_verdict`를 채운다.
- **DD2 정신 보존**: same-model으로 *치환*이 아니라 *계층화*. Codex는 L3 opt-in으로 존속. mechanical L1이 앞서므로 same-model L2의 correlated 위험이 backbone에 노출되지 않음.

---

## 5. `mccp-implement-verify`와의 관계 — 확장, 병행 아님

현행 gate를 버리지 않고 **generalize**한다:

- 현행: `decideMergedVerify`가 `codexJson`(L3)만 소비.
- 확장: `decideVerification({ l1Result, l2Result, l3Result?, mode })` — L1/L2를 앞단에 추가, L3는 옵션. 반환은 동일 enum + block matrix(§4). `verify.js`의 pure-oracle 구조·`VERDICTS` vocabulary·`parseMergedVerifyMode` 그대로 재사용.
- 기존 `MCCP_WORK_MERGED_VERIFY=off|warn|enforce` 토글 계승. `off`면 L1까지 skip? → **아니오**: L1(test/typecheck)은 Stop-loop가 이미 독립적으로 돌므로 verify가 off여도 backbone은 살아있음. `off`는 L2/L3 advisory disable로 한정.
- `review_source` 매핑: L1+L2만 → `multi-agent`; L1+L2+L3 → `hybrid`.

---

## 6. 논문 정합 요약

| 층 | 근거 논문 |
|---|---|
| L1 deterministic backbone | Verification-Aware Planning(arXiv:2510.17109) "verification을 planning에 통합" · Kiro formal SMT · Correlated Errors(면역 축이 유일하게 상관 0) |
| L2 self-consistency voting | More Agents(arXiv:2402.05120) · CoT-SC(GSM8K +17.9%) · N-Critics/Reflexion |
| L2 refute-only, 승인은 증거부재 | mccp v1.22.3 Implement-Codex R1 F3 "스캔은 승인을 증명 못 함" |
| L3 hybrid opt-in | Correlated Errors(cross-model 0.08) · Devin Fusion 선례 · LLM-as-judge vendor-diverse panel |

---

## 7. 열린 질문 / 다음 단계

**설계 미결:**
1. **L1 스텝 확정** — test/typecheck/build/schema 중 어디까지 필수, 어디까지 프로젝트별 opt-in. 통합 diff scope 한정 방법(전체 test vs 변경 영향 test).
2. **L2 quorum 파라미터** — N(critic 수), M(통과), self-consistency 샘플 수 K. plan-fanout 4관점 재사용 여부.
3. **L2 refute framing 프롬프트** — "invariant erosion 증거를 찾아라"의 구체 rubric(fail-closed gate / receipt anchoring / rollback safety 체크리스트).
4. **L3 발동 조건** — high-stakes 판정 기준(terminal PR only? severity? L2 경계값?).
5. **speed 실측** — L1(수십초~수분) + L2(병렬 수분) vs 현행 L3(10-15분) wall-clock 비교 목표.
6. **어느 gate부터** — plan-codex(저위험, L1 약함=plan엔 test 없음 → L2 중심) vs implement-verify(L1 강함=코드 diff).

**주의 — plan gate의 L1 공백**: plan 단계는 코드 diff가 없어 L1(test/typecheck)이 약하다. plan verification은 L2(다관점) 중심 + L1은 "plan 내부 일관성 mechanical check"(Files to Change 경로 존재성, 참조 정합 — plan-conflict-detector 계열)로 대체. 이게 [converged §5](converged-redefinition-design.md)의 "plan/implement는 multi-agent, PR은 hybrid" 정책과 맞물린다.

**다음 액션 후보:**
- 이 3층 모델을 [converged 설계](converged-redefinition-design.md)의 `review_proof` 스키마에 반영(perspectives + quorum + **l1/l2/l3 sub-verdict**로 확장).
- 또는 `/mccp:plan-prd`로 전체(converged 재정의 + verification 3층)를 PRD화.
- 또는 L1 스텝 확정부터 (가장 저위험·즉효 — Stop-loop 재사용).
