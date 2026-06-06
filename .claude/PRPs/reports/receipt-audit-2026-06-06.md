# Receipt Audit Report (2026-06-06)

**Context**: roadmap thin-index transform (Milestone 0 finalization) — chain integrity 3 신호 검증 + receipt namespace 현황 + 복구 옵션 명시.
**Trigger**: `/mccp:plan .claude/plans/mccp-roadmap.plan.md` Phase 1 ANALYZE (이전 세션 진단 검증).

## Background

`.claude/receipts/`는 [CLAUDE.md §4](../../CLAUDE.md) per `working-tree only — 각 사용자가 직접 실행` 정책에 의해 gitignored. 따라서 receipt 점거/부재는 "삭제" 사건이 아니라 "현 worktree 발행/미발행" 상태 기록.

## 3-Signal Verification (이전 세션 진단)

| Signal | Claim | Verified |
|---|---|---|
| 1. plan_hash drift | receipt `4b3d49d6…` ≠ current plan `7fdd6aab…` | ✅ CONFIRMED — Phase 1에서 SHA-256 직접 검증. 2026-06-06 thin-index transform 후 추가 drift: 현재 `b31a5204d48f94c683c7a2248727cd677a2df379d097371b3c8cd76561e5493d` |
| 2. receipt namespace collision (`mccp-implement-codex/mccp-roadmap.json` overlay) | v0.2.7 silent-hook receipt 점거 (security_skipped=true, impeccable_skipped=true, branch=feat/v0.2.7-silent-hook-ux) | ⚠️ PARTIALLY CONFIRMED — 해당 파일은 **부재**. 단 `mccp-implement-codex/{default,main}.json`은 v0.1 era 잔재 (2026-06-03, branch=main, security_skipped=false, impeccable_skipped=false). 점거 자체는 사실, 점거 *내용*은 claim과 다름. |
| 3. plan scope 91KB | 단일 implement 불가 | ✅ CONFIRMED — 91180 bytes, 5+1 milestones. 본 thin-index transform 후 15697 bytes (83% 감축). |

## Receipt Inventory (worktree state)

### `mccp-plan-codex/`

| File | plan_hash | branch | round | meta.security_skipped | meta.impeccable_skipped | Status |
|---|---|---|---|---|---|---|
| `mccp-roadmap.json` | `sha256:4b3d49d6…` | main | 1 | false | false | **STALE** — current plan_hash `b31a5204…` |
| `default.json` | (v0.2.6 schema migrated) | — | — | — | — | v0.1 era 잔재 |
| `main.json` | (v0.2.6 schema migrated) | — | — | — | — | v0.1 era 잔재 |
| `mccp.json` | (v0.2.6 schema migrated) | — | — | — | — | v0.1 era 잔재 |
| `s10a.json` / `s10a-state-md-continuity.json` | (v0.2.6 schema migrated) | — | — | — | — | S10a 시점 receipt |
| `v0-2-4-phase-7-2-5-restore.json` | (v0.2.6 schema migrated) | — | — | — | — | v0.2.4 cycle receipt |
| `default.v0.2.3-schema.bak.json` | — | — | — | — | — | INC-001 cycle pre-migration backup |

### `mccp-implement-codex/`

| File | plan_hash | branch | round | meta.security_skipped | meta.impeccable_skipped | created_at |
|---|---|---|---|---|---|---|
| `default.json` | `sha256:101891841a…` | main | 1 | false | false | 2026-06-03T15:25:14Z |
| `main.json` | `sha256:8c5984efaa…` | main | 2 | false | false | 2026-06-03T20:19:33Z |
| ~~`mccp-roadmap.json`~~ | — | — | — | — | — | **부재** (Milestone 1 report 주장하지만 현 worktree에 없음) |

### `mccp-pr-codex/`

부재. v0.2.5/0.2.6/0.2.7 cycle 모두 PR 발행 단계 미진입 (v0.2.7은 code-complete, PR pending).

## Findings

### F-RA-1 (HIGH / blocking-for-PR — reclassified per Codex R1) — `mccp-implement-codex/{default,main}.json` namespace 점거

**Initial classification was `informational` based on the argument that v0.2.6 decision-slug derivation from plan-path naturally avoids generic slugs. Codex R1 (2026-06-06) correctly invalidated this argument**: terminal branch-based commands (`/mccp:pr` 특히) derive decision_id from current **branch name**, not plan path. On `main` branch this resolves to `decision_id=main`, which then validates against `mccp-implement-codex/main.json` — a v0.1-era receipt with `plan_hash=8c5984efaa…` (unrelated to current plan). The hook validation path does NOT pass a plan path for hash comparison, so the chain check returns false-green.

