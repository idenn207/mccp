# Plan: mccp Roadmap — v0.2.5 onwards (single source of truth)

**Source PRD**: 통합 — 사용자 메시지(2026-06-04, `/mccp:plan` 호출) + 기존 산출물 합본
**Selected Milestone**: v0.2.5 (immediate next) + v0.2.6 / v0.3.0 / v0.3.1 / v0.3.2 (sequenced)
**Complexity**: Medium (roadmap consolidation) + 마일스톤별 Medium-Large
**Current plugin version**: 0.2.4 (shipped — [plugin.json](../../plugins/mccp/.claude-plugin/plugin.json))
**Branch decision**: 마일스톤마다 별도 feature branch. main 직접 push 금지.

> 본 plan은 `.claude/plans/`, `.claude/PRPs/plans/`, `.claude/PRPs/reports/`, `.claude/notes/`, user-level `MEMORY.md`에 흩어진 모든 진행 상황을 단일 roadmap으로 통합합니다. 본 plan 발효 후 기존 산출물은 Milestone 0 Task A에서 archive됩니다.

---

## Summary

mccp v0.2.4 (security-reviewer Skill→Task canonical contract 치환) main merge 완료. 다음 cycle은 **impeccable 디자인 검증 자동화**를 v0.2.5의 단일 focus로 좁히고, 그 뒤 housekeeping(v0.2.6) → **silent-hook UX(v0.2.7)** → S10b auto-handoff(v0.3.0) → S11 단일 entry(v0.3.1) → S12 escalate(v0.3.2)로 순차 진행. 각 마일스톤은 `plugin.json` version bump + main merge + 단일 PR을 단위로 한다.

v0.2.7은 2026-06-05 사용자 incident(`MCCP_RECEIPT_DEBUG=1` 로그 침묵)에서 도출된 ALLOW-path observability cycle. Claude(저) + Claude subagent + Codex GPT-5.4 3-source brainstorm → santa-loop 3-round adversarial review(R1 v1 → R2 v2 → R3 v3-minimal) converged to *observability + recovery hint system* — **no trust claim, no machine-enforced attestation**. R3 critical findings(C1-C8)이 MUST constraint로 고정됨.

---

## Status Snapshot (2026-06-04 기준)

### ✅ Shipped (이번 roadmap 이전)

