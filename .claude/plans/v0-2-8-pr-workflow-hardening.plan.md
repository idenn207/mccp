# Plan: v0.2.8 — PR Workflow Hardening (Milestone 2.6)

**Status**: ✅ **DECISIONS APPROVED (B+D+C + α+β)** — Codex PLAN-CODEX gate active, R4 absorbed
**Plugin version**: 0.2.7 → **0.2.8**
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 2.6
**Origin**: 2026-06-05 사용자 보고 — 2개의 workflow UX defect
**Codex review**: R1 → R2 → R3 (cap-at-3) → R4 (2026-06-06 OAuth 복구 후 재진입, 3 HIGH/MED findings absorbed) → R5 pending verification
**Decision lineage**: 2026-06-06 user AskUserQuestion 응답 — Decision 1 = B+D+C (권장), Decision 2 = α+β (권장). R4 absorb 후 Task 2.6.5 narrow scope 진행 (user 결정 2026-06-06).

---

## Summary

`/mccp:pr` + `/mccp:prp-pr`에서 Codex review가 사용자 의도(PR 생성)를 fix-cycle로 변질시키는 문제, 그리고 IDE markdownlint warning이 Claude tool-result로 surface돼 반복 처리되는 노이즈를 제거.

**Positioning**: workflow UX defect 보완. **value prop(dual-reviewer)을 PR step에서도 유지하는 게 1차 목표**, "Codex 제거"는 fallback. 진짜 통증은 review 자체가 아니라 review 직후의 mutation impulse이므로, 본 milestone은 두 경로를 분리.

## Approved Decisions (2026-06-06)

### Decision 1: Task 2.6.1 = **B + D + C** ✅

- **B** — Codex review 유지, findings은 PR body `## Codex Review` section에만 inject. command 본문에 `Findings → PR body only. NO Edit/Write calls in this command. Fix-cycle은 사용자가 별도로 /mccp:plan 또는 /mccp:prp-implement 호출 시에만 진입.` invariant block 명시.
- **D** — cross-gate dedupe: plan-codex + implement-codex 둘 다 verdict=approve + same decision-slug → PR step Codex 재호출 skip. receipt meta `codex_dedupe_at_pr=true`, `codex_dedupe_source=["mccp-plan-codex/<slug>", "mccp-implement-codex/<slug>"]`. v0.2.6 derive-decision plan-path 통일 SHIPPED — 활성화 조건 충족.
- **C** — `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape. reason 비어있거나 1-token → schema REJECT (v0.2.6 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` reason validator helper 재사용). receipt meta `codex_skipped_at_pr=true` + `codex_skip_reason=<reason>` + PR body footer `## Codex Review Skipped` section auto-inject.
- **A 거부 근거**: dual-reviewer value prop 손실. PR step에서도 cross-model adversarial 가치 보존이 1차 목표.

### Decision 2: Task 2.6.2 = **α + β** ✅

- **α (primary)** — `post-edit-format.js`에 `.md` 분기 추가, `code --reuse-window --command "markdownlint.fixAll"` 호출. 사용자 VSCode + davidanson.vscode-markdownlint extension 신뢰 — mccp는 *trigger*만 담당.
- **β (fallback)** — VSCode CLI 미가용 시 (headless CI, WSL host mismatch, code.cmd shim 부재) `npx markdownlint --fix` 호출. 양쪽 미가용 시 silent noop + STATE.md `markdownlint_skipped` telemetry.
- **γ deferred** — `MCCP_SUPPRESS_MD_DIAGNOSTICS_FEEDBACK=1` env로 IDE diagnostics surface suppress하는 강수는 v0.2.7 hook-trace 인프라 안정화 후 별도 cycle에서 amend 검토. v0.2.8은 trigger-based 처리만.

## Pre-flight diagnostic (plan 작성 시 수행)

- `mccp/scripts/hooks/` grep `markdownlint|markdown-lint|md-lint` → **0건** → markdown lint hook은 mccp 직접 보유 아님. 노이즈 출처는 IDE integration 또는 user-level hook.
- 해결책: lint resolve를 IDE extension에 위임해 warning이 *생성되기 전에* fix되도록 trigger.

## Tasks (B+D+C + α+β APPROVED)

### Task 2.6.1: `/mccp:pr` + `/mccp:prp-pr` review-only invariant

**Action**:

1. [commands/pr.md](../../plugins/mccp/commands/pr.md) + [commands/prp-pr.md](../../plugins/mccp/commands/prp-pr.md) 본문 amend:
   - Phase N (Codex review): findings은 **PR body `## Codex Review` section에만 inject**.
   - 명시적 invariant block: `Findings → PR body inject only. NO Edit/Write calls in this command. Fix-cycle은 사용자가 별도로 /mccp:plan 또는 /mccp:prp-implement 호출 시에만 진입.`
2. Cross-gate dedupe 활성화:
   - plan-codex + implement-codex 둘 다 verdict=approve + same decision-slug → PR step Codex 재호출 skip.
   - Receipt meta 추가: `codex_dedupe_at_pr=true`, `codex_dedupe_source=["mccp-plan-codex/<slug>", "mccp-implement-codex/<slug>"]`.
   - dedupe 조건 미충족 시 fallback은 정상 Codex 호출 (B의 review-only invariant 적용).
3. `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape (default off):
   - reason 비어있거나 1-token → schema REJECT (v0.2.6 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` mirror).
   - Reason 명시 → Codex review 호출 skip + receipt meta `codex_skipped_at_pr=true` + `codex_skip_reason=<reason>` + PR body footer `## Codex Review Skipped` section auto-inject.
4. Receipt schema에 `meta.codex_review_actionable_findings` (boolean) — findings이 있어도 mutation 안 했다는 audit trail.
5. **Runtime PR-phase guard (F1 absorption from Codex R1 + R2-F1 + R3-F1/F2 tightening)** — declarative invariant만으로는 single AI lapse를 막을 수 없음. mechanical enforce 추가:
   - `pr-phase-guard.js` (PreToolUse + PostToolUse hook + SessionEnd snapshot):
     - **Lock scope + concrete enter/exit protocol (R3-F1 + R4-F2 commitments, BLOCKING)**: lock은 **Codex-review subphase**에만 활성 — `/mccp:pr` 전체 lifetime이 아님. PR command는 `gh pr create`/`git push`/`gh api` 등 Bash 호출이 필수이므로 blanket block은 command 자체를 brick함.
       - **Enter (R4-F2)**: `/mccp:pr` command body의 Phase 3.5 (Codex adversarial review) 진입 직전 첫 Bash 호출 — `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js" enter --run-id "$RUN_ID" --pid $$ --subphase codex-review --branch "$BRANCH"` (RUN_ID = `node -e 'console.log(crypto.randomUUID())'`로 생성, env로 export). 이 호출이 baseline snapshot (head_sha + index_tree + porcelain_z + dirty_content_hashes) 수집 + `.claude/state/pr-phase.lock` write를 책임.
       - **Exit normal (R4-F2)**: Phase 3.5 종료 직전 (Codex findings을 PR body에 inject한 직후, gh pr create 직전) — `node ... pr-phase-lock.js exit --run-id "$RUN_ID"`. 이 호출이 finalizer 실행 (baseline 비교 → mutation_files 산출 → PR-Codex receipt verdict downgrade if mutations detected → lock file delete).
       - **Exit on crash (R4-F2)**: 다음 `/mccp:pr` 또는 validate-cmd 호출의 Phase 0 preflight에서 orphan lock detection — `pr-phase-lock.js detect-stale` → orphan 발견 시 finalizer 우선 실행 (baseline 검증) → lock clear → fresh run 시작.
       - **run_id propagation (R4-F2)**: lock file 자체가 single source of truth. PreToolUse/PostToolUse hook은 lock file을 read해서 run_id/subphase를 가져옴 — env 변수 의존 없음. command body는 RUN_ID env로 propagate.
       - **Boundary tests (R4-F2)**: `pr-phase-lock-boundary.test.js` — (a) Phase 3.5 entry 전 Bash는 hook noop, (b) Phase 3.5 내 Edit은 block, (c) Phase 3.5 exit 후 gh pr create는 정상 통과, (d) crash recovery — entry 후 kill -9, 다음 invocation에서 finalizer 실행 후 orphan clear, (e) subphase=codex-review 외 lock file은 hook이 read만 하고 enforcement skip.
       - Phase 3.5 외 (git ops, gh CLI, body templating)는 정상 동작.
     - **Stale-lock recovery (R3-F1 commitment, BLOCKING)**: orphan lock 발견 시 자동 recovery. (1) `run_id` + `pid` + `started_at`을 lock에서 read. (2) pid가 살아있고 start_time이 일치 → 정상 lock, respect. (3) pid 없음/start_time 불일치 → orphan. orphan path: git finalizer 우선 실행 (baseline 검증으로 mutation 기록 보존) → 그 후 lock clear. 이를 통해 crash 시에도 mutation evidence 유지 + 다음 invocation block 해소.
     - **Lock metadata 확장 (R3-F1 + R3-F2 + R4-F1 commitments)**: `.claude/state/pr-phase.lock` 스키마 — `{ "run_id": "<uuid>", "started_at": "<ISO>", "pid": <int>, "branch": "<name>", "subphase": "codex-review", "baseline": { "head_sha": "<HEAD>", "index_tree": "<git write-tree>", "porcelain_z": "<base64 of `git status --porcelain=v1 -z --untracked-files=all`>", "dirty_content_hashes": { "<path>": "sha256:<hex>", ... } } }`. **`dirty_content_hashes` (R4-F1 absorption, BLOCKING)**: lock entry 시점에 porcelain_z에 등장하는 모든 modified/untracked path를 enumerate해서 각 파일 내용의 sha256을 계산해 저장. finalizer는 porcelain_z byte-equal 비교 외에 추가로 dirty_content_hashes 각 entry를 재계산해서 변경 detection — pre-existing dirty/untracked path가 PR-phase에서 in-place mutation되어도 porcelain status는 그대로지만 content hash가 변경되므로 mutation evidence 보존. `git stash create`는 폐기 — clean tree에서 empty stash 반환하는 R3-F2 trap 차단.
     - **Blanket write-tool block (R2-F1 commitment, Codex-review subphase 한정)**: PreToolUse hook은 `Edit|Write|MultiEdit|NotebookEdit|Bash` (write 가능 subcategory 포함) + 향후 mutation-capable tool — `disable-tool-on-phase` 화이트리스트 패턴 적용 (default-deny). Codex-review subphase에서만 발화. 다른 phase에서는 hook noop.
     - **Bash sub-allow rule (R3-F1 commitment)**: subphase가 codex-review여도 Bash 호출 중 **read-only command catalog** (allowlist: `gh api ... GET`, `git status`, `git log`, `git diff`, `git rev-parse`, `cat`, `node ... receipt validate ...`)는 통과. 명확한 mutation pattern (`git commit`, `git push`, `gh pr create`, `gh api ... PATCH/POST`, `rm`, `mv`)은 block. 모호한 경우 default-deny.
     - **PostToolUse success record (R2-F1 commitment)**: 성공한 PostToolUse도 lock 활성 동안 file path + tool name + run_id + timestamp를 shard에 기록. hook-trace ledger schema 확장 (phase/tool/file_path 필드, 옵셔널 — v0.2.7 fail-open invariant 유지).
     - **Git finalizer with full baseline (R3-F2 + R4-F1 commitment, BLOCKING)**: lock release 시점 (Codex-review subphase 종료) — baseline에서 read한 `head_sha`/`index_tree`/`porcelain_z`/`dirty_content_hashes`와 현재 state 비교. (1) `git status --porcelain=v1 -z --untracked-files=all` 재실행하여 porcelain_z byte-equal 비교 — 새로운 dirty/untracked path 등장 시 즉시 mutation. (2) **dirty_content_hashes re-verify (R4-F1)**: baseline의 각 dirty path에 대해 현재 file content sha256을 재계산해 비교 — pre-existing dirty/untracked path가 in-place mutation되면 porcelain은 동일하지만 content hash가 변경되므로 mutation evidence 기록. baseline 시점 이후 파일 삭제도 detection (hash readFile 실패 → mutation_files entry with reason="deleted-during-subphase"). (3) 차이 검출 시 정확한 diff를 `mutation_files`에 기록 — porcelain delta + content hash delta 모두 evidence. (4) **missing baseline 시 guard failure** — lock metadata에 baseline 필드(특히 dirty_content_hashes) 부재면 receipt verdict를 `needs-attention` + `pr_phase_guard_baseline_missing=true`로 강제. silent fail-open 금지.
   - 사용자가 의도적으로 fix-cycle 필요 시: `/mccp:pr` 종료 (lock release) 후 별도 `/mccp:plan` 또는 `/mccp:prp-implement` 호출 (declarative invariant + runtime guard + git baseline 3중 일치).

