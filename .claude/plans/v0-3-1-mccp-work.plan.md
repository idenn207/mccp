# Plan: v0.3.1 — S11 `/mccp:work` Single Entry (Milestone 4)

**Status**: 🚧 **IN PROGRESS** (plan expand 2026-06-08, Codex permanent-bypass advisory)
**Plugin version**: 0.3.0 → **0.3.1**
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 4
**Complexity**: Medium (1 신규 command + 1 신규 lib + 6 testcase + 2 doc update + version bump)

---

## Summary

PRD → plan → implement → PR 단일 entry orchestration. 단순 변경은 `/mccp:prp-commit` + `/mccp:pr` 직행(trivial path), 새 기능/architectural change는 full chain. 신규 chain primitive를 만들지 않고 기존 [auto-chain.js](../../plugins/mccp/scripts/lib/auto-chain.js) `shouldAbort()` API를 wrap해서 trivial-classifier + step-sequencer만 추가 — receipt-driven progression은 그대로 재사용. 보수적 default = full chain (사용자 Q3 mitigation).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Chain decision API | [scripts/lib/auto-chain.js:106-171](../../plugins/mccp/scripts/lib/auto-chain.js#L106-L171) `shouldAbort()` | exit 0 / 13 / 75 (sysexits) + JSON on stdout |
| CLI flag parsing | [scripts/lib/auto-chain.js:282-297](../../plugins/mccp/scripts/lib/auto-chain.js#L282-L297) `parseFlags()` | `--flag value` + `--bool-flag` + positional `_` |
| Step recording | [scripts/lib/auto-chain.js:191-205](../../plugins/mccp/scripts/lib/auto-chain.js#L191-L205) `recordStep()` | `state-writer.recordChainProgress` + jsonl fallback |
| Sub-step orchestration (no-confirm) | [commands/plan.md](../../plugins/mccp/commands/plan.md) Phase 5 | "Do not skip and do not ask the user between sub-steps. Run all sub-steps in one response." |
| Command markdown structure | [commands/setup.md](../../plugins/mccp/commands/setup.md) + [commands/pr.md](../../plugins/mccp/commands/pr.md) | YAML frontmatter (`description`, `argument-hint`) + Phase 0 preamble + numbered phases |
| Trivial-classifier (NEW — no existing pattern) | n/a | `git diff --numstat` LOC + file count + extension whitelist heuristic, conservative default = full |
| Test fixture (in-memory only) | [scripts/lib/tests/auto-chain.test.js:15-29](../../plugins/mccp/scripts/lib/tests/auto-chain.test.js#L15-L29) `freshHome()` | `os.mkdtempSync` + HOME/USERPROFILE override + try/finally restore |
| fix-task.md write on chain failure | (S8 stop-loop pattern, existing) | `.claude/state/fix-task.md` write + chain stop |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/work.md` | CREATE | `/mccp:work` slash command body (Phase 0 detect, Phase 1 trivial-or-full branch, Phase 2 chain orchestration, Phase 3 error recovery) |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | CREATE | `classifyTrivial()` + `nextStep()` + CLI (`classify` / `next-step` / `record-step`). thin wrapper over `auto-chain.shouldAbort()`. |
| `plugins/mccp/scripts/lib/tests/work-orchestrator.test.js` | CREATE | trivial 매트릭스 (10 cases) + state machine transitions (4 cases) + override-flag precedence (3 cases) |
| `CLAUDE.md` | UPDATE | §1.3 자동화 파이프라인 다이어그램 상단에 `/mccp:work <feature>` 단일 entry 표시 + §4 cheat sheet에 한 줄 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `"version": "0.3.0"` → `"0.3.1"` |
| `.claude/plans/v0-3-1-mccp-work.plan.md` | UPDATE | (본 plan 자체 — implementation 시 status field만 갱신, content는 immutable) |

## Tasks

### Task 1: `classifyTrivial()` + heuristic (work-orchestrator.js §1)

- **Action**: 순수 함수 `classifyTrivial(gitDiff, opts) → { type: 'trivial' | 'full', reason, evidence }`.
  - **trivial 조건 (모두 충족 필요)**:
    1. 변경 파일 수 ≤ 2
    2. 총 LOC change ≤ 20 (added + deleted)
    3. 변경 파일 extension ⊂ `{ '.md', '.txt', '.json', '.yaml', '.yml' }`
    4. 신규 파일 0건 (오직 UPDATE)
    5. git diff 본문에 `function `, `class `, `def `, `import `, `require(` 패턴 무검출 (소스 코드 시그너처)
  - **override precedence (highest first)**:
    1. `opts.forceTrivial === true` → `type: 'trivial', reason: 'user-override-trivial'`
    2. `opts.forceFull === true` → `type: 'full', reason: 'user-override-full'`
    3. heuristic 결과
  - **default (heuristic 결과 ambiguous 또는 git diff parse 실패)**: `type: 'full', reason: 'conservative-default'`
- **Mirror**: [auto-chain.js:44-48](../../plugins/mccp/scripts/lib/auto-chain.js#L44-L48) `envBool()` 의 pure-function 형식 + [auto-chain.js:282-297](../../plugins/mccp/scripts/lib/auto-chain.js#L282-L297) `parseFlags()` 의 CLI 패턴
- **Validate**:
  ```bash
  node --test plugins/mccp/scripts/lib/tests/work-orchestrator.test.js
  # 기대: trivial 매트릭스 10/10 PASS
  ```

### Task 2: `nextStep()` state machine (work-orchestrator.js §2)

- **Action**: `nextStep(currentState, opts) → { step, valid_from, slash_command, halt? }`.
  - State machine:
    ```
    trivial path: init → commit → pr → done
    full path:    init → plan_prd → plan → implement → commit → pr → done
    ```
  - `currentState` 입력은 STATE.md `chain_progress` 또는 caller-provided last record.
  - 각 step 진입 직전 `auto-chain.shouldAbort({ validateCommand: <slash>, decisionId: <slug> })` 호출 → abort 시 `halt: true, reasons: [...]` 반환.
  - PRD 존재 여부 detection: `--prd <path>` arg가 있거나 `<feature>`가 `.prd.md`로 끝나면 plan_prd skip하고 plan으로 진입. v0-3-1 본문 (이 plan)이 PRD 없이 progressed된 케이스이므로 plan_prd가 optional이어야 함.
- **Mirror**: [auto-chain.js:106-171](../../plugins/mccp/scripts/lib/auto-chain.js#L106-L171) `shouldAbort()` opts 형식 (env, repoRoot, validateCommand, decisionId).
- **Validate**:
  ```bash
  node --test plugins/mccp/scripts/lib/tests/work-orchestrator.test.js
  # 기대: 4 state machine transitions PASS (trivial-init→commit, full-init→plan_prd, full-init→plan when --prd given, halt on abort)
  ```

### Task 3: CLI surface (work-orchestrator.js §3)

- **Action**: `runCli(argv)` — subcommands:
  - `classify --feature <text> [--prd <path>] [--full] [--trivial]` → stdout JSON, exit 0
  - `next-step --state <init|plan_prd|plan|implement|commit|pr|done> [--type trivial|full] [--decision <slug>]` → stdout JSON, exit 0 / 13 (halt) / 75 (tempfail bubble-up from auto-chain)
  - `record-step --step <s> --status <ok|failed> [--receipt-path <p>]` → state-writer 위임 (auto-chain.recordStep 재사용)
- **Mirror**: [auto-chain.js:211-280](../../plugins/mccp/scripts/lib/auto-chain.js#L211-L280) `runCli()` 의 dispatch + flag parsing.
- **Validate**:
  ```bash
  node plugins/mccp/scripts/lib/work-orchestrator.js classify --feature "fix typo in README" 2>/dev/null
  # 기대: {"type":"trivial","reason":"heuristic-passed",...} 단, working tree에 실제 git diff가 매칭될 때만. dry-run 모드는 stub.
  node plugins/mccp/scripts/lib/work-orchestrator.js next-step --state init --type full --decision foo
  # 기대: {"step":"plan_prd","slash_command":"/mccp:plan-prd"}
  ```

### Task 4: `/mccp:work` command body ([commands/work.md](../../plugins/mccp/commands/work.md))

- **Action**: 신규 markdown command. 구조:
  ```
  YAML frontmatter:
    description: Single-entry orchestrator — PRD→plan→implement→PR (trivial path 자동 분기)
    argument-hint: "<feature description | path/to/*.prd.md>"
  
  Phase 0 — DETECT
    git status check (dirty working tree → STOP)
    repo root + branch + working tree check
    invoke: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-orchestrator.js classify --feature "<arg>" [--prd <if .prd.md>]
    parse JSON → set TYPE=trivial|full
  
  Phase 1 — BRANCH
    if TYPE=trivial:
      echo "Trivial path: skipping plan/implement, going direct to commit + pr."
      goto Phase 2.T (trivial)
    else:
      echo "Full chain: PRD → plan → implement → PR."
      goto Phase 2.F (full)
  
  Phase 2.T — TRIVIAL CHAIN
    Step 1: /mccp:prp-commit <auto-generated message from arg>
    Step 2: /mccp:pr (Codex bypass via memory rule — auto-apply MCCP_PR_SKIP_CODEX_REVIEW)
  
  Phase 2.F — FULL CHAIN (sequential, no inter-step user confirmation)
    Step 1: /mccp:plan-prd <feature> (or skip if --prd given)
    Step 2: /mccp:plan <prd-or-feature>
    Step 3: /mccp:prp-implement <plan path from Step 2>
    Step 4: /mccp:prp-commit (auto-generated)
    Step 5: /mccp:pr
    
    Between steps: invoke work-orchestrator.js next-step --state <previous> --type full
    If halt: write .claude/state/fix-task.md + STOP (do NOT skip ahead)
  
  Phase 3 — REPORT
    Summarize: type, steps taken, receipt paths, PR URL (if any)
  ```
- **Mirror**: [commands/setup.md](../../plugins/mccp/commands/setup.md) phase 분리 + [commands/pr.md](../../plugins/mccp/commands/pr.md) "no inter-step confirmation" 패턴.
- **Validate**: command-body가 markdown 문법 valid + `argument-hint` frontmatter 존재 검증.
  ```bash
  grep -q "^argument-hint:" plugins/mccp/commands/work.md
  grep -q "^description:" plugins/mccp/commands/work.md
  grep -c "^Phase " plugins/mccp/commands/work.md  # ≥ 4 (Phase 0/1/2.T/2.F/3)
  ```

### Task 5: tests (work-orchestrator.test.js)

- **Action**: node:test runner. 17 testcase 작성:
  - trivial heuristic 10 cases: { typo-fix, README-only, multi-file-docs, json-config-only, code-change, large-diff, new-file, mixed-extension, empty-diff, malformed-diff }
  - state machine 4 cases: { trivial-init→commit, full-init→plan_prd, full-init→plan-when-prd-given, halt-on-receipt-block }
  - override precedence 3 cases: { force-trivial-wins, force-full-wins, both-set-force-trivial-wins (force-trivial first per spec) }
- **Mirror**: [scripts/lib/tests/auto-chain.test.js:15-29](../../plugins/mccp/scripts/lib/tests/auto-chain.test.js#L15-L29) `freshHome()` + try/finally pattern.
- **Validate**:
  ```bash
  node --test plugins/mccp/scripts/lib/tests/work-orchestrator.test.js
  # 기대: 17/17 PASS
  ```

### Task 6: CLAUDE.md §1.3 + §4 update

- **Action**:
  - §1.3 diagram 상단에 `/mccp:work <feature>` 추가 (단일 entry → 자동 분기):
    ```
    /mccp:work <feature>  ← 단일 entry (v0.3.1+)
            ↓ (auto-classify: trivial or full)
    ┌─ trivial: /mccp:prp-commit → /mccp:pr
    └─ full:    /mccp:plan-prd → /mccp:plan → /mccp:prp-implement → /mccp:prp-commit → /mccp:pr
    ```
  - §4 cheat sheet `# 게이트 파이프라인` 블록 최상단에 `/mccp:work <feature>` 한 줄 추가.
- **Mirror**: 기존 §1.3/§4 형식 (한국어 + emoji 없음 + table/code-block).
- **Validate**:
  ```bash
  grep -c "/mccp:work" CLAUDE.md  # ≥ 2
  ```

### Task 7: plugin.json version bump

- **Action**: `"version": "0.3.0"` → `"0.3.1"`. (semver patch — 신규 명령 추가지만 기존 명령 API 변경 0건 + receipt schema 변경 0건이므로 patch 적정.)
- **Mirror**: 기존 bump 패턴 (PR #11이 0.2.x → 0.3.0).
- **Validate**:
  ```bash
  node -e "process.stdout.write(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
  # 기대: 0.3.1
  ```

## Validation

```bash
# 1) Unit tests (Task 5)
node --test plugins/mccp/scripts/lib/tests/work-orchestrator.test.js

# 2) Baseline regression (전체 mccp 테스트 suite — work 추가가 기존 테스트 깨뜨리지 않는지)
node --test plugins/mccp/scripts/**/tests/*.test.js

# 3) Command body smoke
grep -q "^argument-hint:" plugins/mccp/commands/work.md
grep -q "^description:" plugins/mccp/commands/work.md
[ "$(grep -c '^Phase ' plugins/mccp/commands/work.md)" -ge 4 ] || exit 1

# 4) CLI smoke (work-orchestrator.js 실행 가능)
node plugins/mccp/scripts/lib/work-orchestrator.js classify --feature "trivial typo fix" >/dev/null
node plugins/mccp/scripts/lib/work-orchestrator.js next-step --state init --type full --decision tmp >/dev/null

# 5) Cross-doc consistency
grep -c "/mccp:work" CLAUDE.md  # ≥ 2

# 6) plugin.json bump
[ "$(node -e "process.stdout.write(require('./plugins/mccp/.claude-plugin/plugin.json').version)")" = "0.3.1" ] || exit 1

# 7) Receipt chain integrity (regressions)
node plugins/mccp/scripts/receipt/cli.js status --json 2>/dev/null || true   # gate-off 환경이라 informational
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| trivial 오분류로 plan-less mutation 진행 | Medium | High | 5중 AND 조건 + 보수적 default=full + `--full` override flag + 신규 파일 0건 invariant |
| chain 중간 receipt 실패 시 사용자가 어디서 막혔는지 모름 | Medium | Medium | `.claude/state/fix-task.md` write + 명시적 STOP + `next-step` JSON `reasons[]` 전체 노출 |
| 사용자 메모리 "codex permanent bypass" 룰이 `/mccp:work` full chain 도중 모든 게이트에 자동 적용돼야 함 | High (constant) | Low | trivial path는 `/mccp:pr` 단일 step이라 기존 memory 룰 그대로 적용. full path 도중 `/mccp:plan`/`/mccp:prp-implement`도 동일 메모리 자동 적용 (별도 작업 불필요) |
| `git diff --numstat` parse 실패 시 silent classify-as-full로 떨어져 trivial path가 영영 발화하지 않음 | Low | Low | parse 실패 시 `reason: 'diff-parse-failed'`로 명시 + 테스트 케이스로 cover |
| `/mccp:work` invocation이 dirty working tree에서 발화하면 chain 도중 commit이 다른 파일을 끌어옴 | High (operator error) | High | Phase 0 dirty-tree STOP (Phase 2의 prp-implement와 같은 패턴) + 사용자에게 stash 안내 |
| v0.2.8 review-only invariant 와 dual-trigger | Low | Low | `/mccp:work`는 본문에 Edit/Write 호출 0건 (commands/agents만 invoke). pr-phase-guard.js와 충돌 0건 — v0.2.8 머지 후이므로 invariant 자동 적용 |
| auto-chain `cost-state-missing` trigger가 fresh-install 환경에서 false-positive 발화 | Medium | Medium | `cost-state-path.js`가 cost-state 자동 init (이미 S10b ship). work-orchestrator는 auto-chain 결과만 그대로 surface — 별도 처리 불필요 |

## Open Questions

- **MEDIUM (Q3 carry-over from roadmap)**: trivial vs full chain heuristic 정밀도. 본 plan은 5중 AND 조건 + 보수적 default을 채택 — 실제 trivial path 발화율은 v0.3.1 ship 후 1-2주 telemetry로 검증 권고. false-negative (full이어야 하는데 trivial로 분류)는 5중 AND가 막고, false-positive (trivial이어야 하는데 full)는 사용자 `--trivial` override가 막음.
- **LOW**: Phase 2.F Step 1 `/mccp:plan-prd` 자동 invocation — PRD 작성은 본질적으로 사용자와의 대화 turn이 필요. `/mccp:work` 안에서 plan-prd를 호출하면 chain이 inter-step 사용자 응답을 기다리는 비대칭 상태가 됨. 본 plan은 plan-prd도 sequential invoke하지만, 실제 implement 시 plan-prd가 "no-confirm" 모드로 작동하는지 / 사용자 turn을 기다리는지 검증 필요.
- **LOW**: STATE.md `task_fingerprint` 갱신은 v0.3.1 implement 직전 별도 step (현재 fingerprint=`v0-2-8-task-2-6-1-followup` stale). 본 plan scope 밖이지만 Phase 0 invocation 시 stale STATE.md warning을 surface하는 것은 고려 가치.

## Acceptance

- [ ] `plugins/mccp/scripts/lib/work-orchestrator.js` CREATE — classifyTrivial + nextStep + CLI
- [ ] `plugins/mccp/scripts/lib/tests/work-orchestrator.test.js` CREATE — 17 testcases PASS
- [ ] `plugins/mccp/commands/work.md` CREATE — frontmatter + Phase 0/1/2.T/2.F/3
- [ ] `/mccp:work <feature>` end-to-end smoke: trivial 1건 + full 1건 (manual dogfood)
- [ ] trivial vs full heuristic 매트릭스 10 cases PASS
- [ ] receipt-driven progression — 각 단계 valid 후에만 다음 진입 (state-machine test로 mechanical 검증)
- [ ] CLAUDE.md §1.3 + §4 갱신 (grep `/mccp:work` ≥ 2)
- [ ] plugin.json 0.3.0 → 0.3.1
- [ ] 전체 mccp 테스트 suite regression 0건 (`node --test plugins/mccp/scripts/**/tests/*.test.js` baseline + 17 신규 PASS)
- [ ] PR merge to main + roadmap §Status Snapshot 갱신 (Milestone 4 → ✅ shipped)

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 4 (lines 856-878)에 있음. 본 plan은 그 본문을 Patterns / Files / Tasks / Validation / Risks / Acceptance 표준 스키마로 expand.

---

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미설치 — plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true` warning으로 처리. `/mccp:work`는 CLI command이지 UI surface 없음 — design_signal=false도 일치.)

---

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (Claude self-YAGNI triage applied — Codex permanent bypass via MCCP_CODEX_DISABLED=1). No new implement-time decisions detected: all file layout, helper abstraction boundaries (auto-chain wrap pattern), CLI surface, and concurrency model (none — single-shot Node CLI) pre-committed in §Tasks 1-7. Cross-gate dedupe applied.

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill not installed per fork lineage NOTICE — intentional namespace-conflict avoidance. implement mode design_signal=false — no UI surface in this milestone. mccp-implement-codex strict gate yields receipt with `impeccable_skipped=true`, but MCCP_RECEIPT_GATE_MODE=off bypasses downstream PR block.)

## Codex Adversarial Review

> Codex unavailable, skipped (permanent bypass via MCCP_CODEX_DISABLED=1 in `.claude/settings.local.json`): codex_disabled

- 호출: skip (사용자 메모리 [feedback-codex-permanent-bypass.md] + [feedback-codex-runner-disabled-blind.md] 규정에 따라 영구 bypass. `/codex:setup` 재인증 제안 금지가 룰.)
- 라운드 수: 0 (advisory mode, classification=codex_disabled)
- 합치 결론: N/A — Codex 비활성. plan은 Phase 2 GROUND에서 기존 auto-chain.js 패턴을 source-of-truth로 채택하여 신규 chain primitive 발명 0건. implement-time decision 중 architectural risk는 본 plan의 §Risks에 7개 모두 enumerate + mitigation 명시. 만약 추후 Codex token cap 회복 시 R1 re-run 가능.
- YAGNI Triage: (Codex 미발화 — Claude self-triage)
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | (self) chain-state-machine을 별도 lib으로 분리 vs auto-chain.js wrap | LOW | REJECT_YAGNI | 기존 auto-chain의 8-trigger fail-closed + tempfail exit이 그대로 적용 가능. wrap이 inheritance보다 간결. |
  | (self) trivial heuristic 4-condition vs 5-condition | LOW | ACCEPT_NOW | 5조건이 false-positive(non-trivial을 trivial로 오분류) 가능성을 효과적으로 차단. parser cost 증가 ~10ms 무시 가능. |
  | (self) `/mccp:plan-prd` 자동 invocation 가능 여부 | MEDIUM | DEFER_TO_BACKLOG | plan-prd가 inter-step 사용자 응답을 기다리는 비대칭 — implement 시 검증 필요. backlog file에 기록. |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 위 §Open Questions 3개 (Q3 carry-over MEDIUM + plan-prd no-confirm LOW + STATE.md stale LOW)
- Codex session 참조: N/A (no live session — permanent bypass)
