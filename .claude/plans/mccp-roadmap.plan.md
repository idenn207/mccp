# Plan: mccp Roadmap — v0.2.5 onwards (single source of truth)

**Source PRD**: 통합 — 사용자 메시지(2026-06-04, `/mccp:plan` 호출) + 기존 산출물 합본
**Selected Milestone**: v0.2.5 (immediate next) + v0.2.6 / v0.3.0 / v0.3.1 / v0.3.2 (sequenced)
**Complexity**: Medium (roadmap consolidation) + 마일스톤별 Medium-Large
**Current plugin version**: 0.2.4 (shipped — [plugin.json](../../plugins/mccp/.claude-plugin/plugin.json))
**Branch decision**: 마일스톤마다 별도 feature branch. main 직접 push 금지.

> 본 plan은 `.claude/plans/`, `.claude/PRPs/plans/`, `.claude/PRPs/reports/`, `.claude/notes/`, user-level `MEMORY.md`에 흩어진 모든 진행 상황을 단일 roadmap으로 통합합니다. 본 plan 발효 후 기존 산출물은 Milestone 0 Task A에서 archive됩니다.

---

## Summary

mccp v0.2.4 (security-reviewer Skill→Task canonical contract 치환) main merge 완료. 다음 cycle은 **impeccable 디자인 검증 자동화**를 v0.2.5의 단일 focus로 좁히고, 그 뒤 housekeeping(v0.2.6) → S10b auto-handoff(v0.3.0) → S11 단일 entry(v0.3.1) → S12 escalate(v0.3.2)로 순차 진행. 각 마일스톤은 `plugin.json` version bump + main merge + 단일 PR을 단위로 한다.

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
