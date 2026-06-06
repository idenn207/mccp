# Plan: v0.2.8 — PR Workflow Hardening (Milestone 2.6)

**Status**: ⏳ **NOT STARTED** (decisions A/B/C/D + α/β/γ pending user confirmation)
**Plugin version**: 0.2.7 → **0.2.8**
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 2.6
**Origin**: 2026-06-05 사용자 보고 — 2개의 workflow UX defect
**Codex review**: R1 pending (사용자 confirmation 후 `/mccp:plan` 또는 `/mccp:santa-loop` 진입)

---

## Summary

`/mccp:pr` + `/mccp:prp-pr`에서 Codex review가 사용자 의도(PR 생성)를 fix-cycle로 변질시키는 문제, 그리고 IDE markdownlint warning이 Claude tool-result로 surface돼 반복 처리되는 노이즈를 제거.

**Positioning**: workflow UX defect 보완. **value prop(dual-reviewer)을 PR step에서도 유지하는 게 1차 목표**, "Codex 제거"는 fallback. 진짜 통증은 review 자체가 아니라 review 직후의 mutation impulse이므로, 본 milestone은 두 경로를 분리.

## Pending User Decisions

### Decision 1: Task 2.6.1 옵션 (A/B/C/D 또는 조합)

| 옵션 | 동작 | 권장도 |
|---|---|---|
| A | Codex review 호출 자체 제거 | ❌ dual-reviewer 가치 prop 손실 |
| B | Codex review 유지, findings은 PR body `## Codex Review` section에만 inject + 본문에 "Findings → PR body only. NO mutations." invariant | ✅ |
| C | env `MCCP_PR_SKIP_CODEX_REVIEW=1` opt-in escape hatch | ✅ (escape only) |
| D | cross-gate dedupe: plan-codex + implement-codex 둘 다 approve이면 PR step Codex auto-skip | ✅ (v0.2.6 derive-decision 통합 의존) |

**Plan 본문 권장 조합**: **B + D + C(escape hatch)** — review-only invariant + cross-gate dedupe + env opt-in escape.

### Decision 2: Task 2.6.2 옵션 (α/β/γ 또는 조합)

| 옵션 | 동작 | 권장도 |
|---|---|---|
| α | `post-edit-format.js`에 `.md` 분기 추가 — `code --reuse-window --command "markdownlint.fixAll"` | ✅ primary |
| β | mccp 자체 `npx markdownlint --fix` 호출 | ✅ fallback |
| γ | IDE diagnostics surface 자체 suppress (env `MCCP_SUPPRESS_MD_DIAGNOSTICS_FEEDBACK=1`) | ⚠ last escape, v0.2.7 hook-trace 머지 후 amend 검토 |

**Plan 본문 권장 조합**: **α (primary) + β (fallback)** — γ는 마지막 escape.

## Pre-flight diagnostic (plan 작성 시 수행)

- `mccp/scripts/hooks/` grep `markdownlint|markdown-lint|md-lint` → **0건** → markdown lint hook은 mccp 직접 보유 아님. 노이즈 출처는 IDE integration 또는 user-level hook.
- 해결책: lint resolve를 IDE extension에 위임해 warning이 *생성되기 전에* fix되도록 trigger.

## Tasks (B+D+C + α+β 가정)

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
- **HIGH (Q1)**: review-only invariant의 mechanical enforce 방법? command body는 declarative. v0.2.7 PostToolUseFailure surface와 결합해 PR phase Edit/Write 발화 시 audit log 보조 hook 검토.
- **MEDIUM (Q2)**: A/B/C/D 조합 — 권장 B+D+C, 최종은 사용자 결정.
- **MEDIUM (Q3)**: dedupe에 `mccp-code-review` receipt도 포함할지?
- **LOW (Q4)**: `codex_review_actionable_findings` field plan/implement step backport 여부?

### Task 2.6.2: IDE markdownlint warning 노이즈 제거 (VSCode extension delegation)

**Action**:

