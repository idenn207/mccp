# Plan: Integrity Unification (무결성 통일 cycle) M1

**Source**: `.claude/plans/codex-findings-backlog.md` (deferred-findings 클러스터, reference mode)
**Selected Milestone**: M1 — durable corpus verdict-SoT + hash 무결성 core
**Complexity**: Medium (M1 scope; M2/M3 별도)

## Summary

이 저장소의 감사·필터·파서·술어 계열이 실제 producer 출력의 형태/부재와 어긋난 채 조용히 통과하는 결함이 backlog에 누적됐다(선례 이미 3건). 뿌리는 둘이다 — (1) 완료/승인 판정이 v1.20.3이 신뢰 불가로 판정한 `resolution.converged`를 아직 여러 소비처에서 읽고, (2) `receipt_hash` 무결성 검증이 write 경로(stage-guard)와 read 경로(audit)에서 비대칭이다. **M1**은 durable corpus를 지키는 tightly-coupled 3축(ledger 승인 술어 · stage-guard write-side · audit read-side)을 verdict SoT=`resolution.codex_verdict`, 무결성=`receiptHash` 재계산+schema validate로 통일하고, 각 수정을 실제 producer 출력 fixture로 회귀 고정한다. 나머지 독립 축은 M2(leak-scan·subject_hash·parser fixture), 최고위험 terminal-gate 재설계는 M3로 분리한다(Codex R1 F1/F5 흡수 — 아래 §Codex Adversarial Review).

