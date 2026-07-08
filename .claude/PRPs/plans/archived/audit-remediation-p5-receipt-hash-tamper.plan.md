# Plan: receipt_hash tamper-detect 실연결 (audit-remediation P5)

**Source PRD**: `.claude/prds/audit-remediation-followup.prd.md`
**Selected Milestone**: P5 — receipt_hash tamper-detect 실연결
**Complexity**: Small

## Summary

`write.js`는 receipt 저장 시 `subject_hash`와 `receipt_hash`를 **둘 다** 봉인하지만, `validate-cmd.js`는 `subject_hash`만 재계산·비교하고 `receipt_hash`는 **저장만 되고 검증되지 않는다**. `subject_hash`는 `SUBJECT_FIELDS`(task_id/phase/gate_id/plan_hash/design_doc_hash/base_sha/head_sha/round)만 커버하므로 서명 후 `findings`·`resolution`·`meta` 변조(특히 P1이 복구한 dual-review 무결성 필드 `resolution.codex_verdict`)는 현재 탐지되지 않는다. 본 milestone은 `validate-cmd.js`에 `receiptHash()` 재계산·비교를 **기존 subject_hash 패턴 그대로 미러링**해 그 gap을 닫는다. `receiptHash()`는 이미 `hash.js`에 존재·export되어 있고 write/validate 양쪽이 동일 함수를 쓰므로 carve-out(briefing_*·ledger_write_skipped·self) parity가 구조적으로 보장된다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/receipt/validate-cmd.js:252` | `const computedSubject = subjectHash(receipt); if (computedSubject !== receipt.subject_hash) { result.stale.push({...}) }` — receipt_hash 체크를 동일 형태로 |
| Errors | `plugins/mccp/scripts/receipt/validate-cmd.js:254-258` (구조) · `preflight.js:29-34` (`kind`) | mismatch → `result.blocking.push({ gate_id, decision_id, kind:'receipt-tamper', reason })` + `continue`. blocking은 hard/soft 양 모드 차단(off만 예외). `kind` 필드는 기존 `tempfail` 패턴(preflight.js:32) 미러 |
| Ordering | `plugins/mccp/scripts/receipt/validate-cmd.js:242,252` | schema 검증(L242)이 hash 체크보다 선행 → receipt_hash 부재/malformed는 이미 `blocking`("schema invalid")으로 fail-closed. tamper 체크는 well-formed hash 보유 receipt에만 도달 |
| Hash fn | `plugins/mccp/scripts/receipt/hash.js:198-225` | `receiptHash(receipt)` — deep-clone 후 receipt_hash/meta.briefing_*/meta.ledger_write_skipped carve-out → canonicalize → sha256. write.js:310과 동일 함수 |
| Tests | `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js:65-75` | `write()` → 파일 raw JSON mutate → `validateCommand()` → `result.stale.length===1` + reason 정규식 |

## 설계 결정 (grounding으로 해소된 Open Question)

1. **구 schema(receipt_hash 부재) 처리 정책** — 별도 정책 불필요. `schema.js:142-143`이 `receipt_hash`를 required(`SHA256_RE`)로 강제하고, validate 루프에서 schema 검증(L242)이 hash 체크(L252)보다 **먼저** 돌아 부재/malformed를 `blocking`("schema invalid")으로 fail-closed 처리한다. → tamper 체크는 항상 well-formed hash를 상대한다. PRD Open Question(fail-closed vs advisory)의 답: **schema 게이트가 이미 fail-closed** — 신규 absence 정책 코드 없음.
2. **carve-out parity** — validate가 write.js와 **동일한** `hash.js#receiptHash()`를 호출 → briefing_*·ledger_write_skipped·self carve-out이 bit-단위로 일치. drift 위험 0(별도 재구현 금지).
3. **분류: `blocking` (kind='receipt-tamper'), NOT stale** — **Codex R1 F1 흡수(revised)**. 초안은 subject_hash를 미러링해 `stale`로 뒀으나, `preflight.js:42-43`이 stale에 대해 `"To regenerate STALE: re-run the producing gate"`를 지시한다 → 변조된 receipt를 stale로 분류하면 복구 가이드가 **재생성(덮어쓰기)을 지시해 tamper 증거를 소실**시킨다(P5 목적을 복구 레이어에서 무력화). 따라서 `result.blocking`에 **기존 `kind: 'tempfail'` 패턴을 미러링한 `kind: 'receipt-tamper'`** 로 push한다. 게이팅 강도는 stale과 동일(hard+soft 양 모드 차단, `preflight.js:29-34` blocking 루프 + soft-mode blocking 차단 §1.2), 그러나 "regenerate STALE" 라인을 받지 않고 전용 TAMPER 복구 라인(재생성 금지·조사 지시)을 받는다. `mode=off`는 receipt 게이트 전역 bypass라 tamper도 통과 — 의도된 문서화된 escape(CLAUDE.md §4).
   - **subject_hash의 동일 잠복 결함은 out-of-scope** — subject_hash mismatch도 stale→regenerate 가이드를 받는다(선행 동작). P5는 receipt_hash(findings/resolution/meta)만 다루고, subject_hash tamper 처리 통일은 backlog로 이연(`codex-findings-backlog.md`).
