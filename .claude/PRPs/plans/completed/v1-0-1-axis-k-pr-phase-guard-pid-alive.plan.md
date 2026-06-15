# Plan: v1.0.1 axis K — `pr-phase-guard.js` PID liveness verification

**Source PRD**: `.claude/prds/v1-0-1-axis-k-pr-phase-guard-pid-alive.prd.md`
**Selected Milestone**: M1 — guard hook PID liveness check + reclaim path
**Complexity**: Small (M2 검증 milestone은 별도 plan으로 분리 — Out of scope here)

## Summary

`pr-phase-guard.js`의 `lockActive()`가 lock 존재 여부만 확인하고 holder의 PID liveness를 검증하지 않아, PR helper crash로 orphan lock이 남으면 Linux/macOS 사용자가 self-trap (escape 명령 `detect-stale` 자체가 hook tokenizer/allowlist 두 layer에서 거부됨). M1에서는 guard hook이 `pr-phase-lock.js`의 기존 `isPidAlive()` + `tryReclaimStaleLock()`을 재사용해 same-host + dead-PID 시나리오를 자동 reclaim하고, finalize-receipt가 audit field `meta.pr_phase_lock_stale_reclaimed_at_hook=true`로 silent recovery를 loud audit trail로 변환한다.

## Decision: Option A (자동 reclaim + audit marker) 권장 — Option B 비교 표 포함

PRD §Open Questions가 "자동 release vs 안내된 사용자 액션" 결정을 `/mccp:plan`에 위임함. 두 옵션 비교:

| 축 | Option A — guard hook 자동 reclaim | Option B — detect-stale을 allowlist에 추가 (사용자 1줄) |
|---|---|---|
| F11 sealed-channel 정합 | OK — `tryReclaimStaleLock()`이 의도적으로 token-free (R3-F1 absorbed). guard reuse 가능 | OK — 사용자가 별도 process로 `detect-stale` 실행, schema 무변경 |
| chain-of-custody audit | state-file marker → finalize-receipt read → `meta.pr_phase_lock_stale_reclaimed_at_hook=true`. codex-disabled pattern과 동일 (state marker → receipt stamp) | receipt에 stamp 없음. 사용자가 실행한 명령 자체가 audit trail (shell history / hook-trace shard) |
| 사용자 cognitive load | 0 — hook이 자동 처리, stderr 1줄로 알림 | 2 — 거부된 명령 확인 → 안내된 1줄 실행 → /mccp:pr 재호출 |
| Loud fail-open 정합 ([[feedback-loud-fail-open]]) | OK iff stderr emit + audit marker 둘 다 (silent recovery 방지) | OK trivially (사용자 액션이 가시) |
| Windows 회귀 위험 | LOW — Windows 경로는 lockActive() 이른 return으로 그대로 (hook이 active만 동작) | LOW — allowlist 항목 추가는 host-agnostic |
| 코드 surface | guard hook 내부 +30줄, finalize-receipt +15줄, receipt schema +1 enum, state marker contract 신규 | guard hook `READ_ONLY_CATALOG`에 1줄 추가, denyBlock 메시지 무변경 |
| W11 rubric 결과 (예상) | Type B (인간 1단계, 자동 recovery), NS=1 | Type C (인간 1단계, 안내된 명령), NS=2 |

**권장: Option A**. 이유 3가지:
1. **dead PID self-trap은 infrastructure failure** — 사용자가 명령을 입력해 발생한 게 아닌데 명령 입력을 요구하는 건 root-cause-bypass UX.
2. **`tryReclaimStaleLock()`이 이미 host-aware tri-state** — same-host+pid-alive=NEVER reclaim 보장, alive PID 회귀 0이 mechanical로 보장.
3. **audit marker가 silent recovery 방지** — Loud fail-open principle 위반 없음. state-file marker pattern은 codex-disabled에서 검증된 path.

