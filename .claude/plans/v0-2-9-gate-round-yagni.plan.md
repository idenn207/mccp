# Plan: Gate Round Budget + YAGNI Triage (v0.2.9, Milestone 2.7)

**Source request**: user message 2026-06-08 `/mccp:plan` — "codex review를 그대로 수용하지 말고 yagni 판단 후 진행하라; 3-round 비용 + finding 누수로 메인 기능 진행 정체"
**Roadmap entry**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 2.7 (to be added by Task 6)
**Plugin version**: 0.2.8 → **0.2.9** (post-ship)
**Branch convention**: `feat/v0-2-9-gate-round-yagni` (mccp branch convention)
**Complexity**: Small (10 files: 8 UPDATE + 2 CREATE, no schema bump, no new helper, no new hook)

---

## Summary

mccp의 모든 게이트(plan/implement/pr)가 Codex adversarial review를 최대 3 round까지 무조건 escalate하는 정책을 **severity-gated cap (default 1)** + **YAGNI triage table** + **defer-to-backlog file**로 교체. R1 결과는 ACCEPT_NOW / DEFER_TO_BACKLOG / REJECT_YAGNI 3분류로 처리하며 R2는 ACCEPT_NOW × {CRITICAL, HIGH} 미해소 항목이 있을 때만 trigger. 미해소 미만의 모든 finding은 `.claude/plans/codex-findings-backlog.md`에 1줄 append되어 현 plan을 비대화시키지 않음. 신규 env `MCCP_GATE_ROUND_CAP=1|2|3` 도입(default 1). schema bump 없음 — `meta.deferred_findings_count`는 optional 필드.

---

## Problem (Why this exists)