4. **배치** — subject_hash 블록(L260) 직후 · plan_hash 블록(L262) 직전. subject 필드 변조는 subject_hash가 먼저 잡아(더 구체적 reason, stale) `continue`하고, findings/resolution/meta 변조는 receipt_hash가 blocking(receipt-tamper)으로 잡는다.
5. **오탐 없음(legit post-seal mutation)** — 마이그레이션 3종(v0.2.4/v0.2.6/v0.3.6)은 필드 추가 후 `receipt.receipt_hash = receiptHash(receipt)`로 **재봉인**하고(각 migration L55/59/62), `restampGroundingVerdict`(write.js:488)도 재봉인하며, briefing/ledger 필드는 carve-out이다. 남은 이론적 위험(과거 canonicalize 버전 차이)은 **현존 receipt 전수 sweep**(Task 3)으로 경험적으로 닫는다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | subject_hash 블록 직후 `receiptHash()` 재계산·비교 추가 → mismatch 시 `result.blocking.push({kind:'receipt-tamper'})` |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATE | blocking 루프에 `receipt-tamper` → `TAMPER` 라벨(L32 tempfail 미러) + 전용 복구 라인(재생성 금지·조사 지시). Codex R1 F1 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATE | tamper 회귀(findings·resolution.codex_verdict·meta) → blocking(kind=receipt-tamper) + 오탐 방지(briefing stamp·grounding restamp) 테스트 |
| `plugins/mccp/scripts/receipt/tests/preflight.test.js` | UPDATE/CREATE | tamper-only 시 `TAMPER` 라벨 surface + "regenerate STALE" 라인 **부재** 검증 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` 1.20.8 → 1.20.9 (§3.7 patch bump) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.20.8` → `v1.20.9` (L1417) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.20.8` → `v1.20.9` (L154) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 버전 assertion `v1.20.8` → `v1.20.9` (L88/L125) 동기 |
| `CHANGELOG.md` | UPDATE | `[1.20.9]` row 추가 |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATE | P5 status `in-progress`(plan 단계) → 구현 완료 시 `complete`. **동시에 P2/P3/P4 in-progress drift를 complete로 정합**(사용자 결정: 별도 chore PR 대신 P5 PR fold) |

## Tasks

### Task 1: validate-cmd.js에 receipt_hash tamper 체크 추가
- **Action**: `validate-cmd.js`의 subject_hash 블록(L252-260) 직후, plan_hash 블록(L262) 직전에 삽입:
  ```js
  const computedReceipt = receiptHash(receipt);
  if (computedReceipt !== receipt.receipt_hash) {
    result.blocking.push({
      gate_id: gateId,
      decision_id: result.decisionId,
      kind: 'receipt-tamper',
      reason: 'receipt_hash mismatch (findings/resolution/meta altered after signing)',
    });
    continue;
  }
  ```
  `require('./hash')` 구조분해에 `receiptHash` 추가(현재 `subjectHash`만 import).
- **Mirror**: `validate-cmd.js:252-260` subject_hash 체크(구조) · `preflight.js:32` `kind:'tempfail'`(kind 필드) · write.js:12 import 형태.
- **Verify(implement-time)**: `classify.js`가 `kind:'receipt-tamper'`를 특수 처리(tempfail=exit 75)가 아닌 **일반 blocking(exit 2)** 으로 취급하는지 확인(tempfail만 특수 kind이어야 함).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/validate-cmd.test.js`

### Task 2: 회귀 테스트 (tamper 탐지 + 복구 surface + 오탐 방지)
- **Action**: `validate-cmd.test.js` + `preflight.test.js`에 케이스 추가 —
  - **탐지**: write 후 raw JSON에서 (a) `findings` 배열에 항목 주입 (b) `resolution.codex_verdict`를 `converged`→`divergent`로 변조 (c) `meta.command` 변조 각각 → `result.blocking.length===1` + `blocking[0].kind==='receipt-tamper'` + reason `/receipt_hash mismatch/`.
  - **subject-우선**: `task_id` 변조 시 여전히 `subject_hash mismatch`(stale, 더 구체적)가 surface되는지(회귀 보호).
  - **복구 surface(Codex R1 F1)**: tamper-only receipt를 preflight에 태워 stderr에 `TAMPER` 라벨 + 조사 지시 라인이 나오고 **"To regenerate STALE" 라인은 부재**함을 검증.
  - **오탐 방지**: write 후 `meta.briefing_summary`/`meta.briefing_token_count` 등 carve-out 필드만 주입 → `result.ok` 유지(blocking 0). grounding restamp 경로(`cli.js restamp-grounding` / `restampGroundingVerdict`)를 거친 receipt도 validate ok.