(Phase 5 Codex review가 Option B로 reverse 권고 시 trade-off 표 재검토 — 본 plan은 Option A 구현 baseline.)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| PID liveness check | `plugins/mccp/scripts/lib/pr-phase-lock.js:264-273` `isPidAlive()` | `process.kill(pid, 0)` + EPERM-as-alive. cross-platform (Win + POSIX) |
| Host-aware reclaim | `plugins/mccp/scripts/lib/pr-phase-lock.js:286-317` `tryReclaimStaleLock()` | same-host+dead → unlink; same-host+alive → false; cross-host → mtime |
| Hook stderr emit | `plugins/mccp/scripts/hooks/pr-phase-guard.js:331-346` `denyBlock()` | structured multi-line `[mccp:pr-phase-guard] ...` prefix |
| State-file marker → receipt stamp | `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:40-77` `deriveCodexFlags()` (codex-disabled state file read) | env/state read → flag vector → CLI forward → receipt.meta |
| Tests axis layout | `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` axes 1–10 | append axis 11 (PID liveness) + axis 12 (audit marker round-trip) |
| Receipt schema field add | `plugins/mccp/scripts/migrations/v0.2.8-*.js` migration scripts | additive field, default unset, no breaking — no migration 필요 (optional boolean) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` | UPDATE | `lockActive()` extend: same-host+dead PID 감지 → `tryReclaimStaleLock()` 호출 + state marker drop + stderr emit + return null (treat lock-absent) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | state marker read → `--pr-phase-lock-stale-reclaimed-at-hook` flag forward |
| `plugins/mccp/scripts/receipt/cli.js` (or schema validator) | UPDATE | new optional flag `--pr-phase-lock-stale-reclaimed-at-hook` → `meta.pr_phase_lock_stale_reclaimed_at_hook=true` |
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | UPDATE | axis 11: PID liveness (alive same-host, dead same-host, cross-host, missing pid, EPERM). axis 12: marker drop on reclaim |
| `plugins/mccp/scripts/lib/pr-phase-helpers/tests/finalize-receipt.test.js` (또는 동등) | UPDATE | marker round-trip: state file present → flag emitted → receipt CLI invoked correctly |
| `docs/v0.2-state-schema.md` | UPDATE | `pr-phase.lock.stale-at-hook` state marker scheme 문서화 (path, contract, lifetime) |
| `CHANGELOG.md` | UPDATE | v1.0.1 entry — axis K 첫 row |
| `.claude/state/STATE.md` | (no manual edit) | hook 갱신, plan에는 변경 없음 |

State marker contract (신규):
- Path: `<repo>/.claude/state/pr-phase-lock-stale-reclaimed.json`
- Body: `{ "reclaimed_at": "<ISO>", "former_run_id": "<uuid>", "former_pid": <int>, "former_host": "<hostname>", "reason": "same-host-dead-pid" }`
- Lifetime: guard hook이 write, finalize-receipt가 read + unlink. 만약 lock 다시 enter (정상 PR cycle 재진입)되면 marker stale → finalize-receipt가 그 invocation의 receipt에 stamp + delete.
- Path containment: `assertContained(dirname, path.join(root, '.claude'))` 재사용 (pr-phase-lock.js와 동일)

## Tasks

### Task 1: guard hook `lockActive()`에 PID liveness 분기 추가
- **Action**: `pr-phase-guard.js:317-329` `lockActive()` 본문을 확장. lock body 로드 후 same-host check (`lock.host === os.hostname()`) + `pr-phase-lock.isPidAlive(lock.pid)` 호출. dead이면 `tryReclaimStaleLock(lockMod.lockPath(root))` 호출 → 성공 시 state marker drop + stderr 1줄 emit + `return null` (treat lock-absent → 후속 PreToolUse가 ALLOW). 실패 시 (cross-host alive PID 등) 기존 block path 유지.
- **Mirror**: `pr-phase-lock.js:602-624` `cmdDetectStale()` same-host branch — 동일한 tri-state 분기 결정. lock module의 `isPidAlive` / `tryReclaimStaleLock` / `lockPath` 함수 직접 require (이미 module.exports에 있음 — 추가 surface 0).
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js -- --test-name-pattern="axis 11"` PASS (Task 4에서 작성).