**핵심 순서 불변식(이미 위반됨 — 그래서 시급)**: durable-evidence-substrate가 ship receipt를 git-tracked 내구층으로 승격(PR #110)했으나, completion-ledger 승인 술어는 여전히 `resolution.converged`를 1차 게이트로 본다. 즉 *거짓 승인이 durable corpus에 영구 기록되는 상태*가 이미 진행 중이다(CRITICAL 행이 예고한 "소실보다 나쁜 거짓 내구 증거"). M1 Task 1이 최우선인 이유다.

## Delivery Milestones

| Milestone | Scope | Status | Plan |
|---|---|---|---|
| **M1** | verdict-SoT + hash 무결성 core: ledger 승인 술어(+소비처 sweep) · stage-guard write-side · audit read-side · migration | **complete** | (this plan) |
| M2 | 독립 무결성 fixes: history-leak-scan path-precision(R5-F3) · subject_hash tamper 통일(2026-07-08) · parseReviewPayload 실-producer fixture(2026-07-22 MEDIUM) | pending | — |
| M3 | terminal `/mccp:pr` non-approving mechanical hard-stop 재설계(2026-07-21 HIGH) — bounded orchestration·re-entrancy·lock·crash-window·self-receipt 포함 semantics + absent-verdict fail-closed(Codex R1 F2) + 자체 version bump·acceptance gates | pending | — |

> M1/M2는 서로 다른 trust boundary라 롤백·호환성 위험이 분리된다(Codex R1 F5). M3는 이미 8라운드 비수렴 루프를 유발한 축이라 독립 재설계 단위로 격리한다(Codex R1 F1). M1은 M2/M3 없이 단독 ship 가능.

## Absorbed Findings (backlog → milestone 매핑)

| Backlog 행 | Severity | Milestone/Task | 상태(실측 재검증) |
|---|---|---|---|
| 2026-07-22 CRITICAL — ledger 술어가 `resolution.converged` 봄 | CRITICAL | M1 Task 1 | 부분 흡수(divergent/critical skip만) — 완전 술어·actionable·legacy 보존·소비처 sweep OPEN |
| 2026-07-23 HIGH R5-F1 — evidence-stage-guard schema/gate 무검증 | HIGH | M1 Task 2 | OPEN(`validateContent`가 hash만, schema/gate/slug 강제 없음) |
| 2026-07-23 HIGH R5-F2 — evidence-audit declared-hash만, `receiptHash` 재계산 안 함 | HIGH | M1 Task 3 | OPEN(`audit.js:200` declared 비교만) |
| 2026-07-23 MEDIUM R5-F3 — history-leak-scan allowlist blob당 1경로만 | MEDIUM | M2 | OPEN(`byOid` first-path만) |
| 2026-07-08 MEDIUM — subject_hash mismatch가 stale→regenerate로 tamper 증거 소실 | MEDIUM | M2 | OPEN(`validate-cmd:253` stale 분류) |
| 2026-07-22 MEDIUM — `parseReviewPayload` 정상 응답 미파싱 | MEDIUM | M2 | 이번 gate에서 실 producer envelope를 `source:structured`로 정상 파싱 확인 — M2는 회귀 fixture로 close |
| 2026-07-21 HIGH — terminal `/mccp:pr` non-approving mechanical hard-stop 부재 | HIGH | M3 | OPEN(validate-cmd audit-only) — 독립 재설계 |

> **명시적 제외**(무결성-verdict-SoT 계열 아님, 별도 cycle): briefing hang(2026-07-21 HIGH — PR-gate operability) · derive-decision fallback(2026-07-21 HIGH) · finalize-receipt `--deferred-findings` · STATE.md body roll · design-grounding H17 · fan-out debt marker residual · `--apply-fix-task` 유령 플래그 · pre-existing test 실패 2건.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| verdict SoT | `receipt/schema.js:120,138` | `resolution.converged`(boolean, always-true) vs `resolution.codex_verdict`(enum `CODEX_VERDICT_VALUES`, present-only) — 후자가 authoritative |
| 무결성 재계산 | `receipt/hash.js:198 receiptHash()` | deep-clone → `receipt_hash`/`briefing_*`/`ledger_write_skipped` carve-out → canonicalize → sha256. write/read 양경로가 **같은 함수** |
| verdict agree 매핑 | `evidence-audit.js:157 verdictsAgree` | converged↔converged / skipped↔skipped / advisory↔unavailable — ledger verdict가 receipt codex_verdict를 corroborate |
| stage-guard 검증 | `evidence-stage-guard.js:46 validateContent()` | pure(no I/O) → 단위 test. 위반 시 `{path, reason}` |
| schema validate | `validate-cmd.js:244` | `receipt/schema.validate(receipt).ok` — GATE_IDS·PHASES enum 강제 |
| 소비처 sweep | (this cycle) | `resolution.converged` 읽는 곳: dedupe(재검증)·escalate-detector:59·status.js:29·snapshot:128·decision-state.js(4곳)·audit-timeline.js:165·worktrees.js:228 |
| migration | `scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | idempotent · `--dry-run` · marker · read-only 진단 우선 |

## Files to Change (M1)

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/completion-ledger/index.js` | UPDATE | 술어 codex_verdict-first + NEW append 부재=fail-closed |
| `plugins/mccp/scripts/lib/completion-ledger/store.js` | UPDATE | entry에 `verdict_provenance`(legacy-unknown 보존 상태) 필드 |
| `plugins/mccp/scripts/lib/completion-ledger/tests/index.test.js` | UPDATE | 4-tuple + actionable=true + **cardinality 보존** 회귀 |
| `plugins/mccp/scripts/migrations/v1.22.x-ledger-verdict-repair.js` | CREATE | 기존 거짓양성 정정 + legacy/대조불가 **보존+표식**(drop 금지), idempotent, --dry-run |
| `plugins/mccp/scripts/lib/evidence-stage-guard.js` | UPDATE | schema.validate + gate_id·phase·slug 강제 |
| `plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js` | UPDATE | wrong-gate/schema-invalid/slug-mismatch 회귀 |
| `plugins/mccp/scripts/lib/evidence-audit.js` | UPDATE | `hash_bound` 집계 전 `receiptHash` 재계산 + schema validate |
| `plugins/mccp/scripts/lib/tests/evidence-audit.test.js` | UPDATE | body 변조(declared-hash stale-일치) → 미집계 회귀 |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE(조건부) | sweep에서 잔여 `.converged` 읽기 발견 시 codex_verdict 정합 |
| `plugins/mccp/scripts/lib/escalate-detector.js` | UPDATE | `r.converged===false` → codex_verdict-aware divergent 판정 |
| `plugins/mccp/scripts/receipt/status.js` · `lib/snapshot/index.js` · `lib/renderer/parsers/decision-state.js` · `lib/renderer/sections/audit-timeline.js` · `derive/sources/worktrees.js` | UPDATE | convergence 표시를 codex_verdict 반영(divergent ship을 "converged"로 오표시 금지, Codex R1 F4) + 각 divergent-receipt 회귀 test |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump(patch — main과 forward-only reconcile) |
| `CLAUDE.md` · `CHANGELOG.md` · `.claude/plans/codex-findings-backlog.md` | UPDATE | cycle 표 행 + 흡수 3행 ABSORBED 표식(row 보존) |

## Tasks (M1)

### Task 1: completion-ledger 승인 술어 codex_verdict-first + legacy 보존 (CRITICAL, Codex R1 F3 흡수)
- **Action**:
  1. `index.js:96` 1차 게이트 `resolution.converged !== true`를 codex_verdict-first로 교체 — **신규** append 조건 = `codex_verdict === 'converged'` ∧ `meta.codex_review_actionable_findings !== true` ∧ 비-advisory ∧ 비-skipped. `codex_verdict` 부재(신규 write에서) = fail-closed skip. `converged` 필드는 신뢰 키에서 은퇴.
  2. **기존 legacy 엔트리는 drop하지 않는다**(Codex R1 F3): codex_verdict 부재는 *비완료 증거가 아니라 schema-version 증거*다. migration이 기존 ledger를 재판정해 — verdict 불일치(거짓양성)는 `superseded`, 대조 가능하나 legacy(codex_verdict 없는 ship)·대조 불가(receipt gitignore-소실)는 `verdict_provenance:'legacy-unknown'`으로 **보존+표식**(original decision_id·receipt_hash 유지). idempotent + `--dry-run`.
  3. **소비처가 legacy-unknown을 완료로 보존**하도록 정합: `milestone-history`(타임라인)·`archive-complete`(status 근거)가 legacy-unknown 엔트리를 "완료·미검증"으로 계속 표시(누락 금지). corpus cardinality가 migration 전후 불변임을 test로 증명(Codex R1 F3 recommendation).
- **Mirror**: `schema.js:138` · `evidence-audit.js:157` · migration은 `v0.2.8-generic-receipt-quarantine.js`
- **Validate**: divergent/skipped/legacy-null 4-tuple + actionable=true가 신규 append 안 됨. migration `--dry-run`이 실측 거짓양성(예: `live-activation-m3-pr-codex-absorption` codex_verdict='divergent') 검출 + cardinality 불변 test.

### Task 1b: convergence-presentation 소비처 전부 codex_verdict 정합 (Codex R1 F4 흡수)
- **Action**: `resolution.converged`를 읽는 **모든** 소비처를 semantic으로 취급(display도 이연 안 함) — divergent ship을 "converged"로 표시하면 이 cycle이 막으려는 durable-corpus 오염을 관측 표면이 은폐한다. semantic(dedupe 재검증·escalate-detector:59)은 codex_verdict로 판정 정합, display(status:29·snapshot:128·decision-state 4곳·audit-timeline:165·worktrees:228)는 divergent를 "converged"로 렌더 안 하도록 codex_verdict 반영 또는 라벨 중립화. rg-based residual check로 미이전 잔여 0 확인.
- **Mirror**: `evidence-audit.js:143 receiptVerdict` (codex_verdict 우선 read helper 재사용)
- **Validate**: divergent receipt fixture → status/snapshot/renderer 어디에도 "converged" 라벨 미출력 회귀. `rg 'resolution\.converged|\.converged\b'`로 semantic 소비처 잔여 0.

### Task 2: evidence-stage-guard schema + gate 검증 (HIGH, R5-F1)
- **Action**: `validateContent(relPath, raw)`에 hash 재계산 통과 후 (a) `receipt/schema.validate(receipt).ok` (b) `gate_id==='mccp-pr-codex'` (c) `phase==='pr'` (d) 파일명 basename slug ↔ `receipt.decision_id` 일치 추가. 위반 시 `{path, reason}`(fail-closed). PURE 유지. R3/F1 tamper(hash 재계산) 보존.
- **Mirror**: `validate-cmd.js:244` schema validate · `evidence-stage-guard.js:46` 기존 구조
- **Validate**: wrong-gate(mccp-plan-codex)·schema-invalid·slug 불일치가 valid `receipt_hash`여도 HALT. 정상 pr-codex는 통과.

### Task 3: evidence-audit receiptHash 재계산 (HIGH, R5-F2)
- **Action**: `audit.js:200`의 `hash_bound` 집계를 `entry.receipt_hash === receipt.receipt_hash` 단순 비교 → ship receipt 읽을 때 `receiptHash(receipt)` 재계산 + schema validate 강화. 재계산 불일치/schema invalid는 `hash_bound` 미집계 + `inconsistent` 승격. declared==declared는 필요조건이되 충분조건 아님. (Task 2 write-side와 **대칭** — 같은 `receiptHash` 함수.)
- **Mirror**: `hash.js:198 receiptHash` · `audit.js:222 inconsistent` 사다리
- **Validate**: body 변조·`receipt_hash`만 stale(우연 일치) fixture → `hash_bound < comparable` → `inconsistent` + 비영점 exit. 정상 corpus 상태 불변.

## Validation (M1)

```bash
node --test plugins/mccp/scripts/lib/completion-ledger/tests/index.test.js
node --test plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js
node --test plugins/mccp/scripts/lib/tests/evidence-audit.test.js
node --test plugins/mccp/scripts/receipt/tests/
node --test                       # 전체(pre-existing 실패 2건 제외 baseline — 개별 명시)
node plugins/mccp/scripts/migrations/v1.22.x-ledger-verdict-repair.js --dry-run
node plugins/mccp/scripts/lib/evidence-audit.js --json   # 수정 후 상태 재확인
rg 'resolution\.converged' plugins/mccp/scripts   # semantic 소비처 잔여 0 확인
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 1 legacy fail-closed가 정상 historical 완료를 corpus에서 소실(Codex R1 F3) | MEDIUM | NEW append만 fail-closed. 기존은 `legacy-unknown` **보존+표식**(drop 금지) + cardinality 불변 test + 소비처가 legacy-unknown을 완료로 계속 표시 |
| display 소비처 미이전 시 divergent를 converged로 오표시(Codex R1 F4) | MEDIUM | Task 1b가 display 포함 전부 semantic 취급 + divergent-receipt 회귀 test + rg residual check |
| write-side(Task 2)/read-side(Task 3) hash 검증 out of sync(Codex R1 F5) | MEDIUM | 같은 `receiptHash` 함수 공유 + 두 Task 동일 M1에서 대칭 land + 양방향 회귀 |
| migration이 git-tracked ledger를 손상 | LOW | idempotent·`--dry-run` 우선·보존+표식(삭제 없음)·marker. `v0.2.8-quarantine` 선례 mirror |
| 소비처 sweep이 dedupe 실제 미이전을 발견해 scope 확장 | LOW | dedupe은 v1.20.3 이전 주장 — Task 1b가 실코드 재검증, 잔여 시 fail-closed 정합 |

## Acceptance (M1)
- [x] Task 1: ledger 술어 codex_verdict-first + migration이 legacy 보존(`legacy-unknown`) + cardinality 불변 test 통과. **(운영자 승인 deviation: skipped/unavailable append 유지 — §Codex Implementation Review D1. 실측 정정: 현 corpus false_positive=0이라 migration은 9 codex-verdict + 19 legacy-unknown + 0 superseded, superseded 경로는 fixture로 test — D2.)**
- [x] Task 1b: 모든 convergence-presentation 소비처(display 포함) codex_verdict 정합(공유 `receipt-convergence.js`), divergent-receipt 회귀 test, rg residual 0(주석만 잔존). 실측: divergent ship 3건이 status/derive에서 `converged=false`.
- [x] Task 2: stage-guard가 wrong-gate/schema-invalid/slug-mismatch를 valid-hash여도 HALT
- [x] Task 3: evidence-audit가 body 변조(declared-hash stale-일치)를 inconsistent로 봉인, Task 2와 hash 대칭. 실측 corpus 불변(hash_bound 9, state incomplete)
- [x] `node --test` 회귀 0(M1 79/79; renderer 666/667 — 남은 1건 verdict-label은 pre-existing으로 실측 확인). 실 evidence-audit 상태 문서화(incomplete/9/9/0/9/19)
- [x] plugin.json patch bump(1.22.4→1.22.5) + renderer footer 동기 + CLAUDE.md/CHANGELOG/backlog(3행 ABSORBED, row 보존) 동기
- [x] M2/M3 backlog 행 보존, Delivery Milestones 표 정확(M1 complete, M2/M3 pending)
- [x] Patterns mirrored, not reinvented(`receiptHash`·`verdictsAgree`·v0.2.8 migration 선례)

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope narrow)
- 라운드 수: 1 (cap=1 default — 아래 5건 모두 R1에서 plan 재구조화로 흡수, DIVERGENT_UNRESOLVED 없음 → 미escalate)
- 합치 결론: **No-ship(needs-attention/divergent)** — plan-v1이 loop-prone terminal hard-stop·lossy legacy corpus·deferred false status·18-file blast radius를 한 cycle에 섞음. plan-v2가 M1/M2/M3 분할 + Task 1 legacy 보존 + display 소비처 미이연으로 전부 재구조화 흡수.
- verdict SoT 파싱: `codex-review-payload.deriveGateVerdict` → `{verdict:'divergent', source:'structured', rawVerdict:'needs-attention'}` (실 producer envelope를 구조화로 정상 read — 2026-07-22 MEDIUM finding의 M2 verify를 부수 입증).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Task 5 번들 위험 | HIGH | ACCEPT_NOW | Task 5를 M1→**M3 분리**. "루프 조짐 시 분리"는 메커니즘 자체가 detector라 불충분 — 선제 격리 |
  | F2 terminal hard-stop이 absent verdict 통과 | HIGH | ACCEPT_NOW | M3 설계 제약으로 이관 — current terminal receipt의 absent codex_verdict는 fail-closed, historical만 예외 |
  | F3 legacy fail-closed가 historical 완료 소실 | HIGH | ACCEPT_NOW | Task 1 개정 — 기존 legacy는 `legacy-unknown` 보존+표식(drop 금지), NEW append만 fail-closed, cardinality 불변 test |
  | F4 display 소비처 이연이 divergent 은폐 | MEDIUM | ACCEPT_NOW | Task 1b가 display 포함 전부 semantic 취급 + 회귀 test + rg residual |
  | F5 7-task/18-file 과대 범위 | MEDIUM | ACCEPT_NOW | M1(verdict/hash core)·M2(독립 fixes)·M3(terminal 재설계) 분할 |
- Deferred to backlog: 0 (전건 ACCEPT_NOW, plan 재구조화로 흡수)
- Open Questions: 없음 (auto-CRITICAL 없음 — migration은 보존+표식·idempotent·dry-run, data-loss 아님)
- Codex 상태: durationMs=205420 (~3.4분), classification=ok, blocking=false
- Note(§3.12 dogfood): raw Codex verdict는 `divergent`(No-ship)였고 plan을 materially 개정했으나 개정본은 Codex 미검토다. "authoritative approve 없이 converged 봉인 금지" 원칙대로 receipt는 `codex_verdict='divergent'`로 정직 봉인 — cross-gate dedupe fail-closed → 후속 게이트가 개정본을 재검증한다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) — **timeout(570s), classification=timeout, blocking=true**. 이 환경의 Codex companion 무응답(알려진 operability 이슈).
- 진행 모드: **advisory** (`MCCP_ALLOW_CODEX_UNAVAILABLE=1`, 운영자 승인). non-approving implement receipt(`codex_verdict='unavailable'`). cross-model 적대 검토는 `/mccp:pr`(PR-Codex)로 이연 — plan-codex가 `divergent`라 cross-gate dedupe fail-closed → PR-Codex가 전체 diff를 재검토한다.
- 라운드 수: 0 (Codex 미발화)
- 합치 결론: N/A (advisory — Codex 미검토). implement-time 결정 6건(D1~D6)은 focus에 명시했으나 companion timeout으로 판정 미수신.

### 운영자 승인 deviation (plan 문자로부터)

- **D1 (Task 1 술어 — "완료 corpus")**: plan Validate는 "skipped 신규 append 안 됨"(converged-only)이나, 이는 dedupe happy-path(plan+implement 둘 다 `codex_verdict='converged'` → PR ship `codex_verdict='skipped'`)를 corpus에서 누락시키고 `evidence-audit#verdictsAgree(skipped↔skipped, advisory↔unavailable)` + migration의 skipped-보존과 모순된다. **운영자 확인**으로 `skipped→verdict'skipped'`·`unavailable→verdict'advisory'` append를 유지하고, `divergent`/`critical`/absent(fail-closed) + actionable-converged만 skip한다. `resolution.converged`는 신뢰 키에서 은퇴.
- **D2 (migration 실측 정정)**: plan Task 1 Validate의 "실측 거짓양성(예: `live-activation-m3-pr-codex-absorption` codex_verdict='divergent')" 예시는 부정확하다 — 그 divergent ship은 ledger에 **entry가 없다**(현 코드가 이미 divergent를 skip). 현 corpus는 `false_positive=0`. migration의 실효는 **19개 legacy-unknown 표식 + 9개 codex-verdict 표식 + superseded 0건**, cardinality 28 불변. `superseded` 경로는 방어적(fixture로만 test).

### Security Reviewer

> integrity/tamper-detection 하드닝(기존 control 확장) — 신규 auth/crypto/secret/injection 표면 없음. 코드 리뷰는 Phase 4 code-reviewer로 수행.
