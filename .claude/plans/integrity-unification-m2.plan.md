# Plan: Integrity Unification (무결성 통일 cycle) M2

**Source**: `.claude/plans/integrity-unification-m1.plan.md` (Delivery Milestones M2 행, reference mode) + `.claude/plans/codex-findings-backlog.md` deferred rows
**Selected Milestone**: M2 — 독립 무결성 fixes (tamper 대칭 · leak-scan 정밀도 · parser 실-producer 회귀)
**Complexity**: Small~Medium (M1 대비 좁음 — 서로 독립적인 4개 국소 수정, blast radius 작음)

## Summary

M1이 durable corpus를 지키는 tightly-coupled 3축(ledger 술어 · stage-guard write-side · audit read-side)을 `codex_verdict` SoT + `receiptHash` 대칭으로 닫았다면, M2는 M1과 **다른 trust boundary**에 흩어진 **서로 독립적인** 무결성 결함들을 닫는다 — 롤백·호환성 위험이 M1과 분리되므로 별도 milestone으로 격리했다(M1 Codex R1 F5). 축은 넷이다: (1) `subject_hash` mismatch가 tamper인데 `stale`로 분류돼 preflight의 "regenerate" 가이드로 **증거가 파괴**될 수 있다(M1이 `receipt_hash`에 대해 이미 닫은 것과 **동일 잠복 결함의 subject-side 잔여**), (2) `history-leak-scan`의 allowlist가 blob당 대표 경로 하나에만 적용돼 같은 blob이 fixture·real 두 경로로 도달하면 real leak이 조용히 억제된다, (3) `parseReviewPayload`가 정상 응답을 못 읽는다고 지목됐으나 M1 gate에서 이미 `source:structured`로 정상 파싱됨이 실증됐다 — 실-producer 형태 **회귀 fixture로 close**해 향후 drift를 봉인, (4) M1 Task 1b의 convergence-소비처 sweep이 놓친 **`briefing/invoke.js:27` residual**(raw `!!res.converged`)을 공유 `receipt-convergence.js`로 정합. 넷 다 국소·회귀-고정이며 새 스키마·새 표면이 없다. 최고위험 terminal-gate 재설계는 M3로 계속 분리한다(M1 Codex R1 F1 — 이미 8라운드 비수렴을 유발한 축).

**핵심 성질(M1과의 차이)**: M2 축들은 서로 얽혀 있지 않다 — subject_hash·leak-scan·parser·briefing은 각기 다른 파일·다른 소비처라 하나가 실패해도 나머지가 독립 land 가능하다. 그래서 M1의 "대칭 land 강제" 같은 순서 불변식이 없고, 각 Task가 자기 완결 회귀 test로 닫힌다.

## Delivery Milestones

| Milestone | Scope | Status | Plan |
|---|---|---|---|
| M1 | verdict-SoT + hash 무결성 core: ledger 승인 술어(+소비처 sweep) · stage-guard write-side · audit read-side · migration | complete | `.claude/plans/integrity-unification-m1.plan.md` |
| **M2** | 독립 무결성 fixes: subject_hash tamper 대칭(2026-07-08) · history-leak-scan path-precision(R5-F3) · parseReviewPayload 실-producer fixture(2026-07-22) · briefing convergence residual(M1 Task 1b 잔여) | **in-progress** | (this plan) |
| M3 | terminal `/mccp:pr` non-approving mechanical hard-stop 재설계(2026-07-21 HIGH) — bounded orchestration·re-entrancy·lock·crash-window·self-receipt 포함 semantics + absent-verdict fail-closed(M1 Codex R1 F2) + 자체 version bump·acceptance gates | pending | — |

> M2는 M1/M3 없이 단독 ship 가능(독립 trust boundary). M3는 여전히 격리 — advisory→mechanical 승격은 강제 메커니즘을 적대 리뷰하면 우회 표면이 매 라운드 새로 노출되는 축이라(backlog 2026-07-21 HIGH가 8라운드 비수렴 근거를 명시) 별도 재설계 단위.

