# Local Review: v1.4.0-m3 (axis C — /goal → mccp:milestone-close)

**Reviewed**: 2026-06-19
**Mode**: Local Review Mode (`/mccp:code-review` no args, advisory pre-commit)
**Branch**: v1-4-0-automation-m3-goal-milestone-close
**Decision**: APPROVE with comments

## Summary

`/mccp:milestone-close` + goal-phase isolation lock (PreToolUse guard + Stop-hook short-circuit 2-axis) 도입. M2 ultracode-phase-lock 패턴을 정확히 mirror하고 multi-turn `/goal` loop 특성(90s lease, F3 STRICT non-owner)을 정확히 반영. 보안 absorption(S1~S6)과 race condition absorption(F1~F4)이 모두 명시적으로 처리. 80/80 회귀 테스트 pass. ship-ready.

## Findings

### CRITICAL
None.

### HIGH
None. 모든 critical surface (sidecar token 0o600, symlink containment, host-aware tri-state reclaim, F2 malformed-lock fail-CLOSED, F3 STRICT non-owner write-deny)는 absorption 완료.

### MEDIUM

**M1. `goal-phase-lock.js` `cmdEnter` — lock open 이후 sidecar token write의 race window** (`plugins/mccp/scripts/lib/goal-phase-lock.js:246-283`)

```
L246  tryOpen()        // lock file 작성 (wx 모드)
...
L282  sfd = fs.openSync(sp, 'w', 0o600)   // sidecar token 작성
L283  fs.writeSync(sfd, ownershipToken)
```

H2 absorption은 sidecar dir mkdir을 lock open 전에 했지만, sidecar token write 자체는 lock 작성 직후입니다. token write가 EACCES/ENOSPC/EBUSY 등으로 throw하면 lock file은 orphan 상태로 남고, 다음 caller가 detect-stale → 90s mtime 만료까지 진입 불가입니다.

권장: lock open 후 sidecar write 실패 시 `try/catch`로 잡고 lock file을 unlink → 사용자에게 retry 안내. 또는 sidecar token을 lock body의 `ownership_token_hash` 검증으로 충분하다고 판단되면 (이미 그러함) sidecar 자체를 in-memory + stdin-pipe로 전달하는 방식 검토. 우선순위 MEDIUM — 실제 발생 확률 낮음.

**M2. `milestone-close.md` Phase 4 — user grammar의 shell injection invariant 부재** (`plugins/mccp/commands/milestone-close.md:134-138`)

```bash
RAW_RESULT="<user response text from Phase 3>"
MASKED=$(node -e '...' "$RAW_RESULT")
```

`goal-done:` summary가 single/double quote, backtick, `$()` 등을 포함하면 shell substitution이 발생합니다. Documentation level이라 immediate 위험은 없지만, Claude가 본 command를 자동 실행 시 user grammar string을 escape 안 하면 mid-execution failure 또는 worst-case command injection 가능.

권장: 사용자 응답 텍스트를 stdin pipe로 node helper에 전달하는 패턴 명시 (예: `printf '%s' "$RAW_RESULT" | node -e '...'`) 또는 임시 파일 경유. 우선순위 MEDIUM.

**M3. `stop-review-loop.js` goal-lock suppress 시 `signalStopLoopPass` 미발화 — auto-handoff 마커 stale 가능성** (`plugins/mccp/scripts/hooks/stop-review-loop.js:203`)

suppress path는 `return rawInput` 즉시 종료해 `signalStopLoopPass(repoRoot, stderr)`를 호출하지 않습니다. M3 의도 (goal loop 동안 mccp 자체 상태 mutation 방지)와 정합하지만, 결과적으로 `/goal` loop가 길어지면 STATE.md의 `last_event=stop_loop_pass` 마커가 stale이 되어 auto-handoff cost-tier breakpoint AND-gate 판단이 흐려질 수 있습니다.

권장: closure-doc README 또는 plan body의 design note에 "goal-phase 동안 stop_loop_pass 마커는 의도적으로 frozen"으로 명시. 또는 별도 `goal_phase_active` 이벤트를 emit해 auto-handoff의 staleness 판단을 도움. 우선순위 MEDIUM (doc only).

**M4. `goal-phase-guard.js` Bash allow-list — `echo`/`cat` redirect로 isolation 외 worktree write 가능** (`plugins/mccp/scripts/hooks/goal-phase-guard.js:84-86`)

```
BASH_DENY_PATTERNS:
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]state[\/\\]/      // .claude/state/ 한정
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]receipts[\/\\]/
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]milestone-closures[\/\\]/
BASH_ALLOW_PATTERNS:
  /^\s*echo\s+/
  /^\s*cat\s+/
```

`echo X > foo.txt` 같이 `.claude/` 밖 redirect는 DENY 패턴에 매치되지 않고 ALLOW의 `echo`로 통과합니다. closure-doc anchor invariant는 `.claude/` 한정이라 audit 영향 없지만, isolation 의도 (lock active 중 working tree mutation 0) 와 약간 어긋납니다.

