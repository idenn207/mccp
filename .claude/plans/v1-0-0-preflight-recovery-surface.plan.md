# Plan: preflight.js Recovery Surface (v1.0.0 patch)

**Source audit**: `.worktrees/v1.0.0-verify-state-continuity/.claude/audit/v1.0.0-state-continuity.md` §(6) addendum (11j + 11k single-source captures)
**Selected Milestone**: v1.0.0 ship-prep — pre-ship MEDIUM finding absorption
**Complexity**: Small
**Branch**: `v1.0.0-preflight-recovery-surface` (from `main` bb54abd)

## Summary

W11 audit row 11j + 11k가 같은 mechanical defect를 두 angle에서 노출 — `preflight.js writeBlockReason()` 함수가 missing/stale 분기별 stderr block에 generic bypass/inspect 안내만 emit하고 **분기별 specific recovery 명령**(missing: `/mccp:receipt-write`, stale: 받기 gate 재실행)을 surface 안 함. 결과 직접 호출 사용자는 NS=3 (docs/memory lookup 필요). 본 patch는 `writeBlockReason()` 함수 끝에 분기별 conditional 1줄 emit을 추가해 NS=1로 회복.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/receipt/preflight.js:15` | `GATE_TAG = '[MCCP-RECEIPT-GATE]'` prefix 모든 stderr line 일관 사용 |
| Stderr emit | `plugins/mccp/scripts/receipt/preflight.js:38-39` | `stderr.write(GATE_TAG + ' <verb>: <command>\n')` 1줄 hint 패턴 — bypass/inspect line이 기준 |
| Conditional emit | `plugins/mccp/scripts/receipt/preflight.js:29-34` | `for (...of result.blocking)` 같은 loop pattern, length 체크 후 emit |
| Tests | `plugins/mccp/scripts/receipt/tests/preflight.test.js:36-49` | `mkTmpRepo()` + `captureIO()` + `assert.match(io.errput(), /pattern/)` stderr assertion |

## Files to Change

| File | Action | Why |
|---|---|---|
| plugins/mccp/scripts/receipt/preflight.js | UPDATE | writeBlockReason() 함수에 missing/stale 분기 conditional recovery hint 2줄 추가 (~6 LoC) |
| plugins/mccp/scripts/receipt/tests/preflight.test.js | UPDATE | 2 신규 test — missing recovery hint assertion + stale recovery hint assertion |

## Tasks

### Task 1: Patch `writeBlockReason()` recovery emit

- **Action**: `preflight.js:17-40` `writeBlockReason()` 함수에서 stale loop(L22-28) 종료 후 + bypass line(L38) 전에 다음 2 블록 추가:
  ```js
  if (result.missing.length > 0) {
    stderr.write(GATE_TAG + ' To recover MISSING: /mccp:receipt-write --gate <gate_id> --decision ' + result.decisionId + ' --plan <plan path>\n');
  }
  if (result.stale.length > 0) {
    stderr.write(GATE_TAG + ' To regenerate STALE: re-run the producing gate (e.g. /mccp:plan for mccp-plan-codex, /mccp:prp-implement for mccp-implement-codex)\n');
  }
  ```
- **Mirror**: `preflight.js:38-39` bypass/inspect 1줄 hint 패턴 — `GATE_TAG + ' <verb>: <command>'` 동일 구조
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/preflight.test.js` — 기존 6 test PASS 유지 + 신규 2 test PASS

### Task 2: Test — missing branch recovery hint

- **Action**: `preflight.test.js`에 신규 test 추가:
  ```js
  test('preflight: missing → emits /mccp:receipt-write recovery hint', function () {
    const { repo } = setupRepo();
    const cwd = process.cwd();
    process.chdir(repo);
    const io = captureIO();
    try {
      const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
      assert.strictEqual(code, 2);
      assert.match(io.errput(), /To recover MISSING.*\/mccp:receipt-write.*--gate.*--decision x.*--plan/);
    } finally {
      process.chdir(cwd);
    }
  });
  ```
- **Mirror**: `preflight.test.js:36-49` setup + assertion 패턴
- **Validate**: 신규 test 단독 실행 PASS

### Task 3: Test — stale branch recovery hint

- **Action**: `preflight.test.js`에 신규 test 추가:
  ```js
  test('preflight: stale → emits regenerate recovery hint', function () {
    const { repo, plan, planRel } = setupRepo();
    const cwd = process.cwd();
    process.chdir(repo);
    const io = captureIO();
    try {
      require('../write').write({ gate: 'mccp-plan-codex', decision: 'x', plan: planRel });
      require('fs').appendFileSync(plan, '\n\nmutate\n');
      const code = preflight({ command: '/mccp:prp-implement', decision: 'x', plan: planRel }, io);
      assert.strictEqual(code, 2);
      assert.match(io.errput(), /STALE/);
      assert.match(io.errput(), /To regenerate STALE.*re-run the producing gate/);
    } finally {
      process.chdir(cwd);
    }
  });
  ```
- **Mirror**: `validate-cmd.test.js:45-63` stale plan_hash 생성 패턴
- **Validate**: 신규 test 단독 실행 PASS