## Absorbed Findings (backlog → Task 매핑)

| Backlog 행 | Severity | Task | 상태(실측 재검증) |
|---|---|---|---|
| 2026-07-08 MEDIUM — subject_hash mismatch가 stale→regenerate로 tamper 증거 소실 | MEDIUM | M2 Task 1 | OPEN 확인(`validate-cmd.js:252-260` stale 분류 · `preflight.js:47-48` regenerate 힌트가 이 stale을 먹음) |
| 2026-07-23 MEDIUM R5-F3 — history-leak-scan allowlist blob당 1경로만 | MEDIUM | M2 Task 2 | OPEN 확인(`history-leak-scan.js:147-160` `byOid` first-path 대표만 allowlist) |
| 2026-07-22 MEDIUM — parseReviewPayload 정상 응답 미파싱 | MEDIUM | M2 Task 3 | **실측 정정**: 현 `codex-review-payload.js:48-60`은 `.stdout`→`.result.verdict`를 정상 파싱(M1 gate가 `source:structured`로 부수 입증). 결함 아님 → **회귀 fixture로 close**(파서·filter가 실 producer 출력과 drift한 채 통과하던 선례 3건 방지) |
| (M1 Task 1b 잔여) — briefing focus가 raw `!!res.converged` stamp | MEDIUM | M2 Task 4 | OPEN 확인(`briefing/invoke.js:27` — `receipt-convergence` 미import, divergent ship을 briefing 요약에 "converged: true"로 표기) |

> **명시적 제외**(별도 cycle 유지, M2 무결성-계열 아님): terminal `/mccp:pr` hard-stop(2026-07-21 HIGH → **M3**) · briefing **hang**(2026-07-21 HIGH exit-127 — PR-gate operability, verdict-SoT 아님) · finalize-receipt `--deferred-findings`(2026-07-21 MEDIUM) · derive-decision branch fallback(2026-07-21 HIGH) · fan-out debt marker residual(2026-07-16/21) · `--apply-fix-task` 유령 플래그(2026-07-15) · pre-existing test 실패 2건(`verdict-label` · `design-critique-loop-e2e` fixture).
>
> **미기록 항목 주의(운영자 확인 필요)**: M1 `/mccp:code-review`가 보고한 LOW 2건은 backlog·report·fix-task 어디에도 durable하게 남지 않았다(transient review 세션). 날조하지 않으므로 M2는 이를 흡수하지 않는다 — 실재하면 운영자가 내용을 제시하면 Task로 추가하거나 backlog에 append한다. 그 전까지 M2 scope는 위 4 Task로 고정.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| tamper classify | `validate-cmd.js:262-279` | receipt_hash mismatch → `blocking` + `kind:'receipt-tamper'`(NOT stale). subject_hash 블록(252-260)을 이 형태로 대칭화 |
| tamper preflight hint | `preflight.js:50-55` | receipt-tamper는 INTEGRITY — "Do NOT regenerate (that destroys the evidence)" 힌트. subject-tamper도 같은 계열 메시지로 |
| self-consistency hash | `hash.js#subjectHash` / `receiptHash` | 둘 다 receipt 자기 필드 재계산 → sealed 값과 비교. mismatch = 서명 후 변조(tamper), plan 변경(staleness)은 별도 plan_hash 비교 |
| per-path allowlist | `history-leak-scan.js:88 isAllowlisted(allowlist, filePath, line)` | 이미 path+line 단위 판정 — 결함은 호출부(`byOid` first-path)이지 판정 함수가 아님 |
| structured verdict SoT | `codex-review-payload.js:48-60 parseReviewPayload` | `.stdout` 한 번 더 JSON.parse → `.result.verdict`. null=fail-closed(승인 불가) |
| convergence read helper | `receipt-convergence.js#isConvergedVerdict` (M1) | divergent/critical → false, 그 외 `resolution.converged` fallback. 모든 display 소비처 공유 |
| 실-producer 회귀 test | M1 `codex-result-filter`/`verify.js` 교정 선례 | 손수 fixture가 아니라 실 producer envelope 형태로 test — "통과했다 ≠ 검사했다" 방지 |
| 회귀 test 위치 | `receipt/tests/validate-cmd.test.js` · `lib/tests/history-leak-scan.test.js` · `lib/tests/codex-review-payload.test.js` · `lib/briefing/tests/invoke.test.js` | 각 Task는 해당 파일에 negative 회귀 추가 |