| # | Pain | 현 동작 | 근본 원인 |
|---|---|---|---|
| P1 | Token/시간 폭발 | 3 게이트 × 최대 3 라운드 = cycle당 최대 **9 Codex 호출** (각 900s timeout). round 사이 plan body 재편집 토큰 추가. | [plan.md 5.4](../../plugins/mccp/commands/plan.md#L295-L297) / [prp-implement.md 2.5.4](../../plugins/mccp/commands/prp-implement.md#L150-L154) / [pr.md 2.5.4](../../plugins/mccp/commands/pr.md#L306-L322) 모두 severity 무관 cap=3 escalate. |
| P2 | YAGNI 누수 | 모든 Codex finding이 `## In scope`로 흡수 → followup cycle도 같은 plan의 미완 항목 처리. | 응답 contract에 **defer / reject** 단계 부재. accept-now만 존재. |
| P3 | 메인 기능 지연 | v0.2.5→v0.2.6→v0.2.7→v0.2.8 모두 gate hardening, v0.3.0 auto-handoff·v0.3.1 `/mccp:work` 미진행. | P2의 결과 + plan 분할 정책 부재. |

**해결 목표**: Codex 재활성화 후에도 cycle당 Codex 호출 **3회 이하 cap** + 모든 finding에 **명시적 YAGNI 판정** 강제 + defer 항목은 **단일 backlog 파일**.

> 본 plan 작성 시점에 `MCCP_CODEX_DISABLED=1`(영구 — `.claude/settings.local.json`)이므로 모든 게이트가 `verdict=skipped`. 효과의 즉시 측정은 불가능하나, mechanical validation(grep + unit test)으로 정책 적용은 검증 가능.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Phase cap policy 변형 | [plan.md:295-297](../../plugins/mccp/commands/plan.md#L295-L297) | 동일 위치 in-place edit. 신규 sub-step 신설 안 함. |
| Inject schema 변경 | [plan.md:282-293](../../plugins/mccp/commands/plan.md#L282-L293) — `수용한 제안 / 거부한 제안` 두 라인 | YAGNI 표로 두 라인을 승격. column: Finding / Severity / Verdict / Why. |
| Cross-gate dedupe deterministic | [pr.md 2.5.2](../../plugins/mccp/commands/pr.md#L207-L223) — `dedupe` subcommand JSON 파싱 | implement-codex에도 동일 패턴 적용 가능 (file-set 확장 조건). |
| Receipt CLI 옵션 추가 | [cli.js](../../plugins/mccp/scripts/receipt/cli.js) `write` — 기존 `--security-skipped`, `--codex-skipped` | `--deferred-findings <N>` 단일 정수 옵션. schema는 additive. |
| Test 위치 + 형식 | [plugins/mccp/scripts/lib/tests/codex-bridge.test.js](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js) | Node native runner. unit + boundary 케이스. |
| Env var naming | [CLAUDE.md §4 cheat sheet](../../CLAUDE.md) `MCCP_*` prefix | `MCCP_GATE_ROUND_CAP=1|2|3` (default 1). |
| Backlog as append-only | (없음 — 신규 도입) | 단일 markdown 파일 + 표 한 개. roadmap entry 폭발 방지. |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/plan.md` | UPDATE Phase 5.3 schema + 5.4 cap policy | R1 결과에 YAGNI 표 강제 + R2/R3는 HIGH/CRITICAL 미해소 시에만 escalate |
| `plugins/mccp/commands/prp-implement.md` | UPDATE Phase 2.5.4 + 2.5.1 dedupe 조건 확장 | 동일 정책 + dedupe 조건에 file-set inclusion 추가 |
| `plugins/mccp/commands/pr.md` | UPDATE Phase 2.5.4 schema + 2.5.3 env export | runner는 env inherit이라 helper 코드 변경 없음 |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE write subcommand | `--deferred-findings <N>` 옵션 (default 0) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE (additive, NO schema bump) | `meta.deferred_findings_count` optional integer field |
| `docs/gate-design.md` | UPDATE `### Divergent auto-rerun` 단락 | 새 정책 문서화 (severity gate + cap=1 default + backlog reference) |
| `CLAUDE.md` §1.3 + §4 cheat sheet | UPDATE | round 정책 한 단락 + `MCCP_GATE_ROUND_CAP` env var 등록 |
| `.claude/plans/codex-findings-backlog.md` | CREATE | append-only defer 기록. 헤더 + 표 schema만 (entries 0) |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE Status Snapshot + Active 표 | v0.2.9 Milestone 2.7 행 추가 |
| `plugins/mccp/scripts/lib/tests/round-budget.test.js` | CREATE | 3 boundary case unit test |

**총 10 파일**. **schema bump 없음** (forward-compat). **신규 helper / hook / lock 없음.**

---

## Tasks

### Task 1: Specify new round policy in `docs/gate-design.md`

- **Action**: `### Divergent auto-rerun` 단락(2개)을 다음으로 교체:
  ```
  Default round cap is 1 (controlled by MCCP_GATE_ROUND_CAP, allowed 1/2/3).
  After R1, Claude produces a YAGNI triage table classifying each finding as
  ACCEPT_NOW / DEFER_TO_BACKLOG / REJECT_YAGNI. R2 runs ONLY if ≥1 finding is
  classified ACCEPT_NOW with severity CRITICAL or HIGH AND the absorption was
  unable to fully address it (Claude self-attests in the plan body). R3 runs
  only if R2 returns a NEW CRITICAL/HIGH unresolved.

  All DEFER_TO_BACKLOG items are appended to .claude/plans/codex-findings-backlog.md
  with a one-line entry: YYYY-MM-DD | severity | source plan | one-line finding.
  REJECT_YAGNI items require a "Why YAGNI" sentence in the table.
  ```
- **Mirror**: 같은 단락의 `### Codex auto-fallback`의 명령형 톤
- **Validate**: `grep -n "MCCP_GATE_ROUND_CAP" docs/gate-design.md` → 1 hit

### Task 2: Update `plan.md` Phase 5.3 schema + 5.4 cap policy

- **Action**: 두 곳 in-place edit:
  1. **Phase 5.3 inject schema**의 `수용한 제안: <bullet list>` + `거부한 제안 + 근거: <bullet list>` 두 라인을 다음 표로 교체:
     ```markdown
     - YAGNI Triage:
       | Finding | Severity | Verdict | Why |
       |---|---|---|---|
       | F1 | CRITICAL | ACCEPT_NOW | <one-line> |
       | F2 | HIGH | DEFER_TO_BACKLOG | <one-line> |
       | F3 | LOW | REJECT_YAGNI | <one-line, "not needed because…"> |
     - Deferred to backlog: <count> → `.claude/plans/codex-findings-backlog.md`
     ```
  2. **Phase 5.4 본문**을 다음으로 교체:
     ```
     ### 5.4 — Severity-gated re-rerun (default cap=1)
     After R1's YAGNI triage table is written, escalate ONLY if BOTH:
       (a) ≥1 finding is verdict=ACCEPT_NOW AND severity ∈ {CRITICAL, HIGH}
       (b) The R1 absorption could not fully resolve it (Claude self-attests in plan body)
     If escalate triggers, run R2 with focus restricted to the unresolved item(s).
     Repeat up to MCCP_GATE_ROUND_CAP (default 1, allowed 1/2/3). Beyond the cap,
     annotate as DIVERGENT_UNRESOLVED and proceed.

     If no ACCEPT_NOW HIGH/CRITICAL remains, stop at R1.

     All DEFER_TO_BACKLOG items: append a line to .claude/plans/codex-findings-backlog.md
     before Phase 5.5. Format:
       - YYYY-MM-DD | <severity> | <source plan path> | <one-line finding>
     ```
- **Mirror**: 기존 Phase 5.5 auto-CRITICAL 단락의 명령형 + 명령어 인용 톤
- **Validate**: `grep -c "MCCP_GATE_ROUND_CAP" plugins/mccp/commands/plan.md` ≥ 1

### Task 3: Apply Task 2 delta to `prp-implement.md` Phase 2.5.4 + 2.5.1 dedupe 강화

- **Action**:
  1. Phase 2.5.4를 Task 2.4 본문 동일 패턴으로 교체 (gate ID `mccp-implement-codex`).
  2. Phase 2.5.1 dedupe 조건 강화:
     ```
     기존: "the same architectural decisions … AND no new decision was introduced"
     변경: "the same architectural decisions … AND no new decision was introduced
            AND git diff --name-only origin/<base>..HEAD ⊆ plan's Files to Change list
            (no implement-time file expansion)"
     ```
- **Mirror**: Task 2 코드 블록 + [pr.md 2.5.2 deterministic dedupe](../../plugins/mccp/commands/pr.md#L207-L223)
- **Validate**: `grep -c "MCCP_GATE_ROUND_CAP" plugins/mccp/commands/prp-implement.md` ≥ 1

### Task 4: Apply Task 2 delta to `pr.md` Phase 2.5.4 + 2.5.3 env export

- **Action**:
  1. Phase 2.5.4 schema도 YAGNI 표로 교체 (Task 2와 동일).
  2. Phase 2.5.3의 `codex-runner.js` 호출 직전에 env export 한 줄 추가:
     ```bash
     export MCCP_GATE_ROUND_CAP="${MCCP_GATE_ROUND_CAP:-1}"
     ```
     `codex-runner.js`는 child process 호출 시 env inherit하므로 코드 변경 없음.
- **Mirror**: 기존 `CODEX_DEDUPE_AT_PR` export 패턴 ([pr.md 2.5.2](../../plugins/mccp/commands/pr.md#L207-L223))
- **Validate**: `grep "MCCP_GATE_ROUND_CAP" plugins/mccp/commands/pr.md` ≥ 1

### Task 5: Receipt CLI `--deferred-findings` 옵션

- **Action**:
  - `cli.js` write의 argv 파싱에 `--deferred-findings <N>` 추가. integer, default 0.
  - `schema.js`의 `meta` shape에 `deferred_findings_count: { type: 'integer', minimum: 0, default: 0 }` 추가. **`required`에 넣지 않음** (forward-compat).
- **Mirror**: 기존 `--codex-skipped` 플래그 처리 ([cli.js write argv parsing](../../plugins/mccp/scripts/receipt/cli.js))
- **Validate**:
  ```bash
  node plugins/mccp/scripts/receipt/cli.js write \
    --gate mccp-plan-codex --decision test-deferred --plan dummy.md \
    --deferred-findings 3 --quiet
  grep deferred_findings_count .claude/receipts/mccp-plan-codex/test-deferred.json
  ```

### Task 6: Backlog file + roadmap entry

- **Action**:
  - CREATE `.claude/plans/codex-findings-backlog.md`:
    ```markdown
    # Codex Findings Backlog (defer-to-later)

    Append-only log of Codex findings classified DEFER_TO_BACKLOG by YAGNI triage
    (v0.2.9+ gate policy — see docs/gate-design.md §Divergent auto-rerun).

    Reviewed quarterly OR when a new milestone consciously elects to absorb.

    | Date | Severity | Source plan | Finding |
    |---|---|---|---|
    ```
  - UPDATE `.claude/plans/mccp-roadmap.plan.md`:
    - Ship History → v0.2.9 행 추가 (ship 후 갱신)
    - Active/Pending Milestones 표:
      `| **Milestone 2.7** | v0.2.9 | Gate Round Budget + YAGNI Triage | (인라인 — 단일 패치) | ⏳ pending |`
    - §Patterns to Mirror 표에 1줄 추가 (YAGNI triage + backlog file)
- **Validate**: `grep -c "v0.2.9" .claude/plans/mccp-roadmap.plan.md` ≥ 2

### Task 7: `CLAUDE.md` §1.3 + §4 업데이트

- **Action**:
  - §1.3 "자동화 파이프라인" 끝에 한 단락:
    ```
    v0.2.9부터 각 게이트는 R1 default + YAGNI triage로 R2/R3 escalate 결정.
    DEFER_TO_BACKLOG 항목은 .claude/plans/codex-findings-backlog.md 단일 파일에 누적.
    cap override: MCCP_GATE_ROUND_CAP=1|2|3 (default 1).
    ```
  - §4 운영 토글 블록에 한 줄:
    ```
    MCCP_GATE_ROUND_CAP=1|2|3                # default: 1. R2/R3은 HIGH/CRITICAL 미해소 시에만 trigger.
    ```
- **Mirror**: 같은 블록의 다른 env var 형식
- **Validate**: `grep "MCCP_GATE_ROUND_CAP" CLAUDE.md` ≥ 1

### Task 8: Unit test — `round-budget.test.js`

- **Action**: CREATE `plugins/mccp/scripts/lib/tests/round-budget.test.js`. Node native runner. 3 케이스:
  1. **Default cap=1 + no HIGH/CRITICAL**: R1 결과에 ACCEPT_NOW HIGH/CRITICAL 없으면 R2 trigger 안 됨. (env unset)
  2. **Cap=1 + unresolved HIGH**: ACCEPT_NOW HIGH가 R1 absorb로 해결 안 됐다 표시되면 R2 trigger.
  3. **Cap=3 + persistent divergence**: `MCCP_GATE_ROUND_CAP=3` + R1·R2·R3 모두 HIGH 미해소 → R3에서 DIVERGENT_UNRESOLVED.
- **Mirror**: [tests/codex-bridge.test.js](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js) 파일 구조 + `node:test` import 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/round-budget.test.js` → 3/3 PASS

---

## Validation (entire plan)

```bash
# Spec-level grep guards
grep -c "MCCP_GATE_ROUND_CAP" plugins/mccp/commands/plan.md plugins/mccp/commands/prp-implement.md plugins/mccp/commands/pr.md  # each ≥ 1
grep -c "YAGNI Triage" plugins/mccp/commands/plan.md plugins/mccp/commands/prp-implement.md plugins/mccp/commands/pr.md          # each ≥ 1
grep -l "codex-findings-backlog" plugins/mccp/commands/*.md docs/gate-design.md CLAUDE.md                                        # ≥ 4 files
grep "MCCP_GATE_ROUND_CAP" CLAUDE.md                                                                                              # ≥ 1
test -f .claude/plans/codex-findings-backlog.md                                                                                   # exists

# Baseline regression
node --test plugins/mccp/scripts/**/tests/*.test.js

# New test
node --test plugins/mccp/scripts/lib/tests/round-budget.test.js

# Receipt schema forward-compat (existing receipts still validate)
node plugins/mccp/scripts/receipt/cli.js status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const bad=j.filter(r=>r.valid!==true);console.log("invalid:",bad.length);process.exit(bad.length===0?0:1)})'

# Roadmap entry
grep -c "v0.2.9" .claude/plans/mccp-roadmap.plan.md   # ≥ 2

# Receipt new flag round-trip
node plugins/mccp/scripts/receipt/cli.js write --gate mccp-plan-codex --decision test-deferred --plan dummy.md --deferred-findings 3 --quiet
grep '"deferred_findings_count": 3' .claude/receipts/mccp-plan-codex/test-deferred.json
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| YAGNI triage step 자체가 Claude 토큰 추가 | High (구조상 매 R1 발생) | Low | finding당 1줄. R2 회피 시 절감이 5-10배 더 큼. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| DEFER_TO_BACKLOG 파일이 graveyard화 | Medium | Low-Medium | `/mccp:trace` surface는 별도 cycle로 deferred (YAGNI). 파일 존재만으로 plan 비대화 차단 목적 충족. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Codex가 R1에서 ACCEPT_NOW CRITICAL을 영영 안 표시 → R2 절대 안 trigger → adversarial value 손실 | Low | High | (a) `MCCP_GATE_ROUND_CAP=3` override 가능. (b) plan.md 5.5 auto-CRITICAL catalog는 무관하게 작동 (CRITICAL Open Question은 무조건 STOP). |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 기존 plan의 "R1+R2 converged" 패턴이 새 schema와 충돌 | Low | Low | inject 텍스트 형식만 영향. 기존 receipt forward-compat. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 사용자가 매번 env var 토글 cognitive overhead | Low | Low | Default 1로 두면 끄는 행위만 필요. 평소 무의식. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Codex 영구 비활성화 상태 (`MCCP_CODEX_DISABLED=1`)이므로 정책 효과 즉시 검증 불가 | High | Low (정책 자체는 mechanical 검증 가능) | grep + unit test로 spec compliance 검증. round 효과는 Codex 재활성화 첫 cycle에서 자연 측정. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `prp-implement.md` 2.5.1 dedupe 강화로 implement-codex가 거의 항상 skip → implement-time decision 누락 review 위험 | Medium | Medium | file-set ⊆ plan이라는 조건 자체가 architectural decision 변경이 없다는 시그널. 진짜 새 결정은 file 추가/architecture 변경으로 자연 surface. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

---

## Acceptance

- [ ] 3 command body (plan/prp-implement/pr)가 `MCCP_GATE_ROUND_CAP` honor + YAGNI triage 표 inject — grep validate PASS
- [ ] `.claude/plans/codex-findings-backlog.md` 존재 + 헤더 형식 일치
- [ ] receipt CLI `--deferred-findings <N>` accept + receipt JSON에 `meta.deferred_findings_count` 기록
- [ ] schema BUMP 없이 forward-compat (기존 receipts validate 변화 없음, `status --json` 모두 valid)
- [ ] `gate-design.md` + `CLAUDE.md` 두 곳에 새 정책 문서화 (각 ≥ 1 hit on `MCCP_GATE_ROUND_CAP`)
- [ ] roadmap에 v0.2.9 Milestone 2.7 entry (`grep -c v0.2.9` ≥ 2)
- [ ] 신규 unit test 3/3 PASS + 기존 baseline 회귀 없음
- [ ] PR 본문에 `## Codex Adversarial Review` (skipped marker 허용 — 현재 Codex disabled)

---

## Out of scope (this cycle — YAGNI 자체 적용)

- ❌ schema bump (forward-compat additive 필드만)
- ❌ `MCCP_GATE_ROUND_CAP=0` (Codex 완전 off는 이미 `MCCP_CODEX_DISABLED`가 담당)
- ❌ backlog 파일 자동 surface (STATE.md inject / `/mccp:trace` 통합) — 효용 확인 후 별도 cycle
- ❌ severity 자동 분류기 — Codex 출력의 severity field 그대로 사용
- ❌ 신규 hook / lock / IPC
- ❌ codex-invoke.js / codex-runner.js 구조 변경 (env var 통과만)
- ❌ 기존 v0.2.8 followup deferred findings(F6 doc 등) backlog 파일 마이그레이션 (이미 ship 됨)
- ❌ backlog → 새 plan 변환 자동화

---

## Codex Adversarial Review

- **호출**: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.8/scripts/lib/codex-invoke.js adversarial-review --focus "v0.2.9 plan의 3 core decision (round cap default, backlog file 위치, dedupe expansion)" --timeout-ms 60000 --json` (Phase 5.2 fail-closed Bash wrapper)
- **결과**: classification `timeout` (60028ms), blocking=true, exit=12
- **라운드 수**: 0 (R1 호출 자체가 timeout으로 무응답 — adversarial value 0)
- **합치 결론**: `unavailable / auto-fallback`. Codex 토큰 cap 소진(사용자 memory `feedback-codex-permanent-bypass`)으로 companion이 응답 못 함. `MCCP_CODEX_DISABLED=1`은 codex-bridge.parseCodexResult()에서 체크되는 receipt-write layer 플래그라 wrapper layer는 spawn 시도. 사용자가 영구 bypass + `MCCP_RECEIPT_GATE_MODE=off`로 chain-of-custody 깨진 상태를 design feature로 명시 수용한 환경.
- **YAGNI Triage**: 적용 불가 (R1 응답 없음). 향후 Codex 재활성화 후 별도 plan-codex round로 검증 권고 — 본 plan은 receipt CLI / hook 표면 변경 없는 spec-level 변경이라 mechanical validation (grep + node --test)으로 spec compliance 검증 가능.
- **Open Questions**: 
  - **MEDIUM**: Codex 재활성화 시점의 R1 verification 필요. 본 plan의 핵심 가정 — "ACCEPT_NOW HIGH/CRITICAL만 R2 trigger"가 실 finding 분포에서 합리적인지 (R1 결과가 거의 항상 LOW/MEDIUM이면 R2가 영영 안 trigger되어 adversarial value 손실 risk). MCCP_GATE_ROUND_CAP=3 override path가 mitigation.
  - **MEDIUM (선재)**: `MCCP_CODEX_DISABLED` 영구화 상태에서 receipt chain integrity 자체가 advisory — 본 plan 변경의 효과는 Codex 복귀 시점에 처음 측정됨.
- **Codex session 참조**: 없음 (60s timeout 내 응답 미수신).

> **Self-review (Claude 독립 분석, Codex 부재 보완)**: 본 plan은 의도적으로 신규 helper/hook/lock/schema bump 없이 command body + doc + 1 test + 1 markdown file만 추가하는 spec-level 패치. R2 escalate 정책의 boundary case(persistent divergence)는 Task 8 unit test가 mechanical 검증. backlog 파일 graveyard 위험은 Risks 표에 명시 + Out of scope에서 surface 자동화 의도적 deferred. 가장 큰 미검증 가정은 "Codex R1 finding의 severity 분포가 ACCEPT_NOW HIGH/CRITICAL escalate를 적절히 trigger할 만큼 신뢰할 수 있는가" — Codex 재활성화 후 첫 cycle에서 실측 필요.

---

## Codex Implementation Review

- **상태**: `unavailable / auto-fallback` (`MCCP_CODEX_DISABLED=1` 영구 + `MCCP_RECEIPT_GATE_MODE=off` 영구 — `.claude/settings.local.json`)
- **호출**: skipped (정책 — 사용자 memory `feedback-codex-permanent-bypass`)
- **YAGNI Triage**: 적용 불가 (R0 호출 자체 미발생).
- **Cross-gate dedupe**: 본 plan의 architectural decision은 `## Codex Adversarial Review`에서 plan-codex 단계도 동일 사유로 skipped 상태. Implement-time 새 결정 없음 (file 추가 0, 신규 helper 0, 신규 hook 0 — Files to Change 표가 implement-time 확장 없음을 mechanical 보증).
- **Design review**: `Skill(impeccable)` signal 0 — git diff에 UI 표면 / `.claude/design/*.design.plan.md` 변경 0건. 자동 skip.
- **Security review**: 본 plan에 auth/crypto/secrets/input validation/SQL·cmd injection/SSRF/path traversal/priv-escalation 표면 없음. Task 5 receipt CLI 추가는 integer 옵션 1개 (`--deferred-findings <N>`)로 input은 schema-validated, attack surface 0. security-reviewer Task tool 호출 미해당.
- **Receipt**: `MCCP_RECEIPT_GATE_MODE=off` 영구로 receipt-write skipped (chain-of-custody broken은 design feature per memory). 향후 Codex 복귀 시 본 plan의 정책 자체가 다음 cycle부터 자동 적용.