1. [post-edit-format.js](../../plugins/mccp/scripts/hooks/post-edit-format.js)에 `.md` 분기 추가:
   ```js
   if (filePath && /\.md$/.test(filePath)) {
     // α path
     const codeBin = findCodeCli();
     if (codeBin) {
       try {
         execFileSync(codeBin, ['--reuse-window', '--command', 'markdownlint.fixAll', filePath], { stdio: 'ignore', timeout: 5000 });
         return rawInput;
       } catch { /* fall through to β */ }
     }
     // β path
     const mdLintBin = resolveBin(projectRoot, 'markdownlint');
     if (mdLintBin) {
       try { execFileSync(mdLintBin, ['--fix', filePath], { stdio: 'ignore', timeout: 5000 }); } catch {}
       return rawInput;
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
- **HIGH (Q5)**: VSCode CLI `code --command markdownlint.fixAll` 실제 syntax 검증 — davidanson.vscode-markdownlint extension commandId 정확성.
- **MEDIUM (Q6)**: α/β/γ 조합 — 권장 α+β, γ는 v0.2.7 머지 후 amend.
- **MEDIUM (Q7)**: WSL/remote SSH 환경 호환성 — `code` CLI host invoke 검증 필요.
- **LOW (Q8)**: 노이즈 출처 IDE diagnostics vs user-level hook 잔재? 사용자 환경 grep 권장 (`Get-ChildItem $env:USERPROFILE\.claude\hooks\` markdown 관련).

### Task 2.6.5: validate-cmd generic decision_id hardening (Codex R1 F1 absorption from roadmap thin-index)

**Origin**: roadmap thin-index transform 시 Codex R1 F1 — `/mccp:pr` on `main` branch가 stale `mccp-implement-codex/main.json` (v0.1 era, unrelated plan_hash)을 chain validate에서 oring하는 false-green path 발견. [.claude/PRPs/reports/receipt-audit-2026-06-06.md](../PRPs/reports/receipt-audit-2026-06-06.md) §F-RA-1.

**Symptom**: terminal branch-based 명령(특히 `/mccp:pr`)이 decision_id를 branch에서 derive. main branch → `decision_id=main` → `mccp-implement-codex/main.json` validate (plan_hash 검사 없이 exit 0 = false-green).

**Action** (options to scope in v0.2.8 cycle):

| 옵션 | 동작 | Trade-off |
|---|---|---|
| (i) validate-cmd 강화 | generic decision_id (`default`/`main`)는 plan_hash mismatch 시 **reject**. `--plan` flag 없으면 generic 거부. | 기존 사용자 환경의 v0.1 receipt가 즉시 blocking → migration window 필요 |
| (ii) `/mccp:pr` decision-slug 변경 | branch-only → `branch + plan-fingerprint` composite. 또는 plan-path 우선 derive. | derive-decision API 변경 — backward compatibility 영향 |
| (iii) Quarantine convention 표준화 | `*.legacy.json` 또는 `.legacy/` subdir로 자동 격리하는 cleanup script | manual trigger 필요, automation 부재 |

**권장 결합**: (i) + (iii). (ii)는 derive-decision API 변경 risk가 커 별도 cycle (v0.3.x?) deferral.

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
| `plugins/mccp/scripts/hooks/post-edit-format.js` | UPDATE | `.md` 분기 + α+β fallback |
| `plugins/mccp/scripts/hooks/tests/post-edit-format-md.test.js` | CREATE | spawn mock + telemetry |
| `plugins/mccp/scripts/lib/find-code-cli.js` | CREATE | VSCode CLI PATH probe helper |
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

- [ ] Task 2.6.1 Decision (A/B/C/D) 사용자 confirmation
- [ ] Task 2.6.1: `/mccp:pr` + `/mccp:prp-pr` review-only invariant 명시
- [ ] cross-gate dedupe 동작 + receipt meta 정확
- [ ] `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape live (v0.2.6 helper 재사용)
- [ ] Receipt schema 3-axis fixture test pass
- [ ] Task 2.6.2 Decision (α/β/γ) + Q5 (VSCode commandId) 사용자 confirmation
- [ ] Task 2.6.2: `post-edit-format.js` `.md` 분기 + VSCode CLI invoke + β fallback + telemetry
- [ ] Task 2.6.2: 사용자 환경 dogfood 5회 — IDE diagnostics surface 0건
- [ ] CLAUDE.md §1.2 + §4 갱신
- [ ] plugin.json 0.2.8 + PR merge (Task 2.6.1 invariant 자체 dogfood)
- [ ] **Task 2.6.5 (BLOCKING — R1 F1 absorption from roadmap thin-index): `validate-cmd.js` generic decision_id (`default`/`main`) plan_hash mismatch reject + `--plan` flag 없이는 generic 거부**
- [ ] **Task 2.6.5 BLOCKING: `validate-cmd-generic-reject.test.js` (with `--plan` mismatch) + `validate-cmd-generic-no-plan-reject.test.js` (bare no-`--plan` branch fallback, R3 absorption — both `default` and `main`) + `validate-cmd-explicit-pass.test.js` pass**
- [ ] **Task 2.6.5 BLOCKING: `pr-on-main-stale-receipt.fixture.test.js` — `/mccp:pr` on `main` branch with v0.1 stale receipt → PR gate **fail without quarantine** (mechanical false-green 제거 확인)**
- [ ] **Task 2.6.5 BLOCKING: CLAUDE.md §4 cheat sheet에 quarantine runbook 추가 — 두 namespace 모두 cover. Codex R2 F1 absorption: `mccp-implement-codex/{default,main}.json`은 이미 `.legacy.json`으로 격리되었으므로 현재 actual exposure는 `mccp-plan-codex/{default,main}.json`. runbook 예: `mv .claude/receipts/mccp-plan-codex/default.json .claude/receipts/mccp-plan-codex/default.legacy.json && mv .claude/receipts/mccp-plan-codex/main.json .claude/receipts/mccp-plan-codex/main.legacy.json` (실행 전 `git ls-files .claude/receipts/mccp-plan-codex/` 로 active receipt 확인). implement-codex side는 v0.1 잔재 재생성 방지용 idempotent guard 포함 (`*.json` 발견 시 동일 mv 수행)**

**임의로 acceptance 일부를 skip하여 v0.2.8 ship 못함**: Task 2.6.5 4개 항목 (validate-cmd 수정 + 3 test + CLAUDE.md runbook)는 R1 F1 false-green path 해소의 mechanical guarantee. 본 acceptance items가 통과되지 않으면 v0.2.8 PR도 본 같은 false-green path에 노출됨 (self-dogfood failure).

## Dependencies

- **v0.2.6 Task 2.1** (`derive-decision` plan-path 통일): 이미 SHIPPED (commits ab02a8a~e75afca). D-axis dedupe 활성화 조건 충족.
- **v0.2.7 silent-hook UX** (PostToolUseFailure surface): 이미 SHIPPED. Q1 보조 hook 인프라 사용 가능.
- **v0.2.6 force-override-reason.js helper**: 이미 SHIPPED. Task 2.6.1 reason validator 재사용.

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 2.6 (lines 647-820)에 있음.