## Files to Change (M2)

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | subject_hash mismatch를 stale → blocking `kind:'subject-tamper'`로 승격(Task 1) |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATE | subject-tamper용 INTEGRITY 힌트 추가(regenerate 경로에서 제외) |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATE | subject-field 변조(valid schema, stale subject_hash) → blocking·not-stale 회귀 |
| `plugins/mccp/scripts/lib/history-leak-scan.js` | UPDATE | `byOid`를 oid→paths[] 다중 경로 추적 또는 경로별 스캔으로 — allowlist는 매칭 path+line만 억제(Task 2) |
| `plugins/mccp/scripts/lib/tests/history-leak-scan.test.js` | UPDATE | 같은 blob이 fixture(allowlisted)+real(non) 두 경로 도달 시 real leak 보고 회귀 |
| `plugins/mccp/scripts/lib/tests/codex-review-payload.test.js` | UPDATE | 실-producer envelope(`{ok,stdout:'{...result.verdict...}'}`) fixture → `source:structured` 회귀 + malformed→`unavailable` fail-closed 유지(Task 3) |
| `plugins/mccp/scripts/lib/briefing/invoke.js` | UPDATE | `receipt-convergence` import + `isConvergedVerdict(res)`로 line 27 교체(Task 4) |
| `plugins/mccp/scripts/lib/briefing/tests/invoke.test.js` | UPDATE | divergent-ship receipt → briefing focus "converged: false" 회귀 |
| `plugins/mccp/scripts/lib/codex-review-payload.js` | UPDATE(조건부) | Task 3에서 fixture가 실제 파싱 gap을 드러내면(현 실측=정상) 그때만 수정 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump `1.22.5 → 1.22.6`(patch — 같은 PRD의 M2, M3 잔여) |
| `plugins/mccp/scripts/lib/renderer/html.js` · `lib/renderer/markdown.js` | UPDATE | footer version 동기(§3.7 surface drift 방지) |
| `.claude/plans/integrity-unification-m1.plan.md` | UPDATE | Delivery Milestones M2 행 pending→in-progress + Plan cell = 본 plan 경로(roadmap 정합) |
| `CLAUDE.md` · `CHANGELOG.md` · `.claude/plans/codex-findings-backlog.md` | UPDATE | cycle 행 추가 + 흡수 3행(2026-07-08·2026-07-23 R5-F3·2026-07-22) ABSORBED 표식(row 보존) |

## Tasks (M2)

### Task 1: subject_hash mismatch를 tamper로 대칭 분류 (MEDIUM, 2026-07-08)
- **Action**:
  1. `validate-cmd.js:252-260` — `computedSubject !== receipt.subject_hash`를 `result.stale`가 아니라 `result.blocking` + `kind:'subject-tamper'`로 승격(바로 아래 262-279의 `receipt_hash` receipt-tamper 블록과 **대칭**). reason은 "subject_hash mismatch (subject fields altered after signing)".
  2. `preflight.js` — 현재 receipt-tamper(receipt_hash)만 "Do NOT regenerate" INTEGRITY 힌트를 받는다(50-55). `subject-tamper`도 같은 계열 힌트를 받도록 확장(stale의 "To regenerate STALE" 경로에서 제외 — 이것이 증거 파괴를 막는 핵심).
  3. **설계 검증(구현 전 필수)**: subject_hash는 `subjectHash(receipt)`(receipt 자기 SUBJECT_FIELDS 재계산) vs sealed `receipt.subject_hash` — self-consistency이므로 mismatch는 서명-후-변조(tamper)이지 plan 변경(staleness)이 아니다(plan staleness는 별도 plan_hash 비교). `rg 'subject_hash'`로 stale-분류에 의존하는 **정상 regenerate 흐름이 없음**을 확인(있다면 그 흐름을 tamper 승격과 양립하도록 조정). receipt_hash가 subject의 상위집합이라 subject 변조는 receipt_hash도 트립하지만, subject 블록이 먼저 `continue`해 pre-empt하므로 subject 블록 자체를 tamper로 만드는 것이 정답.
