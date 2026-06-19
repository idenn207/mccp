# v1.3.0-m6 Audit Evidence Matrix

> Codex Plan-Codex R1 F2 absorption — Task 0 deterministic matrix (grep-only audit miss 방지).

**Date**: 2026-06-19
**Plan**: `.claude/plans/v1-3-0-observability-m6-generic-interface.plan.md`
**Decision**: 5 axis × {fixture assertion / documented non-generic contract / required patch}.

## Matrix

| # | Axis | Decision | Evidence |
|---|---|---|---|
| 1 | **Source path shape** | **contract** | `derive/sources/*.js`가 가정하는 layout(`.claude/{plans,receipts,state,state/dispatches,cache,plans/codex-findings-backlog.md,state/fix-task.md,state/STATE.md}`)은 **mccp 표준**이며, 외부 repo가 같은 경로에 호환 파일을 두면 derive가 동작. 다른 layout은 generic 보장 외(`docs/.../generic-interface.md` §4 "What is NOT generic"에 명시). Fixture B/C가 layout 충족하는 외부 repo를 시뮬레이션해 이 contract을 평가. |
| 2 | **Status / event enums** | **fixture** | `envelopes.js:10` `TERMINAL_STATUSES=['ok','failure','timeout','crashed']` 외 값은 `is_terminal:false`로 자동 fallback(graceful). `receipts.js`는 `gate_id` prefix 검사 안 함 — free-form string. Fixture C가 `gate_id='foo-gate','bar-gate'` (mccp-* 비prefix)로 derive+render 통과를 assertion. Fixture D 의 envelope `additionalProperties:false` 위반은 `envelope.read()`이 reject → `invalid_count++` + `degraded:true` (이미 graceful). |
| 3 | **STATE schema version** | **fixture + contract** | `state-writer.js#readState`는 frontmatter parse만 수행하고 schema_version 강제 안 함(read-only graceful). 외부 자동화가 `schema_version:'v1'` minimal frontmatter만 적어도 derive `sources/state.js`가 item.frontmatter로 surface. Fixture B가 (`schema_version:'v1'` + `session_id` 만)으로 검증. Contract: **mccp만 자체 STATE schema 작성**, 외부 repo는 read-only graceful — `docs/.../generic-interface.md` §3에 명시. Fixture D가 `format_version:99` 같은 unsupported frontmatter도 throw 없이 surface 됨을 검증. |
| 4 | **Snapshot identity fields** | **fixture** | `receipts.js:55-77`이 모든 mccp-extension meta field(`briefing_*`, `codex_*`, `codex_dedupe_at_pr`, `codex_skipped_at_pr`, `ipc_envelope_path`, `dispatched_by_controller_session_id`, `worker_dispatch_id` 등 13개)를 `pick()` 으로 추출 — missing은 `undefined`로 fallback(이미 graceful). Fixture C가 `gate_id='foo-gate'` receipt에서 위 field 모두 비어있어도 projection + snapshot writer 통과를 assertion. |
| 5 | **Renderer source presence** | **fixture** | `verdict.js`의 11-step priority chain은 각 source missing/empty 시 다음 단계로 fall-through(이미 graceful: m0_capability→mask_hits→critical warning→degraded→state→fix-task→envelopes→backlog→plans→default). `audit-timeline.js:124` 가 `r.gate_id \|\| r.gate \|\| '(unknown-gate)'`로 raw label fallback (이미 graceful). `worker-fanout.js:54-66` 가 envelope `ok:false` 시 ⚠ envelope corrupt 표시 (이미 graceful). `open-questions.js:27` 와 `risks.js`도 source missing 시 `return null`로 section skip. Fixture A(empty)/B(state-only)/C(non-mccp gates)/D(degraded) 4 fixture 모두 `renderStatus`가 throw 없이 6-section 산출 + verdict 1줄 + audit-timeline에 raw label 그대로 표시를 assertion. |

## Patch column tally

**1 axis requires patch** (axis 1 — source path shape, security sub-axis). 나머지 4 axes는 기존 graceful fallback이 이미 cover.

### Patch — receipt file-level symlink guard (axis 1 sub-axis: security contract)