### Task 2: state marker write 함수 추가 (guard hook 내부)
- **Action**: `pr-phase-guard.js`에 `writeStaleReclaimMarker(root, formerLock, reason)` 함수 추가. `path.join(root, '.claude/state/pr-phase-lock-stale-reclaimed.json')`에 atomic write (`writeFileSync` w/ tmp + rename — 또는 단순 writeSync 0o600). `assertContained` 검증 후 write. Task 1에서 reclaim 성공 시 호출.
- **Mirror**: `pr-phase-lock.js:445-451` `mkdirSync({recursive:true})` + `assertContained()` 시퀀스 + `:458` `fs.openSync(p, 'wx', 0o600)` 모드 — atomic create + owner-only mode.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js -- --test-name-pattern="axis 12"` PASS (Task 4).

### Task 3: finalize-receipt가 marker read → flag forward
- **Action**: `finalize-receipt.js:79-` `run()` 본문 시작부에 marker read 로직 추가. `<root>/.claude/state/pr-phase-lock-stale-reclaimed.json` 존재 시 `--pr-phase-lock-stale-reclaimed-at-hook` flag를 `WRITE_FLAGS`에 push, marker unlink. read/parse fail은 silent skip (loud fail-open: stderr 1줄). `_args.js`의 `--cwd` 인자로 root 결정.
- **Mirror**: `finalize-receipt.js:40-77` `deriveCodexFlags()` — codex-result JSON load → flag vector emit 동일 shape. marker delete는 `pr-phase-lock.js:571` `fs.unlinkSync` (best-effort, swallow ENOENT).
- **Validate**: marker present + run() → exit 0 + `WRITE_FLAGS_USED` includes `--pr-phase-lock-stale-reclaimed-at-hook` AND marker file unlinked.

### Task 4: receipt CLI schema — new flag → meta field
- **Action**: receipt CLI의 `write` subcommand argv parser에 `--pr-phase-lock-stale-reclaimed-at-hook` (boolean) 추가. receipt JSON schema (validator)에 `meta.pr_phase_lock_stale_reclaimed_at_hook` (optional boolean, default unset) 추가. 기존 receipt에 영향 없음 (additive, optional).
- **Mirror**: `--codex-dedupe-at-pr` / `--codex-disabled` 가 동일 패턴으로 추가된 commit 참고 (grep `--codex-dedupe-at-pr` in receipt/cli.js). migration script 불필요 — additive.
- **Validate**: `node plugins/mccp/scripts/receipt/cli.js write --gate mccp-pr-codex --decision test --plan x.md --pr-phase-lock-stale-reclaimed-at-hook` → 생성된 receipt JSON의 `meta.pr_phase_lock_stale_reclaimed_at_hook === true`.

### Task 5: 테스트 axis 11 (PID liveness) + axis 12 (marker round-trip)
- **Action**: `pr-phase-guard.test.js` 끝에 axis 11 + axis 12 추가:
  - **axis 11.1**: fakeLock with `{ pid: process.pid, host: os.hostname(), subphase: 'codex-review' }` (alive same-host) → `lockActive()` returns metadata (기존 동작, 회귀 검증).
  - **axis 11.2**: fakeLock with `{ pid: 999999, host: os.hostname() }` (dead same-host) → `lockActive()` returns null + tmpdir lock 파일이 unlink됨 + marker 파일 작성됨.
  - **axis 11.3**: fakeLock with `{ pid: 1, host: 'other-host' }` (cross-host) → 기존 block path (return metadata, hook이 deny). reclaim 안 됨.
  - **axis 11.4**: lock.pid 누락/0/음수 → `isPidAlive` returns false → same-host 가정 시 reclaim 시도. (PRD §Risks: race window mitigation)
  - **axis 11.5**: Windows 회귀 fixture — PowerShell tool name (`PowerShell` 등) 입력 시 hook이 적용 안 됨 (hooks.json matcher가 `Bash|Edit|Write|...`만, PowerShell 미포함). 별도 test로 명시.
  - **axis 12.1**: state marker write — guard hook이 reclaim 시 `.claude/state/pr-phase-lock-stale-reclaimed.json` JSON shape 검증 (`reclaimed_at`, `former_run_id`, `former_pid`, `former_host`, `reason`).
  - **axis 12.2**: marker idempotency — 두 번째 reclaim 시 기존 marker overwrite (또는 append? — Task 2 결정: overwrite, 가장 최근 reclaim만 stamp).
- **Mirror**: axis 9 `lockActive returns ...` fixture style (in-test fakeLock 객체 with `repoRoot/readLock/SUBPHASE_DEFAULT`). axis 6 `verifyHelperContent` tmp-dir fixture pattern.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` 전체 PASS + 기존 axis 1-10 회귀 0.