- **Mirror**: `validate-cmd.js:262-279`(receipt-tamper 블록) · `preflight.js:50-55`(INTEGRITY 힌트) · `classify.js`(non-tempfail kind → exit 2)
- **Validate**: SUBJECT_FIELD 변조 + `subject_hash` 미갱신(valid schema) receipt → `blocking`(kind subject-tamper), `stale` 아님, preflight가 regenerate 힌트 대신 TAMPER 힌트 출력. 정상 receipt는 통과 불변.

### Task 2: history-leak-scan allowlist를 oid의 전 경로에 적용 (MEDIUM, R5-F3)
- **Action**:
  1. `history-leak-scan.js:147-160` — `byOid`(oid→first-path 대표)를 `oid→paths[]`(모든 경로)로 확장하거나, blob 스캔 후 allowlist 판정을 **경로별**로 수행. `git rev-list --objects`가 같은 oid를 여러 `<oid> <path>` 행으로 낼 때 전 경로를 수집.
  2. allowlist 매칭은 이미 path+line 단위(`isAllowlisted`, 88) — 호출부가 대표 경로 하나만 넘기던 것을 전 경로 순회로 바꾸고, **매칭된 path+line만 억제**하고 같은 blob의 non-allowlisted 경로 leak은 그대로 보고. leak record에 실제 보고 경로를 정확히 실어 audit 추적 가능하게.
- **Mirror**: `history-leak-scan.js:88 isAllowlisted`(per-path 판정 재사용) · `:116 scanRange` 구조 · DEFAULT_ALLOWLIST fixture 계약(33-39)
- **Validate**: 동일 내용 blob이 fixture(allowlisted) 경로 + real(non-allowlisted) 경로 양쪽에 존재하고 git이 **fixture 경로를 먼저** 보고하는 fixture → real 경로 leak이 `leaks[]`에 보고됨(HALT). 단일 allowlisted 경로만 있는 blob은 기존대로 억제(회귀 0).

### Task 3: parseReviewPayload 실-producer 회귀 fixture (MEDIUM, 2026-07-22 — verify-and-close)
- **Action**:
  1. `codex-review-payload.test.js`에 **실 producer envelope 형태** fixture 추가: 외곽 래퍼 `{ok, stdout, stderr, durationMs, classification, blocking, advisory}`, `stdout`은 `{review, target, threadId, context, codex:{...}, result:{verdict, summary, findings, next_steps}, rawOutput, parseError}` JSON 문자열. `deriveGateVerdict`가 `{verdict, source:'structured'}`(unavailable 아님)를 내는지 assert.
  2. `parseReviewPayload`가 이 fixture에서 null을 반환하면(=실제 gap) `codex-review-payload.js`를 수정. **현 실측은 정상 파싱**(48-60이 `.stdout` 재파싱 + `.result` 우선 read)이므로 대개 코드 수정 없이 fixture-only close지만, fixture가 gap을 드러내면 조건부 UPDATE.
  3. fail-closed 회귀 유지: wrapper-only(`stdout` 없음)·malformed `stdout`·`result.verdict` 부재 → `unavailable`(승인 불가)를 별도 케이스로 고정.
- **Mirror**: backlog 2026-07-22 행이 명시한 실 응답 구조(`threadId`, `stdout.length` 규모) · M1의 `verify.js`/`codex-result-filter` 실-producer fixture 전환 선례(손수 fixture → producer 계약)
- **Validate**: 실-producer fixture → `source:structured` + 정확 verdict. malformed → `unavailable`. 기존 `codex-review-payload.test.js` 케이스 전부 green 유지.

