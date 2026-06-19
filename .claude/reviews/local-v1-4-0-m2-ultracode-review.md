# Local Review: v1.4.0-m2 ultracode delegation

**Reviewed**: 2026-06-19
**Branch**: v1-4-0-m2-ultracode (uncommitted changes)
**Mode**: Local Review (advisory pre-commit, no receipt chain)
**Decision**: REQUEST CHANGES (2 HIGH 수정 후 APPROVE — 모두 mechanical 1-line 패치)

## Summary

axis B (M2) ultracode 위임 통합의 7개 추적 + 8개 untracked 파일 검토. 신규 1,000+ LOC(detect/lock/guard + 73 test) + prp-implement.md Phase 3.5 sub-phase 명세 추가. 핵심 invariant(F1-F5 absorption) 모두 구현으로 매핑되어 있고 73/73 test 통과. CRITICAL 없음, HIGH 2건은 모두 1-line 수정 가능. 한 건 잠재적 hook 25s stall + 한 건 sidecar mkdir ordering race.

## Findings

### CRITICAL
None.

### HIGH

**H1 — `ultracode-phase-guard.js:194` PreToolUse stdin timeout 25s 과대**

```js
setTimeout(function () { resolve(buf); }, 25000);
```

PreToolUse hook은 모든 tool call 직전에 호출됩니다. stdin pipe가 stall되면 25s 동안 사용자가 모든 도구 호출을 기다리게 됩니다. plan body의 Risks 표는 이 시나리오를 다루지 않습니다.

**제안**: 2000ms (또는 더 짧게)로 줄이고, timeout 시 fail-open ALLOW 정책 유지(이미 `resolve(buf)` → 빈 buf → `event=null` → early return 0). hook payload는 보통 수 KB이므로 read는 ms 단위로 끝납니다 — 25s는 abnormal case로 무의미하게 길어집니다.

**H2 — `ultracode-phase-lock.js cmdEnter` sidecar mkdir이 lock 생성 후로 ordered됨 → orphan lock race**

```js
// Line 243-269: tryOpen()로 lock file 먼저 생성
// Line 274-277: 이후 sidecar dir mkdir + sidecar 작성
```

`fs.mkdirSync(path.dirname(sp), { recursive: true })`(line 275)이 lock file 생성 이후 호출됩니다. 만약 sidecar dir mkdir이 실패(권한, ENOSPC, race for `.git/mccp/tmp/` 생성)하면:

1. Lock file은 이미 disk에 있음 → 이후 enter 시도 모두 exit 11
2. Sidecar 부재 → `cmdExit`는 token 검증 불가 → 항상 exit 16
3. 결과: 60s mtime 만료 + detect-stale 호출 전까지 모든 mccp delegation 차단

**제안**: sidecar dir을 `tryOpen` 호출 전에 만드세요:

```js
fs.mkdirSync(path.dirname(p), { recursive: true });           // 기존
fs.mkdirSync(path.dirname(sidecarPath(args.cwd, runId)), { recursive: true });  // 추가
```

또는 enter가 실패 시 lock을 cleanup하는 rollback 추가. test S1은 happy-path만 검증 — 이 race를 직접 covers하는 fixture 없음.

### MEDIUM

**M1 — `prp-implement.md` 3.5.2 IDEMPOTENCY CHECK이 "queue push + next task 진행"을 comment-only로 둠**

```bash
if [ -n "$PRIOR" ]; then
  ...
  echo "[ultracode-delegated-previously] ..."
  # Push to queue from journal entry (so Phase 5 REPORT + provenance still surface it)
  # then continue to next task.
fi
```

Comment만 있고 실제 push/continue 메커니즘이 인스트럭션화되지 않습니다. Claude가 comment를 읽고 의도대로 행동해야 하는데, 이는 cooperative-only 패턴. 만약 missed → 재실행 시 REPORT/PROVENANCE에서 prior delegation이 누락됩니다.

**제안**: `# Push to queue` 줄을 explicit shell 명령(예: `DELEGATIONS_FROM_JOURNAL+="$PRIOR\n"` 또는 sub-phase 3.5.10 Forwarded effects 내 명시적 step)으로 spelling out. 또는 sub-phase 3.5.9 PROVENANCE STAMP가 항상 journal에서 read하도록 명시(이미 그렇게 보이지만 in-memory queue와의 관계 명확히).