## Validation

```bash
# 1. Unit tests — preflight.js 직접 테스트
node --test plugins/mccp/scripts/receipt/tests/preflight.test.js

# 2. 전체 receipt module regression
node --test plugins/mccp/scripts/receipt/tests/*.test.js

# 3. End-to-end manual replay — audit 11j + 11k 시나리오 재현
TMPDIR="/c/Temp/mccp-patchverify-$(date +%s)"
mkdir -p "$TMPDIR/.claude/receipts/mccp-plan-codex"
cd "$TMPDIR"
git init -q && git config user.email t@t && git config user.name t
echo "# plan" > test-plan.md && git add -A && git commit -qm init

# 11j replay: missing receipt
node <repo>/plugins/mccp/scripts/receipt/cli.js preflight \
  --command /mccp:prp-implement --decision verify-j --plan test-plan.md
# 기대: stderr에 'To recover MISSING: /mccp:receipt-write --gate' 1줄 포함

# 11k replay: stale plan hash
node <repo>/plugins/mccp/scripts/receipt/cli.js write \
  --gate mccp-plan-codex --decision verify-k --plan test-plan.md
echo "# plan mutated" > test-plan.md && git add -A && git commit -qm mutate
node <repo>/plugins/mccp/scripts/receipt/cli.js preflight \
  --command /mccp:prp-implement --decision verify-k --plan test-plan.md
# 기대: stderr에 'To regenerate STALE: re-run the producing gate' 1줄 포함

cd / && rm -rf "$TMPDIR"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 기존 preflight test가 stderr exact line count 기반 assertion이면 회귀 | Low | 기존 6 test grep으로 검토 — 모두 `assert.match` regex이라 line count assertion 없음. 회귀 위험 0 |
| Recovery hint wording이 i18n breaks downstream consumer | Low | hint는 stderr human-readable block — JSON stdout(`result.missing[]/stale[]`)은 그대로. machine consumer는 stdout JSON만 read 권장 |
| stale 분기에서 gate_id별 mapping이 부정확 | Low | 본 patch는 generic 안내("e.g. /mccp:plan for mccp-plan-codex") — 사용자가 receipt가 emit한 gate_id를 보고 매핑 가능 |
| MCCP_RECEIPT_DEBUG=1일 때 silent-hook UX(L2a)와 충돌 | Very Low | L2a는 ALLOW path에서만 발화. block path는 stderr 그대로 — 기존 행동 무영향 |

## Acceptance

- [ ] Task 1: `writeBlockReason()`에 missing/stale 분기 conditional recovery hint 2 블록 추가 (~6 LoC)
- [ ] Task 2: missing branch test PASS — `To recover MISSING.*\/mccp:receipt-write` 매칭
- [ ] Task 3: stale branch test PASS — `To regenerate STALE.*re-run the producing gate` 매칭
- [ ] 기존 `preflight.test.js` 6 test 회귀 없음
- [ ] 전체 receipt module test PASS
- [ ] Manual replay 11j+11k 시나리오에서 audit 인용 stderr가 변경되어 recovery 1줄 포함
- [ ] Audit cross-reference 업데이트는 v1.0.0 verify-state-continuity worktree에서 후속 (본 branch scope 외)

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, v0.3.5 first-class skip).
> 호출 출력: `{"ok":true,"classification":"disabled","blocking":false,"advisory":false,"durationMs":0}` (codex-invoke.js wrapper, spawn 직전 short-circuit).
> Receipt write at Phase 5.6 will stamp `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'` via env detection.
> Per user memory `feedback-codex-permanent-bypass` (2026-06-08): codex 토큰 cap 소진으로 `MCCP_CODEX_DISABLED=1` 영구 + `MCCP_RECEIPT_GATE_MODE=off` 영구.

## Impeccable Design Critique

> impeccable available but design_signal=false (plan declares no UI surface) — Phase 5.0 silent skip.
> 호출 출력: `{"skill_available":true,"cli_available":false,"design_signal":false,"signal_files":[],"mode":"plan","reason":"path-traversal"}`.

## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, v0.3.5 first-class skip).
> 호출 출력: `{"ok":true,"classification":"disabled","blocking":false,"advisory":false,"durationMs":0}` (codex-invoke.js wrapper, spawn 직전 short-circuit).
> Receipt write at Phase 2.5.6 will stamp `meta.codex_disabled=true` via env detection.

### Design Review

> impeccable available but design_signal=false (implement-mode reads git diff for UI extensions + `.claude/design/*.design.plan.md` changes — neither present in this patch). Phase 2.5.5b silent skip path.
> 호출 출력: `{"skill_available":true,"cli_available":false,"design_signal":false,"signal_files":[],"mode":"implement","reason":"no-signal"}`.

### Security Reviewer

> Not invoked. Phase 2.5.5 security-sensitive area catalog (auth/crypto/secrets/input validation/SQL/cmd injection/SSRF/path traversal/privilege escalation) does NOT match this patch — preflight.js stderr message text changes only. No Task tool call required.