### Task 4: briefing convergence residual 정합 (MEDIUM, M1 Task 1b 잔여)
- **Action**:
  1. `briefing/invoke.js:27` — `'- converged: ' + (!!res.converged)`를 `isConvergedVerdict(res)`로 교체. 파일 상단에 `require('../receipt-convergence')` import 추가(현재 `path`·`codex-invoke`만 import).
  2. M1 Task 1b의 sweep이 "모든 convergence-presentation 소비처(display 포함)"를 주장했으나 briefing focus line이 누락됐음을 닫는다 — divergent/critical ship의 briefing 요약이 더 이상 "converged: true"로 오기하지 않음.
  3. **잔여 재확인**: `rg 'resolution\.converged|!!res\.converged|\.converged\b' plugins/mccp/scripts`로 semantic/display 소비처 중 헬퍼 미경유 잔여가 briefing 외에 없음을 확인(있으면 같은 방식 정합 — scope는 이번 Task로 국한, 신규 발견은 backlog).
- **Mirror**: `receipt-convergence.js#isConvergedVerdict`(M1 신규 공유 헬퍼) · M1 sweep 소비처(`status.js:31`, `derive/sources/receipts.js:45`)의 import+호출 패턴
- **Validate**: `res.codex_verdict='divergent'`(converged:true) receipt → briefing focus line "converged: false". converged/skipped/absent ship은 기존 표기 불변. `lib/briefing/tests/invoke.test.js` 회귀.

## Validation (M2)