**M2 — `prp-implement.md` 3.5.6 IMMEDIATE STAMP의 `head -c 280` byte-truncate은 UTF-8 multi-byte 경계 미보호**

```bash
SUMMARY_TRUNC=$(echo "$USER_SUMMARY" | head -c 280)
```

한국어 summary가 280 byte 경계에서 multi-byte character 중간에 잘리면 mojibake 발생 → journal entry parse 실패. plan body의 invariant("응답 grammar는 Korean primary, terminology 보존")와 충돌합니다.

**제안**: `head -c`를 character-aware truncate로 교체:

```bash
SUMMARY_TRUNC=$(echo "$USER_SUMMARY" | node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").slice(0,280))')
```

또는 journal entry 작성을 Node 안에서 통째로 하고 truncate도 거기서. 현재 entry composition은 이미 Node `process.argv` 경유라 일관성도 좋아집니다.

**M3 — `plugin.json` version 필드 bump 누락**

Plan Task 8 본문이 "version 필드는 변경 안 함 — Task 11 issue (PR ship 시점 main HEAD 기준)"으로 의도적 deferral을 명시. 하지만 CLAUDE.md §3.7 + memory `[mccp-v1.3.0-cycle]`은 minor milestone(M2 ship)에서 bump을 ship-time 의무 체크리스트로 강제합니다. 누락 cycle 누적이 v1.2.0 → v1.4.0 jump을 야기한 전례 있음.

**제안**: PR ship 직전 `plugins/mccp/.claude-plugin/plugin.json` minor bump(1.4.0 → 1.4.x 또는 1.5.0) 필수. branch 이름 `v1-4-0-m2-ultracode`은 1.4.x 시리즈로 보이므로 1.4.x patch가 적절. 이 결정은 PR 작성 시점에 main HEAD 확인 후 결정.

### LOW

**L1 — `ultracode-phase-lock.js cmdEnter` reclaim 경로에서 이전 run_id의 sidecar 즉시 cleanup 부재**

`tryReclaimStaleLock`이 lock unlink만 수행, 이전 run_id sidecar는 orphan으로 남습니다. `sweepOrphanSidecars`가 2×STALE_MS_DEFAULT(120s) 후 sweep, 그 전까지 `.git/mccp/tmp/`에 stale 파일. enter 직후 active mismatch는 없지만 cleanup hygiene 측면에서 enter에서 reclaim된 lock의 이전 run_id sidecar를 즉시 unlink하는 게 깔끔합니다. detect-stale의 sweep 로직(line 416-420)을 enter에서도 호출하는 게 1줄.

**L2 — `ultracode-phase-lock.js cmdEnter` `fs.realpathSync` catch 부재**

Line 228-229의 `realpathSync` 호출이 throw 시 uncaught → process exit 1 + 의미 없는 stack trace. Windows symlink edge에서 발생 가능. try/catch + `return 18` (symlink-containment exit code 재사용)으로 wrap.

**L3 — `<plan>.delegations.jsonl` concurrent append POSIX-atomic 보장은 PIPE_BUF(4096) 미만**

JSON entry는 ~500 byte 미만이므로 POSIX-atomic. Windows는 atomic 보장 약함. 동일 plan에 대한 동시 prp-implement 가능성은 매우 낮음(같은 plan 두 곳에서 implement는 사용자가 의도해야 함). 설계 caveat로만 표기.

**L4 — `ultracode-phase-guard.js:87` `cat` allow 패턴이 `.claude/state/` 차단**

`cat .claude/state/STATE.md` 같은 read도 차단됩니다. lock CLI의 `read` subcommand가 canonical path지만, user-debug 시 `cat` 직접 호출 차단은 UX 마찰. read-only이므로 deny할 이유는 없음. allow로 옮기는 게 일관적.

## Cross-cutting observations

