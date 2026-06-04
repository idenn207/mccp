# Plan: DEP0190 회피 — mccp hook의 `spawnSync + shell:true + args 배열` 패턴 제거 (retroactive)

**Source**: Stop hook feedback from Codex stop-time review showing `(node:XXXXX) [DEP0190] DeprecationWarning` blocking session end. Investigation traced the offending pattern to two mccp hooks (`stop-format-typecheck.js`, `post-edit-format.js`).
**Selected Scope**: Replace `spawnSync(bin, args, { shell: true })` in the Windows `.cmd` execution paths with `execFileSync(bin, args, { ... })`. Add static regression guard test. Preserve `UNSAFE_PATH_CHARS` as defense-in-depth.
**Complexity**: Small (3 files, +127 / -20 lines).
**Branch decision**: Standalone fix branch `fix/stop-hook-dep0190` off `origin/main`. No coupling to v0.2.2 work.

---

## Why retroactive

This plan was authored *after* the fix landed in commit `7af0324`, to satisfy the `/mccp:pr` Phase 2.5.7 `--plan <path>` requirement. The work itself was reactive — driven by a stop-hook failure during the previous session, not from a pre-existing PRD.

The retroactive plan documents the same artifact set the receipt CLI would expect: scope, files-to-change, validation, risks.

---

## Files Changed

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/stop-format-typecheck.js` | UPDATE | Two call sites (`formatBatch` line 69, `typecheckBatch` line 104) used `spawnSync + shell:true + args[]`. Both switched to `execFileSync`. `spawnSync` import dropped (no longer used in this file). |
| `plugins/mccp/scripts/hooks/post-edit-format.js` | UPDATE | Same pattern at line 62. `spawnSync` import dropped. Misleading comment "// Windows: .cmd files require shell to execute" corrected. |
| `plugins/mccp/scripts/hooks/tests/dep0190-guard.test.js` | CREATE | Static text scan of `scripts/{hooks,quality,lib,state,receipt}` for `spawn(*, [non-empty], { shell: true })`. Self-test via synthetic offender + safe-form fixture to bound the guard regex itself. |

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| `.cmd` execution on Windows without shell:true | [`post-edit-typecheck.js:53`](plugins/mccp/scripts/hooks/post-edit-typecheck.js#L53) — already comment-documented "Use npx.cmd on Windows to avoid shell: true which enables command injection" | `execFileSync(npxBin, args, options)` — Node 16+ auto-wraps `.cmd` via cmd.exe with separate argv (no shell parsing) |

---

## Validation

```bash
# Level 1: regression guard
node --test plugins/mccp/scripts/hooks/tests/dep0190-guard.test.js

# Level 2: full hook + lib + state suite (no regression elsewhere)
node --test plugins/mccp/scripts/hooks/tests/*.test.js \
              plugins/mccp/scripts/lib/tests/*.test.js \
              plugins/mccp/scripts/state/tests/*.test.js

# Level 3: empirical Node behavior verification (Windows, Node 24.11.1)
node -e "const { spawnSync } = require('child_process'); spawnSync('echo', ['hello'], { shell: true });" 2>&1
# → DEP0190 emitted (confirms trigger condition)

node -e "const { execFileSync } = require('child_process'); execFileSync('cmd.exe', ['/c', 'echo', 'ok'], { stdio: 'pipe' });" 2>&1
# → no DEP0190 (confirms fix path)
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Node 16+ `execFileSync` on `.cmd` requires no `shell:true` claim turns out to be wrong on some Windows config | L | M | Empirical verification on Node 24.11.1 (Windows 11) confirms behavior. `post-edit-typecheck.js` has been shipping the same pattern without reported issue. |
| `UNSAFE_PATH_CHARS` guard becomes dead code, leaves false sense of safety | L | L | Security review (Agent(security-reviewer)) explicitly evaluated this and recommended retention as defense-in-depth + threat-model documentation. |
| Regression guard regex false-negative on dynamic variants (`opts = { shell: true }`) | M | L | Test explicitly verifies that variable-based options are NOT matched. Mitigation: extend regex if codebase introduces a hot path that genuinely needs dynamic options. |
| Codex auto-fallback at Phase 2.5.3 leaves single-model blind spot | H | M | security-reviewer (`Agent`) was invoked as the second adversarial pass (Phase 2.5.5). APPROVE verdict with all four explicit verification questions addressed. |

---

## Acceptance

- [x] `node --test plugins/mccp/scripts/hooks/tests/dep0190-guard.test.js` → 3/3 pass
- [x] Empirical Node test: `spawnSync + shell:true + args[]` emits DEP0190; `execFileSync + args[]` does not
- [x] `UNSAFE_PATH_CHARS` guard preserved in both files
- [x] No `spawnSync` import remains in either modified file (unused)
- [x] `dep0190-guard.test.js` covers the live tree (`scripts/{hooks,quality,lib,state,receipt}/**/*.js`)
- [x] Security reviewer APPROVE with no Open Questions
- [x] Codex adversarial review attempted; auto-fallback recorded (unknown_skill + broker_busy)

---

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): `codex:adversarial-review` skill not registered in the current environment + codex auth broker busy (`/codex:setup` confirmed).

- 호출: N/A
- 라운드 수: 0
- 합치 결론: N/A
- 수용한 제안: N/A
- 거부한 제안 + 근거: N/A
- Open Questions: 없음 — security-reviewer가 보완 review로 APPROVE 수행 (Phase 2.5.5)
- Codex session 참조: N/A