```bash
node --test plugins/mccp/scripts/receipt/tests/validate-cmd.test.js
node --test plugins/mccp/scripts/lib/tests/history-leak-scan.test.js
node --test plugins/mccp/scripts/lib/tests/codex-review-payload.test.js
node --test plugins/mccp/scripts/lib/briefing/tests/invoke.test.js
node --test plugins/mccp/scripts/receipt/tests/                # tamper 계열 회귀 전체
node plugins/mccp/scripts/lib/history-leak-scan.js 2>&1 | tail -5   # 실 저장소 스캔 불변(신규 leak 0)
node plugins/mccp/scripts/lib/evidence-audit.js --json         # M1 corpus 상태 불변(incomplete/9/9/0/9/19)
rg 'resolution\.converged|!!res\.converged' plugins/mccp/scripts # briefing residual 제거 확인(헬퍼/주석만)
# 전체 회귀(pre-existing 실패 2건 제외 baseline — verdict-label · design-critique-loop-e2e fixture)
node --test $(ls plugins/mccp/scripts/lib/renderer/tests/*.test.js)  # 666/667 불변
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 1 subject-tamper 승격이 정상 stale-regenerate 흐름을 깨뜨림 | LOW | 구현 전 `rg subject_hash`로 stale 의존 흐름 부재 확인(self-consistency = tamper 논증) + 정상 receipt 통과 회귀 |
| Task 2 다중 경로 추적이 대형 저장소에서 스캔 비용 증가 | LOW | oid당 경로 수집만 추가(cat-file blob 재호출 없음 — blob 1회 스캔 유지) · 실 저장소 스캔 시간 불변 확인 |
| Task 3 fixture가 실제로 파서 gap을 드러냄(현 실측과 상충) | LOW | 조건부 코드 수정 경로 명시 · gap이면 M1 verify.js 선례대로 구조화-우선 유지 |
| Task 4 briefing 교체가 briefing hang(별도 결함)과 얽힘 | LOW | 순수 read 값 교체(1줄) — hang은 spawn/timeout 축(별도 cycle), 교체는 stamp 내용만 · `MCCP_BRIEFING=off`로 test 격리 |
| 4 Task를 한 PR에 묶어 cross-gate dedupe diff⊆Files 위반 | LOW | Files to Change에 실제 변경 파일 전부 full 경로로 열거(§1.2 dedupe planned matcher 계약) |

## Acceptance (M2)
- [ ] Task 1: subject_hash mismatch가 `blocking`(subject-tamper)으로 분류 + preflight가 regenerate 아닌 INTEGRITY 힌트, valid-schema-but-altered receipt 회귀 통과. 정상 receipt 불변.
- [ ] Task 2: 같은 blob의 non-allowlisted 경로 leak이 fixture 경로 우선 보고 시에도 검출, 단일 allowlisted 경로 억제 회귀 0. 실 저장소 스캔 신규 leak 0.
- [ ] Task 3: 실-producer envelope fixture → `source:structured`, malformed → `unavailable` fail-closed, 기존 케이스 green. (코드 수정은 fixture가 gap 드러낼 때만.)
- [ ] Task 4: divergent ship → briefing "converged: false", `rg` residual 0(헬퍼/주석만). M1 Task 1b sweep 완결.
- [ ] `node --test` 회귀 0(신규 회귀 + M1 79/79 불변 + renderer 666/667 pre-existing 1). evidence-audit corpus 불변(incomplete/9/9/0/9/19).
- [ ] plugin.json patch bump(1.22.5→1.22.6) + renderer footer 동기 + CLAUDE.md/CHANGELOG/backlog(3행 ABSORBED, row 보존) + M1 plan Delivery Milestones M2 in-progress 동기.
- [ ] M3 backlog 행 보존, Delivery Milestones 표 정확(M1 complete, M2 in-progress→완료 시 complete, M3 pending).
- [ ] Patterns mirrored, not reinvented(receipt-tamper 블록 · isAllowlisted per-path · isConvergedVerdict 헬퍼 · 실-producer fixture 선례).

## Codex Adversarial Review

<!-- Plan-Codex gate recovered via v1.3.1 informational allow-path (missing-only
     mccp-plan-codex receipt auto-written at /mccp:prp-implement Phase 0.0). The
     real adversarial teeth for this cycle live at the Implement-Codex gate below
     and the downstream /mccp:pr PR-Codex gate. -->

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (Codex unavailable — companion exit-nonzero, ~20s crash, stdout empty)
- 합치 결론: Codex unavailable → advisory mode (`MCCP_ALLOW_CODEX_UNAVAILABLE=1`). non-approving receipt (`resolution.codex_verdict='unavailable'`). Downstream `/mccp:pr`는 이 advisory receipt를 non-approving으로 처리 → PR-Codex 별도 발화(dual-review 보존, this-cycle 약화). M1 #110 선례와 동일.
- YAGNI Triage: n/a (Codex 미발화)
- Open Questions: none
- Codex session 참조: n/a

> Codex unavailable, skipped (auto-fallback): exit-nonzero

### Security Reviewer

security-reviewer agent (Task tool)가 security-sensitive 두 축을 독립 검토 — Codex 부재를 부분 보완:

| Proposal | Verdict | Severity(수정 대상 버그) |
|---|---|---|
| Task 2 history-leak-scan per-path allowlist | SOUND — 다중경로 leak 억제 취약점 실제 수정, current catch의 strict superset (회귀 0), path-ordering bypass 불가, allowlist는 path-EXACT 유지 | CRITICAL |
| Task 1 subject_hash → subject-tamper 재분류 | SOUND — `subjectHash`가 SUBJECT_FIELDS self-consistency seal 확인(hash.js), regenerate-driven evidence destruction 방지, legitimate regenerate 흐름 부재 | HIGH |

- 두 제안 모두 CRITICAL/HIGH **결함 없음**(제안이 *도입*하는 취약점 0) → MCCP-GATE-STOP 미해당. "Ship both" 권고.
- 구현 중 실측 정정(리뷰어도 미검증했던 축): 플랜 Task 2가 가정한 `git rev-list --objects` 다중경로 방출은 **거짓**(oid당 first-path 1행만, 실측 count=1). 올바른 전 경로 열거는 range 커밋들의 `git ls-tree -r`로 수행(플랜 Action이 명시한 대안 "blob 스캔 후 경로별 판정"). 상세는 구현 리포트 Deviations.

### Design Review

> impeccable silent-skip (reason=no-signal): 본 M2는 rendered surface 없음(backend logic only). SKILL_AVAIL=1 · SIGNAL=0 → critique loop 미실행.