- **Mirror**: `validate-cmd.test.js:65-75`(tampered subject_hash) · `hash.test.js:178-190`(receiptHash 동작) · `tempfail-precedence.test.js`(kind 기반 preflight surface).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/validate-cmd.test.js plugins/mccp/scripts/receipt/tests/hash.test.js plugins/mccp/scripts/receipt/tests/preflight.test.js`

### Task 3: 현존 receipt 전수 오탐 sweep (경험적 acceptance)
- **Action**: 신규 validator 로직을 현재 워크트리의 모든 `.claude/receipts/**/*.json`에 적용해 receipt_hash mismatch가 **0건**임을 확인(과거 canonicalize/schema 버전 차이로 인한 오탐 배제). 1회성 diagnostic 스크립트(커밋 안 함, `scratchpad`)로 `readReceipt` 없이 파일별 `receiptHash(parsed)===parsed.receipt_hash` 대조.
- **Mirror**: 코드 변경 아님 — ship 전 검증 절차.
- **Validate**: 스크립트 출력 `mismatch=0`. mismatch 발견 시 원인 분석(진짜 tamper인지 canonicalize drift인지) 후 plan 재검토.

### Task 4: 버전 bump 하우스키핑 (§3.7)
- **Action**: `plugin.json` 1.20.8→1.20.9 · html.js/markdown.js footer 2곳 동기 · i18n-surface.test.js assertion 동기 · CHANGELOG `[1.20.9]` row.
- **Mirror**: 직전 P4 CHANGELOG `[1.20.8]` row 형식.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` · `grep -rn "1.20.9" plugins/mccp/.claude-plugin/plugin.json plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js`

