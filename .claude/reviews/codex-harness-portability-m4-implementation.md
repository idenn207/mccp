# M4 implementation execution

## Codex Implementation Review

- Latest plan: R5 converged, zero findings. Approved plan bytes retained.
- Fresh implement review: approve / converged, zero findings. Raw: codex-harness-portability-m4-implement-resume.json. Prior operator instruction to repeat until convergence honored with observe ledger; no rounds deleted.
- Security design review: separate Codex agent /root/security_review, previously authorized substitute, no new HIGH/CRITICAL blockers in DD6–DD8. Not a Claude cross-model product acceptance.
- Design: no signal, no design invocation.
- Fresh Claude CLI probe: Task 1 passed, actual model claude-opus-5, write denied, protected hash unchanged; three-gate acceptance subsequently passed (canonical data and completion report).
- Execution record is separate to preserve the R5 plan digest; no architectural changes to the approved plan.

## Implementation and security absorption

- Security review confirmed no remaining HIGH/CRITICAL after fixing: checkout hook execution, index/worktree cancellation, PR owner release before seal, receipt/manifest replacement, and proof re-read binding. These are independently reproduced regression cases.
- Live measurement also exposed plan intent applicability masking a divergent reviewer exit; Claude plan completion now requires a converged on-disk reviewer receipt.
- Additional path: `plugins/mccp/scripts/lib/env-contract/registry.js` updates one line-number evidence pointer after plan-mode routing changes. No new environment variable. Recorded here instead of changing approved R5 bytes.
- Snapshot uses `worktree add --no-checkout`, hooks disabled and fsmonitor disabled, plus complete frozen Git blobs/diff on stdin with tools disabled. UTF-8 text is readable; binary blobs are base64. Limit 8 MiB; larger targets fail closed. This avoids symlink following and checkout filters.
- PR dedupe remains conservatively off for the Claude owner; the shared predicate validates eligible cross-model evidence but the PR owner always obtains a fresh review.
- Required auxiliary Task/Workflow tools remain fail-closed when unavailable. These measurements exercise real gate owner CLIs, not a whole published PR or M5 cross-harness continuation.