### Task 6: state marker contract 문서화 (`docs/v0.2-state-schema.md`)
- **Action**: 신규 section "pr-phase-lock-stale-reclaimed.json — state marker" 추가. path / body shape / lifetime / writer (guard hook) / reader (finalize-receipt) / 삭제 트리거 명시. F11 sealed-channel과의 관계 (this marker는 token-free, audit-only — sealed-channel 무관) 명시.
- **Mirror**: 동일 문서의 `pr-phase.lock` section structure.
- **Validate**: `grep -q "pr-phase-lock-stale-reclaimed" docs/v0.2-state-schema.md` → match.

### Task 7: CHANGELOG.md v1.0.1 entry
- **Action**: v1.0.1 `## Fixed` section 추가. 1줄: "pr-phase-guard hook now reclaims orphan locks left by crashed PR helpers (same-host + dead PID), eliminating Linux/macOS self-trap when /mccp:pr is re-invoked. Audit marker `meta.pr_phase_lock_stale_reclaimed_at_hook=true` lands on the next PR receipt."
- **Mirror**: v1.0.0 entry shape (`## Fixed` `## Added` headings).
- **Validate**: human read.

## Validation

```bash
# 단위 회귀 — 기존 + 신규 axis
node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js
node --test plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js
node --test plugins/mccp/scripts/lib/tests/pr-phase-lock-f11.test.js

# state marker round-trip (Task 3 + 4 integration)
node --test plugins/mccp/scripts/lib/pr-phase-helpers/tests/finalize-receipt.test.js

# 전체 mccp 단위 — 기존 327 + 신규 axis. 회귀 0.
node --test 'plugins/mccp/**/*.test.js'

# Schema sanity — receipt 신규 flag → meta field stamp 확인 (Task 4)
node plugins/mccp/scripts/receipt/cli.js write \
  --gate mccp-pr-codex --decision v1-0-1-axis-k-smoke \
  --plan .claude/plans/v1-0-1-axis-k-pr-phase-guard-pid-alive.plan.md \
  --pr-phase-lock-stale-reclaimed-at-hook \
  --quiet \
  && node -e "const j=require('./.claude/receipts/mccp-pr-codex/v1-0-1-axis-k-smoke.json'); console.assert(j.meta.pr_phase_lock_stale_reclaimed_at_hook===true)"

# Linux/macOS reproduction은 M2로 분리 — 본 plan 범위 외
# (W11 rubric 재측정 + Docker/WSL/GitHub Actions matrix 선택은 M2 plan에 위임)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| race window: alive PID check 직후 holder die → guard가 NEVER reclaim path 선택, 다음 호출에서 같은 결과 (기존 동작 회귀 0). M2 reproduction이 자연 cover | LOW | Task 1에서 isPidAlive → tryReclaimStaleLock 이중 호출 (lock library가 atomic rename으로 race window 최소화). `pr-phase-lock.js:475` `if (!tryReclaimStaleLock(p)) return 11;` 동일 path |
| F11 sealed-channel schema 무손상 invariant 위반 | LOW | Task 1+2가 lock body 읽기만 — `ownership_token_hash` 검증 path 무접근. `tryReclaimStaleLock()`이 token-free로 설계됨 (R3-F1). receipt acceptance에 schema diff 0 row 박음 |
| Windows PowerShell 우회 path 회귀 | LOW | Task 5 axis 11.5 fixture + hooks.json matcher `Edit|Write|MultiEdit|NotebookEdit|Bash` (PowerShell 포함 없음 — 기존 동작) verifty |
| silent recovery → Loud fail-open principle 위반 | MED | Task 1 stderr 1줄 emit (구조화 prefix `[mccp:pr-phase-guard] stale lock reclaimed (former_run_id=...)`) + Task 3 state marker → Task 4 receipt audit field 양축 enforcement |
| state marker 누락 / 비동기 race (marker write 후 process kill → next finalize-receipt가 못 읽음) | MED | atomic write (tmp + rename) — Task 2. read 실패 시 silent skip이지만 stderr 1줄 emit (Loud fail-open). marker 누락 시 receipt는 audit field 없이 작성됨 — chain-of-custody는 stderr trace로 secondary trail 유지 |
| receipt schema 추가 시 기존 validator가 reject | LOW | Task 4 additive optional field — 기존 receipt JSON에 영향 0. 신규 validation rule은 `if present === boolean` only |

## Acceptance

- [ ] Tasks 1–7 모두 complete
- [ ] `node --test 'plugins/mccp/**/*.test.js'` 전체 PASS, 기존 axis 1–10 회귀 0
- [ ] axis 11.5 (Windows PowerShell 우회 path) 회귀 PASS — PRD Success Metrics 표 row 3
- [ ] F11 schema diff: `pr-phase-lock.js`의 `lockBody` 구조 변경 0 row, `ownership_token_hash` 검증 path 미접근 — PRD Success Metrics 표 row 4
- [ ] state marker contract가 `docs/v0.2-state-schema.md`에 문서화 (Task 6)
- [ ] receipt 신규 flag가 schema에 등록되고 round-trip validation PASS (Task 4 + Validation 마지막 블록)
- [ ] CHANGELOG.md v1.0.1 entry 작성 (Task 7)
- [ ] Linux/macOS reproduction (PRD M2)은 별도 plan으로 분리, 본 plan 범위 외 — M2 plan path는 PRD Delivery Milestones 표 row 2 Plan column에 따로 박힘
- [ ] Phase 5 Codex review가 Option A 선택을 APPROVE (또는 R1 round에서 Option B 권고 시 trade-off 표 재검토 + 사용자 재확인)

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip via wrapper short-circuit; classification=disabled, durationMs=0). Permanent bypass per [[feedback-codex-permanent-bypass]] (codex token cap 소진, 2026-06-08 user 결정). Receipt at 5.6 will auto-stamp `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'`.

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (skipped)
- 합치 결론: n/a — codex permanently disabled per user policy
- YAGNI Triage: n/a (no findings to triage)
- Deferred to backlog: 0
- Open Questions: none from Codex (PRD §Open Questions는 plan 본문 §Decision + §Tasks에서 흡수됨)
- Codex session 참조: n/a

## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip via wrapper short-circuit; classification=disabled, blocking=false, advisory=false, durationMs=0). Permanent bypass per [[feedback-codex-permanent-bypass]] — same rationale as plan-time review above. Receipt at Phase 2.5.6 will auto-stamp `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'` via env-level detection in receipt/write.js. Note: settings.local.json은 현재 env를 명시 보유하지 않지만, 사용자 영구 정책에 따라 inline 적용 (no re-auth prompt).

- 호출: `MCCP_CODEX_DISABLED=1 node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0/scripts/lib/codex-invoke.js adversarial-review --focus "<3개 implement-time decisions>"` (fail-closed wrapper, classification=disabled)
- 라운드 수: 0 (skipped)
- 합치 결론: n/a — codex permanently disabled per user policy
- YAGNI Triage: n/a (no findings to triage)
- Deferred to backlog: 0
- Open Questions: none from Codex

### Security Reviewer

> N/A — implementation은 hook + receipt schema additive change. auth/crypto/secrets/SQL/cmd injection/SSRF/path traversal/privilege escalation 카테고리 미접근. `assertContained` 재사용으로 path containment 이미 보장 (Task 2 mirror).

### Design Review

> impeccable skipped — implementation은 UI 비대상 (hook + receipt + tests + docs only). impeccable-detect signal=0 expected.