권장: redirect operator(`>`, `>>`)가 segment에 존재하면 default-deny로 떨어지도록 패턴 강화. 또는 의도적 design choice이면 doc에 명시. 우선순위 MEDIUM (현재 도그푸드 risk 낮음).

### LOW

**L1. `goal-detect.js` `STATUS_VALUES` exported but unused** (`plugins/mccp/scripts/lib/goal-detect.js:47`)

`module.exports.STATUS_VALUES`는 외부 검증을 위한 hint로 export됐지만 실제 코드에서 활용 안 됨. 의도적 surface면 OK, 아니면 제거.

**L2. `goal-phase-lock.js` `parseArgs` dash-prefix value handling** (`plugins/mccp/scripts/lib/goal-phase-lock.js:499-516`)

```js
if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
  args[key] = argv[i + 1];
  i += 1;
}
```

`--milestone-id "--foo"` 같이 값이 `--`로 시작하면 boolean으로 처리됩니다. corner case지만 milestone id에 dash 접두 사용 가능성은 낮음. nit.

**L3. `goal-phase-guard.js` `git checkout HEAD` 같은 read-only도 deny** (`plugins/mccp/scripts/hooks/goal-phase-guard.js:60`)

`/\bgit\s+checkout\s+[^-]/`는 모든 checkout (read-only 포함)을 deny. 의도일 가능성 (branch switch는 working tree state change) — doc/주석에 명시 권장.

### Cross-cutting observations

- **S1~S6 absorption은 모두 검증 완료**: 0o600 mode (S13 POSIX test), symlink containment (S9b), Bash whitelist fail-closed (S3 test), F2 fail-CLOSED on malformed lock (S13 E2E), H2 mkdir-before-lock (S14 EACCES test), derive/mask.js secret mask는 README spec에 명시 (S5).
- **F3 STRICT non-owner policy** — Edit/Write/MultiEdit/Skill mccp:*는 session_id 무관 DENY, Read/Grep/Glob/ToolSearch는 non-owner session에 한해 ALLOW. closure-doc anchor invariant 보존을 위한 defense-in-depth.
- **M2 mirroring 정확성**: lock body 4-field 구조, sidecar token authority split (sha256 hash + raw via sidecar), host-aware tri-state reclaim, F8 symlink containment, S1 0o600 sidecar mode 모두 ultracode-phase-lock.js v1.4.0-m2 ship 1:1 mirror. Lease만 60s → 90s (multi-turn justification).
- **integration-template.md §3 layer 4가 1-axis(M2) → 2-axis(M3)로 일반화** — `/goal`이 session-scoped Stop hook이라는 Anthropic spec 확인 후 stop-review-loop.js short-circuit 도입. 패턴이 잘 정리됨.
- **plugin.json version bump 누락 의식적**: CHANGELOG `[Unreleased]`로 두고 PR squash 시 stamping — CLAUDE.md §3.7 milestone-PR checklist 흐름 정합.

## Validation Results

| Check | Result |
|---|---|
| Targeted test (goal-detect/lock/guard + stop-review-loop) | **Pass — 80/82 (2 Windows skip), 0 fail** |
| Type check (project-level) | Skipped (no project-wide typecheck command, JS native) |
| Lint | Skipped (no project lint command) |
| Build | Skipped (Node plugin) |

## Files Reviewed

### Added (10)
- `.claude/PRPs/reports/v1-4-0-m3-goal-milestone-close-report.md` (work artifact — not source)
- `.claude/milestone-closures/README.md`
- `.claude/plans/v1-4-0-m3-goal-milestone-close.plan.md` (work artifact — not source)
- `plugins/mccp/commands/milestone-close.md`
- `plugins/mccp/scripts/hooks/goal-phase-guard.js`
- `plugins/mccp/scripts/hooks/tests/goal-phase-guard.test.js`
- `plugins/mccp/scripts/lib/goal-detect.js`
- `plugins/mccp/scripts/lib/goal-phase-lock.js`
- `plugins/mccp/scripts/lib/tests/goal-detect.test.js`
- `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js`

### Modified (6)
- `.claude/prds/v1-4-0-automation-modernization.prd.md` — M2/M3/M4 row status + Open Q decisions
- `CHANGELOG.md` — `[Unreleased]` axis C entry
- `docs/automation-modernization/integration-template.md` — 3-axis sample + Stop-hook layer + §10 audit checklist 2건 추가
- `plugins/mccp/hooks/hooks.json` — `mccp:goal-phase-guard:pre` PreToolUse hook 등록
- `plugins/mccp/scripts/hooks/stop-review-loop.js` — goal-phase lock-aware short-circuit (`os` import + ~25 line inline check)
- `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` — M3-S1~S4 4 scenarios 추가

## Next steps

- Optional ship-blocking이 아닌 M1~M4 MEDIUM follow-up — separate axis로 분리 가능.
- `/mccp:pr` 진입 직전 — `plan_hash` 산정 시 closure-doc anchor 정합성 확인 필요 (이 PR 자체가 `/mccp:milestone-close` 산출물을 stamp하지 않음 — bootstrap cycle이므로 closure-doc은 다음 cycle부터).
- CHANGELOG `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD` 갱신은 PR squash 시점에 처리.