| Version | Shipped | Scope | Receipt chain |
|---|---|---|---|
| v0.1 | 2026-06-02 | ECC fork + Phase 게이트 + receipt 인프라 + 49 agents + 47 skills | mccp-plan-codex / mccp-implement-codex / mccp-pr-codex |
| v0.2.1 | 2026-06-04 (Q5) | Q5 patch | — |
| v0.2.2 | 2026-06-04 (commit 9106922) | Codex `Skill` → fail-closed Bash wrapper, auto-chain, receipt SOFT/HARD/OFF | `codex-invoke.js` + `MCCP_RECEIPT_GATE_MODE` |
| v0.2.3 | 2026-06-04 (PR #1-#3 main merge) | DEP0190 회피 + `/mccp:setup` bootstrap + `MCCP_CODEX_DISABLED` toggle + STATE.md `dep_check_*` schema + pr-body worktree fix | `dep-check.js` + `settings-writer` |
| v0.2.4 | 2026-06-04 (branch `feat/v0.2.4-security-reviewer-restore`) | 3개 command `Skill(security-reviewer, ...)` → canonical Task tool contract + `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audited escape + 4-axis state matrix invariants + 49 new tests | `security_skipped` + `security_force_override` meta |

### 🚧 Active artifacts to be archived in Milestone 0

| Path | Why archive | Destination |
|---|---|---|
| `.claude/PRPs/plans/s10a-state-md-continuity.plan.md` | S10a shipped (commit `9d79795` + follow-ups) | `.claude/PRPs/plans/completed/` |
| `.claude/plans/mccp-v0.2.plan.md` | v0.2 master plan superseded by 본 roadmap | `.claude/plans/archive/` |
| `.claude/plans/mccp-v0.2.2.plan.md` | v0.2.2 shipped | `.claude/plans/archive/` |
| `.claude/plans/mccp-setup-command.plan.md` | v0.2.3 shipped | `.claude/plans/archive/` |
| `.claude/plans/stop-hook-dep0190.plan.md` | v0.2.3 shipped | `.claude/plans/archive/` |
| `.claude/notes/mccp-v0.2-continuation.md` | continuation queue 폐기 — 본 roadmap이 단일 진입점 | `.claude/notes/archive/` |
| user-level `MEMORY.md` entries | 본 roadmap을 단일 entry point로 갱신 | (handled in Milestone 0 Task A.3) |

### 🚫 Out of scope — do not reference

- `~/.claude/hooks/impeccable-flag.ps1`
- `~/.claude/hooks/impeccable-guard.ps1`

이전 ECC 잔재 hook. v0.2.5 impeccable wiring은 **새로 설계** — plugin manifest hook + command 본문 inline only. 잔재 cleanup은 README에 안내만 추가하고 코드는 무시.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| `Skill(impeccable, ...)` unavailable fallback | [pr.md:120](../../plugins/mccp/commands/pr.md#L120) — `> impeccable unavailable, skipped (auto-fallback)` placeholder injection | Skill 호출이 `unknown_skill`/`not found` 반환 시 정상 통과 + audit note inject. 본 패턴을 7개 명령 본문에 표준화 |
| design surface 감지 | [pr.md:111](../../plugins/mccp/commands/pr.md#L111) 확장자 리스트 + `.claude/design/*.design.plan.md` | `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.astro`, `*.css`, `*.scss`, `*.module.css`, `*.html` + design plan paths |
| impeccable_skipped receipt meta (primary codex receipt) | v0.2.4 [security-skipped.test.js](../../plugins/mccp/scripts/receipt/tests/security-skipped.test.js) | `meta.impeccable_skipped` + `meta.impeccable_skip_reason` on primary codex receipt (별도 namespace 없음); plan/code-review = informational (warnings[]), implement/pr = blocking. 별개로 `plan-impeccable`/`implement-impeccable`/`pr-impeccable` 게이트는 impeccable이 실제 실행됐을 때 *결과* receipt로 활성화 — Codex R1 F1 absorption |
| Force override audit | v0.2.4 [security-force-override.test.js](../../plugins/mccp/scripts/receipt/tests/security-force-override.test.js) | `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` env + non-empty reason + PR body `## Impeccable Override` section auto-inject (canonical audit source) |
| Pre-flight dep detection | [dep-check.js:53-59](../../plugins/mccp/scripts/lib/dep-check.js#L53-L59) `checkImpeccableCli` + [session-start.js:693-704](../../plugins/mccp/scripts/hooks/session-start.js#L693-L704) 24h warning | 이미 PATH lookup + STATE.md `dep_check_missing` 인프라 존재 — 새 hook 작성 불필요. 본문에서 `dep-check.js` 재사용 |
| Phase sub-step naming | [plan.md:207 Phase 5](../../plugins/mccp/commands/plan.md#L207) | `Phase N.M — title (자동, /mccp:<cmd> 진입 시 MANDATORY)` 형식 |
| Regression grep guard | [security-reviewer-guard.test.js](../../plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js) | synthetic offender + safe-form 양방향 regex |
| Cross-gate dedupe (디자인 재호출 방지) | [code-review.md:151-162](../../plugins/mccp/commands/code-review.md#L151-L162) reuse-first | 같은 PR에서 `/mccp:pr`이 이미 `## Design Review` injection했으면 `/mccp:code-review`/`/mccp:review-pr`은 재호출 안 함 |
| Archive 디렉토리 컨벤션 | `.claude/PRPs/plans/completed/` 기존 사용 | 동일 컨벤션으로 `.claude/plans/archive/`, `.claude/notes/archive/` 추가 |
| Plugin version bump | v0.2.4 [plugin.json](../../plugins/mccp/.claude-plugin/plugin.json) `+1 / -1` | 각 마일스톤 PR 단위로 `plugin.json` + CLAUDE.md §4 cheat sheet 동시 갱신 |

---

## Files to Change (마일스톤 통합)

> 각 행의 **Milestone** 컬럼은 변경이 일어나는 cycle. 같은 파일이 여러 마일스톤에 걸쳐 변경될 수 있음 (예: `plugin.json`은 매 마일스톤마다 bump).

| File | Action | Milestone | Why |
|---|---|---|---|
| `.claude/plans/mccp-roadmap.plan.md` | CREATE | 0 (본 plan) | 단일 진입점 |
| `.claude/plans/archive/` | CREATE | 0 | 디렉토리 |
| `.claude/notes/archive/` | CREATE | 0 | 디렉토리 |
| `.claude/plans/{mccp-v0.2, mccp-v0.2.2, mccp-setup-command, stop-hook-dep0190}.plan.md` | MOVE → archive/ | 0 | 마감된 plan archive |
| `.claude/PRPs/plans/s10a-state-md-continuity.plan.md` | MOVE → completed/ | 0 | shipped plan archive |
| `.claude/notes/mccp-v0.2-continuation.md` | MOVE → archive/ | 0 | continuation queue 폐기 |
| `C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md` | UPDATE | 0 | 본 roadmap을 단일 entry로 prepend, 기존 항목은 archive 섹션으로 강등 |
| `plugins/mccp/commands/plan.md` | UPDATE | v0.2.5 | Phase 5에 `5.0 — impeccable design gate (sub-step)` 추가 |
| `plugins/mccp/commands/plan-prd.md` | UPDATE | v0.2.5 | Phase N에 impeccable design gate 추가 (PRD 단계 디자인 surface 정의 시) |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | v0.2.5 | Phase 2.5에 `2.5.X — impeccable design gate` 추가 |
| `plugins/mccp/commands/code-review.md` | UPDATE | v0.2.5 | Phase 2.5.2 reuse-first 호출 표준화 + non-blocking 분기 정리 |
| `plugins/mccp/commands/pr.md` | UPDATE | v0.2.5 | Phase 2.5.1 호출 표준화 + Phase 0 preflight에서 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape 처리 |
| `plugins/mccp/commands/prp-pr.md` | UPDATE | v0.2.5 | `/mccp:pr`의 verbatim alias 유지 + impeccable gate inheritance 명시 |
| `plugins/mccp/commands/review-pr.md` | UPDATE | v0.2.5 | `/mccp:code-review`의 verbatim alias 유지 + impeccable gate inheritance 명시 |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | v0.2.5 | `write --gate plan-impeccable|implement-impeccable|pr-impeccable` 활성화 + `--impeccable-skipped`/`--impeccable-skip-reason` 메타 forward (primary codex receipt에 기록 — Codex R1 Finding 1 absorption: design_* 새 namespace 폐기, 기존 *-impeccable gate ID 재사용) |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | v0.2.5 | impeccable receipt 부재 + `meta.impeccable_skipped=true`인 경우만 게이트 통과; strict 게이트(implement/pr)는 부재 자체를 blocking으로 처리, lenient(plan/code-review)는 warnings[] |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | v0.2.5 | `meta.impeccable_skipped`, `meta.impeccable_skip_reason`, `meta.impeccable_force_override`, `meta.impeccable_force_override_reason` forward (primary codex receipt 메타로만 기록; 별도 design_* 필드 추가 안 함) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | v0.2.5 | `meta.impeccable_*` 4필드 추가 + force_override 시 reason placeholder/길이 검증 (1-token, `1`, `yes`, `ok`, 영문 stop-word 등 → schema REJECT, **not warning** — Codex R1 Finding 4 absorption) |
| `plugins/mccp/scripts/receipt/tests/impeccable-skipped.test.js` | CREATE | v0.2.5 | strict/lenient gate split + impeccable receipt 부재 처리 + reason persist 검증 (security-skipped.test.js mirror, namespace만 impeccable_*로 교체) |
| `plugins/mccp/scripts/receipt/tests/impeccable-force-override.test.js` | CREATE | v0.2.5 | `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audit + **1-token/placeholder reason은 schema reject(=blocking)** + PR body audit inject |
| `plugins/mccp/scripts/receipt/tests/state-matrix.test.js` | UPDATE | v0.2.5 | v0.2.4 4-axis matrix에 impeccable 2-axis 추가 (총 6-axis, but **반쪽 namespace는 schema/CLI 추가 없이 \*-impeccable receipt 부재 + meta.impeccable_skipped로 표현**); invariant: same-namespace skipped+force_override 조합 reject, cross-namespace는 허용 |
| `plugins/mccp/scripts/receipt/tests/schema.test.js` | UPDATE | v0.2.5 | `valid()` helper baseline에 impeccable_* 4필드 추가 + force_override placeholder reject case |
| `plugins/mccp/scripts/lib/impeccable-detect.js` | CREATE | v0.2.5 | dep-check 결과 + design signal detection을 한 줄 boolean으로 노출하는 helper. CLI subcommand: `node impeccable-detect.js detect --base <ref>` |
| `plugins/mccp/scripts/lib/tests/impeccable-detect.test.js` | CREATE | v0.2.5 | dep-check + design signal 매트릭스 (8 combos) |
| `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` | CREATE | v0.2.5 | 7개 command 본문 grep regression guard (Skill 호출 표현 + fallback 분기 동시 존재 검증) |
| `plugins/mccp/scripts/lib/tests/impeccable-dogfood.test.js` | CREATE | v0.2.5 | fake Skill harness fixture로 invocation runtime contract dogfood |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | v0.2.5 | impeccable 미설치 시 warning 메시지에 "디자인 게이트는 informational fallback으로 동작" 안내 추가 (기존 24h-cadence 그대로) |
| `plugins/mccp/commands/setup.md` | UPDATE | v0.2.5 | Phase 1 detection 출력에 impeccable 상태 표시 + Phase 2 install offer에 impeccable 추가 (이미 dep-check 포함되어 있다면 noop) |
| `docs/gate-design.md` | UPDATE | v0.2.5 | 새 design 게이트 분기 + fallback matrix + `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` semantics |
| `docs/ENVIRONMENT.md` | UPDATE | v0.2.5 | `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` env 추가 |
| `CLAUDE.md` | UPDATE | v0.2.5 | §4 cheat sheet 운영 토글에 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` 추가 + §1.1 fork lineage에 impeccable wiring 명시 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | v0.2.5 | 0.2.4 → 0.2.5 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | v0.2.6 | 0.2.5 → 0.2.6 |
| `plugins/mccp/scripts/receipt/cli.js` (decision-slug) | UPDATE | v0.2.6 | `derive-decision`을 plan-path 기준으로 통일 (Option Y, Codex 권고) |
| `plugins/mccp/scripts/receipt/tests/derive-decision.test.js` | UPDATE | v0.2.6 | plan-path 기반 slug fixture 추가 |
| `.gitattributes` | CREATE | v0.2.6 | CRLF noise cleanup (`* text=auto eol=lf` + `*.ps1 eol=crlf` 등) |
| `README.md` | UPDATE | v0.2.6 | impeccable wiring 사용자 안내 + ECC 잔재 hook cleanup checklist |
| `.gitignore` | UPDATE | v0.2.7 | `.claude/state/hook-trace/` ignore — FIRST commit of milestone (R3 Codex C2) |
| `plugins/mccp/scripts/lib/hook-trace.js` | CREATE | v0.2.7 | shard ledger writer + allowlist enforcer + corruption contract (C4, C6) |
| `plugins/mccp/scripts/lib/tests/hook-trace.test.js` | CREATE | v0.2.7 | shard write + allowlist + corruption + active-session lease + LRU evict matrix |
| `plugins/mccp/scripts/lib/tests/hook-trace-integration.test.js` | CREATE | v0.2.7 | `systemMessage` user-visibility integration test (C5) — gate for Task 2.5.4 |
| `plugins/mccp/scripts/hooks/post-tool-use-failure.js` | CREATE | v0.2.7 | Layer 2b — event-native PostToolUseFailure surface (no L1 dep) |
| `plugins/mccp/scripts/hooks/session-end-trace.js` | CREATE | v0.2.7 | Layer 5 — SessionEnd marker + compactor (active-session lease, C1, C3) |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | v0.2.7 | G1 patch: ALLOW path `systemMessage` emit when `MCCP_RECEIPT_DEBUG=1` (Layer 2a); v0.2.5 block-payload inline 무조건 보존 |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATE | v0.2.7 | G1 patch: module load + decision eval try/catch + shard write + `systemMessage` emit + return allow (C6 — live hook state = event payload only) |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | v0.2.7 | L2c external `claude --version` probe + `.claude/state/hook-caps.json` (provenance: binary_path + stderr, C8) + prior-session crash alerts (active-session lease guard, C3) |
| `plugins/mccp/commands/trace.md` | CREATE | v0.2.7 | `/mccp:trace` slash command (Layer 4) — reads shards + consolidated.jsonl |
| `plugins/mccp/commands/*.md` (all `/mccp:*`) | UPDATE | v0.2.7 | Phase 0 preamble 1줄: "If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`" |
| `docs/gate-design.md` | UPDATE | v0.2.7 | v0.2.7 surface architecture 섹션 + B1-B5 blind spots + `MCCP_RECEIPT_DEBUG` precedence table (C7) |
| `docs/ENVIRONMENT.md` | UPDATE | v0.2.7 | `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` entry |
| `CLAUDE.md` | UPDATE | v0.2.7 | §4 cheat sheet에 신규 env vars + `/mccp:trace` 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | v0.2.7 | 0.2.6 → 0.2.7 |
| `plugins/mccp/scripts/hooks/auto-handoff.js` | CREATE | v0.3.0 | $100 hard ceiling 자동 세션 spawn (S10b) |
| `plugins/mccp/scripts/hooks/breakpoint-detector.js` | CREATE | v0.3.0 | task fingerprint + cost threshold 결합 |
| `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` | CREATE | v0.3.0 | $50/$80/$100 threshold matrix |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | v0.3.0 | 0.2.6 → 0.3.0 |
| `plugins/mccp/commands/work.md` | CREATE | v0.3.1 | `/mccp:work` 단일 entry (PRD→plan→implement→PR 자동 chain) |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | CREATE | v0.3.1 | chain state machine |
| `plugins/mccp/scripts/lib/tests/work-orchestrator.test.js` | CREATE | v0.3.1 | chain state matrix |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | v0.3.1 | 0.3.0 → 0.3.1 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | v0.3.2 | dual-reviewer escalate trigger 통합 |
| `plugins/mccp/scripts/lib/escalate-detector.js` | CREATE | v0.3.2 | CRITICAL/divergent 자동 `Next: /santa-loop` 안내 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | v0.3.2 | 0.3.1 → 0.3.2 |

---

# Milestones

## Milestone 0 — Roadmap consolidation + Archive (zero version bump)

**Goal**: 본 roadmap plan 발효 + 기존 산출물 archive. plugin.json은 bump하지 않음 (메타 작업).

**Scope**:
- 본 plan을 `.claude/plans/mccp-roadmap.plan.md`에 작성 (Phase 4 완료 시).
- 기존 plan/note 파일을 archive 디렉토리로 이동.
- user-level `MEMORY.md`를 본 roadmap을 단일 entry로 prepend, 기존 v0.2.x cycle memory는 archive 섹션으로 강등.

### Task A.1: archive 디렉토리 생성

- **Action**: `.claude/plans/archive/`, `.claude/notes/archive/` 디렉토리 생성 (`.gitkeep` 포함).
- **Mirror**: `.claude/PRPs/plans/completed/` 기존 컨벤션.
- **Validate**: `ls .claude/plans/archive .claude/notes/archive` exit 0.

### Task A.2: 기존 plan/note 파일 이동

- **Action**: 다음 파일들을 `git mv`로 이동:
  - `.claude/plans/{mccp-v0.2, mccp-v0.2.2, mccp-setup-command, stop-hook-dep0190}.plan.md` → `.claude/plans/archive/`
  - `.claude/PRPs/plans/s10a-state-md-continuity.plan.md` → `.claude/PRPs/plans/completed/`
  - `.claude/notes/mccp-v0.2-continuation.md` → `.claude/notes/archive/`
- **Mirror**: v0.2.4 plan archive 패턴 (이미 `.claude/PRPs/plans/completed/v0-2-4-phase-7-2-5-restore.plan.md` 존재).
- **Validate**:
  - `ls .claude/plans/*.plan.md` → `mccp-roadmap.plan.md`만 남음
  - `ls .claude/notes/*.md` → 0건 (디렉토리 빈 상태)
  - `git status -s` → 모든 이동이 R(rename) 또는 D+?? 로 추적됨

### Task A.3: MEMORY.md 갱신 (backup + append-only + rollback)

**Codex R1 Finding 5 absorption**: user-level MEMORY.md는 repo 밖이라 git rename history에 보호받지 못함. 파괴적 재구성을 PR body에 묶지 말고 단계별 안전망 + rollback path 명시.

- **Action**: 4단계 안전 마이그레이션:

  **Step 1 — Backup**:
  ```bash
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  cp "C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md" \
     "C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md.bak.${TS}"
  # SHA-256 checksum 기록
  node -e "const fs=require('fs'); const c=require('crypto'); const p='C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md'; const h=c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); console.log('PRE-MIGRATION SHA-256:', h);"
  ```
  Backup은 30일 보존. `.gitignore`에 `MEMORY.md.bak.*` 추가하여 백업이 실수로 commit되지 않도록.

  **Step 2 — Append-only roadmap pointer**:
  - 1번 줄에 `- [mccp Roadmap](mccp-roadmap.md) — **현재 단일 진입점**. v0.2.5+ 마일스톤 합본.` prepend.
  - 새 memory 파일 `mccp-roadmap.md`를 `metadata.type: project`로 작성 — 본 plan 경로 + 마일스톤 요약 + 다음 entry point만 짧게.
  - **이 단계까지는 destructive 작업 없음** — 기존 항목 모두 그대로 유지. 단순히 새 항목을 최상단에 prepend.

  **Step 3 — 별도 migration script로 demotion** (PR body 외부에서 실행):
  - 본 Milestone 0 PR에는 포함하지 않음. `.claude/scripts/migrations/memory-archive-2026-06-04.js` 스크립트로 분리.
  - dry-run 모드 (`--dry-run`) 우선 실행 → 어떤 항목이 어디로 이동되는지 stdout 출력.
  - 사용자 확인 후 `--apply` 실행 — 다음 항목만 `## Archive (historical reference)` 섹션으로 이동:
    - `mccp-v0.2.3-cycle`, `mccp-v0.2-continuation`, `mccp-v0.2-s9-dogfood`, `mccp-v0.2-plan-converged`, `mccp-bootstrap-progress`, `mccp-direction-decision`, `ecc-hook-malfunction-observation`, `ecc-autonomy-infra`
  - 보존: `feedback-cost-not-stop-signal` (feedback type, 여전히 유효)
  - migration script는 매 demotion 직후 **slug grep 검증** — 이동된 항목 슬러그가 사라지지 않고 archive 섹션에 정확히 한 번 등장하는지 확인.

  **Step 4 — Validation matrix**:
  ```bash
  # (a) 본 roadmap 진입점이 1번 줄
  head -1 MEMORY.md | grep -q "mccp-roadmap" || exit 1
  # (b) Archive 섹션 정확히 1개
  test "$(grep -c "^## Archive" MEMORY.md)" = "1" || exit 1
  # (c) 모든 슬러그 전수 검증 — pre-migration 시점에 캡처한 슬러그 목록이 모두 한 번씩 등장
  for slug in mccp-v0.2.3-cycle mccp-v0.2-continuation mccp-v0.2-s9-dogfood mccp-v0.2-plan-converged mccp-bootstrap-progress mccp-direction-decision ecc-hook-malfunction-observation ecc-autonomy-infra feedback-cost-not-stop-signal mccp-roadmap; do
    test "$(grep -c "\[\[$slug\]\]\|\($slug.md\)" MEMORY.md)" -ge "1" || { echo "MISSING: $slug"; exit 1; }
  done
  # (d) backup checksum이 pre-migration 파일과 일치
  node -e "..." # SHA-256 비교
  ```

  **Rollback path**:
  - 검증 실패 시: `mv MEMORY.md.bak.${TS} MEMORY.md` 원복.
  - 사용 후 backup 파일 정리는 30일 후 수동 — 자동 삭제 안 함.

- **Scope split**: Step 1+2만 Milestone 0 본 PR에 포함. Step 3 (demotion)은 Milestone 0 머지 후 별도 maintenance commit으로 분리 — Codex R1 Finding 5의 "본 PR과 분리" 권장 흡수.
- **Mirror**: CLAUDE.md auto-memory 섹션의 `## How to save memories` Step 2 ("Add a pointer in `MEMORY.md`").
- **Validate**: Step 4 matrix 4개 모두 pass.

### Task A.4: STATE.md fingerprint 갱신

- **Action**: `.claude/state/STATE.md` frontmatter `task_fingerprint`를 `s10a-done` → `roadmap-active`로 갱신. `## Next Step`을 "Milestone 1 (v0.2.5) — impeccable design-review automation 시작"으로 교체. **직접 편집 금지** — `state-writer.js` API 호출.
- **Mirror**: CLAUDE.md §3.2 직접 편집 금지 + state-writer.js API 사용 원칙.
- **Validate**: `node -e "require('./plugins/mccp/scripts/state/state-writer.js').read()"` → fingerprint=`roadmap-active`.

### Task A.5: 본 plan 자체를 commit + PR

- **Action**: `chore(roadmap): consolidate plans + archive v0.2.x cycle artifacts` 커밋. 본 plan은 Milestone 0의 결과물이므로 자기참조 receipt 없이 진행. `/mccp:prp-commit` + `/mccp:pr` 사용.
- **Note**: 본 plan 자체는 **`/mccp:plan` Phase 5 PLAN-CODEX GATE**를 통과해야 하므로 (Phase 5는 본 응답 끝에서 자동 invoke), 그 receipt가 곧 Milestone 0의 게이트 통과 증명.
- **Validate**: `node scripts/receipt/cli.js status --json --gate mccp-plan-codex` → 본 plan의 receipt가 converged 상태.

### Milestone 0 Acceptance

- [ ] `.claude/plans/`에 `mccp-roadmap.plan.md`만 남음
- [ ] `.claude/notes/`에 active note 0건
- [ ] `MEMORY.md` 1번 줄이 `mccp-roadmap` 진입점
- [ ] STATE.md fingerprint=`roadmap-active`
- [ ] Milestone 0 자체의 `mccp-plan-codex` receipt converged

---

## Milestone 1 — v0.2.5: Impeccable Design-Review Automation

**Goal**: 7개 명령(`/mccp:plan`, `/mccp:plan-prd`, `/mccp:prp-implement`, `/mccp:code-review`, `/mccp:pr`, `/mccp:prp-pr`, `/mccp:review-pr`)에 디자인 surface 감지 + `Skill(impeccable, ...)` 위임 + 미설치 분기를 통합한다. v0.2.4 security-reviewer 패턴을 mirror하되 **Skill index 존재 가정** 차이가 있음 (impeccable은 시스템에 등록된 skill, security-reviewer는 agent).

**Plugin version**: 0.2.4 → **0.2.5**

**Why now** (사용자 메시지):
> "web 디자인 관련된 수정이 있으면 impeccable 한테 위임해서 shape, polish, critique, audit, live 등을 통해서 디자인을 검증하는거야. 기존에는 hook을 사용했는데, 이번에는 어떻게 할지 모르겠어. 기존에 만들었던 hook의 잔재는 \"~/.claude/hooks/\" 경로에 있는데, 이걸 참고하지 말고 새로 만들어야될거야."

**Decision: hook vs command 본문**

| 옵션 | 장점 | 단점 | 선택 |
|---|---|---|---|
| (A) PreToolUse / PostToolUse hook | 명령 본문 변경 없이 횡단 enforcement | hook stderr noise + 이미 v0.2.2에서 hook 의존 줄이는 방향 | ❌ |
| (B) Command 본문 inline sub-step | v0.2.4 security-reviewer와 동일 패턴 + receipt CLI와 직접 연동 + dedupe 가능 | 7개 명령에 본문 wiring 필요 | ✅ |
| (C) Hybrid (`session-start.js` hook으로 dep-check + 명령 본문에서 호출) | 이미 dep-check.js + session-start.js가 detection을 하므로 재사용 | impeccable 호출 자체는 명령 본문에서 — 결국 (B)의 표면적 + (A)의 detection | ✅ (현재 인프라 그대로 + 본문 wiring) |

**최종 결론**: (C) Hybrid. impeccable 호출은 명령 본문 inline sub-step으로 wiring(Mirror v0.2.4 security-reviewer). pre-flight detection은 이미 존재하는 [dep-check.js](../../plugins/mccp/scripts/lib/dep-check.js) + [session-start.js](../../plugins/mccp/scripts/hooks/session-start.js) hook 재사용 — **새 hook 작성 안 함**. ECC 잔재 (`~/.claude/hooks/impeccable-flag.ps1`, `impeccable-guard.ps1`)는 참조 금지, README에 cleanup 안내만 추가.

### Scope: 7개 명령 × design signal × impeccable 가용성 매트릭스

| 명령 | Phase 위치 | impeccable 가용 | impeccable 미가용 | design signal 없음 |
|---|---|---|---|---|
| `/mccp:plan` | Phase 5.0 (5.1 전) | `Skill(impeccable, "critique <plan slug>")` → plan 본문에 `## Design Critique` inject + `plan-impeccable` receipt write | `> impeccable unavailable, skipped (auto-fallback)` inject + primary `mccp-plan-codex` receipt에 `meta.impeccable_skipped=true` | sub-step skip |
| `/mccp:plan-prd` | Phase N (artifact write 직후) | PRD에 `## Design Direction` 섹션 자동 inject (impeccable `shape` op) | `> impeccable unavailable, skipped` | skip |
| `/mccp:prp-implement` | Phase 2.5.6 (security 다음) | `Skill(impeccable, "audit <impl summary>")` → `## Design Review` inject + `implement-impeccable` receipt write | primary `mccp-implement-codex` receipt에 `meta.impeccable_skipped=true` + **blocking** (strict gate) | skip |
| `/mccp:code-review` | Phase 2.5.4 (security 다음) — reuse-first | PR body의 `## Design Review` 재사용 우선, 없을 때만 호출 | `> impeccable unavailable, skipped` + informational warning | skip |
| `/mccp:pr` | Phase 2.5.6 + Phase 4 inject | `Skill(impeccable, "critique <PR>")` + `audit` → PR body `## Design Review` | `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` reason 검증 없으면 **hard block** | skip |
| `/mccp:prp-pr` | alias of `/mccp:pr` (verbatim) | inherit | inherit | inherit |
| `/mccp:review-pr` | alias of `/mccp:code-review` (verbatim) | inherit | inherit | inherit |

### Tasks

#### Task 1.1: impeccable-detect helper

- **Action**: [scripts/lib/impeccable-detect.js](../../plugins/mccp/scripts/lib/impeccable-detect.js) 신규 작성. **Codex R1 Finding 2 absorption**: 가용성 판정의 primary dimension은 **Skill 시스템 등록 여부**, CLI PATH lookup은 telemetry-only. impeccable은 Claude Code Skill로 배포되므로 CLI 미존재해도 Skill 등록되어 있으면 호출 가능.
  ```bash
  node impeccable-detect.js detect --mode <prd|plan|implement|pr|review> --base <ref> --json
  # → {
  #     skill_available: bool,        ← PRIMARY (gates 분기 결정)
  #     cli_available: bool,          ← telemetry only (STATE.md dep_check 갱신용)
  #     design_signal: bool,
  #     signal_files: [...],
  #     mode: "<mode>",
  #     reason: string
  #   }
  ```
  - `skill_available` 판정 방법: Skill 등록 probe. plan/plan-prd/prp-implement/code-review/pr/prp-pr/review-pr이 본 helper를 호출한 결과로 `skill_available=false`이면, 본 호출 직후 Skill 호출 시 `unknown_skill`/`not found` 반환이 보장됨. probe 자체는 `process.env.CLAUDE_PLUGIN_REGISTRY` (있을 때) 또는 lazy lookup으로 구현 — 최소한의 negative cache.
  - `cli_available`은 [dep-check.js:checkImpeccableCli](../../plugins/mccp/scripts/lib/dep-check.js#L53) 그대로 재사용. STATE.md `dep_check_missing`에는 cli_available 결과를 반영.
- **Mirror**: [codex-invoke.js](../../plugins/mccp/scripts/lib/codex-invoke.js)의 `--json` flag + classification enum 패턴. impeccable enum: `{ok, skill-missing, no-signal, mode-mismatch}`.
- **Validate**:
  - `node impeccable-detect.js detect --mode plan --json` → JSON 출력
  - 8 combo unit test: (skill 가용/미가용) × (cli 가용/미가용) × (design signal 있음/없음). 특히 **skill-present + cli-missing** 케이스가 fallback에서 false-unavailable 안 나는지 검증 (R1 Finding 2 hot path)
  - mode별 detection 분기 test: prd/plan/implement/pr/review 각 mode의 signal 정의 검증

#### Task 1.2: receipt schema — impeccable_* 4 필드 추가 (primary codex receipt 메타)

- **Action** (Codex R1 F1 absorption): [schema.js](../../plugins/mccp/scripts/receipt/schema.js)에 **primary codex receipt(mccp-plan-codex/mccp-implement-codex/mccp-pr-codex)의 meta**로 `meta.impeccable_skipped`, `meta.impeccable_skip_reason`, `meta.impeccable_force_override`, `meta.impeccable_force_override_reason` 추가. 별도 design_* namespace는 생성하지 않음. v0.2.4 4-axis invariant 동일 적용: 같은 namespace 내 `impeccable_skipped=true` + `impeccable_force_override=true` 조합은 schema reject. F4 hardening 동시 적용: force_override=true일 때 reason이 empty/whitespace/1-token/`1`/`yes`/`ok`/30자 미만/placeholder 패턴이면 schema **REJECT** (warning 아님).
- **Mirror**: v0.2.4 schema.js의 `security_skipped`/`security_force_override` 블록 (reason validation은 v0.2.5에서 강화).
- **Validate**: schema test 4 신규 positive case + invariant reject case + reason placeholder reject case 7건.

#### Task 1.3: receipt CLI — impeccable flag forward + 기존 *-impeccable gate 활성화

- **Action** (Codex R1 F1 absorption): [cli.js](../../plugins/mccp/scripts/receipt/cli.js)와 [validate-cmd.js](../../plugins/mccp/scripts/receipt/validate-cmd.js):
  - `--impeccable-skipped`, `--impeccable-skip-reason`, `--impeccable-force-override`, `--impeccable-force-override-reason` flag forward → primary codex receipt의 meta 기록 (별도 receipt 안 만듦).
  - 별개로 `write --gate plan-impeccable|implement-impeccable|pr-impeccable` 활성화 — impeccable이 실제로 호출되어 결과가 나왔을 때 그 결과를 별도 receipt로 기록 (이미 receipt schema의 GATE_IDS에 declared되어 있던 항목). decision_id는 primary codex receipt와 동일 (cross-link key).
  - validate-cmd: `STRICT_IMPECCABLE_GATES = ['mccp-implement-codex', 'mccp-pr-codex']` — strict 게이트는 primary receipt에 `meta.impeccable_skipped=true`이고 force_override가 없으면 blocking. lenient(mccp-plan-codex, code-reviewer)는 warnings[]만.
  - `STRICT_DESIGN_GATES` constant 추가 **금지** — F1 absorption 일관성.
- **Mirror**: v0.2.4 STRICT_SECURITY_GATES 패턴 (namespace만 impeccable로 교체, schema 위치는 primary codex receipt 메타로 일원화).
- **Validate**: [impeccable-skipped.test.js](../../plugins/mccp/scripts/receipt/tests/impeccable-skipped.test.js) 7 test (strict/lenient split + dual-skipped + reason persist + 별도 *-impeccable receipt 작성/검증 동작).

#### Task 1.4: state matrix 확장 — security 4-axis + impeccable 2-axis 통합

- **Action** (Codex R1 F1 absorption): [state-matrix.test.js](../../plugins/mccp/scripts/receipt/tests/state-matrix.test.js)에 impeccable 2-axis 케이스 추가. **6-axis 표현은 schema에 별도 namespace를 만들지 않고, 동일 receipt 메타 안에서 security_*와 impeccable_* 4쌍을 독립 검증**하는 형태. security와 impeccable은 cross-namespace이므로 한쪽 skipped + 다른쪽 override는 허용, same-namespace 조합만 reject. design_* / cross-receipt namespace는 생성하지 않음.
- **Mirror**: v0.2.4 4-axis matrix (security only).
- **Validate**: 기존 10 test + 신규 impeccable 6 test (skipped/override/reason 3쌍 × pos+neg) + cross-namespace 통과 3 test = 19 pass.

#### Task 1.5: 7개 command 본문 wiring (mode-aware)

- **Action**: 각 명령에 inline sub-step 추가. **Codex R1 Finding 3 absorption**: 명령별로 design signal 정의가 다름. `/mccp:plan-prd`와 `/mccp:plan`은 git diff가 없는 상태에서 진입하므로 artifact content 기반 detection 필수.

  | 명령 | detection mode | signal source |
  |---|---|---|
  | `/mccp:plan-prd` | `prd` | PRD artifact 본문 keyword 매칭(`#design`, `## Design Direction`, `## Files to Change`의 UI 확장자 행) + 명시 design plan path 참조 |
  | `/mccp:plan` | `plan` | plan artifact의 `## Files to Change` 테이블 UI 확장자 + `.claude/design/*.design.plan.md` 참조 + plan 본문 design 키워드 |
  | `/mccp:prp-implement` | `implement` | git diff `--name-only` UI 확장자 + 변경된 `.claude/design/*.design.plan.md` |
  | `/mccp:pr`, `/mccp:prp-pr` | `pr` | `git diff origin/<base>..HEAD --name-only` UI 확장자 + design plan |
  | `/mccp:code-review`, `/mccp:review-pr` | `review` | PR body의 기존 `## Design Review` reuse first, 없으면 PR diff scan |

  호출 패턴 표준화:
  ```markdown
  ### Phase N.M — impeccable design gate (자동, /mccp:<cmd> 진입 시 MANDATORY)

  1. Run pre-flight detection (mode 명시):
     ```bash
     DETECT=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js detect \
       --mode <prd|plan|implement|pr|review> \
       --base <base> \
       --plan <plan-path-or-empty> \
       --json)
     SKILL_AVAIL=$(echo "$DETECT" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).skill_available?"1":"0")')
     SIGNAL=$(echo "$DETECT" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).design_signal?"1":"0")')
     ```
  2. Decision tree:
     | SKILL_AVAIL | SIGNAL | Action |
     |---|---|---|
     | 0 | * | record `> impeccable unavailable, skipped (auto-fallback)`; receipt에 `meta.impeccable_skipped=true` + `meta.impeccable_skip_reason="skill-missing"`. terminal `/mccp:pr`은 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` reason 명시(1-token + placeholder 거부) 없으면 exit 1. |
     | 1 | 0 | sub-step skip silently. **plan/plan-prd mode는 git diff 없어도 signal 가능 — artifact 기반이므로 `mode-mismatch`로 분류, 별도 receipt 안 씀** |
     | 1 | 1 | `Skill(impeccable, "critique/audit/shape <args>")` 호출 → 별도 `plan-impeccable` / `implement-impeccable` / `pr-impeccable` receipt write (Phase에 매핑된 gate ID). primary codex receipt와 cross-link |
  3. Skill 호출이 `unknown_skill`/`not found` 반환 시: SKILL_AVAIL=1이어도 fallback path로 분기 (negative cache 갱신).
  ```
- **Mirror**: v0.2.4 [pr.md Phase 2.5.5](../../plugins/mccp/commands/pr.md) security-reviewer Task tool invocation + `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` escape.
- **Validate**: 각 명령에 다음이 모두 grep으로 매칭되어야 함:
  - `grep -c "impeccable-detect.js detect --mode" plugins/mccp/commands/*.md` → 7 (alias 포함)
  - `grep -c "Skill(impeccable" plugins/mccp/commands/*.md` → ≥7
  - `grep -c "impeccable unavailable, skipped" plugins/mccp/commands/*.md` → 7
  - mode별 grep — 각 mode가 정확한 명령에만 등장:
    - `grep -l "\\-\\-mode prd" plugins/mccp/commands/plan-prd.md` exit 0
    - `grep -l "\\-\\-mode plan" plugins/mccp/commands/plan.md` exit 0
    - etc.

#### Task 1.6: `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape (hardened)

- **Action**: `/mccp:pr` Phase 0 preflight에서 env 값 검증. **Codex R1 Finding 4 absorption**: v0.2.4 security_force_override는 1-token reason도 warning으로 통과시켰지만, v0.2.5 impeccable_force_override는 **schema REJECT (=blocking)** — 의미 있는 reason 없이 escape 불가:
  - REJECT 대상: empty, whitespace-only, 1-token (`1`, `yes`, `ok`, `true`, `noop`), URL-only (`http(s)://...` 단독), 30자 미만, `lorem`/`test`/`tmp`/`dummy` 등 placeholder.
  - 통과 조건: ≥30자 자연어 reason + 최소 1개 의미어 (action verb, target, time/incident reference 중 하나).
  - validation은 schema.js + write.js 양쪽에서 — schema가 reject하면 write 거부, write가 통과시키면 receipt 작성됨.
  - PR body에 `## Impeccable Override` section auto-inject (canonical audit source — v0.2.4 R3 finding #1 패턴).
  - **v0.2.4 security_force_override backport debt**: 동일 hardening을 security namespace에 backport하면 호환성 깨짐 — v0.2.6 housekeeping Task로 별도 분리.
- **Mirror**: v0.2.4 [pr.md Phase 0](../../plugins/mccp/commands/pr.md) `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` (reason field shape는 mirror, validation 강도는 강화).
- **Validate**: [impeccable-force-override.test.js](../../plugins/mccp/scripts/receipt/tests/impeccable-force-override.test.js) 10 test (긍정 3 + REJECT 7: empty/whitespace/1-token x3/placeholder x2/under-30chars).

#### Task 1.7: regression guard + dogfood test

- **Action**:
  - [impeccable-guard.test.js](../../plugins/mccp/scripts/lib/tests/impeccable-guard.test.js) — 7개 명령 grep 표준화 (Task 1.5의 grep을 test로).
  - [impeccable-dogfood.test.js](../../plugins/mccp/scripts/lib/tests/impeccable-dogfood.test.js) — fake Skill harness fixture로 invocation contract dispatch.
- **Mirror**: v0.2.4 security-reviewer-guard.test.js + security-reviewer-dogfood.test.js.
- **Validate**: 15+ tests pass.

#### Task 1.8: setup.md + session-start.js + docs

- **Action**:
  - [setup.md](../../plugins/mccp/commands/setup.md): Phase 1 detection 출력에 impeccable 상태 행 추가 (이미 dep-check 포함되면 noop).
  - [session-start.js](../../plugins/mccp/scripts/hooks/session-start.js) 24h warning 텍스트에 "디자인 게이트는 informational fallback으로 동작" 한 줄 추가.
  - [gate-design.md](../../docs/gate-design.md) + [ENVIRONMENT.md](../../docs/ENVIRONMENT.md): 새 분기 + env 추가.
  - [CLAUDE.md](../../CLAUDE.md) §1.1 fork lineage 갱신 + §4 cheat sheet 운영 토글에 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` 추가.
  - [README.md](../../README.md): 사용자 안내 + ECC 잔재 hook cleanup checklist (`~/.claude/hooks/impeccable-{flag,guard}.ps1` 삭제 권장).
- **Validate**: doc grep `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` ≥ 4 files.

#### Task 1.9: plugin.json bump + PR

- **Action**: 0.2.4 → 0.2.5. `/mccp:prp-commit` + `/mccp:pr` 사용.
- **Validate**: PR body에 `## Design Review` + `## Codex Adversarial Review` 모두 inject.

### Milestone 1 Acceptance

- [ ] 7개 명령에 impeccable gate sub-step inline 통합 (grep으로 검증)
- [ ] `impeccable-detect.js` + tests (8/8 pass)
- [ ] receipt schema에 design_* 4 필드 + invariant
- [ ] [impeccable-skipped.test.js](../../plugins/mccp/scripts/receipt/tests/impeccable-skipped.test.js) (7 pass — F1 absorption: design-skipped.test.js 폐기, namespace 통합)
- [ ] [impeccable-force-override.test.js](../../plugins/mccp/scripts/receipt/tests/impeccable-force-override.test.js) (10 pass — F4 hardening: 긍정 3 + REJECT 7. design-force-override.test.js 폐기)
- [ ] state-matrix.test.js 확장 (20 pass)
- [ ] [impeccable-guard.test.js](../../plugins/mccp/scripts/lib/tests/impeccable-guard.test.js) + [impeccable-dogfood.test.js](../../plugins/mccp/scripts/lib/tests/impeccable-dogfood.test.js) (15+ pass)
- [ ] CLAUDE.md §1.1 + §4 + README.md + gate-design.md + ENVIRONMENT.md 갱신
- [ ] plugin.json 0.2.5 + PR merge
- [ ] baseline + new tests both pass (목표: 327 baseline + ~50 new = ~377)
- [ ] ECC 잔재 hook은 cleanup 안내만 (코드 무참조 grep으로 검증)

---

## Milestone 2 — v0.2.6: Housekeeping

**Goal**: v0.2.3/v0.2.4/v0.2.5에서 누적된 small refactor + UX 개선.

**Plugin version**: 0.2.5 → **0.2.6**

### Tasks

#### Task 2.1: Decision-slug derivation 통합 (Option Y)

- **Action**: [cli.js](../../plugins/mccp/scripts/receipt/cli.js) `derive-decision`을 plan-path 기준으로 통일. 현재는 `--args "..."` 자유 문자열 기반 — slug가 명령 호출마다 달라져 plan-codex와 implement-codex가 silent block되는 일이 있음. After: `--plan <plan path>` 입력 시 basename에서 slug 추출.
- **Mirror**: 기존 derive-decision 본문.
- **Validate**: derive-decision.test.js 신규 case 4건.

#### Task 2.2: README CRLF cleanup + .gitattributes

- **Action**: `.gitattributes` 신규: `* text=auto eol=lf`, `*.ps1 eol=crlf`, `*.cmd eol=crlf`, `*.bat eol=crlf`. README.md normalize.
- **Mirror**: 표준 Node 프로젝트 .gitattributes.
- **Validate**: `git ls-files --eol README.md` → `i/lf`.

#### Task 2.3: pr-body residual fix

- **Action**: v0.2.3 PR #4가 처리한 worktree compatibility 외에 남은 edge case 점검 (multi-line content 인코딩, special character escape). 없으면 noop.
- **Validate**: pr-body regression test 통과.

#### Task 2.4: plugin.json bump + PR

- **Action**: 0.2.5 → 0.2.6.

### Milestone 2 Acceptance

- [ ] derive-decision plan-path 통일 (1.fixture 추가)
- [ ] .gitattributes commit
- [ ] plugin.json 0.2.6 + PR merge

---

## Milestone 2.5 — v0.2.7: Silent Hook UX (Observability Surface)

**Goal**: ALLOW-path silent failure 제거. UserPromptExpansion hook이 통과시키고 다운스트림이 침묵하는 시나리오를 hook surface로 가시화.

**Plugin version**: 0.2.6 → **0.2.7**

**Origin**: 2026-06-05 사용자 incident — `MCCP_RECEIPT_DEBUG=1`이 켜져 있어도 `/mccp:pr` 실패 시 로그 미출력. 본 세션 brainstorm + santa-loop 3-round adversarial review converged to v3-minimal design. 자세한 R1/R2/R3 verdict + critical issues는 본 세션 transcript.

**Positioning**: observability + recovery hint system. **NO trust claim. NO machine-enforced attestation.** Claude Code hook API documented surface 안에서만 작동.

### Verified Hook API (per [Claude Code hooks docs](https://code.claude.com/docs/en/hooks))

- `systemMessage` — universal top-level hook output field (user-visible)
- `PostToolUseFailure` — hook event with native `tool_use_id` + `tool_name` + `error` payload
- `permissionDecision: "ask"` — PreToolUse.hookSpecificOutput value
- `SessionEnd` — lifecycle event (**NOT "Pre-Stop" — Pre-Stop 존재하지 않음**, R3 Codex catch)
- SessionStart input has `model` field but NOT Claude Code version → external probe 필요

### Accepted Blind Spots (out of scope, documented in `docs/gate-design.md`)

| ID | Scenario | Mitigation |
|---|---|---|
| B1 | `StopFailure` 이벤트 + 사용자 미재개 | manual ledger inspection 필요 |
| B2 | Power loss before shard write | data loss accepted |
| B3 | In-session Claude Code version upgrade | restart required for new probe |
| B4 | Same-session concurrent ledger global ordering | per-shard scope only |
| B5 | L0 subagent contract attestation | docs-only, no enforcement (별도 W2 워크스트림) |

### MUST Constraints (R3 critical issues — non-negotiable)

| # | Constraint | Source |
|---|---|---|
| **C1** | end-marker writing은 **`SessionEnd` hook**에 anchor. "Pre-Stop"은 존재하지 않음 | R3 Codex docs catch |
| **C2** | `.gitignore`에 `.claude/state/hook-trace/` 추가 — milestone FIRST commit | R3 Codex: 실수 커밋 위험 |
| **C3** | SessionStart LRU eviction은 **active-session lease** 확인 후만. live session dir 절대 삭제 금지 | R3 Codex: concurrent session race |
| **C4** | Corruption contract: temp file + atomic rename, malformed shard 격리, surviving shards에서 consolidated 재구축, `hook-caps.json` corrupt 시 자동 reprobe | R3 Codex: self-healing 미정의 |
| **C5** | `systemMessage` 필드 user-visibility를 **integration test로 사전 검증** (현재 spike 미커버) | R3 Reviewer A |
| **C6** | L2a/G1 patch의 "live hook state" = **event payload only** (filesystem/module state 아님) — spec + 주석 모두 명시 | R3 Reviewer A |
| **C7** | `MCCP_RECEIPT_DEBUG` precedence table에 *unset default* 명시 (`"interactive" > "1" > "0"/unset`) | R3 Reviewer A |
| **C8** | `claude --version` external probe — binary path + stderr 기록, semver-only 의존 금지, attempted-feature-use + fallback 패턴 | R3 Codex |

### Layered Design v3-minimal (R3-converged)

```
P0 (BLOCKING):
  L1  — Per-invocation shard ledger (.claude/state/hook-trace/<session_id>/<tool_use_id>-<phase>.jsonl)
  L2b — PostToolUseFailure surface (event-native, no L1 dep)
  G1 patch — receipt-skill.js / receipt-prompt.js try/catch wrap

P1:
  L2a — MCCP_RECEIPT_DEBUG=1 + ALLOW path → systemMessage emit (v0.2.5 inline 보존)
  L2c — External version probe + cross-session inject (claude --version, hook-caps.json)
  L5  — SessionEnd marker + compactor (active-session lease)
  G1 invariant — Loud Fail-Open 정책 + event-shape-specific output

P2:
  L2d — hookSpecificOutput.additionalContext breadcrumb (model context only)

P3 (opt-in):
  L3a — MCCP_RECEIPT_DEBUG="interactive" + permissionDecision:"ask"
  L4  — /mccp:trace slash command + Phase 0 preamble in all /mccp:* markdown

Deferred (W2 separate workstream):
  L0  — subagent contract attestation (docs only, no machine enforcement)
```

### Tasks

#### Task 2.5.0 (BLOCKING — must precede all others): `.gitignore` update

- **Action**: `.gitignore`에 단일 라인 추가: `.claude/state/hook-trace/`
- **Why**: 미적용 시 v0.2.7 설치 즉시 untracked 파일이 git status에 노출 → 실수 커밋 + repo bloat (R3 Codex C2)
- **Validate**: `echo '' > .claude/state/hook-trace/test/dummy.jsonl && git status` → no untracked report
- **Commit**: 본 milestone의 FIRST commit이어야 함

#### Task 2.5.1: Layer 1 (P0) — Per-invocation shard ledger

- **Action**: `plugins/mccp/scripts/lib/hook-trace.js` 생성
- **Schema** (write-time enforced): `{ts, session_id, tool_use_id, command_id, command_name (sha256 if non-mccp:), gate_decision, layer, exception_class, exit_code}`
- **FORBIDDEN at write**: `command_args` raw, `tool_input` raw, env vars, user content
- **Per-shard cap**: 64KB OR 100 entries (whichever first)
- **Global cap**: 100MB total via SessionStart LRU evict — **active-session lease 검증 필수** (C3)
- **Disk-full**: skip + systemMessage + never block (G1)
- **Read-only fs**: detect at SessionStart probe, layer disabled with single notice
- **Corruption contract** (C4): temp file + atomic rename per shard write, malformed shard 자동 격리
- **Validate**: `hook-trace.test.js` — shard write, allowlist, corruption, lease, LRU evict 8+ cases

#### Task 2.5.2: Layer 2b (P0) — PostToolUseFailure surface

- **Action**: `plugins/mccp/scripts/hooks/post-tool-use-failure.js` 생성
- **Source data**: event payload native `tool_use_id` + `tool_name` + `error` (NO L1 lookup)
- **Output**: systemMessage + `hookSpecificOutput.additionalContext` 동시 emit (recovery hint + log path)
- **L1 unavailable**: surface 계속 동작 (event payload only)
- **Mirror**: 기존 hook 패턴 — `bash-hook-dispatcher.js`의 dispatcher style
- **Validate**: integration test — fake PostToolUseFailure event 발사 후 systemMessage 출력 확인

#### Task 2.5.3: hooks G1 patch (P0)

- **Action**: `receipt-skill.js` / `receipt-prompt.js`의 module load + decision evaluation을 try/catch로 감싸기
- **Catch block**: L1 shard write 시도 (fail-silent OK) + systemMessage emit + return allow
- **C6 명시**: 주석에 "live hook state = event payload only" 강조
- **G1 contract**: 모든 internal exception이 동일 경로
- **Mirror**: 기존 `debug()` 패턴 + v0.2.5 block-payload inline 처리
- **Validate**: `module load error → systemMessage 출력 + allow` integration test

#### Task 2.5.4: Layer 2a (P1) — ALLOW-path systemMessage

- **Action**: `receipt-prompt.js`에서 `MCCP_RECEIPT_DEBUG=1` + ALLOW path 시 systemMessage 발행
- **Coexistence**: v0.2.5 block-payload inline 무조건 보존
- **Opt-out only**: `MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0` (advanced users)
- **GATED by C5**: `hook-trace-integration.test.js`가 systemMessage user-visibility 사전 검증 통과해야 본 Task 진행
- **Validate**: integration test 통과 + manual smoke (사용자 환경에서 ALLOW path debug 메시지 노출 확인)

#### Task 2.5.5: Layer 2c (P1) — External version probe + cross-session inject

- **Action**: `session-start.js`에 `claude --version` spawn 로직 + `.claude/state/hook-caps.json` cache write
- **Cache schema**: `{version, probed_at, binary_path, stderr_capture, supported_features}` (provenance per C8)
- **Probe fail OR v < 2.1.141**: minimum-spec mode (systemMessage only, no `terminalSequence`, no `permissionDecision: "ask"`)
- **Cross-session inject**: prior-session shard dirs lacking `.end` marker → 최대 3개 system-reminder inject
- **C3 guard**: 다른 active session의 dir은 inject 대상에서 제외 (lease 확인)
- **Mirror**: 기존 `session-start.js` `<system-reminder>` injection pattern
- **Validate**: probe success/fail + minimum-spec fallback + cross-session alert matrix

#### Task 2.5.6: Layer 5 (P1) — SessionEnd marker + compactor

- **Action**: `plugins/mccp/scripts/hooks/session-end-trace.js` 생성
- **Hook event**: **`SessionEnd`** (NOT Pre-Stop — C1 enforced)
- **End marker**: `.claude/state/hook-trace/<session_id>/.end` write
- **Compactor**: per-shard files → `consolidated.jsonl` (atomic rename, active-session lease 존중)
- **Compactor failure**: SessionEnd 진행 차단 안 함
- **Mirror**: `state-writer.js`의 atomic lock + CRLF normalization 패턴
- **Validate**: SessionEnd 후 .end marker 존재 + consolidated.jsonl 생성 + 동시 세션 dir 미터치 확인

#### Task 2.5.7: G1 invariant 명문화 + grep guard

- **Action**: `docs/gate-design.md`에 G1 정책 섹션 추가
- **Event-shape-specific output**: UserPromptExpansion(block), PreToolUse(decision:allow/deny/ask), PostToolUseFailure(systemMessage+additionalContext), Stop(advisory), SessionEnd(advisory) 각각의 fail-open contract 명시
- **Test invariant**: 모든 hook 코드 경로에 G1 적용 여부 grep guard (`scripts/lib/tests/g1-guard.test.js`)
- **Validate**: synthetic offender + safe-form 양방향 regex pattern (v0.2.4 security-reviewer-guard.test.js mirror)

#### Task 2.5.8: `/mccp:trace` slash command (P3) + Phase 0 preamble

- **Action**: `plugins/mccp/commands/trace.md` 생성 — shards + consolidated.jsonl read
- **All `/mccp:*` markdown**: Phase 0에 preamble 1줄 추가: `> If I disappear silently, run \`/mccp:trace\` or check \`.claude/state/hook-trace/<session_id>/\``
- **Mirror**: `code-review.md` 등의 Phase 0 패턴
- **Validate**: `/mccp:trace`가 current + prior session entries 모두 표시

#### Task 2.5.9: docs + plugin.json bump + PR

- **Action**:
  - `docs/gate-design.md`: v0.2.7 surface architecture, B1-B5 blind spots, `MCCP_RECEIPT_DEBUG` precedence table (C7)
  - `docs/ENVIRONMENT.md`: `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` entry
  - `CLAUDE.md` §4 cheat sheet: 신규 env vars + `/mccp:trace`
  - `plugins/mccp/.claude-plugin/plugin.json`: 0.2.6 → 0.2.7
- **PR**: `/mccp:pr` (v0.2.7은 own gates를 통과해야 함 — dogfood)

### Milestone 2.5 Acceptance

- [ ] `.gitignore`에 `.claude/state/hook-trace/` 추가 (FIRST commit, C2)
- [ ] L1 shard ledger 동작 + allowlist enforced + corruption contract test pass (Task 2.5.1, C4, C6)
- [ ] PostToolUseFailure surface integration test pass (Task 2.5.2)
- [ ] receipt-skill.js / receipt-prompt.js G1 patch 적용 + module load error → systemMessage 확인 (Task 2.5.3, C6)
- [ ] `systemMessage` user-visibility integration test pass (Task 2.5.4, C5 — gate)
- [ ] `claude --version` external probe + hook-caps.json provenance 기록 (Task 2.5.5, C8)
- [ ] SessionEnd compactor 동작 + Pre-Stop 사용 0건 검증 (Task 2.5.6, C1)
- [ ] active-session lease guard로 concurrent session safe (Task 2.5.6, C3)
- [ ] G1 grep guard test pass + 모든 hook 경로에 G1 적용 (Task 2.5.7)
- [ ] `/mccp:trace` 호출 시 prior-session shards + consolidated 표시 (Task 2.5.8)
- [ ] 모든 `/mccp:*` markdown에 Phase 0 preamble 추가 (Task 2.5.8)
- [ ] docs + CLAUDE.md + plugin.json 0.2.7 + PR merge (Task 2.5.9)

### Origin Trace (Audit)

- **Source incident**: 2026-06-05 사용자 보고 — `MCCP_RECEIPT_DEBUG=1`이 켜져 있어도 `/mccp:pr` 실패 시 로그 미출력
- **Brainstorm sources (3)**: Claude(저) + Claude subagent(=두 번째 claude perspective) + Codex GPT-5.4 via `codex exec`
- **Adversarial review**: `mccp:santa-loop` 3-round R1/R2/R3
  - **R1**: v1 design, 9/10 criteria FAIL on both reviewers (broad design holes)
  - **R2**: v2 design, 9-10/10 criteria FAIL (deeper architectural limits surfaced)
  - **R3**: v3-minimal design, 3-4/10 criteria FAIL (specific spec gaps — present milestone constraints)
- **Critical Codex findings (Reviewer B, docs-grounded)**:
  - C1: "Pre-Stop" hook does not exist; SessionEnd is correct anchor
  - C2: `.claude/state/hook-trace/` not in `.gitignore` — migration risk
  - C3: SessionStart LRU eviction can delete live concurrent session dirs
  - C4: Corruption contract underspecified
  - C8: `claude --version` probe provenance + attempted-feature-use fallback
- **Critical Claude findings (Reviewer A, codebase-grounded)**:
  - C5: `systemMessage` field not yet tested in spike — integration test required
  - C6: "live hook state" 출처 모호 — event payload only로 명시 필요
  - C7: env var precedence table에 unset default 누락
- **Deferred to W2 (separate workstream, not v0.2.7)**:
  - L0 subagent contract attestation — hook API에 cryptographic transport 없어 self-reported stamp는 forgeable. trust 주장 불가. 본 세션 codex:codex-rescue forwarder violation incident가 이 한계를 정확히 예시.

---

## Milestone 3 — v0.3.0: S10b Auto-Handoff ($100 hard ceiling)

**Goal**: cost hard ceiling 자동 enforcement. v0.2 architecture §4 design 그대로 구현.

**Plugin version**: 0.2.6 → **0.3.0** (major minor bump — semantics 확장)

### Tasks

#### Task 3.1: breakpoint-detector.js

- **Action**: STATE.md fingerprint + cost threshold 결합 — task 단위 안전한 stop point 탐지.
- **Mirror**: [docs/v0.2-architecture.md §4](../../docs/v0.2-architecture.md) sequence diagram.

#### Task 3.2: auto-handoff.js hook

- **Action**: $50 notice / $80 soft / $100 hard 임계. hard ceiling 시 세션 자동 spawn (PowerShell `Start-Process` + restored STATE.md).
- **Validate**: $50/$80/$100 threshold matrix unit test + STATE.md handoff snapshot test.

#### Task 3.3: `MCCP_AUTO_HANDOFF=off|notify|spawn` env live

- **Action**: CLAUDE.md §4의 "⚠ S10b 미구현. 환경변수만 예약된 상태" 주석 제거.

#### Task 3.4: plugin.json bump + PR

### Milestone 3 Acceptance

- [ ] auto-handoff hook fires at thresholds
- [ ] STATE.md `next_chunk` populated at handoff
- [ ] plugin.json 0.3.0 + PR merge

---

## Milestone 4 — v0.3.1: S11 `/mccp:work` Single Entry

**Goal**: PRD → plan → implement → PR 단일 entry orchestration.

**Plugin version**: 0.3.0 → **0.3.1**

### Tasks

#### Task 4.1: `/mccp:work` command body

- **Action**: [commands/work.md](../../plugins/mccp/commands/work.md) 신규. trivial heuristic (사용자 Q3) 적용 — 단순 작업은 `/mccp:prp-commit + /mccp:pr` 직행, 복잡한 작업은 full chain.

#### Task 4.2: work-orchestrator.js + tests

- **Action**: chain state machine — 각 단계 receipt 통과 후 다음 단계 자동 invoke. 중간 사용자 컨펌 없음 (Phase 5 forbidden 패턴 mirror).

#### Task 4.3: plugin.json bump + PR

### Milestone 4 Acceptance

- [ ] `/mccp:work <feature>` end-to-end chain
- [ ] trivial vs full chain heuristic test
- [ ] plugin.json 0.3.1 + PR merge

---

## Milestone 5 — v0.3.2: S12 Dual-Reviewer Escalate

**Goal**: CRITICAL / divergent finding 시 `fix-task.md`에 `Next: /santa-loop <args>` 안내 자동 추가 (자동 invoke는 안 함 — 사용자 결정 보존).

**Plugin version**: 0.3.1 → **0.3.2**

### Tasks

#### Task 5.1: escalate-detector.js

- **Action**: receipt resolution.open_questions + CRITICAL findings 스캔. 임계 충족 시 `fix-task.md` 끝에 escalate 안내 append.

#### Task 5.2: santa-loop.md 통합

- **Action**: 기존 `/mccp:santa-loop` command body에 escalate 진입 시 STATE.md fingerprint validation 추가.

#### Task 5.3: plugin.json bump + PR

### Milestone 5 Acceptance

- [ ] escalate trigger fires on CRITICAL
- [ ] `Next: /santa-loop` 안내 inject (자동 invoke X)
- [ ] plugin.json 0.3.2 + PR merge

---

## Validation (전체 roadmap)

각 마일스톤 PR 머지 전 다음 모두 통과:

```bash
# Baseline + new tests (Node native runner)
node --test plugins/mccp/scripts/**/tests/*.test.js

# Receipt chain validate
node plugins/mccp/scripts/receipt/cli.js status --json

# Grep regression guards
grep -c "Skill(impeccable" plugins/mccp/commands/*.md          # ≥ 7 (v0.2.5+)
grep -rn "Skill(security-reviewer" plugins/mccp/commands/      # 0 (v0.2.4 회귀 없음)
grep -rn "impeccable-flag\|impeccable-guard" plugins/mccp/    # 0 (ECC 잔재 무참조)

# Plugin manifest
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 마일스톤 버전
```

---

## Risks (전체 roadmap)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| v0.2.5 7개 명령 동시 본문 wiring → 회귀 영향 큼 | High | High | guard test를 v0.2.4 security-reviewer 패턴과 동일 mirror; 한 PR 안에 모두 묶고 baseline 327 + 신규 ~50 모두 green 확인 |
| impeccable Skill 호출이 시스템 환경에 따라 다르게 동작 | Medium | High | `unknown_skill`/`not found` fallback을 본문에 명시; dogfood test에 fake Skill harness fixture |
| impeccable 메타가 v0.2.4 security 4-axis 및 기존 *-impeccable gate ID와 충돌 | Medium | High | F1 absorption: design_* namespace 폐기. primary codex receipt 메타로 일원화 + 기존 *-impeccable gate IDs를 결과 receipt로 활성화. cross-namespace는 통과 |
| ECC 잔재 hook이 새 hook과 동시 발화 | Medium | Medium | README cleanup checklist; user-level 잔재는 mccp가 강제 삭제 못 함 |
| Milestone 0 archive 도중 git history 손상 | Low | High | `git mv` 사용 (rename으로 추적); 절대 `rm -rf` 금지 |
| `MEMORY.md` 갱신 도중 active 항목 손실 | Low | Medium | feedback-cost-not-stop-signal 보존 명시; archive 항목은 strikethrough 대신 별도 섹션 |
| v0.3.0+ 큰 작업이 v0.2.5/v0.2.6과 함께 묶이면 cycle 길어짐 | Medium | Medium | 마일스톤 단위로 PR 분리; 한 cycle에 두 마일스톤 묶지 않음 |
| 본 plan 자체가 비대해져 가독성 저하 | Low | Medium | `## Milestone N` 헤더로 sub-section; shipped 마일스톤은 별도 `## Status: ✅` 마킹 |

---

## Acceptance (roadmap 전체)

- [ ] Milestone 0: 모든 archive 완료 + `MEMORY.md` 단일 entry
- [ ] Milestone 1 (v0.2.5): impeccable wiring shipped — 7개 명령 + receipt + tests
- [ ] Milestone 2 (v0.2.6): housekeeping shipped
- [ ] Milestone 3 (v0.3.0): auto-handoff shipped
- [ ] Milestone 4 (v0.3.1): `/mccp:work` shipped
- [ ] Milestone 5 (v0.3.2): escalate shipped
- [ ] 매 마일스톤마다 `plugin.json` bump + main merge
- [ ] 매 마일스톤 PR 본문에 `## Codex Adversarial Review` + (디자인 surface 변경 시) `## Design Review` 모두 inject
- [ ] 본 plan은 매 마일스톤 shipping 후 해당 마일스톤 헤더에 `## Status: ✅ shipped (vX.Y.Z)` 마킹

---

## Codex Adversarial Review

- 호출: `node "C:/Users/skypark207/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" adversarial-review --wait --json ...` (companion 직접 호출 — mccp wrapper의 spawnSync stdout 캡처 이슈 우회. wrapper fix는 v0.2.6 housekeeping Task로 추적)
- 라운드 수: R1 + R2 완료, R3 quota-deferred (Codex usage limit, 7:53 PM 리셋 후 사용자 직접 trigger 가능)
- 합치 결론: R1 verdict `needs-attention`, summary "the roadmap leaves the v0.2.5 design gate with conflicting state models, unreliable detection, and an under-audited override path". 5 HIGH findings 모두 ACCEPT, 본 plan 본문에 흡수 완료.
- 수용한 제안 (R1, 5건 전부):
  - **F1 (HIGH, plan-roadmap:244-258) — 새 `design_*` meta가 기존 `plan-impeccable`/`implement-impeccable`/`pr-impeccable` gate ID와 충돌**: design_* 새 namespace **폐기**, 기존 *-impeccable gate IDs를 primary impeccable receipt mechanism으로 채택. 호출 시 별도 receipt 작성 + primary codex receipt와 cross-link. impeccable 미가용 시 primary codex receipt의 `meta.impeccable_skipped=true` 메타로만 기록 (별도 namespace 없음). → "Files to Change" 테이블의 4 receipt-side 행 + Task 1.2/1.3/1.4 본문 갱신.
  - **F2 (HIGH, plan-roadmap:231-238) — Hybrid C가 PATH lookup으로 가용성 판정 → false unavailable**: dep 가용성 판정 primary dimension을 **Skill 등록 여부**로 전환, CLI PATH lookup은 STATE.md `dep_check_missing`용 telemetry-only. impeccable-detect.js는 `skill_available` (primary, gate 분기) + `cli_available` (telemetry) 두 필드 분리. → Task 1.1 본문 갱신, 8-combo test가 skill-present/cli-missing hot path 검증.
  - **F3 (HIGH, plan-roadmap:217-238) — git diff 기반 detection이 PRD/plan 단계 design work를 못 잡음**: impeccable-detect.js를 mode-aware로 확장. `prd` mode는 PRD artifact 본문 keyword + `## Files to Change` UI 확장자 + design plan path. `plan` mode는 plan artifact + `## Files to Change` + design 키워드. `implement`/`pr`/`review`는 git diff 그대로. → Task 1.5 본문에 mode 매트릭스 추가, command 별 `--mode` 지정.
  - **F4 (HIGH, plan-roadmap:288-291) — `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` 1-token reason이 warning에 그침**: v0.2.4 security_force_override는 warning 통과지만, v0.2.5 impeccable_force_override는 schema **REJECT** (blocking). empty/whitespace/1-token/placeholder/30자 미만 reason 거부. v0.2.4 security backport는 v0.2.6 housekeeping debt. → Task 1.6 본문 + impeccable-force-override.test.js 10 case (긍정 3 + REJECT 7).
  - **F5 (HIGH, plan-roadmap:155-174) — Milestone 0이 user-level MEMORY.md를 backup/rollback 없이 destructive 재구성**: 4단계 안전 마이그레이션으로 분리. Step 1 (backup + SHA-256), Step 2 (append-only roadmap pointer prepend), Step 3 (별도 migration script로 demotion, 본 PR 외부), Step 4 (4개 validation matrix). Step 3는 Milestone 0 머지 후 별도 maintenance commit. → Task A.3 본문 전면 재작성, `.gitignore`에 `MEMORY.md.bak.*` 추가 필요.
- 거부한 제안 + 근거: 없음 (5건 전부 ACCEPT).
- R2 finding (1건, ACCEPT + 흡수 완료):
  - **R2-F1 (HIGH, plan-roadmap:283 → 295) — R1 F1 absorption 미완료**: R1 absorption 노트는 design_* 폐기를 선언했지만 Files to Change 외 본문(Scope matrix, Task 1.2/1.3/1.4 body, acceptance, risks)에 design_* 잔존. R2 absorption: 본문 7곳 일괄 정정 — Task 1.2/1.3/1.4 전면 재작성 (impeccable_* primary codex receipt 메타 + *-impeccable result gate 활성화), Scope matrix 갱신, acceptance/risk wording 정정. 잔존 3 reference는 모두 historical/negation form (line 295 STRICT_DESIGN_GATES PROHIBITION, 388/389 obsolete test 폐기 노트) — R2가 NEXT step에서 명시적으로 허용한 형태.
- R3 결과: **quota-deferred** (Codex API usage limit). Phase 5.4 cap-at-3 정책 적용 — R1/R2 substantive convergence 달성, R3는 operational block이지 새 finding 아님. 사용자가 quota 리셋(7:53 PM 시점) 후 직접 R3 verification trigger 가능: `node "C:/Users/skypark207/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" adversarial-review --wait --json "<focus>" > .git/mccp/tmp/codex-r3.json`.
- Open Questions:
  - **MEDIUM (R3 deferred)** — R3 verification은 Codex quota 리셋 후 사용자 trigger. R3가 새 finding 반환 시 본 plan 추가 amend + receipt revise 필요. 우선순위: Milestone 0 commit 전에 검증 권장.
  - **MEDIUM (wrapper bug)** — codex-invoke.js wrapper의 spawnSync stdout-empty 이슈는 본 게이트 진행 도중 발견. companion 직접 호출은 정상 동작 확인. v0.2.6 housekeeping에 새 Task로 추가 필요 (현재 plan 본문 Files to Change에는 미반영).
  - **MEDIUM (security backport debt)** — F4 absorption이 v0.2.4 security_force_override와 강도 다르게 남음 (security=warning, impeccable=REJECT). v0.2.6 backport 권고 — 호환성 깨짐 risk 있어 별도 cycle.
  - **LOW (Milestone 0 split)** — F5 absorption의 migration script는 Milestone 0 머지 후 별도 maintenance commit. script 자체는 v0.2.5 cycle 진입 전에 작성/dry-run 실행 권장 (Step 2까지만 머지하고 사용자가 ready일 때 Step 3 실행).
- Codex session 참조: threadId `019e9193-65fe-7871-ae60-95b8ddec2956` (R1, direct companion), threadId `019e91a2-2783-7382-bdfa-203adc739823` (R3 quota-deferred), `019e9184-19ce-7ed1-bba4-58510a78dd74` (preliminary working-tree review, background)

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1 + R2, F1-F5 absorbed). No new implement-time decisions detected — architectural choices (file structure per "Files to Change" table, abstraction boundaries between impeccable-detect.js / schema.js / cli.js / validate-cmd.js, no new external deps, sync concurrency model) all pre-committed. Micro-decisions remaining (skill registry probe shape, namespace-aware reason validator parametrization, STATE.md write ownership, fake Skill harness fixture) are implementation details, not architectural. **Cross-gate dedupe applied (Phase 2.5.1).**

Decision-slug reused from plan-codex: `mccp-roadmap`. Implement-codex receipt will record this dedupe via standard receipt write.

### Security Reviewer

Verdict: **NEEDS-ATTENTION** (0 HIGH/CRITICAL → gate proceeds with implement-time absorption). 5 findings, all MEDIUM/LOW.

- **F-Sec-1 (MEDIUM) — Reason validator cross-namespace divergence**: v0.2.5 impeccable_force_override_reason은 schema REJECT, v0.2.4 security_force_override_reason은 write-layer warning. write.js + schema.js 양쪽 검증 시 코드 중복. → **흡수**: Task 1.2 본문에 reason validator를 `plugins/mccp/scripts/receipt/lib/force-override-reason.js` 단일 helper로 분리. v0.2.7 housekeeping (originally v0.2.6 in plan)에서 security namespace backport 시 같은 helper에 namespace-aware strictness flag 추가.
- **F-Sec-2 (MEDIUM) — Path traversal via `--plan <user-path>`**: impeccable-detect.js가 사용자 입력 경로를 검증 없이 fs로 읽음. → **흡수**: Task 1.1 본문에 `path.resolve(cwd, userPath)` + `path.relative(repoRoot, abs).startsWith('..')` 거부 추가. Unit test에 traversal positive case 추가.
- **F-Sec-3 (LOW) — Skill registry probe telemetry on stdout**: stdout JSON에 `cli_available`이 섞이면 telemetry가 caller stdout에 노출. → **흡수**: Task 1.1 본문에 `--json` 출력은 `skill_available + design_signal + signal_files + mode + reason`만, `cli_available`은 별도 `--telemetry` flag로 분리하거나 같은 JSON 내에 두되 caller가 STATE.md write 외엔 사용 안 함을 코드 주석으로 명시.
- **F-Sec-4 (MEDIUM) — Cross-namespace schema bypass via direct store.js write**: schema validator를 우회하면 same-namespace invariant 무효화. → **흡수**: Task 1.2 본문에 impeccable invariant를 schema.js에 명시(security와 대칭) + write.js buildReceipt가 validate() 호출 전에 sanitization 단계 추가 금지. write.js에 grep guard test 추가 (validate가 단일 진입점인지 확인).
- **F-Sec-5 (LOW) — PR body Override section markdown injection**: v0.2.5 impeccable reason은 ≥30자 validator가 일부 방어, 그러나 v0.2.4 security override는 reason 미검증이라 v0.2.7 backport에서 bash escaping 필요. → **흡수**: Task 1.6 본문에 v0.2.5 impeccable Override section은 reason validator를 통과한 후 inject되므로 추가 escape 불필요라 명시; v0.2.4 backport debt에 escaping 항목 추가.

세션 ref: security-reviewer agent direct invocation (Task tool), 2026-06-04 cycle.

---

## Operational Incidents Log

> Roadmap 진행 중 발견된 운영 incident와 그 대응. 각 incident는 milestone scope에 들어가지 않더라도, **schema/wiring 가설**이 명시적으로 흔들린 시점이므로 plan에 누적 기록한다. 후속 milestone이 incident pattern을 흡수해야 함.

### INC-001 (2026-06-05) — `/mccp:prp-implement` silent block: v0.2.6 schema 확장 후 forward-migration 누락

**증상**
- `/mccp:prp-implement .claude/plans/mccp-roadmap.plan.md` 실행 시 출력 없이 즉시 종료. error/stderr surface 0건.
- `MCCP_RECEIPT_GATE_MODE=soft` + `MCCP_RECEIPT_DEBUG=1` 설정 상태에서도 동일.

**근본 원인**
1. v0.2.6 Milestone 1 Task 1.2 — [schema.js:178-189](../../plugins/mccp/scripts/receipt/schema.js#L178-L189)가 receipt `meta`에 4개 boolean/string 필드를 **required**로 추가:
   - `impeccable_skipped` (boolean)
   - `impeccable_skip_reason` (string|null)
   - `impeccable_force_override` (boolean)
   - `impeccable_force_override_reason` (string|null)
2. v0.2.4 schema로 발행된 기존 receipt들(`.claude/receipts/mccp-{plan,implement}-codex/mccp-roadmap.json` 포함 11개)은 이 4개 필드가 부재 → [validate-cmd.js:80-88](../../plugins/mccp/scripts/receipt/validate-cmd.js#L80-L88)가 첫 검증인 `validateSchema()`에서 **blocking** 분류 (stale이 아니라).
3. `MCCP_RECEIPT_GATE_MODE=soft`는 [receipt-prompt.js:168-178](../../plugins/mccp/scripts/hooks/receipt-prompt.js#L168-L178) 라인에서 `missing` 만 통과시키고 `blocking/stale/critical`은 그대로 막음 — `soft` 의미와 정합.
4. [receipt-prompt.js:78-87](../../plugins/mccp/scripts/hooks/receipt-prompt.js#L78-L87) 가 `decision: block` JSON 페이로드를 stdout으로 emit하는데, `UserPromptExpansion` hook이 그 payload를 슬래시 명령 확장 단계에서 처리하므로 사용자에게는 명령이 "사라진" 것처럼 보임. [receipt-prompt.js:75-76](../../plugins/mccp/scripts/hooks/receipt-prompt.js#L75-L76) 의 self-comment("hook stderr is not surfaced in UserPromptExpansion block payload")가 이를 인정.

**v0.2.7 design intent와의 정합**
- v0.2.7 silent-hook UX milestone (`feedback-loud-fail-open` 메모리 + roadmap 후속 cycle)이 **fail-open 침묵**을 잡는 ALLOW-path observability를 다루지만, 본 incident는 **fail-closed silent block** — 정반대 축. 같은 UX 문제(operator가 왜 막혔는지 안 보임)이므로 v0.2.7 scope에 _block-path observability_ 항목 추가가 합당.
- v0.2.6 강화(`impeccable_force_override_reason` strict REJECT)는 의도된 동작이지만, 강화 시 **기존 receipt에 대한 forward-migration 책임이 schema 변경자에게 없었음** — v0.2.4→v0.2.6 schema bump가 migration script 동반 없이 ship됨.

**우회 + 복구 (INC-001 적용 분)**
1. forward-migration 스크립트 작성: [.claude/state/receipt-impeccable-migrate.js](../state/receipt-impeccable-migrate.js)
   - `meta`에 4개 default 필드(`false`/`null`/`false`/`null`) 보강
   - `receipt_hash` 재계산 (canonical JSON 직렬화 — `subject_hash`는 `SUBJECT_FIELDS` ⊃ meta 미포함이라 변경 없음, [hash.js:178-196](../../plugins/mccp/scripts/receipt/hash.js#L178-L196))
   - `validateSchema()` re-run으로 성공 확인 후에만 write
2. chain 게이트(mccp-roadmap)에 적용: 2개 receipt 마이그레이션
   - `.claude/receipts/mccp-plan-codex/mccp-roadmap.json` → `receipt_hash=sha256:0020407823a394ced28ab3436856eea50ac5b19e6c0c261502c04936a81b0621`
   - `.claude/receipts/mccp-implement-codex/mccp-roadmap.json` → `receipt_hash=sha256:cb620648a8c05719fe583693f996594a2a10361534f0d7a2b71285468a0a1837`
3. 검증: `mccp:plan / mccp:prp-implement / mccp:pr` 전 chain `validate` 결과 `{ok:true}`.

**Residual debt (Milestone scope에 흡수해야 함)**
| ID | Severity | 항목 | 흡수 milestone |
|---|---|---|---|
| INC-001-R1 | MEDIUM | 다른 9개 receipt(`default`, `main`, `mccp`, `s10a`, `s10a-state-md-continuity`, `v0-2-4-phase-7-2-5-restore` 등)도 같은 schema 결함. 현재 chain에 영향 없으나 audit·CI·`receipt-status`에서 모두 blocking 상태. | v0.2.6 housekeeping batch — `node .claude/state/receipt-impeccable-migrate.js $(ls .claude/receipts/*/*.json)` 일괄 적용 |
| INC-001-R2 | HIGH | **Schema migration runbook 부재**. v0.2.6 ship 시 `meta` required 필드 추가가 BREAKING change임에도 `tests/` 만 갱신되고 기존 receipt migration이 빠짐. | v0.2.7 silent-hook UX (또는 v0.2.6 housekeeping) — schema bump 시 `migrations/` 디렉토리에 forward-migration 스크립트 동반을 acceptance에 추가 |
| INC-001-R3 | MEDIUM | **Block-path observability 부재**. `UserPromptExpansion` block payload가 클라이언트 UI에서 silent하게 처리됨. `MCCP_RECEIPT_DEBUG=1`도 도움 안 됨. | v0.2.7 silent-hook UX — ALLOW-path observability에 BLOCK-path 추가. 후보: hook이 `~/.claude/logs/mccp-receipt-block.log`에 동시 fsync, `/mccp:receipt-status` 가 마지막 block 사유 표시 |
| INC-001-R4 | LOW | migration 스크립트 위치 (`.claude/state/`)는 1회용 임시 — `plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js` 로 이전하면서 idempotent 검증 추가 권장 | v0.2.6 housekeeping |

**Why log here, not in `.claude/notes/`**
roadmap이 단일 진입점이라 명시했으므로 ([CLAUDE.md §5](../../CLAUDE.md), [MEMORY.md:1](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md)) operational incident도 본 plan에 누적. `.claude/notes/`는 archive only.

**Absorption (2026-06-05 cycle, feat/v0.2.6-housekeeping)**

| Residual | Status | Commit / Annotation |
|---|---|---|
| INC-001-R1 | **resolved** | Cumulative migration applied locally on all 11 receipts: 11/11 schema validate `ok`. Receipts are `.claude/receipts/`-gitignored, so the *commit story* is R4 (scripts in repo); per-workstation execution stays manual. |
| INC-001-R2 | **partial** | `plugins/mccp/scripts/migrations/` directory established + 2 cumulative scripts shipped (v0.2.4 + v0.2.6). Schema migration runbook moved from "absent" to "tactical" — full v0.2.7 absorption still wants automated discovery (e.g. validate-cmd hint listing which migration to run). |
| INC-001-R3 | **deferred** | Block-path observability stays in v0.2.7 silent-hook UX milestone scope. |
| INC-001-R4 | **resolved** | Migration script promoted: `.claude/state/receipt-impeccable-migrate.js` → `plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js` + sibling `v0.2.4-security-fields.js` added. Both expose `module.exports` for test-ability. CLAUDE.md §4 cheat sheet now lists migration invocation. |

Residual finding (this absorption): the persistent FAIL chains for `default mccp:pr` + `v0-2-4-phase-7-2-5-restore mccp:prp-implement` after migration are *semantic* gate decisions (`codex_skipped=true` preserved from session-of-record), NOT schema bugs. fail-closed working as designed.