### Task 5: PRD status 정합 (P5 + P2/P3/P4 drift fold)
- **Action**: PRD Delivery Milestones 표에서 P5 `pending`→`in-progress`(plan 단계, Plan 셀에 본 파일 경로), 구현 완료 시 `complete`. 동시에 이미 머지된 P2(#88)/P3(#89)/P4(#92)의 `in-progress` drift를 `complete`로 정정(사용자 결정 fold).
- **Mirror**: PRD 표 기존 행 형식.
- **Validate**: 표에 in-progress 잔존 0(P5 complete 시점 기준).

## Validation

```bash
# 핵심 회귀 (receipt 서브시스템 전체 — validate-cmd·preflight·hash 포함)
node --test plugins/mccp/scripts/receipt/tests/

# 렌더러 footer surface (버전 동기)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 버전 일관성
grep -rn "1.20.9" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js \
  plugins/mccp/scripts/lib/renderer/markdown.js

# Task 3 오탐 sweep (scratchpad diagnostic — 커밋 안 함)
# 현존 .claude/receipts/**/*.json 전수 receiptHash 대조 → mismatch=0
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 과거 canonicalize/schema 버전으로 봉인된 현존 receipt가 신규 체크에서 오탐 | Low | Task 3 전수 sweep로 ship 전 경험적 0 확인. 마이그레이션·restamp 재봉인 + carve-out backward-compat 설계로 이론적 위험 낮음 |
| 정당한 post-seal mutation(briefing/ledger/grounding) 오탐 | Low | validate가 write와 **동일** `receiptHash()` 호출 → carve-out parity 구조적 보장. Task 2 오탐 방지 테스트로 고정 |
| blocking(receipt-tamper) 분류가 soft 모드에서도 차단 → 기존 soft-mode 흐름 변화 | Low | 의도된 동작(tamper는 soft에서도 막아야 함). blocking은 §1.2 matrix상 hard+soft 차단. CHANGELOG 명시 |
| 새 `kind:'receipt-tamper'`가 classify.js에서 tempfail처럼 exit 75로 오분류 | Low | Task 1 verify-step으로 classify.js가 tempfail만 특수 처리하고 나머지 kind는 exit 2 일반 blocking임을 확인. preflight.test.js로 고정 |
| P2/P3/P4 status fold가 P5 diff 범위를 넓혀 리뷰 노이즈 | Low | PRD 표 1개 파일 · status 셀만 변경. 커밋 메시지에 fold 사유 명시 |

## Acceptance

- [ ] `validate-cmd.js`가 findings/resolution/meta 변조를 `receipt_hash mismatch`로 **blocking(kind=receipt-tamper)** 분류
- [ ] preflight가 tamper에 `TAMPER` 라벨 + 조사 지시 라인 surface, "regenerate STALE" 라인 부재(Codex R1 F1)
- [ ] subject 필드 변조는 여전히 `subject_hash mismatch`(stale, 더 구체적)로 우선 surface
- [ ] briefing/ledger/grounding carve-out post-seal mutation은 오탐 없음(validate ok, blocking 0)
- [ ] 현존 `.claude/receipts/` 전수 sweep mismatch=0 (Task 3)
- [ ] plugin.json 1.20.9 + footer 2곳 + i18n-surface 테스트 동기 (surface drift 0)
- [ ] CHANGELOG `[1.20.9]` row + PRD P5 complete + P2/P3/P4 drift 정합
- [ ] Patterns mirrored, not reinvented (subject_hash 체크 형태 재사용, 신규 hash 로직 0)

## External Research Provenance

- Source PRD: .claude/prds/audit-remediation-followup.prd.md
- References section sha256: 0eecc0ea19cbb247ddb9b217f324ad3c5a8e7057076f94c97c2366508c21c861
- Stamped at: 2026-07-07T18:55:45.243Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 트리거: `impeccable-detect` SIGNAL=1 (renderer 파일 `html.js`/`markdown.js`/`i18n-surface.test.js`가 `Files to Change`에 등장 → 경로 기반 detector positive).
- 실질: 본 plan은 renderer 파일을 **footer 버전 문자열(`v1.20.8`→`v1.20.9`) 동기 목적으로만** 건드리며 rendered design surface를 도입하지 않는다(control-plane/버전-string bump). SKILL Output Constraints 4항(정보 위계·강조색·raw markdown·항목 수) 모두 변경할 rendered surface 부재 → 해당 없음.
- 결과: critique findings = 0 → `decideCritique({findings:[], round:0, cap:2})` = **CONVERGED** (round 1/1). 실제 rendered-surface delta는 v1.18.22 produced-diff grounding lint(prp-implement Phase 3.7)이 H15 anchor로 별도 mechanical 검증 — footer string 변경은 heading depth 무영향.

## Design Routing Guide

routing mode: auto (implement 단계에서 발효). plan 단계는 렌더 UI가 아직 없어 어떤 impeccable 명령도 invoke하지 않는다 — 아래는 체크리스트일 뿐이며, 본 plan은 rendered surface 미도입이라 사실상 no-op이다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.8/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2). classification=`ok`, blocking=0.
- 라운드 수: 1 (R1 — MEDIUM finding, HIGH/CRITICAL ACCEPT_NOW 부재로 R2 미발화)
- 합치 결론: **converged** — Codex가 제기한 유일 finding(F1, MEDIUM)을 plan에 흡수(분류 stale→blocking `receipt-tamper` + preflight 전용 복구 라인). 남은 미해소 HIGH/CRITICAL 없음.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — receipt_hash mismatch를 `stale`로 분류하면 `preflight.js:42-43`의 "To regenerate STALE" 가이드를 받아 변조 receipt를 재생성(덮어쓰기)해 tamper 증거를 소실 → P5 목적을 복구 레이어에서 무력화 | MEDIUM | ACCEPT_NOW | grounded(preflight.js:42-43 실측). 게이팅은 이미 되지만 복구 UX가 tamper를 은폐 → `result.blocking` `kind:'receipt-tamper'` + preflight TAMPER 라벨·조사 지시 라인으로 흡수(설계 결정 #3 revised) |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (subject_hash mismatch도 동일 stale→regenerate 잠복 결함 — P5 out-of-scope, tamper kind 통일 별도 cycle)
- Open Questions: 없음 (F1 MEDIUM 흡수 완료, auto-CRITICAL 부재)
- Codex session 참조: threadId `019f3df2-8b47-7420-b534-865b1b05c91c`

> 주: wrapper의 `bridge.parseVerdict`는 companion의 structured JSON 응답을 "unavailable"로 파싱했으나(포맷 seam), 실제 `result.verdict='needs-attention'` + 1 MEDIUM finding이 반환됐고 이를 흡수해 converged. receipt `codex_verdict`는 실제 흡수 결과(converged)를 기록.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- 근거: plan은 파일 layout·삽입 코드 블록·에러 형태(`result.blocking.push({kind:'receipt-tamper'})` + `continue`)·hash 함수(기존 `hash.js#receiptHash()` 재사용) 전부 pre-commit. 신규 helper·라이브러리·concurrency primitive 0. `git diff --name-only origin/main..HEAD` = ∅ (브랜치 커밋 0) ⊆ Files to Change.
- Codex 재호출 skip이 dual-review 무손상: plan-codex 게이트가 이미 실제 Codex adversarial review(threadId `019f3df2-8b47-7420-b534-865b1b05c91c`, F1 MEDIUM 흡수 → converged)를 anchor. implement-time에 재검토할 신규 결정 부재.