| Patch | File | Why |
|---|---|---|
| Add `isPlainFile(filePath)` private helper mirroring `envelopes.js:14-19` | [`receipt/store.js`](../../plugins/mccp/scripts/receipt/store.js) | Defense-in-depth file-level guard. v0.2.8 added gate-dir level guard but not file level. |
| Add `isPlainFile(p)` check inside `readReceipt` after `fs.existsSync(p)` | [`receipt/store.js#readReceipt`](../../plugins/mccp/scripts/receipt/store.js) | A safe gate dir could host a symlinked `<decision>.json` pointing outside the worktree. Without this, generic-interface.md §4.3's "no external dereference" claim was unenforced for receipts — only envelopes had file-level guard. |
| Strengthen Fixture D sentinel JSON: add `meta.created_at` + `meta.command` + `decision_id` sentinels | [`derive/tests/generic-interface.test.js`](../../plugins/mccp/scripts/derive/tests/generic-interface.test.js) | Without `meta` sentinels the original test passed by accident — `receipts.js#extract` reads `meta.created_at`/`meta.command` directly. New sentinels turn the test into a real invariant. New assertion: symlink receipt must surface as `ok:false` item with error referencing the guard, not a silent skip. |
| Update §4.3 cite to reference both envelopes (existing) and receipts (new) symlink guards | [`docs/v1.3.0-observability/generic-interface.md`](../../docs/v1.3.0-observability/generic-interface.md) | Original cite only mentioned `envelopes.js:14-19`, generalizing one source's guard to the contract. Cite now lists both guards by source. |

### Patch — security-reviewer absorption (HIGH × 2)

| Patch | File | Why |
|---|---|---|
| Sanitize error messages in `readReceipt` — remove path from `Error.message`, keep on `err.path` | [`receipt/store.js#readReceipt`](../../plugins/mccp/scripts/receipt/store.js) | security-reviewer Finding 1 (Information Disclosure). `derive/sources/receipts.js#extract` only surfaces `err.message` into the derive model; if the model is serialized to monitoring/CI logs, the full filesystem path leaks. Sanitized messages remove path while preserving `err.path` + `err.code` for local debugging. UNSAFE_GATE_DIR + UNSAFE_RECEIPT_FILE + RECEIPT_PARSE_ERROR + RECEIPT_READ_ERROR all sanitized. |
| Close TOCTOU window — replace `existsSync → lstat → readFileSync` with `existsSync → lstat → open(O_NOFOLLOW) → fstat → read from fd → close` | [`receipt/store.js#readReceipt`](../../plugins/mccp/scripts/receipt/store.js) | security-reviewer Finding 2 (TOCTOU). 3-syscall sequence had a race: attacker could swap a plain file for a symlink between lstat and readFileSync. Atomic open + fstat re-validation closes the window. `O_NOFOLLOW` (POSIX) rejects open() if the path is now a symlink. Windows lacks `O_NOFOLLOW` so the lstat pre-check + isSafeGateDir remain primary defense there. |

### Remaining 4 axes — fallback already implemented (no patch)

- `audit-timeline.js:124` `r.gate_id \|\| r.gate \|\| '(unknown-gate)'` (이미 raw label)
- `receipts.js:55-77` `pick()` 으로 모든 mccp-extension field undefined fallback (이미 null projection)
- `verdict.js` 11-step chain이 source 없으면 다음 단계 fall-through (이미 graceful)
- `worker-fanout.js:29` `if (envSrc.count===0 && !controllerActive) return null` (이미 hide)
- `envelopes.js:36-37` `.claude/state/dispatches` 미존재 시 `count:0` early return (이미 graceful)
- `state.js:22-24` `STATE.md` 미존재 시 `item:null` early return (이미 graceful)
- `backlog.js:10-13`, `fix-task.js:7-10`, `plans.js:28-30` 모두 file 미존재 시 graceful

## Conclusion

- audit evidence가 5/5 axis 모두 결정 column 1개씩 매핑 완료 (F2 absorption invariant 충족)
- Task 1~3 fixture가 axis 2/4/5를 직접 assertion으로 cover
- axis 1/3 contract은 `docs/v1.3.0-observability/generic-interface.md` §4 / §3에서 본문화
- Task 4 patch — axis 1 security sub-axis 1건 (receipt file-level symlink guard). 코드 리뷰 시 발견된 sub-axis. 나머지 4 axes는 fixture/contract로 결정.
- F1 installed-plugin end-to-end smoke 3종은 PR review 단계에서 사용자 manual verify (Plan §Validation)
