# `converged`(승인) 재정의 설계 — cross-model → diverse-agent

> 작성일: 2026-08-06
> 상태: **설계 제안 (미구현·미결정)**. PRD/plan 착수 전 설계 심화 문서.
> 전제: [diverse-agent-review-analysis.md](diverse-agent-review-analysis.md)의 **R2 방향**(다관점 Claude를 주력 critical path로, cross-model은 opt-in 다양성 소스로).
> 목표: "N관점 중 M 통과 + verification clean"을 dedupe/ship-gate/ledger 술어로 **mechanical하게 봉인**하되, 기존 `codex_verdict` 소비처를 무손상 계승하고 fail-closed·tamper-protect·provenance 불변식을 지킨다.

---

## 1. 현행 verdict 아키텍처 지도 (재정의 대상)

**핵심 발견: "승인"은 이미 단일 필드 `resolution.codex_verdict`에 응축돼 있다.** enum `converged|divergent|critical|unavailable|skipped`, present-only, absent=fail-closed. 7개 소비처가 이 한 필드를 읽는다 — 재정의 표면이 좁다.

| # | 소비처 | 파일 | `codex_verdict` 사용 방식 |
|---|---|---|---|
| SSoT | verdict 생산 | [finalize-receipt.js](../../plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js) `deriveCodexFlags` | `codex_outcome`→verdict 매핑. invoked+approve→`converged`, disabled/skipped/deduped→`skipped`, invoked+null→`unavailable` |
| 1 | schema 검증 | [schema.js](../../plugins/mccp/scripts/receipt/schema.js#L33) `CODEX_VERDICT_VALUES` | present-only enum. 부재 시 legacy 통과 |
| 2 | 표시/판정 통일 | [receipt-convergence.js](../../plugins/mccp/scripts/lib/receipt-convergence.js) `isConvergedVerdict` | divergent/critical→false, else `resolution.converged` fallback |
| 3 | ship gate | [pr-ship-gate.js](../../plugins/mccp/scripts/lib/pr-ship-gate.js#L45) `deriveShipDecision` | `SHIP_VERDICTS=['converged','skipped']`; `skipped`는 skip-proof 필요; no-ship `{divergent,critical,unavailable,absent}`; override는 verdict 안 바꿈 |
| 4 | cross-gate dedupe | [dedupe.js](../../plugins/mccp/scripts/receipt/dedupe.js#L372) `codexConverged` | `codex_verdict==='converged'`만. **plan+implement 양쪽** converged라야 PR-Codex skip |
| 5 | completion ledger | [completion-ledger/index.js](../../plugins/mccp/scripts/lib/completion-ledger/index.js#L117) | codex_verdict-first. converged/skipped→append, unavailable→advisory, divergent/critical/absent→skip. `verdict_provenance='codex-verdict'` |
| 6 | hash 봉인 | [hash.js](../../plugins/mccp/scripts/receipt/hash.js#L198) `receiptHash` | carve-out = `briefing_*` + `ledger_write_skipped`만. **verdict/proof는 hash에 포함(tamper-protect)** |
| 7 | 감사 audit | [evidence-audit.js](../../plugins/mccp/scripts/lib/evidence-audit.js) `verdictsAgree` | ledger↔receipt 대조 (converged↔converged, skipped↔skipped, advisory↔unavailable) |

**설계상 이득**: `codex_verdict` 하나만 바꾸면 되는 게 아니라, **이 한 필드를 읽는 소비처들에 "새 verdict 소스도 이 필드처럼 읽어라"를 심으면 된다.** M1(receipt-convergence)이 이미 "verdict를 한 곳에서 읽는다"는 패턴을 확립해 놨다.

---

## 2. 설계 원칙 (프로젝트 철학 계승)

이 프로젝트가 8라운드 adversarial review로 벼려낸 불변식을 그대로 이어받는다:

1. **verdict SSoT 단일화** — 새 소스도 소비처가 한 곳(helper)에서 읽는다. M1 `isConvergedVerdict` 패턴 mirror.
2. **fail-closed** — proof 부재 = converged 아님. (dedupe/ship-gate가 이미 이렇게 동작.)
3. **provenance 명시** — "누가 승인했는가"를 receipt에서 읽을 수 있어야. (`verdict_provenance`, `codex_raw_verdict` 선례.)
4. **converged는 "증명 가능"해야** — §7의 핵심. "스캔은 의심을 제기할 수는 있어도 승인을 증명할 수는 없다"(v1.22.3 Implement-Codex R1 F3). diverse-agent converged는 same-model self-approval로 전락하면 안 됨.
5. **tamper-protect** — verdict + proof는 `receipt_hash`에 포함. carve-out 금지(briefing/ledger_write_skipped만 예외).
6. **audited override 재사용** — 새 escape는 `pr_codex_force_override` 패턴(strict reason validator) mirror.
7. **cross-model은 버리지 않고 opt-in 다양성 소스로** — R2. `source='hybrid'`.

---

## 3. 핵심 설계 — verdict 모델 재정의

### 3.1 결정 A: 필드 확장 vs 새 필드 (→ 새 필드 권장)

| | Option 1 — `codex_verdict` 의미 확장 | **Option 2 — `review_verdict` + `review_source` 신설 (권장)** |
|---|---|---|
| 방법 | `codex_verdict`가 "review consensus"를 의미하도록 생산자만 변경 | `resolution.review_verdict`(동일 enum) + `resolution.review_source` 신설. 소비처는 `codex_verdict` 우선, 없으면 `review_verdict` |
| 소비처 변경 | 거의 없음 | helper 1곳(`resolveReviewVerdict`) + 소비처가 그 helper 호출 |
| provenance | **손실** (필드명이 `codex_`인데 실제는 multi-agent) | 보존 (`review_source`로 명시) |
| back-compat | 위험 (의미가 조용히 바뀜) | 안전 (present-only, 기존 receipt는 `codex_verdict`만) |
| 감사 정직성 | 낮음 (ledger `verdict_provenance='codex-verdict'`가 거짓) | 높음 |

**권장: Option 2.** provenance 손실과 "필드명이 거짓말하는" 문제(ledger `verdict_provenance` 오염, §1.4 v1.22.5 M1이 정확히 이걸 고쳤음)를 피한다. `codex_verdict`는 그대로 두고 그 위에 얹는다.

### 3.2 신규 스키마 (present-only, hash 포함)

```
resolution: {
  converged: bool,              // 기존 — "writer finalized" (retire된 trust key)
  codex_verdict: enum|absent,   // 기존 — Codex 단일 판정 (그대로 유지)

  // 신규 (present-only — 기존 receipt는 전부 absent)
  review_verdict: enum|absent,  // converged|divergent|critical|unavailable|skipped
                                //   — 다관점 합의의 최종 판정
  review_source: enum|absent,   // 'codex' | 'multi-agent' | 'hybrid'
  review_proof: {               // converged를 "증명 가능"하게 만드는 봉인 (§7)
    perspectives: [{ role, verdict }],   // 실제 돈 관점들 + 각 판정
    quorum: { required: M, of: N, passed: bool },
    verification_verdict: enum,          // 독립 verification 단계 결과
    dispatch_evidence: [envelope_path],  // N개 agent가 실제로 돌았다는 아티팩트
  } | absent,
}
```

- **enum 재사용**: `review_verdict`는 `CODEX_VERDICT_VALUES`를 공유 → 소비처 vocabulary 통일. schema에 `REVIEW_SOURCE_VALUES` 추가.
- **present-only**: 기존 git-tracked ship corpus는 세 필드 전부 absent → hash 무변경(briefing/ship-override 선례와 동일).
- **hash 포함**: `review_verdict`/`review_source`/`review_proof`는 `receiptHash` carve-out에 **넣지 않는다** — 승인 판정이므로 tamper-protect 필수.

### 3.3 통합 read helper (SSoT 단일화)

```js
// review-verdict.js — codex_verdict + review_verdict를 한 곳에서 해석.
// M1 receipt-convergence.js 패턴 mirror. 모든 소비처가 이것만 호출.
function resolveEffectiveVerdict(resolution) {
  // 우선순위: 명시적 review_verdict > codex_verdict > absent
  // 단 fail-closed: review_verdict='converged'는 proof가 유효해야만 인정
  if (hasReviewVerdict(resolution)) {
    if (resolution.review_verdict === 'converged' && !isProofValid(resolution.review_proof))
      return { verdict: 'unavailable', source: resolution.review_source, proofFailed: true };
    return { verdict: resolution.review_verdict, source: resolution.review_source };
  }
  if (typeof resolution.codex_verdict === 'string')
    return { verdict: resolution.codex_verdict, source: 'codex' };
  return { verdict: null, source: null };  // absent → fail-closed
}
```

---

## 4. 소비처별 계승 (before → after)

| 소비처 | 현재 | 재정의 후 |
|---|---|---|
| **dedupe** `codexConverged` | `codex_verdict==='converged'` | `resolveEffectiveVerdict().verdict==='converged'` (source 무관, proof 유효 시). 여전히 **양쪽 게이트** 요구·fail-closed |
| **ship-gate** `deriveShipDecision` | `SHIP_VERDICTS` + skip-proof | 동일 enum. `converged` from multi-agent는 **`review_proof` 유효 요구**(skip-proof 패턴 mirror — `hasSkipProof`처럼 `hasReviewProof`) |
| **ledger** | `verdict_provenance='codex-verdict'` | `verdict_provenance = source`(`codex`/`multi-agent`/`hybrid`). 나머지 append 규칙 동일 |
| **receipt-convergence** `isConvergedVerdict` | `codex_verdict` 참조 | `resolveEffectiveVerdict` 참조로 위임 (divergent/critical→false 로직 보존) |
| **schema** | `CODEX_VERDICT_VALUES` | + `review_verdict`/`review_source`/`review_proof` present-only 검증 + proof 구조 invariant |
| **hash** | carve-out 2종 | 무변경 (신규 필드는 hash 포함) |
| **evidence-audit** `verdictsAgree` | codex↔ledger | source-aware 대조 추가 |

**핵심: 소비처 로직의 "형태"는 안 바뀐다.** `codex_verdict` 읽던 자리를 `resolveEffectiveVerdict()`로 교체할 뿐. 이는 M1이 `resolution.converged` 직접 읽기를 `isConvergedVerdict`로 통일한 것과 동일한 수술.

---

## 5. cross-model opt-in 통합 (R2)

- `review_source='multi-agent'`: Codex 미호출. plan-fanout류 N관점 Claude + verification. **critical path 기본** — Codex 10-15분 제거.
- `review_source='hybrid'`: multi-agent + Codex 둘 다 통과. Codex 가용 + 시간 여유 + high-stakes(예: terminal PR)일 때만. `review_proof.perspectives`에 Codex leg 포함.
- `review_source='codex'`: 기존 경로(back-compat). 
- **정책**: plan/implement = `multi-agent` 기본, terminal `/mccp:pr` = `hybrid` 권장(Codex opt-in). 이러면 blind-spot 안전판(model diversity)은 high-stakes 지점에만 남고, 반복 plan 작성의 지연은 사라진다.

---

## 6. back-compat / migration / hash

- **기존 receipt**: `review_*` 전부 absent → `resolveEffectiveVerdict`가 `codex_verdict`로 fallback → 동작 무변경. git-tracked ship corpus의 `receipt_hash` 무변경(present-only, skeleton 미materialize — `pr_codex_force_override` 선례).
- **migration 불필요**: present-only라 재봉인 없음. (§3.12 no-rehash 불변식 준수.)
- **schema bump**: 필드 추가는 additive → `SCHEMA_VERSION` 유지 가능(기존 present-only 필드들이 전부 그랬음).

---

## 7. 핵심 함정 — "증명 가능성"과 same-model self-approval

**이게 이 설계의 심장이다.** v1.22.3 Implement-Codex R1 F3의 교훈: *"스캔은 의심을 제기할 수는 있어도 승인을 증명할 수는 없다. schema drift 시 산문이 승인을 발급하면 F5가 되살아난다."* diverse-agent가 `converged`를 발급하는 것은, 잘못 설계하면 **작성자와 같은 base model이 자기 자신을 승인**하는 것과 구조적으로 동일해진다(correlated errors 0.4 — [analysis §2.2](diverse-agent-review-analysis.md)).

**방어 (review_proof의 존재 이유):**

1. **diversity를 mechanical하게 증명** — `review_proof.dispatch_evidence`가 실제로 N개의 **독립 컨텍스트** agent가 돌았다는 아티팩트(dispatch envelope, plan-fanout의 read-only agent 결과)를 가리킨다. "돌았다고 주장"이 아니라 "envelope 파일이 존재"로 fail-closed 검증. mccp에 이미 dispatch-controller/envelope 인프라 있음.
2. **역할 다양성 강제** — `perspectives[].role`이 서로 달라야(architect/security/test/... 최소 K종). 같은 role N개는 correlated → reject. 논문(2507.11198)이 경고한 "persona만 갈아끼우기"를 구조적으로 차단.
3. **독립 verification 단계 필수** — `verification_verdict`. 논문 공통 결론("verification quality에 투자하라"). 다관점 리뷰 **위에** 별도 검증 gate. 이게 없으면 `converged` 불인정(`resolveEffectiveVerdict`가 unavailable로 강등).
4. **quorum fail-closed** — `quorum.passed=false`거나 필드 위조/누락 → `converged` 아님.
5. **`hasReviewProof`가 ship-gate의 `hasSkipProof`처럼 작동** — proof 없는 multi-agent converged는 "unproven"으로 no-ship(§3 ship-gate의 `skipped-unproven` 패턴 정확히 mirror).

**정직한 한계**: 같은 base model(Claude)이므로 verification 단계마저 correlated일 수 있다. 그래서 R2가 cross-model을 **완전히 버리지 않고** `hybrid`로 남긴다 — high-stakes에서 model-diversity 한 겹을 더 얹는 것이 "verification quality"의 상한을 올린다. **R3(완전 제거)를 기각한 이유가 여기 있다.**

---

## 8. 열린 질문 / 다음 단계

**설계 미결 (PRD에서 답할):**
1. **quorum 파라미터** — N(관점 수), M(통과 임계), K(최소 역할 종류)의 default. plan-fanout은 현재 4관점(architect/security/test/explorer).
2. **verification 단계의 정체** — 별도 critic agent? self-consistency voting? cross-model(hybrid) leg? 셋 다 조합?
3. **어느 게이트부터** — plan-codex를 multi-agent로 먼저(저위험) vs 전 게이트 동시.
4. **`review_proof` 위조 방지 강도** — envelope 존재만 볼지, envelope 내용(각 agent의 실제 verdict)까지 hash-bind할지.
5. **Codex 잔여 트리거** — hybrid를 언제 자동 발동(high-stakes 판정 기준)?
6. **speed 예산** — 반복 plan wall-clock 목표(현 Codex 10-15분 → ?).

**구현 순서 제안 (저위험 → 고위험):**
- Phase 0: `review-verdict.js` helper + schema present-only 필드 (소비처 무변경, 읽기만 추가)
- Phase 1: plan-fanout을 advisory→**review gate**로 승격, `review_verdict='multi-agent'` 생산 (plan-codex 한정)
- Phase 2: dedupe/ship-gate/ledger가 `resolveEffectiveVerdict` 소비 (계승)
- Phase 3: `hybrid` source + terminal PR opt-in Codex
- 각 Phase는 기존 dual-review 게이트(Codex)로 자기 자신을 review — dogfood.

**다음 액션 후보:**
- `/mccp:plan-prd`로 이 설계를 PRD화 (본 문서 + [analysis](diverse-agent-review-analysis.md)를 근거로)
- 또는 열린 질문 (2) verification 단계 설계부터 심화 (논문상 "진짜 레버")