**Mirror**:
- [code-review.md:151-162](../../plugins/mccp/commands/code-review.md#L151-L162) cross-gate dedupe.
- [pr.md:120](../../plugins/mccp/commands/pr.md#L120) audit note inject 패턴.
- v0.2.6 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` reason validator (force-override-reason.js helper 재사용).
- v0.2.4 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`.

**Validate**:
- `pr-codex-no-automutation.test.js`: Codex review가 findings 반환 후 body가 Edit/Write 호출 안 함.
- `pr-codex-dedupe.test.js`: same decision-slug + both approve → skip + receipt meta 정확.
- `pr-codex-skip-env.test.js`: reason 분기 (force-override-reason.js helper 재사용).
- Grep guard: `grep -nE "Edit\(|Write\(" plugins/mccp/commands/{pr,prp-pr}.md` review 후 mutation 0건.
- Receipt fixture: `codex_dedupe_at_pr` + `codex_skipped_at_pr` + `codex_review_actionable_findings` 3-axis matrix.

**Open Questions**:
- ~~**HIGH (Q1)**: review-only invariant의 mechanical enforce 방법?~~ **ABSORBED → Action #5 (Codex R1 F1, 2026-06-06)**. v0.2.7 hook-trace ledger schema가 successful PostToolUse Edit/Write를 미기록 → declarative만으로는 single AI lapse를 못 막음. Runtime PR-phase guard (pr-phase-guard.js) + hook-trace ledger 확장 + PR-Codex receipt verdict downgrade로 mechanical enforce.
- **MEDIUM (Q2)**: ~~A/B/C/D 조합~~ **RESOLVED 2026-06-06 → B+D+C** (user confirmation).
- **MEDIUM (Q3)**: dedupe에 `mccp-code-review` receipt도 포함할지?
- **LOW (Q4)**: `codex_review_actionable_findings` field plan/implement step backport 여부?

### Task 2.6.2: IDE markdownlint warning 노이즈 제거 (VSCode extension delegation)

**Action**:

0. **EMPIRICAL Q5 PROBE (F2 absorption + R2-F2 fixture gate, BLOCKING, pre-implement)**: VSCode commandId `markdownlint.fixAll`가 davidanson.vscode-markdownlint extension에서 실제 동작하는지 **controlled fixture로 검증**. spawn mock + exit 0 검사만으로는 dead α를 못 막음 (R2-F2: VSCode가 commandId 인식 없이도 exit 0 가능).
   - **Fixture preparation**: `.claude/PRPs/reports/q5-fixture/probe.md` 작성 — 알려진 lint violation 5개 (MD009 trailing-spaces 2건, MD012 multi-blanks 1건, MD032 lists-no-blanks 1건, MD034 bare-url 1건) 포함.
   - **Pre-state baseline**: `npx markdownlint .claude/PRPs/reports/q5-fixture/probe.md` → 5 violations 확인 + exit 1 + sha256 기록.
   - **α invoke**: `code --reuse-window --command markdownlint.fixAll .claude/PRPs/reports/q5-fixture/probe.md` — exit/stderr/stdout 모두 capture.
   - **Post-state verification (R2-F2 commitment)**: `npx markdownlint .claude/PRPs/reports/q5-fixture/probe.md` → 동일 fixture에 violations 0건 + exit 0 도달 여부 검증.
     - **α PASS**: post-state lint clean + sha256 변경 → `α_status=pass`.
     - **α FAIL (silent — R2-F2 trap)**: exit 0 + post-state 여전히 5 violations → `α_status=silent_failure`. **이 경우 α path는 production에서 사용 금지** — implement 단계에서 β-only 또는 alternative commandId 모색.
     - **α FAIL (explicit)**: exit non-0 또는 stderr에 commandId-not-found 패턴 → `α_status=explicit_failure`.
   - **결과 기록**: `.claude/PRPs/reports/q5-vscode-markdownlint-probe-<date>.md` — α_status, post-state sha256, lint diff (before/after), VSCode/extension version, OS, fallback decision.
   - **Gate**: `α_status=pass` 외의 경우 plan 본문 amend 필수 (β-only 전환, 또는 정확한 commandId 도입 후 재probe). dead α path로 ship 금지.
1. [post-edit-format.js](../../plugins/mccp/scripts/hooks/post-edit-format.js)에 `.md` 분기 추가:
   ```js
   if (filePath && /\.md$/.test(filePath)) {
     // α path — F2 + R2-F2 + R3-F3 + R4-F3 absorption: per-invocation evidence gate.
     // R4-F3: fileChanged alone is NOT sufficient — VSCode can mutate the file (whitespace,
     // EOL normalization) without resolving lint findings. Alpha success requires lint
     // CLEAN or strictly-fewer findings vs pre-state. stdout.length proxy is dropped.
     const codeBin = findCodeCli();
     const mdLintBin = resolveBin(projectRoot, 'markdownlint');
     // countMarkdownlintFindings — markdownlint CLI prints one finding per line to stderr
     // (default) or stdout (with --output). Use --json for stable counting.
     function countLint(binPath, file) {
       if (!binPath) return null;
       const r = spawnSync(binPath, ['--json', file], { encoding: 'utf8', timeout: 3000 });
       try {
         const obj = JSON.parse(r.stdout || '{}');
         const total = Object.values(obj).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
         return { status: r.status, count: total };
       } catch { return { status: r.status, count: null }; }
     }
     if (codeBin) {
       try {
         const preLint = countLint(mdLintBin, filePath);
         const r = spawnSync(codeBin, ['--reuse-window', '--command', 'markdownlint.fixAll', filePath], { encoding: 'utf8', timeout: 5000 });
         const postLint = countLint(mdLintBin, filePath);
         const stderrBad = /Command .* not found|Unknown command/i.test(r.stderr || '');
         // R4-F3 success condition — only count-based evidence accepted:
         //  (a) postLint clean (count === 0), OR
         //  (b) preLint had findings AND postLint count strictly less than preLint count.
         //  fileChanged is now LOGGED but never a success signal on its own.
         const lintClean = postLint && postLint.count === 0;
         const lintStrictlyReduced = preLint && postLint &&
           typeof preLint.count === 'number' && typeof postLint.count === 'number' &&
           preLint.count > 0 && postLint.count < preLint.count;
         const noLintBin = !mdLintBin;
         if (r.status === 0 && !stderrBad && (lintClean || lintStrictlyReduced || noLintBin)) {
           stateWriter.recordTelemetry({ markdownlint_alpha_ok: true, preCount: preLint?.count, postCount: postLint?.count, noLintBin });
           return rawInput;
         }
         const failReason = stderrBad ? 'commandid-not-found'
           : (r.status !== 0 ? `exit=${r.status}`
           : (preLint && postLint && postLint.count >= preLint.count) ? 'lint-not-reduced'
           : 'noop-exit-0');
         stateWriter.recordTelemetry({ markdownlint_alpha_failed: true, reason: failReason, preCount: preLint?.count, postCount: postLint?.count });
         // fall through to β
       } catch (e) { stateWriter.recordTelemetry({ markdownlint_alpha_failed: true, reason: e.code || e.message?.slice(0, 200) }); }
     }
     // β path — guaranteed runs whenever α did not produce lint-count evidence of work
     if (mdLintBin) {
       try { execFileSync(mdLintBin, ['--fix', filePath], { stdio: 'ignore', timeout: 5000 }); return rawInput; } catch {}
     }
     stateWriter.recordTelemetry({ markdownlint_skipped: true, reason: 'no-cli' });
     return rawInput;
   }
   ```
2. `findCodeCli()` helper: `code` PATH lookup + Windows `code.cmd` shim + WSL `code-insiders` fallback.
3. 본 task는 markdown lint hook을 **새로 만들지 않음** — 기존 IDE extension trust. mccp 책임은 *호출 trigger* 만.
4. (선택) Q5 RESOLVED 시 γ 추가: `MCCP_SUPPRESS_MD_DIAGNOSTICS_FEEDBACK=1` env로 IDE diagnostics 후처리 필터링. v0.2.7 hook-trace 인프라 재사용.

**Mirror**:
- [post-edit-format.js](../../plugins/mccp/scripts/hooks/post-edit-format.js) JS/TS formatter dispatch.
- [resolve-formatter.js](../../plugins/mccp/scripts/lib/resolve-formatter.js) PATH lookup.
- v0.2.3 [dep-check.js:53-59](../../plugins/mccp/scripts/lib/dep-check.js#L53-L59) CLI PATH probe.

**Validate**:
- `post-edit-format-md.test.js`: `.md` Write 후 `code --command markdownlint.fixAll` 호출 (spawn mock).
- VSCode CLI 미가용 → β fallback + markdownlint CLI 호출 검증.
- 양쪽 미가용 → silent noop + STATE.md `markdownlint_skipped` telemetry.
- 사용자 dogfood (Win11 + VSCode + davidanson.vscode-markdownlint): `.md` Write 5회 → IDE diagnostics surface 0건.

**Open Questions**:
- ~~**HIGH (Q5)**: VSCode CLI `code --command markdownlint.fixAll` 실제 syntax 검증~~ **ABSORBED → Action #0 BLOCKING (Codex R1 F2, 2026-06-06)**. implement 진입 전 empirical probe 의무화. probe 결과 commandId 잘못 시 plan amend (정확한 commandId 또는 β-only 전환) 후에야 implement 가능.
- **MEDIUM (Q6)**: ~~α/β/γ 조합~~ **RESOLVED 2026-06-06 → α+β** (user confirmation, γ deferred).
- **MEDIUM (Q7)**: WSL/remote SSH 환경 호환성 — `code` CLI host invoke 검증 필요 (Action #0 probe와 함께 수행).
- **LOW (Q8)**: 노이즈 출처 IDE diagnostics vs user-level hook 잔재? 사용자 환경 grep 권장 (`Get-ChildItem $env:USERPROFILE\.claude\hooks\` markdown 관련).

### Task 2.6.5: validate-cmd generic decision_id hardening (Codex R1 F1 absorption from roadmap thin-index)

**Origin**: roadmap thin-index transform 시 Codex R1 F1 — `/mccp:pr` on `main` branch가 stale `mccp-implement-codex/main.json` (v0.1 era, unrelated plan_hash)을 chain validate에서 oring하는 false-green path 발견. [.claude/PRPs/reports/receipt-audit-2026-06-06.md](../PRPs/reports/receipt-audit-2026-06-06.md) §F-RA-1.

**Symptom**: terminal branch-based 명령(특히 `/mccp:pr`)이 decision_id를 branch에서 derive. main branch → `decision_id=main` → `mccp-implement-codex/main.json` validate (plan_hash 검사 없이 exit 0 = false-green).

**Action** (BLOCKING — Codex R1 F3 absorption mandates (i) + (iv) ordering: auto-quarantine ships BEFORE validate-cmd reject activates):

| 옵션 | 동작 | Trade-off |
|---|---|---|
| (i) validate-cmd 강화 | generic decision_id (`default`/`main`)는 plan_hash mismatch 시 **reject**. `--plan` flag 없으면 generic 거부. | 기존 사용자 환경의 v0.1 receipt가 즉시 blocking → **(iv) 선행 필수 (F3 absorption)** |
| (ii) `/mccp:pr` decision-slug 변경 | branch-only → `branch + plan-fingerprint` composite. 또는 plan-path 우선 derive. | derive-decision API 변경 — backward compatibility 영향. **deferred to v0.3.x** |
| (iii) Quarantine runbook (manual) | CLAUDE.md §4에 quarantine 절차 문서화 | manual trigger 필요 |
| **(iv) AUTO-QUARANTINE migration (NEW, F3 absorption)** | `v0.2.8-generic-receipt-quarantine.js` — one-shot idempotent script. validate-cmd 또는 `/mccp:pr` 부팅 시 자동 트리거 (per-worktree marker). | 사용자 manual 개입 없이 generic receipt 자동 격리 → "왜 갑자기 PR이 안 되지?" hard-fail UX 회피 |

**채택 결합**: **(i) + (iii) + (iv)** — (iv)가 mechanical guarantee, (iii)은 fallback 문서. (ii)는 derive-decision API 변경 risk가 커 별도 cycle (v0.3.x?) deferral.

**(iv) auto-quarantine 상세 (R2-F3 + IMPL-R1-F1/F2 absorption: resumable + collision-safe + receipt-store driven + concurrency-locked)**:
- 위치: `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js`.
- **검출 대상 (IMPL-R1-F1 absorption, BLOCKING)**: receipt-store/alias-matrix driven scan — `.claude/receipts/<gate_id>/<decision>.json` 전체 universe에서 `gate_id ∈ GATE_IDS` AND `decision_id ∈ {default, main}` 필터. hardcoded 4-path 폐기. 이렇게 하면 (a) `mccp-pr-codex/{default,main}.json` (`/mccp:code-review` PR mode 잔재) 자동 cover, (b) 미래 신규 gate namespace 추가 시 별도 migration 수정 없이 cover, (c) marker/migration metadata directory(`.migrations/`)만 explicit exclude. helper: receipt/store.js 또는 신규 `listGenericReceipts(repoRoot)` 함수.
- **Collision-safe rename (R2-F3 commitment)**: 각 source 파일을 `<slug>.legacy.json`으로 rename 시도.
  - target 부재 → 정상 rename.
  - **target 존재 시 (collision)**: source를 collision-safe legacy 이름으로 이동 — `<slug>.legacy-<ISO_TS>.json` (e.g., `default.legacy-2026-06-06T08-30-12Z.json`). active source는 **절대 보존되지 않음** — R2-F3가 지적한 "active source 영구 보존" trap 차단.
  - source 부재 → noop.
- **Marker semantics 재설계 (R2-F3 commitment)**: marker는 *시작*이 아니라 *완료* 상태만 기록.
  - run 종료 시 다시 검출 대상 8 경로 scan. **active generic source receipts 0개**일 때만 `state="complete"` marker 작성.
  - 1개라도 active source 잔존 시 `state="partial"` marker — `pending: [...]` + `last_error: <message>` 기록. 다음 run에서 marker 발견 시 noop이 아니라 **resume** — pending 항목만 재시도.
  - 사용자 manual 개입 후 다시 trigger 시 marker가 partial이라도 retry 진입.
  - Marker 스키마: `.claude/receipts/.migrations/v0.2.8-generic-quarantine.json` — `{ "state": "complete"|"partial"|"failed", "runs": [{ "ran_at": "<ISO>", "renamed": [...], "collided_moved": [{ "from": "...", "to": "...legacy-<ts>.json" }], "errors": [...] }], "pending": [...], "worktree": "<absolute path>" }`.
- **Resumability invariant (R2-F3 commitment)**: 같은 worktree에서 script 재실행 시 marker state별 분기 — `complete` → noop, `partial`/`failed` → pending 항목만 재시도, 부재 → 전체 scan.
- **Concurrency lock (IMPL-R1-F2 + IMPL-R2-F1 absorption, BLOCKING)**: dual auto-trigger로 인한 scan+rename+marker race 해소. (1) `.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock` exclusive lock — `fs.openSync(lockPath, 'wx')` (O_EXCL|O_CREAT|O_WRONLY) create-new semantics. lock 내용: `{ "pid": <int>, "started_at": "<ISO>", "host": "<hostname>" }`. (2) **Lock loser behavior (IMPL-R2-F1 absorption, BLOCKING)**: lock 획득 실패 시 (다른 process 이미 진행중) → noop pass-through 대신 **marker complete bounded poll** — `.claude/receipts/.migrations/v0.2.8-generic-quarantine.json` 100ms 간격 최대 20회 (총 2초) 검사하여 `state="complete"` 도달 대기. (a) 2초 내 complete → 정상 진행 (post-migration state 보장). (b) 2초 timeout / `state="partial|failed"` → visible systemMessage "v0.2.8 generic-receipt quarantine migration in progress, command aborted — retry" + caller (validate-cmd/`/mccp:pr` Phase 0)가 exit 75 (EX_TEMPFAIL) 또는 systemMessage-only abort. 이렇게 하면 loser가 winner의 mid-migration state(stale receipt 부분 잔존)를 false-green으로 읽는 timing window 차단. (3) **stale-lock recovery**: lock 발견 시 `started_at` parse → 60초 초과 OR `pid` not alive (`process.kill(pid, 0)` try/catch) → orphan으로 판단 → lock unlink 후 본인이 재시도. 60초는 마이그레이션 worst case (8 collision rename + marker write) × 안전계수. (4) lock release: `try/finally`로 정상/비정상 종료 모두 unlink 보장.
- Trigger:
  - validate-cmd entry point 최상단에서 marker 검사 → `complete` 아니면 migration 실행 → 끝난 후 reject 로직 진입.
  - `/mccp:pr` Phase 0 (preflight)에서 동일 트리거.
  - 동시 trigger 시 IMPL-R1-F2 lock으로 직렬화 — 첫 process(winner)만 mutate, loser는 IMPL-R2-F1 absorption 따라 marker complete bounded poll (max 2s @ 100ms). complete 도달 시 정상 진행, timeout 시 systemMessage emit + exit 75 (EX_TEMPFAIL). loser가 stale state로 reject 로직 진입 차단 invariant.
- Test 케이스 (BLOCKING — 8-axis, R2-F3 + IMPL-R1-F1/F2 expanded):
  - **(a) fresh worktree** (4 generic receipts 존재, marker 부재) → 모두 rename, marker `state="complete"`, exit 0.
  - **(b) already-migrated** (marker `state="complete"`) → noop, log only.
  - **(c) partial run** — script 실행 중 file 2개 처리 후 process kill로 시뮬레이션 → 다음 run에서 pending 2개 재시도 + marker → `complete`.
  - **(d) collision** — source `default.json` + target `default.legacy.json` 둘 다 존재 → source를 `default.legacy-<ts>.json`으로 이동 (active source 보존 금지 — R2-F3 invariant). marker `collided_moved` entry.
  - **(e) collision + interrupt** — 2개 collision 중 1개 처리 후 kill → 재실행 시 남은 1개 처리 + marker `state="complete"`.
  - **(f) error path** — file system permission error로 rename 실패 → marker `state="failed"` + `errors` + `pending` 기록. validate-cmd가 systemMessage로 사용자 안내.
  - **(g) IMPL-R1-F1 scope expansion** — `mccp-pr-codex/{default,main}.json` fixture 추가. receipt-store driven scan이 발견 + quarantine. `code-reviewer/{default,main}.json` 등 신규 future-gate fixture도 자동 cover. hardcoded path scan 회귀 test (assert NOT in source code).
  - **(h) IMPL-R1-F2 + IMPL-R2-F1 concurrent migration** — 두 child process가 동시에 migrate() 호출 → 한 process만 lock 획득 + rename 진행, 다른 process는 **bounded poll on marker** (max 2s @ 100ms). (h1) winner mid-migration 중 loser polling → winner complete → loser proceed with post-migration state assertion (stale receipt 0건 관측). (h2) loser timeout (winner stuck > 2s) → exit 75 (EX_TEMPFAIL) + systemMessage emit 검증 — loser가 stale state로 reject 로직 진입 안 함 invariant 확인. (h3) stale-lock recovery (60초 초과 mock + pid alive=false → orphan 인식 후 진행).

**Validate**:
- `validate-cmd-generic-reject.test.js`: `--decision default --plan <unrelated path>` → exit ≠ 0 + diagnostic message
- `validate-cmd-explicit-pass.test.js`: `--decision <slug> --plan <matching path>` → exit 0
- `/mccp:pr` on `main` branch fixture (현재 working-tree v0.1 receipt 잔재 가정) → quarantine 적용 없이는 PR gate fail (mechanical false-green 제거 확인)

**Risk**:
- 기존 사용자 환경의 generic receipt가 즉시 blocking → CLAUDE.md §4 cheat sheet에 quarantine runbook 추가 필수
- v0.2.6 derive-decision plan-path 통일과 일관성 — (ii) 옵션은 거기서 이미 완료된 의도를 backport해야 함

### Task 2.6.3: CLAUDE.md §1.2 + §4 갱신

**Action**:
- §1.2 dual-reviewer 본문: "PR step은 cross-gate dedupe + review-only invariant로 보호 유지. Codex 직접 호출은 dedupe 조건 미충족 시에만 발화."
- §4 cheat sheet: `MCCP_PR_SKIP_CODEX_REVIEW`, `MCCP_SUPPRESS_MD_DIAGNOSTICS_FEEDBACK` (γ 채택 시).

### Task 2.6.4: plugin.json bump + PR

- 0.2.7 → 0.2.8.
- PR: `/mccp:pr` (본 PR이 review-only invariant + dedupe **자체 dogfood** — Task 2.6.1 변경사항이 PR 생성 시점에 active).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Review-only invariant | (new) | `code-review.md` reuse-first + 명시적 invariant block |
| Cross-gate dedupe | [code-review.md:151-162](../../plugins/mccp/commands/code-review.md#L151-L162) | plan/implement receipt 결합 |
| Audited escape env | [pr.md](../../plugins/mccp/commands/pr.md) `MCCP_FORCE_PR_WITHOUT_*` | reason validator 통한 schema REJECT |
| Post-edit hook dispatch | [post-edit-format.js](../../plugins/mccp/scripts/hooks/post-edit-format.js) | 확장자별 분기 + graceful degradation |
| CLI PATH probe | [dep-check.js:53-59](../../plugins/mccp/scripts/lib/dep-check.js#L53-L59) | PATH lookup + Windows shim |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/pr.md` | UPDATE | review-only invariant + dedupe + skip env |
| `plugins/mccp/commands/prp-pr.md` | UPDATE | alias inheritance |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.codex_dedupe_at_pr`, `codex_skipped_at_pr`, `codex_skip_reason`, `codex_review_actionable_findings` |
| `plugins/mccp/scripts/receipt/lib/force-override-reason.js` | UPDATE (재사용) | `MCCP_PR_SKIP_CODEX_REVIEW` reason 검증 |
| `plugins/mccp/scripts/receipt/tests/pr-codex-{no-automutation,dedupe,skip-env}.test.js` | CREATE | 3 fixture matrix |
| `plugins/mccp/scripts/hooks/post-edit-format.js` | UPDATE | `.md` 분기 + α+β fallback + α silent failure telemetry (F2 absorption) |
| `plugins/mccp/scripts/hooks/tests/post-edit-format-md.test.js` | CREATE | spawn mock + α `markdownlint_alpha_failed` telemetry assertion + β fallback assertion |
| `plugins/mccp/scripts/lib/find-code-cli.js` | CREATE | VSCode CLI PATH probe helper |
| **`plugins/mccp/scripts/hooks/pr-phase-guard.js`** | **CREATE** | **F1 absorption — `/mccp:pr` 진입 시 phase marker + PreToolUse Edit/Write 차단 + PostToolUse 성공한 mutation 기록** |
| **`plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js`** | **CREATE** | **F1 absorption — phase marker lifecycle + Edit/Write block + hook-trace shard 기록 검증** |
| **`plugins/mccp/scripts/state/hook-trace.js`** | **UPDATE** | **F1 absorption — ledger schema에 `phase`, `tool`, `file_path` 필드 추가 (successful PostToolUse 기록)** |
| **`.claude/PRPs/reports/q5-vscode-markdownlint-probe-2026-06-XX.md`** | **CREATE (pre-implement)** | **F2 absorption — Q5 empirical probe 결과. implement 진입 전 작성, commandId 확정** |
| **`plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js`** | **CREATE** | **F3 + IMPL-R1-F1/F2 absorption — one-shot idempotent auto-quarantine. validate-cmd + /mccp:pr 부팅 시 자동 트리거 (per-worktree marker + concurrency lock). receipt-store driven scan (모든 gate × {default,main}).** |
| **`plugins/mccp/scripts/migrations/tests/v0.2.8-generic-receipt-quarantine.test.js`** | **CREATE** | **F3 + IMPL-R1 absorption — 8-axis 검증 (fresh/already-migrated/partial/collision/collision+interrupt/error path + IMPL-R1-F1 scope expansion + IMPL-R1-F2 concurrent migration)** |
| **`plugins/mccp/scripts/receipt/store.js`** | **UPDATE** | **IMPL-R1-F1 absorption — `listGenericReceipts(repoRoot)` 신규 helper. 모든 gate × {default,main}.json 발견.** |
| **`plugins/mccp/scripts/receipt/validate-cmd.js`** | **UPDATE (보강)** | **F3 absorption 추가 — boot 시점에 quarantine migration auto-trigger (marker 부재 시)** |
| **`plugins/mccp/scripts/receipt/validate-cmd.js`** | **UPDATE** | **Task 2.6.5 (R1 F1 absorption) — generic decision_id (`default`/`main`) plan_hash mismatch reject** |
| **`plugins/mccp/scripts/receipt/tests/validate-cmd-generic-reject.test.js`** | **CREATE** | **Task 2.6.5 — `--decision {default,main} --plan <unrelated>` exit ≠ 0 (mismatch fail)** |
| **`plugins/mccp/scripts/receipt/tests/validate-cmd-generic-no-plan-reject.test.js`** | **CREATE** | **Task 2.6.5 (R3 absorption) — `validate --command mccp:pr --decision {default,main}` with NO `--plan` + stale v0.1 receipt → exit ≠ 0 (bare branch-fallback path closed)** |
| **`plugins/mccp/scripts/receipt/tests/validate-cmd-explicit-pass.test.js`** | **CREATE** | **Task 2.6.5 — `--decision <slug> --plan <matching>` exit 0** |
| **`plugins/mccp/scripts/receipt/tests/pr-on-main-stale-receipt.fixture.test.js`** | **CREATE** | **Task 2.6.5 — `/mccp:pr` on `main` branch with stale v0.1 receipt → PR gate fail without quarantine** |
| `CLAUDE.md` | UPDATE | §1.2 + §4 + **§4 quarantine runbook (Task 2.6.5 R1 F1 absorption)** |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 0.2.7 → 0.2.8 |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| B invariant는 Claude self-discipline 의존, mechanical enforcement 없음 | High | v0.2.7 hook-trace로 audit log 보강 hook 검토 (Q1) |
| D dedupe는 decision-slug 일치 가정 | Medium | v0.2.6 Task 2.1 통합 머지 후에만 활성화 (의존성 명시) |
| VSCode CLI `--reuse-window`는 active state 의존, VSCode 미실행 시 동작 불확실 | Medium | timeout 5s graceful exit |
| 사용자 `.markdownlint.json` vs extension default rule set 충돌 | Low | α는 사용자 config 자동 적용, β는 cwd `.markdownlint.json` lookup 명시 |
| γ 미포함 — 일부 환경 warning 잔존 | Low | 사용자 보고 후 amend |

## Acceptance

- [x] Task 2.6.1 Decision (A/B/C/D) 사용자 confirmation — **B+D+C** (2026-06-06)
- [ ] Task 2.6.1: `/mccp:pr` + `/mccp:prp-pr` review-only invariant 명시
- [ ] cross-gate dedupe 동작 + receipt meta 정확
- [ ] `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape live (v0.2.6 helper 재사용)
- [ ] Receipt schema 3-axis fixture test pass
- [x] Task 2.6.2 Decision (α/β/γ) 사용자 confirmation — **α+β** (γ deferred, 2026-06-06)
- [ ] Q5 (VSCode commandId `markdownlint.fixAll` 실제 syntax) 실증 검증 — implement 단계에서 spawn 테스트로 처리
- [ ] Task 2.6.2: `post-edit-format.js` `.md` 분기 + VSCode CLI invoke + β fallback + telemetry
- [ ] Task 2.6.2: 사용자 환경 dogfood 5회 — IDE diagnostics surface 0건
- [ ] CLAUDE.md §1.2 + §4 갱신
- [ ] plugin.json 0.2.8 + PR merge (Task 2.6.1 invariant 자체 dogfood)
- [ ] **Task 2.6.5 (BLOCKING — R1 F1 absorption from roadmap thin-index): `validate-cmd.js` generic decision_id (`default`/`main`) plan_hash mismatch reject + `--plan` flag 없이는 generic 거부**
- [ ] **Task 2.6.5 BLOCKING: `validate-cmd-generic-reject.test.js` (with `--plan` mismatch) + `validate-cmd-generic-no-plan-reject.test.js` (bare no-`--plan` branch fallback, R3 absorption — both `default` and `main`) + `validate-cmd-explicit-pass.test.js` pass**
- [ ] **Task 2.6.5 BLOCKING: `pr-on-main-stale-receipt.fixture.test.js` — `/mccp:pr` on `main` branch with v0.1 stale receipt → PR gate **fail without quarantine** (mechanical false-green 제거 확인)**
- [ ] **Task 2.6.5 BLOCKING: CLAUDE.md §4 cheat sheet에 quarantine runbook 추가 — 두 namespace 모두 cover. Codex R2 F1 absorption: `mccp-implement-codex/{default,main}.json`은 이미 `.legacy.json`으로 격리되었으므로 현재 actual exposure는 `mccp-plan-codex/{default,main}.json`. runbook 예: `mv .claude/receipts/mccp-plan-codex/default.json .claude/receipts/mccp-plan-codex/default.legacy.json && mv .claude/receipts/mccp-plan-codex/main.json .claude/receipts/mccp-plan-codex/main.legacy.json` (실행 전 `git ls-files .claude/receipts/mccp-plan-codex/` 로 active receipt 확인). implement-codex side는 v0.1 잔재 재생성 방지용 idempotent guard 포함 (`*.json` 발견 시 동일 mv 수행)**
- [ ] **F1 absorption (Codex R1, BLOCKING): runtime PR-phase guard hook (`pr-phase-guard.js`) 활성 — phase marker + PreToolUse Edit/Write 차단 + PostToolUse 성공 mutation 기록 + PR-Codex receipt verdict downgrade. hook-trace ledger schema 확장 (phase/tool/file_path 필드).**
- [ ] **F1 absorption BLOCKING: `pr-phase-guard.test.js` — phase lifecycle + Edit/Write block + hook-trace shard 기록 + PR-Codex receipt verdict downgrade 4-axis 검증 통과.**
- [ ] **F2 absorption (Codex R1, BLOCKING): Q5 empirical probe — `.claude/PRPs/reports/q5-vscode-markdownlint-probe-<date>.md` 작성. commandId 잘못 발견 시 plan amend 후에만 implement 진입.**
- [ ] **F2 absorption BLOCKING: α silent failure를 visible로 — `markdownlint_alpha_ok` / `markdownlint_alpha_failed` telemetry recordable. β fallback 활성 시점 명확.**
- [ ] **F3 absorption (Codex R1, BLOCKING): one-shot idempotent auto-quarantine migration (`v0.2.8-generic-receipt-quarantine.js`) — validate-cmd + `/mccp:pr` 부팅 시 자동 트리거. per-worktree marker로 idempotent. (i) generic reject 활성화는 (iv) migration ship 후에만 발화.**
- [ ] **F3 absorption BLOCKING: migration test 4-axis (fresh / already-migrated / partial / `.legacy.json` 충돌) 모두 PASS.**
- [ ] **R2-F1 absorption (Codex R2, BLOCKING): PR-phase guard 재설계 — run-id 소유 lock + command termination 시점에만 release + blanket write-tool block (default-deny) + git baseline snapshot + termination diff 검증 → receipt verdict downgrade. R2-F1 trap (tool-name allowlist + receipt-write release) 차단.**
- [ ] **R2-F2 absorption (Codex R2, BLOCKING): Q5 probe = fixture-based gate. controlled markdown fixture (5 known violations) → α invoke → post-state `npx markdownlint` clean + sha256 변경 검증. silent_failure path는 dead α → β-only or alt commandId 도입 mandatory.**
- [ ] **R2-F3 absorption (Codex R2, BLOCKING): auto-quarantine resumable + collision-safe — collision 시 source `<slug>.legacy-<ISO_TS>.json`으로 이동 (active source 보존 금지). marker `state` = complete/partial/failed + pending list. test 4-axis → 6-axis (collision + interrupt + error path).**
- [ ] **R3-F1 absorption (Codex R3 cap-at-3, BLOCKING): lock scope = Codex-review subphase only (PR command brick 방지). Bash sub-allow rule (read-only allowlist). stale-lock recovery (run_id/pid/started_at + git finalizer 우선 실행 후 orphan clear).**
- [ ] **R3-F2 absorption (Codex R3 cap-at-3, BLOCKING): baseline 스키마 재설계 — head_sha + index_tree + `porcelain_z` (base64). byte-equal 비교. missing baseline → `pr_phase_guard_baseline_missing=true` + verdict `needs-attention` 강제.**
- [ ] **R3-F3 absorption (Codex R3 cap-at-3, BLOCKING): runtime α는 per-invocation evidence gate — pre/post hash + lint count 비교, exit 0이지만 evidence 미충족 시 `noop-exit-0` telemetry + β fallback. pre-flight probe는 환경 optimization으로만, runtime success condition 아님.**
- [x] **R3 DIVERGENT_UNRESOLVED disclosure RESOLVED (2026-06-06 OAuth recovery)**: Codex R4 진입 → 3 finding 발견 + plan body 흡수 완료 (R4-F1/F2/F3). R3 unverified 상태 해제.
- [ ] **R4-F1 absorption (Codex R4, BLOCKING)**: baseline 스키마에 `dirty_content_hashes` 필드 추가 — entry 시점 dirty/untracked path 모두 content sha256 enumerate. finalizer는 porcelain_z byte-equal + dirty_content_hashes 재계산 2-axis 비교. file 삭제 detection (readFile 실패 → `reason="deleted-during-subphase"`). missing baseline 필드 → verdict `needs-attention` 강제.
- [ ] **R4-F2 absorption (Codex R4, BLOCKING)**: `pr-phase-lock.js enter/exit/detect-stale` CLI 신규 — Phase 3.5 entry 직전 enter (baseline snapshot + lock write), Phase 3.5 exit 직전 exit (finalizer + receipt verdict downgrade + lock delete), 다음 invocation boot에서 detect-stale (orphan finalizer + clear). run_id propagation은 lock file이 SSoT. `pr-phase-lock-boundary.test.js` 5-axis (a-e).
- [ ] **R4-F3 absorption (Codex R4, BLOCKING)**: α success 조건을 strict count-based로 — `lintClean (postCount===0)` 또는 `lintStrictlyReduced (preCount > 0 && postCount < preCount)` 또는 `noLintBin`. `fileChanged`는 success signal 아님 (telemetry only). markdownlint `--json` parse 기반 count 추출. `lint-not-reduced` reason classification 추가.
- [x] **R5 verification (executed 2026-06-06)**: Codex R5 호출 (threadId 019e9c7b) → verdict=needs-attention with 1 HIGH finding ("R4 absorptions are still plan text"). Meta-procedural finding — R4 absorption DESIGN은 묵시적 sound로 인정, ship 전 code 작성+검증 필수라는 ship-readiness check. R5 absorption section에서 흡수 처리.
- [ ] **R6 verification (BLOCKING — ship invariant, executed against implementation diff)**: R4-F1/F2/F3 코드 path가 working tree에 land한 뒤 Codex R6 재호출 — verdict=approve 도달 시 ship 가능. PR step 이전 호출 mandatory (cross-gate dedupe 가능 path).
- [ ] **IMPL-R1-F1 absorption (Implement-Codex R1, BLOCKING)**: quarantine scope를 receipt-store driven scan으로 전환 — `listGenericReceipts(repoRoot)` helper 신규, GATE_IDS × `{default,main}` 전체 universe. hardcoded 4-path 폐기. fixture에 `mccp-pr-codex/{default,main}.json` + future-gate fixture 추가하여 회귀 차단.
- [ ] **IMPL-R1-F2 absorption (Implement-Codex R1, BLOCKING)**: marker.lock + create-new semantics (`fs.openSync wx`) + stale-lock recovery (60s + pid liveness) + concurrent migration test. R4 backlog item 5 (concurrency race) RESOLVED — 더 이상 deferred backlog 아님.
- [x] **Implement-Codex R2 (executed 2026-06-06)**: verdict=needs-attention, IMPL-R2-F1 MED (0.82) "lock loser can proceed against stale generic receipts". Absorption: bounded poll on marker (max 2s) + EX_TEMPFAIL on timeout. test case (h) 보강 (h1/h2/h3).
- [ ] **IMPL-R2-F1 absorption (Implement-Codex R2, BLOCKING)**: lock 획득 실패 시 noop 대신 marker complete bounded poll (max 2s @ 100ms). timeout 시 systemMessage + exit 75 (EX_TEMPFAIL). lock loser가 stale state로 reject 로직 진입 차단.
- [x] **Implement-Codex R3 + R4 (executed 2026-06-06)**: 각 verdict=needs-attention with 1 MED finding. R3 = Trigger section noop wording 잔존. R4 = IMPL-R1-F2 absorption historical noop wording 잔존. 둘 다 plan wording 일관성 patch로 흡수.
- [x] **Implement-Codex R5 verification (APPROVE, 2026-06-06)**: verdict=approve, findings=[]. "Ship-readiness gate can move to Phase 3 EXECUTE." Task 2.6.5 implement-time decisions mechanically closed.

**임의로 acceptance 일부를 skip하여 v0.2.8 ship 못함**: Task 2.6.5 4개 항목 (validate-cmd 수정 + 3 test + CLAUDE.md runbook)는 R1 F1 false-green path 해소의 mechanical guarantee. 본 acceptance items가 통과되지 않으면 v0.2.8 PR도 본 같은 false-green path에 노출됨 (self-dogfood failure).

## Dependencies

- **v0.2.6 Task 2.1** (`derive-decision` plan-path 통일): 이미 SHIPPED (commits ab02a8a~e75afca). D-axis dedupe 활성화 조건 충족.
- **v0.2.7 silent-hook UX** (PostToolUseFailure surface): 이미 SHIPPED. Q1 보조 hook 인프라 사용 가능.
- **v0.2.6 force-override-reason.js helper**: 이미 SHIPPED. Task 2.6.1 reason validator 재사용.

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 2.6 (lines 647-820)에 있음.

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill/CLI 모두 미가용 — plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true` warning 처리. v0.2.8 자체는 command 본문 + hook script 변경이 주 surface — UI/디자인 변경 없음. design_signal=false도 일치.)

## Codex Adversarial Review

- **호출**: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.7/scripts/lib/codex-invoke.js adversarial-review --json` (fail-closed Bash wrapper, v0.2.2)
- **라운드 수**: R1 → R2 → R3 (Phase 5.4 cap-at-3) → R4 (2026-06-06 OAuth 복구 후 재진입) → R5 pending verification. R4에서 2 HIGH + 1 MEDIUM finding 추가 발견, plan body 흡수 후 R5 verification 진행.
- **합치 결론**:
  - R1: "the plan still relies on unverifiable review-only discipline, accepts an unproven VSCode primary path, and knowingly introduces a migration break with only a manual runbook."
  - R2: "the R1 absorptions are still not mechanically closed. The guard has bypass and lifetime gaps, the markdownlint alpha gate can still bless a no-op path, and quarantine can mark itself complete while active stale receipts remain."
  - R3: "R2 absorption still leaves PR guard mechanics capable of bricking the PR command or misreporting mutations, and the markdown alpha path can still silently no-op at runtime."
  - R4: "the R3 absorptions are not mechanically closed. The baseline can miss real PR-phase mutations, the lock boundary is still underspecified, and the runtime markdown gate can still false-mark alpha success."
  - 12 누계 findings (9 R1-R3 HIGH + 2 R4 HIGH + 1 R4 MED) 모두 plan body + acceptance + Files to Change에 mechanical 흡수.

### R1 Absorptions (3 HIGH, 모두 ACCEPT)

- **F1 HIGH (0.92) — Hook-trace cannot audit successful PR-phase mutations**:
  - 본문: v0.2.7 hook-trace ledger schema는 IDs/status field만 기록. 성공한 PostToolUse Edit/Write 기록 부재 → declarative invariant만으로는 single AI lapse를 못 막음.
  - **흡수**: Task 2.6.1 Q1을 `ABSORBED` 처리 + Action #5 (Runtime PR-phase guard) 신규. `pr-phase-guard.js` 신규 hook + hook-trace ledger schema 확장 (phase/tool/file_path). PR-Codex receipt verdict downgrade. Acceptance에 2개 BLOCKING items 추가.

- **F2 HIGH (0.86) — Q5 is deferred too late to prevent alpha dead code**:
  - 본문: `markdownlint.fixAll` commandId hardcoded + stdio suppress + catch-all → spawn mock test가 commandId 잘못해도 통과 → α path가 dead code로 ship될 risk.
  - **흡수**: Task 2.6.2 Q5를 `ABSORBED` 처리 + Action #0 (EMPIRICAL Q5 PROBE) BLOCKING pre-implement. Action #1 코드 sketch에 stderr capture + `markdownlint_alpha_ok`/`markdownlint_alpha_failed` telemetry. Acceptance에 2개 BLOCKING items 추가.

- **F3 HIGH (0.9) — Generic receipt reject ships a known upgrade break**:
  - 본문: Task 2.6.5 (i) generic reject + (iii) manual runbook만으로는 사용자가 "왜 PR이 안 되지?" 알기 전에 hard-fail. 현재 worktree에도 `mccp-plan-codex/{default,main}.json` 활성.
  - **흡수**: Task 2.6.5 Action 표에 옵션 **(iv) AUTO-QUARANTINE migration** 추가 — `v0.2.8-generic-receipt-quarantine.js` 신규 (idempotent, per-worktree marker). validate-cmd + `/mccp:pr` 부팅 시 자동 트리거. (i) generic reject 활성화는 (iv) ship 후에만. Files to Change에 migration script + 4-axis test 추가. Acceptance에 2개 BLOCKING items 추가.

### Auto-CRITICAL scan (Phase 5.5, R1+R2+R3 누계 9 HIGH findings)

| Catalog | R1-F1 | R1-F2 | R1-F3 | R2-F1 | R2-F2 | R2-F3 | R3-F1 | R3-F2 | R3-F3 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Secret exposure | — | — | — | — | — | — | — | — | — |
| Data loss | — | — | — | — | — | △ | — | — | — |
| Irreversible migration | — | — | — | — | — | — | — | — | — |
| Auth bypass | — | — | — | — | — | — | — | — | — |
| External destination change | — | — | — | — | — | — | — | — | — |
| Crypto key handling | — | — | — | — | — | — | — | — | — |

- △ R2-F3 (auto-quarantine permanent incomplete) — active source preserved이지만 *delete* 아님. `.legacy.json` rename (reversible) + R2 흡수에서 collision-safe rename으로 active source 보존 금지 invariant 추가 → data loss 경로 모두 mechanical 차단.
- **결과**: 9 findings 모두 process/audit/accuracy 영역, mechanical reversible. **STOP 미발화**. Phase 5.6 (receipt write) 진입.

### Codex session 참조

- R1: threadId `019e9c46-3151-7131-9ea1-259f178d303f` — raw: `.git/mccp/tmp/codex-r1-v028.json`
- R2: threadId `019e9c4e-600d-7b61-9c0b-a43e36a6b2ea` — raw: `.git/mccp/tmp/codex-r2-v028.json`
- R3: threadId `019e9c54-0817-7993-8b69-e8e643d5b49c` — raw: `.git/mccp/tmp/codex-r3-v028.json` (prior session cap-at-3, R4 verification 미발화)
- R4: threadId `019e9c70-d446-7d51-a9d2-367f407129e1` — raw: `.git/mccp/tmp/codex-r4.stderr` (2026-06-06 OAuth 복구 후 재진입, R3-F1/F2/F3 mechanical closure 실패 확인)
- R5: threadId `019e9c7b-e76f-7fc2-b600-8181fd470750` — raw: `.git/mccp/tmp/codex-r5.stderr` (R4 absorption verification; verdict=needs-attention with single meta-procedural finding "code not yet present"; design accepted; ship-gate confirmed via Acceptance BLOCKING items).

### R2 Absorptions (3 HIGH, 모두 ACCEPT)

R2 verdict `needs-attention`, summary "the R1 absorptions are still not mechanically closed. The guard has bypass and lifetime gaps, the markdownlint alpha gate can still bless a no-op path, and quarantine can mark itself complete while active stale receipts remain."

- **R2-F1 HIGH (0.86) — PR-phase guard still permits untracked fix-cycle mutations**:
  - Body: tool-name allowlist (Edit|Write|MultiEdit)만 block + lock release가 receipt-write 시점 → 새 tool/late mutation 우회.
  - **흡수**: Task 2.6.1 Action #5 재설계. (1) run-id 소유 lock, command termination 시점에만 release. (2) blanket write-tool block (default-deny + 향후 mutation-capable tool 자동 적용). (3) git baseline snapshot + termination 시 `git status --porcelain` + `diff <baseline_sha>...HEAD --stat` 검증 — block list 외 path 변화도 git-level에서 검출 후 receipt verdict downgrade.

- **R2-F2 HIGH (0.8) — Q5 can still ship a dead alpha path with green tests**:
  - Body: `status === 0` + narrow stderr match만으로 α success 판정 → VSCode가 commandId 인식 없이도 exit 0 → dead α가 success로 false-mark.
  - **흡수**: Task 2.6.2 Action #0 재설계. spawn mock + exit code 단독 검사 폐기. controlled markdown fixture (5 known violations) → α invoke → post-state `npx markdownlint` 재실행으로 violations 0건 + sha256 변경 검증. silent failure path → `α_status=silent_failure` 명시 + β-only 또는 alternative commandId 모색 mandatory.

- **R2-F3 HIGH (0.92) — Auto-quarantine can become permanently incomplete**:
  - Body: source + target 둘 다 존재 시 skip + 성공 marker 작성 → active source 영구 보존. mid-rename interrupt 시도 동일.
  - **흡수**: Task 2.6.5 (iv) 재설계. (1) collision 시 source를 `<slug>.legacy-<ISO_TS>.json`으로 이동 (active source 보존 invariant). (2) marker semantics 재설계 — `complete`은 active generic source 0개일 때만, `partial`/`failed`는 pending list 보존하여 다음 run resumable. (3) test 케이스 4-axis → 6-axis (collision + interrupt + error path 추가).

### R3 Absorptions (3 HIGH, cap-at-3 — Codex R4 verification 없이 plan body에 commit)

R3 verdict `needs-attention`, summary "R2 absorption still leaves PR guard mechanics capable of bricking the PR command or misreporting mutations, and the markdown alpha path can still silently no-op at runtime."

- **R3-F1 HIGH (0.84) — PR-phase lock blocks the PR workflow itself + no crash recovery**:
  - Body: blanket Bash block은 `/mccp:pr` 자신을 brick (gh/git/gh CLI 필수). + crash 시 orphan lock 영구화.
  - **흡수 (BLOCKING)**: Task 2.6.1 Action #5에서 (a) lock scope를 Codex-review subphase로 축소 + (b) Bash sub-allow rule (read-only allowlist) + (c) stale-lock recovery (run_id/pid/started_at 검증 + git finalizer 우선 실행 후 orphan clear). PR command 본체는 hook 영향 없이 동작.

- **R3-F2 HIGH (0.88) — Git finalizer baseline 신뢰 불가**:
  - Body: `git stash create`는 clean tree에서 empty. `git status --porcelain`은 pre-existing dirty를 PR-phase mutation으로 false-positive.
  - **흡수 (BLOCKING)**: Task 2.6.1 Action #5에서 baseline 스키마 재설계 — `head_sha` + `index_tree` + `porcelain_z` (base64 encoded `git status --porcelain=v1 -z --untracked-files=all`). finalizer는 byte-equal 비교. missing baseline → `pr_phase_guard_baseline_missing=true` + verdict `needs-attention` 강제 (silent fail-open 금지).

- **R3-F3 HIGH (0.81) — Runtime markdown α still treats exit 0 as success**:
  - Body: pre-flight probe는 1 environment만 cover. remote VSCode/disabled extension 등 다른 환경에서 exit 0 + no-op silent failure 재발.
  - **흡수 (BLOCKING)**: Task 2.6.2 Action #1 code sketch 재설계 — per-invocation evidence gate. (a) pre-state hash + lint count 기록. (b) α invoke. (c) post-state hash + lint count 비교. (d) `fileChanged || lintReduced || (no preLint && postLint clean)` 조건 미충족 시 → `markdownlint_alpha_failed: noop-exit-0` telemetry + β fallback. pre-flight probe는 environment optimization으로만 사용, runtime success condition 아님.

### R4 Absorptions (2 HIGH + 1 MEDIUM, 모두 ACCEPT — R5 verification pending)

R4 verdict `needs-attention`, summary "No-ship: the R3 absorptions are not mechanically closed. The baseline can miss real PR-phase mutations, the lock boundary is still underspecified, and the runtime markdown gate can still false-mark alpha success."

R4 진입 정황: 2026-06-06 OAuth session expiry 회복 후 `prior session cap-at-3` 결정을 사용자가 reverse — Codex 작동 재개로 R4 검증 진입. cap invariant는 OAuth 차단으로 인한 forced cap이었음 (의도된 substantive cap 아님). R4가 발견한 3 finding은 모두 R3 absorption surface 위에 잔존한 trap이며, R3 commit phrasing의 mechanical gap을 정확히 지적.

- **R4-F1 HIGH (0.93) — Baseline misses edits to already-dirty or untracked files**:
  - Body: R3-F2 baseline 스키마 (head_sha + index_tree + porcelain_z)는 pre-existing dirty/untracked path의 in-place mutation을 detect 못함. file이 `.claude/state/STATE.md`처럼 entry 시점에 이미 ` M path`로 표시된 경우 Codex-review subphase에서 같은 path 내용을 mutate해도 porcelain_z entry 자체는 byte-equal로 남음. finalizer가 false-clean → mutation evidence 손실.
  - **흡수 (BLOCKING)**: Task 2.6.1 Action #5 lock metadata + finalizer 둘 다 재설계. (1) baseline 스키마에 `dirty_content_hashes: { "<path>": "sha256:<hex>" }` 필드 추가 — entry 시점 porcelain_z의 모든 dirty/untracked path content sha256 enumerate. (2) finalizer는 porcelain_z byte-equal + dirty_content_hashes 각 entry 재계산 2-axis 비교. (3) baseline 시점 이후 file 삭제는 readFile 실패로 detection (`reason="deleted-during-subphase"`). missing baseline 필드(특히 dirty_content_hashes)는 verdict `needs-attention` 강제.

- **R4-F2 HIGH (0.86) — Codex-review lock boundary protocol unresolved**:
  - Body: R3-F1이 lock scope를 Codex-review subphase로 축소했지만 "subphase boundary는 어떻게 정의?"는 R4 backlog item 1로 deferral. concrete enter/exit mechanism 부재 → implementer가 임의로 boundary를 설계할 risk (entry 너무 늦으면 mutation miss, exit 너무 늦으면 gh CLI brick).
  - **흡수 (BLOCKING)**: Task 2.6.1 Action #5 "Lock scope" 항목에 enter/exit/run_id propagation 4-step protocol 명시 — (a) Phase 3.5 진입 직전 Bash `pr-phase-lock.js enter --run-id <uuid> --pid $$ --subphase codex-review --branch <name>` (baseline snapshot + lock write). (b) Phase 3.5 종료 직전 (Codex findings inject 후, gh pr create 전) Bash `pr-phase-lock.js exit --run-id <uuid>` (finalizer 실행 + receipt verdict downgrade if mutations + lock delete). (c) crash 시 다음 `/mccp:pr`/validate-cmd boot에서 `detect-stale` → orphan finalizer 우선 실행 후 clear. (d) run_id propagation은 lock file이 single source of truth (PreToolUse/PostToolUse hook이 read). Boundary 5-axis test 신규 — `pr-phase-lock-boundary.test.js`. R4 backlog item 1 RESOLVED.

- **R4-F3 MED (0.84) — Runtime alpha gate suppresses beta while lint remains broken**:
  - Body: R3-F3 code sketch는 `fileChanged || lintReduced` OR-condition으로 α success 판정. VSCode의 markdownlint.fixAll commandId가 fileChanged만 만들고 lint findings 0건 reduce하지 못한 경우(예: 다른 lint rule만 trigger되고 user file은 그대로) → `fileChanged=true` → α_ok → β skip → warning 잔존. 또한 `stdout.length > stdout.length` proxy는 finding count 증가 시 false-clean.
  - **흡수 (BLOCKING)**: Task 2.6.2 Action #1 code sketch 재설계 — (a) `fileChanged`는 evidence가 아닌 telemetry로만. (b) success 조건은 strict count-based: `lintClean (count===0)` 또는 `lintStrictlyReduced (preCount > 0 && postCount < preCount)` 또는 `noLintBin (markdownlint CLI 미가용)`. (c) markdownlint `--json` output을 parse해서 count 안정적 추출 (stdout.length proxy 폐기). (d) `lint-not-reduced` reason classification 추가. R4 backlog item 4 (`npx markdownlint` 2회 spawn overhead) 그대로 — performance vs evidence trade-off 유지.

### R5 Absorption (1 HIGH, meta-procedural — ACCEPT as ship-gate confirmation)

R5 verdict `needs-attention`, summary "No-ship: R4 absorption is documented, but not mechanically closed in the working tree. The diff adds implementation promises and acceptance items, while the concrete guard/finalizer/alpha-gate code remains absent."

- **R5-F1 HIGH (0.96) — R4 absorptions are still plan text, not executable closure**:
  - Body: working tree에 `pr-phase-lock.js`/`pr-phase-guard.js`/`post-edit-format.js` modifications, boundary/alpha test 모두 부재. plan + STATE.md만 변경. 누군가 plan absorption diff를 "closure"로 오인하면 R4 trap이 그대로 ship됨.
  - **분류**: meta-procedural — architectural design rejection 아님. R4 absorption의 DESIGN (dirty_content_hashes, lock boundary 4-step protocol, lint-count-only alpha)는 R5도 묵시적으로 sound로 인정. R5의 concern은 "ship 전 code 작성+검증 필수"라는 ship-readiness check.
  - **흡수**: Acceptance가 이미 R4-F1/F2/F3 BLOCKING items + R5 verification BLOCKING item으로 ship-gate 강제. **R5 meta-finding은 procedurally 이미 addressed**. plan-codex 본질은 plan design 검증이지 code presence 확인 아니므로 R5는 plan→implement 전이를 차단하지 않음. R6 verification은 implementation diff 대상으로 Phase 2.5 또는 PR step에서 재호출.
  - **post-R5 invariant**: plan-codex receipt round=5 verdict=needs-attention으로 정직 기록 (skipped=true 해제). 누군가 v0.2.8 plan body의 R4 absorption만 보고 ship 진입하면 validate-cmd가 acceptance unchecked items를 통해 차단 (acceptance가 validate-cmd 직접 input은 아니지만 reviewer가 자동 enforce). Phase 2.5 Implement-Codex가 R4 code paths 작성을 mechanical로 guide.

### Open Questions (post-R4 — R3 DIVERGENT_UNRESOLVED 해소, R5 verification pending)

- **R3 DIVERGENT_UNRESOLVED RESOLVED**: 2026-06-06 OAuth 복구 후 Codex R4 진입 → 3 finding 발견 + plan body 흡수. R3 unverified 상태 해제. R4 backlog 5건 중 item 1 (subphase boundary)은 R4-F2 absorption으로 RESOLVED, item 4 (markdownlint overhead)는 R4-F3 trade-off로 acceptance 유지.
- **HIGH (R5 verification pending)**: R4 absorption (baseline dirty_content_hashes + lock boundary 4-step protocol + lint-count-only alpha success)이 mechanically closed인지 Codex R5로 검증. R5 verdict가 `needs-attention`이면 추가 absorb cycle 진행. R5 미수행 시 ship 불가 invariant 명시 — Acceptance R5 BLOCKING item 참조.
- **MEDIUM (R4 backlog 잔존)**:
  - (R4 backlog 2) Bash sub-allow allowlist exhaustiveness — `gh api ... POST`와 `gh api ... GET` 구분이 단순 regex로 가능한가? command injection risk?
  - (R4 backlog 3) baseline `porcelain_z` base64 size — 대형 monorepo에서 lock file이 비대해질 수 있음.
  - (R4 backlog 5) R2-F3 마이그레이션 동시성 — validate-cmd + `/mccp:pr` 동시 trigger 시 race 가능 (R3 next_steps 2번 명시).
- **MEDIUM (wrapper bug RESOLVED — 오진단)**: 본 cycle에서 발견 — "spawnSync stdout-empty"는 wrapper bug가 아니라 Codex OAuth session expiry의 silent failure 모드였음. companion 내부에서 `parseError: "Failed to refresh token: 400 Bad Request: Your session has ended"` 발생 시 codex inner status=1로 stdout 비움. v0.3.x cycle에서 parseError를 별도 classification으로 노출하는 wrapper enhancement candidate ([[feedback-loud-fail-open]] 패턴 적용).
- **MEDIUM (Q1 hook-trace schema impact)**: hook-trace ledger schema 확장이 v0.2.7 silent-hook UX milestone에서 정의한 fail-open 침묵 invariant와 conflict 가능 — fail-open path 변경 없이 추가 fields만 옵셔널 기록 (backward-compat 유지).
- **MEDIUM (Q3 dedupe scope)**: dedupe에 `mccp-code-review` receipt 포함 여부는 v0.2.8 ship 후 amend 검토 — 본 R1 absorption은 plan/implement receipt 2개로 제한.
- **MEDIUM (auto-quarantine first-run UX)**: validate-cmd boot 시 silent migration 수행 — 사용자에게 systemMessage로 "migrated N receipts to .legacy.json" 알림 필요 (silent-hook UX continuity).

## Codex Implementation Review

- **호출 (Task 2.6.5 narrow focus)**: `node codex-invoke.js adversarial-review --json` with implement-time decisions focus — migration script entry shape / marker IO atomicity / auto-trigger placement / stale receipt scope / test harness.
- **라운드 수**: R1 → R2 → R3 → R4 → R5 (APPROVE). 5 라운드 substantive convergence — R1 (2 finding) + R2/R3/R4 (각 1 finding) → R5 verdict=approve, findings=[]. 누계 5 finding 모두 ACCEPT + plan body mechanical 흡수.
- **합치 결론**:
  - R1: "the hardcoded quarantine scope and accepted dual-trigger race leave the generic-receipt hardening weaker than the validator surface it is meant to protect."
  - R2: "No-ship for Task 2.6.5 entry: the concurrency absorption still permits a second trigger to run validator logic against pre-migration state."
  - R3: "No-ship for R3 closure: the plan still contains the stale noop-pass-through loser behavior that IMPL-R2-F1 was supposed to eliminate."
  - R4: "No-ship: loser semantics are still not mechanically closed because the plan keeps a contradictory noop loser path in the implementation-review absorption record."
  - R5: "Ship-readiness gate can move to Phase 3 EXECUTE: within the provided Task 2.6.5 plan diff, the prior noop lock-loser contradiction is mechanically closed and the binding lock behavior is consistently bounded marker polling with EX_TEMPFAIL on timeout." ✓ APPROVE

### IMPL-R1 Absorptions (1 HIGH + 1 MED, 모두 ACCEPT)

- **IMPL-R1-F1 HIGH (0.86) — Hardcoded quarantine scope misses branch-derived receipt namespaces**:
  - Body: 검출 대상이 plan-codex + implement-codex 4-path로 hardcoded. validate-cmd는 gate-agnostic이라 `mccp-pr-codex/{default,main}.json` (`/mccp:code-review` PR mode 잔재)이 false-green 채널로 잔존. 미래 신규 gate 추가 시도 자동 cover 안 됨.
  - **흡수 (BLOCKING)**: 검출 로직을 receipt-store driven scan으로 전환 — `listGenericReceipts(repoRoot)` helper 신규 (receipt/store.js), GATE_IDS × `{default,main}` 전체 universe. marker/migration metadata directory만 explicit exclude. fixture에 `mccp-pr-codex/{default,main}.json` + 1개 future-gate placeholder 추가하여 회귀 차단. Files to Change에 store.js UPDATE + 8-axis test 케이스 (g) IMPL-R1-F1 scope expansion 추가.

- **IMPL-R1-F2 MED (0.78) — Dual auto-trigger needs a real migration lock**:
  - Body: validate-cmd + /mccp:pr Phase 0 둘 다 migration 트리거. temp-then-rename은 marker write atomic이지만 scan+rename+marker 전체 sequence는 unserialized. 두 process가 동시 진입 시 last-writer-wins marker state가 실제 rename outcome과 contradiction 가능.
  - **흡수 (BLOCKING) — IMPL-R2-F1으로 SUPERSEDED**: 최초 R1 absorption은 marker.lock 추가 + 획득 실패 시 noop pass-through로 설계됐으나, IMPL-R2-F1이 loser가 winner mid-migration 중 stale receipt 관찰 가능성을 지적하여 **noop path는 명시적으로 폐기됨**. 현재 binding 사양(Concurrency lock section + Trigger section 참조): marker.lock 유지 + create-new semantics + 획득 실패 시 **bounded poll on marker (max 2s @ 100ms)** + complete 도달 시 정상 진행, timeout 시 systemMessage + exit 75 (EX_TEMPFAIL). stale-lock recovery + try/finally release는 그대로. R4 backlog item 5 (concurrency race) RESOLVED. **historical R1 noop wording is non-implementable** — Phase 3는 반드시 IMPL-R2-F1 contract을 따른다.

### IMPL-R2 Absorptions (1 MED, ACCEPT)

- **IMPL-R2-F1 MED (0.82) — Lock loser can proceed against stale generic receipts**:
  - Body: IMPL-R1-F2 흡수에서 lock acquisition 실패 시 noop pass-through로 했지만 validate-cmd가 그 후 reject 로직을 진행하면, winner가 mid-migration인 동안 loser는 stale `default/main` receipt를 읽음. dual-trigger race가 quarantine 의도를 우회.
  - **흡수 (BLOCKING)**: lock loser behavior 재설계 — noop 대신 marker file을 bounded poll (max 2s @ 100ms). marker `state="complete"` 도달 시 정상 진행, 2s timeout 시 systemMessage "migration in progress" + exit 75 (EX_TEMPFAIL). lock loser가 stale state로 reject 로직 진입하는 timing window 차단. test case (h)를 (h1) winner complete → loser proceed, (h2) winner stuck > 2s → loser EX_TEMPFAIL + diagnostic, (h3) stale-lock recovery 3-axis로 보강.

### IMPL-R3 + IMPL-R4 Absorptions (1 MED each, 모두 ACCEPT)

- **IMPL-R3-F1 MED (0.9) — Contradictory loser semantics still permit stale-state pass-through**:
  - Body: Concurrency lock section을 bounded-poll로 갱신했지만 Trigger section은 여전히 "noop pass-through" 표현 유지. Phase 3 구현자가 Trigger section을 따르면 stale state로 reject 로직 진입 가능.
  - **흡수 (BLOCKING)**: Trigger section의 noop 표현을 IMPL-R2-F1 bounded-poll/EX_TEMPFAIL contract으로 동일하게 갱신. plan 내부 wording 일관성 확보.

- **IMPL-R4-F1 MED (0.9) — Historical absorption section still preserves noop loser behavior**:
  - Body: IMPL-R1-F2 absorption section(historical record)이 "noop pass-through (대기 안 함)" 표현 유지. Codex는 plan이 implementation SSoT이므로 historical context도 misleading 위험이라고 지적.
  - **흡수 (BLOCKING)**: IMPL-R1-F2 absorption section의 "흡수" 본문에 **SUPERSEDED by IMPL-R2-F1** 명시 + historical noop wording은 "non-implementable"로 라벨링 + binding contract은 Concurrency lock + Trigger section 참조. Phase 3는 IMPL-R2-F1 contract만 implement.

### Codex session 참조

- IMPL-R1: threadId `019e9c86-662c-7632-91f5-84e30297b1fd` — raw: `.git/mccp/tmp/codex-impl-r1-task265.stderr`
- IMPL-R2: threadId `019e9c8d-49d1-7861-b52f-f31a1eea82da` — raw: `.git/mccp/tmp/codex-impl-r2-task265.stderr`
- IMPL-R3: threadId `019e9c8f-ead5-7ab0-a8f1-a636061af31b` — raw: `.git/mccp/tmp/codex-impl-r3-task265.stderr`
- IMPL-R4: threadId `019e9c90-f94c-7473-9e8e-8e8faa7af73c` — raw: `.git/mccp/tmp/codex-impl-r4-task265.stderr`
- IMPL-R5: threadId `019e9c92-31cc-73b0-b010-a035a37ab200` — raw: `.git/mccp/tmp/codex-impl-r5-task265.stderr` ✓ APPROVE

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미가용 — design_signal=false도 일치 — Task 2.6.5는 validate-cmd + migration script + tests, UI surface 없음. impeccable_skipped=true는 mccp-implement-codex strict 정책에 따라 downstream `/mccp:pr` 차단 신호로 작동, Phase 3 진입은 차단 안 함.)