- **Plan body가 R1 Absorption Annex로 5/5 findings absorb**한 것은 plan-review hygiene 모범. impeccable critique이 backend-tooling에 not-applicable로 정확히 격리된 것도 정합. F1 spec confirmation marker(line 470)가 plan 끝에 실제 stamped된 것 확인 — Task 1 plan-finalize gate가 mechanically 작동.
- **test coverage 73/73 통과**. 신규 module 3개 모두 isolated 시나리오 + happy/sad path 포함. 빠진 시나리오 1건만 보고 — sidecar dir mkdir race (H2 관련).
- **integration template doc** §3 row 4 isolation lock 추가 + §10 audit checklist 3개 항목 추가는 future axis(M3 /goal)에서 재평가 가능하도록 axis-conditional하게 적절히 framed. cross-axis lock-in 회피 invariant 보존.
- **CLAUDE.md compliance**: PR 본문 한국어 invariant은 PR 작성 시 적용될 것. PreToolUse hook hooks.json 등록 + JSON 유효성 + 병렬 운용(pr-phase-guard와 동시 chain) 모두 확인. STATE.md timestamp는 stop_loop_pass 갱신만 — body roll 부채 누적 시그널은 별건 backlog axis(STATE.md drift).
- **Receipt schema invariant**: M2가 schema에 손대지 않음(plan §Out-of-file changes 명시 + 코드에서 receipt CLI 호출 사용처 모두 read-only).

## Validation Results

| Check | Result |
|---|---|
| Type check | N/A (JS, no TS) |
| Lint | Skipped (no project lint script) |
| Tests (`node --test`) | **PASS 73/73** (ultracode-detect 26 + ultracode-phase-lock 17 + ultracode-phase-guard 30) |
| hooks.json JSON syntax | OK |
| plugin.json PreToolUse hook 병렬 등록 | OK (pr-phase-guard + ultracode-phase-guard 둘 다 검출) |
| False-positive fixture smoke (M1 plan) | OK (`ultracode_signal=false` + `reason=unknown-default`) |
| Build | N/A |

## Files Reviewed

| File | Change Type | Notes |
|---|---|---|
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | Modified | M1 row complete + M2 row in-progress 표시. 정합. |
| `.claude/state/STATE.md` | Modified | last_event/updated_at timestamp만 갱신. body roll 부재는 알려진 backlog. |
| `.gitignore` | Modified | `*.delegations.jsonl` 패턴 추가. F4 absorption 정합. |
| `CHANGELOG.md` | Modified | (내용 미확인 — diff stat에서 37줄 추가) |
| `docs/automation-modernization/integration-template.md` | Modified | §3/§5/§8/§10 갱신. axis-conditional framing 적절. |
| `plugins/mccp/commands/prp-implement.md` | Modified | Phase 3.5 sub-phase 추가(218줄). M1/M2 위 finding. |
| `plugins/mccp/hooks/hooks.json` | Modified | `mccp:ultracode-phase-guard:pre` 등록. |
| `.claude/PRPs/reports/v1-4-0-m2-ultracode-report.md` | Added | (내용 미확인) |
| `.claude/plans/v1-4-0-m2-ultracode.plan.md` | Added | R1 Absorption Annex(A1-A5) + Codex review + spec confirmation marker 정합. |
| `plugins/mccp/scripts/lib/ultracode-detect.js` | Added | tristate availability + marker regex + path-traversal guard. 통과. |
| `plugins/mccp/scripts/lib/ultracode-phase-lock.js` | Added | pr-phase-lock pattern mirror. H2 mkdir ordering 이슈. |
| `plugins/mccp/scripts/hooks/ultracode-phase-guard.js` | Added | F1 caller-identity + F2 fail-CLOSED. H1 25s timeout 이슈. |
| `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` | Added | 26 시나리오, false-positive fixture 포함. |
| `plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js` | Added | 17 시나리오, 3-host policy + 0-byte/parse-error fallback. |
| `plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js` | Added | 30 시나리오, E2E spawn + F1/F2 absorption fixtures. |

## Recommended next steps

1. **H1/H2 fix (필수)**: 25s timeout → 2s + sidecar dir mkdir ordering 1줄. 둘 다 mechanical.
2. **M1/M2 fix (권장)**: 3.5.2 explicit queue push step + 3.5.6 UTF-8 safe truncate.
3. **M3 (PR ship 직전)**: `plugin.json` version bump 결정 + CHANGELOG row 확인.
4. **dogfood (별도 cycle)**: H2 race는 unit test로 직접 reproduce 어려움 — plan Validate(g) "lock 잔존 후 다음 prp-implement 진입" 시나리오로 e2e 검증.
5. 이후 `/mccp:prp-commit` → `/mccp:pr` 진입.