**Symptom**: generic `decision_id=default`/`main` slug가 v0.1 era receipt로 점유 + branch-derived 명령이 그 receipt를 chain 결과로 oring.

**Impact (Codex R1 F1)**: PR gate can be satisfied by old, unrelated audit records. operators who follow the "do not delete" guidance get a false sense of chain integrity.

**Why not delete (original argument, partially valid)**:
1. Receipts는 append-only audit trail. 삭제는 chain-of-custody 손실.
2. Receipts gitignored → 삭제해도 git history 보존되지 않음.
3. plan-path 기반 명령은 새 decision-slug derive → 자연 회피 (단, 본 finding이 invalidate).

**Required mitigation (before next `/mccp:pr` on `main`)**:

1. **Working-tree quarantine** (immediate, per-workstation): rename `mccp-implement-codex/{default,main}.json` → `*.legacy.json`. 이 파일들은 gitignored이므로 rename은 user trigger만 affect.
   ```bash
   # 본 receipt들은 v0.1 era 잔재이며 현재 plan/chain과 무관
   for f in default main; do
     if [ -f ".claude/receipts/mccp-implement-codex/${f}.json" ]; then
       mv ".claude/receipts/mccp-implement-codex/${f}.json" ".claude/receipts/mccp-implement-codex/${f}.legacy.json"
     fi
     if [ -f ".claude/receipts/mccp-plan-codex/${f}.json" ]; then
       mv ".claude/receipts/mccp-plan-codex/${f}.json" ".claude/receipts/mccp-plan-codex/${f}.legacy.json"
     fi
   done
   ```

2. **v0.2.8 (Milestone 2.6) mechanical fix**: [v0-2-8-pr-workflow-hardening.plan.md](../../plans/v0-2-8-pr-workflow-hardening.plan.md)에 새 Task 2.6.5 추가 — validate-cmd가 generic decision_id receipt(`default`/`main`)를 **plan_hash mismatch 시 reject** (그 외에는 통과). 또는 `/mccp:pr` decision-slug derive를 branch-only에서 branch+plan-fingerprint composite로 변경.

3. **Test required**: `/mccp:pr` on `main` branch에서 stale `mccp-implement-codex/main.json`이 chain validate에 oring되지 않음을 fixture로 검증.

**Resolution path (post-mitigation)**: quarantine 적용 + v0.2.8 validate-cmd hardening + test fixture까지 모두 완료해야 본 finding을 resolved로 close.

### F-RA-2 (HIGH) — `mccp-plan-codex/mccp-roadmap.json` plan_hash drift

**Symptom**: receipt plan_hash `4b3d49d6…` ≠ current thin-index plan_hash `b31a5204…`. PLAN-CODEX 게이트 stale 상태. `validate --command mccp:prp-implement`는 exit 0 (receipt 존재만 확인), 그러나 plan_hash 일치 검사를 통과 못 함.

**Cause**: 2026-06-04 PLAN-CODEX R1+R2 converged 이후 plan 본문 다회 수정 (v0.2.6 INC-001 R1/R2/R4 absorption commits ab02a8a, d6bf878, e75afca + 본 thin-index transform).

**Resolution path**: 본 `/mccp:plan` 호출의 Phase 5 PLAN-CODEX gate가 새 receipt 발행 → plan_hash = `b31a5204…`로 동기화.

### F-RA-3 (MEDIUM) — `mccp-implement-codex/mccp-roadmap.json` 부재

**Symptom**: Milestone 1 implementation report (mccp-roadmap-milestone-1-report.md:97)가 `mccp-implement-codex/mccp-roadmap.json` 발행 (base=`e64a398`, head=`b2b0127`)을 주장. 현 worktree에 없음.

**Possible causes** (mechanical 검증 불가 — receipts gitignored):
1. 발행되었으나 후속 cycle에서 cleanup된 working tree.
2. Report가 aspirational (작업 의도를 기록했지만 실제 write 누락).
3. v0.2.6 schema migration이 receipts 디렉토리 cumulative migrate 시 누락.

**Resolution path**:
1. v0.2.7 PR 발행 시점 `/mccp:prp-implement` 또는 `/mccp:pr`이 cross-gate dedupe 적용해 PR-codex receipt에서 합치, 또는 implement-codex 재발행 trigger.
2. 또는 `node plugins/mccp/scripts/receipt/cli.js write --gate mccp-implement-codex --decision mccp-roadmap --plan .claude/plans/mccp-roadmap.plan.md` 수동 작성 (codex_dedupe 메타로).

## Plan Hash Lineage

**중요**: roadmap plan 본문은 hash 값을 **명시적으로 포함하지 않음**. 본 표는 audit-only lineage 기록이며, canonical hash는 **PLAN-CODEX receipt 자체**가 single source of truth (Codex R1 F2 absorption).

| Time | Event | Source of hash |
|---|---|---|
| 2026-06-04 | PLAN-CODEX R1 receipt 발행 | `mccp-plan-codex/mccp-roadmap.json:plan_hash` (시점-of-write) |
| (interim) | INC-001 R1/R2/R4 absorption commits (d6bf878, ab02a8a, e75afca) | git working-tree (no receipt update) |
| 2026-06-06 thin-index transform | plan 91KB → 15.x KB (F-Sec → v0.2.5 sub-plan, INC-001 audit summary 압축, R1 absorption notes → v0.2.5 sub-plan) | working-tree post-edit. final hash는 본 receipt-audit 작성 이후의 Phase 5 PLAN-CODEX 신 receipt가 기록 |

이 표는 시점별 *event*만 기록. 구체 hash 값을 인용하지 않는 이유는 (a) plan에 자기 hash를 포함하면 recursive paradox, (b) receipt가 single canonical source여야 audit trail이 깨끗.

## Recommendations

1. **Phase 5 PLAN-CODEX 재실행** — `/mccp:plan .claude/plans/mccp-roadmap.plan.md`의 Phase 5에서 새 receipt 발행. plan_hash drift 해소.
2. **v0.2.7 PR 발행 시 implement-codex 합치** — `/mccp:pr` cross-gate dedupe로 `mccp-implement-codex/mccp-roadmap.json` 부재 보완. v0.2.8 (Milestone 2.6) Task 2.6.1 dedupe 로직과 함께 작동.
3. **stale generic-decision receipt 격리 (MANDATORY before next `/mccp:pr` on `main`)** — `mccp-implement-codex/{default,main}.legacy.json`은 이미 `.legacy.json` 접미사로 격리됨. **그러나 `mccp-plan-codex/{default,main}.json`은 아직 active schema 명으로 남아 있어** branch=`main` 같은 generic decision-slug 호출 시 *unrelated v0.1 receipt가 chain을 false-green으로 충족*시킬 수 있음 (본 audit가 §INC-001에서 증명한 path). `/mccp:pr` on `main` 또는 generic-slug 호출 직전에 두 파일을 `.legacy.json`로 rename하거나 quarantine 디렉토리로 이동 필수. **이전 권장의 "decision-slug 분리로 자연 회피" 주장은 철회** — slug 분리는 *새 호출*만 보호하고 기존 generic-slug receipt가 chain에 잔존하면 보호되지 않음 (Codex PR-Codex Round 1 F-1, high confidence 0.9).
4. **validate-cmd generic-decision reject 강화는 v0.2.8 Task 2.6.5에서 mechanical 해결** — `decision_id ∈ {default, main}` AND (`plan_hash mismatch` OR `plan_path 불일치`) 시 validate-cmd가 즉시 reject. 이 변경이 ship되기 전까지 **권장 3 (수동 quarantine)이 사실상 유일한 보호선**임을 명심.
5. **schema migration discipline** — INC-001 R2 lesson 강화: 매 schema bump마다 `plugins/mccp/scripts/migrations/` script 동반. `default.v0.2.3-schema.bak.json` 같은 pre-migration backup 명명 컨벤션 유지.

## Validation Commands (hash-aware, per Codex R1 F2)

```bash
# Receipt chain status
node plugins/mccp/scripts/receipt/cli.js status --json

# PLAN-CODEX preflight WITH explicit decision + plan path (hash-aware)
# Important: bare `validate --command mccp:prp-implement` exits 0 without checking plan_hash → false-green.
# Always pass --decision + --plan for hash verification.
node plugins/mccp/scripts/receipt/cli.js validate \
  --command mccp:prp-implement \
  --decision mccp-roadmap \
  --plan .claude/plans/mccp-roadmap.plan.md

# Decision-slug derivation check (must differ from default/main for mccp-roadmap)
node plugins/mccp/scripts/receipt/cli.js derive-decision \
  --command mccp:plan \
  --args ".claude/plans/mccp-roadmap.plan.md"
```

**v0.2.8 mechanical fix recommended**: validate-cmd가 plan_hash mismatch 시 generic decision_id receipt를 reject하도록 강화. 현재는 `--plan` flag 없이 호출하면 hash 검증을 skip — false-green path. ([v0-2-8-pr-workflow-hardening.plan.md](../../plans/v0-2-8-pr-workflow-hardening.plan.md) Task 2.6.5 후속).

## Audit Trail

본 report는 `/mccp:plan .claude/plans/mccp-roadmap.plan.md` 호출의 Phase 1 ANALYZE에서 도출된 신호를 mechanical 검증한 결과. roadmap §INC-001 receipt namespace audit summary 섹션이 본 report로 위임됨.
