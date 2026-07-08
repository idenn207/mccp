# Plan: P2 — Session-continuity silent-failure

**Source PRD**: `.claude/prds/audit-remediation-followup.prd.md`
**Selected Milestone**: P2 (session-continuity silent-failure)
**Branch**: v1-20-5-session-continuity · **Version**: 1.20.4 → 1.20.5 (patch)
**Complexity**: Medium

## Summary

hook 레이어가 SessionEnd marker를 조용히 누락하는 root cause를 닫는다. `session-end-trace.js`가 hook-trace 모듈 로드 실패 시 `.end` marker 없이 return 0 하고(B#4), 그 실패가 `session-end-marker.js` 중첩 catch + `run-with-flags.js` generic `exit(0)`로 성공처럼 은폐된다(B#5). 결과: 30+ 세션이 marker 없이 종료 → 후속 세션의 `scanCrashAlerts`가 false crash alert 발화. **fail-loud-open**으로 전환한다 — marker는 hook-trace 없이도 `fs` 직접 write로 보장(marker > lease)하고, degraded 경로를 loud stderr로 표면화한다. 부수적으로 idle 대화 세션의 lease heartbeat 부재(B#10), state-lock 문서 드리프트(B#16), lock `tryAcquire` fd 누수(B#17)를 함께 닫는다.

## Root Cause (grounded, worktree 실측)

| 지점 | 코드 | 문제 |
|---|---|---|
| `plugins/mccp/scripts/hooks/session-end-trace.js:55-56` | `const ht = loadHookTrace(); if (!ht) return 0;` | 모듈 로드 실패 시 **marker 없이 return** (B#4 root cause, main 경로) |
| `plugins/mccp/scripts/hooks/session-end-trace.js:99-100` | `runSync`: `if (!ht \|\| ...) return 0;` | 동일 — sync 경로도 marker 미작성 (session-end-marker.js가 호출하는 실경로) |
| `plugins/mccp/scripts/hooks/session-end-trace.js:34-40` | `loadHookTrace()` catch → `debug()` 후 null | 실패가 debug-only, 관측 불가 |
| `plugins/mccp/scripts/hooks/session-end-marker.js:27-35` | `try { trace.runSync(event) } catch { stderr 1줄 }` | runSync/require 총체 실패 시 marker 보장 없음 (B#5) |
| `plugins/mccp/scripts/hooks/run-with-flags.js:151-155` | `catch (runErr) { stderr; stdout.write(raw) } process.exit(0)` | hook `run()` throw를 exit 0으로 은폐 (B#5) — **단 generic runner라 fail-open이 의도됨** |
| `plugins/mccp/scripts/lib/hook-trace.js:277` | `renewLease`가 `recordWrite`에서만 호출 | tool-less 대화 세션은 heartbeat 부재 → `LEASE_LIVE_MS(10분)` 후 stale (B#10) |
| `plugins/mccp/scripts/lib/hook-caps.js:263` | `(now - lease.mtimeMs) < LEASE_LIVE_MS` else crash-flag | idle-but-alive 세션이 false "crashed" alert (B#10 발화 지점) |
| `CLAUDE.md:185` | "…frontmatter 스키마, **atomic lock**, …" | 실제는 advisory(fail-soft ~1s 후 unlocked 진행 + WARNING) (B#16 doc drift) |
| `plugins/mccp/scripts/state/loop-counter.js:108-118` | `openSync→writeSync→closeSync` (try/finally 부재) | `writeSync` throw 시 fd 누수 (B#17) |
| `plugins/mccp/scripts/state/state-writer.js:491-501` | 동일 `tryAcquire` 패턴 | fd 누수 (B#17) |

## 설계 결정

### D1 — Degraded marker는 hook-trace 독립 (B#4, marker > lease)
hook-trace 모듈이 로드 실패해도 marker는 반드시 남긴다. `writeDegradedEndMarker(repoRoot, sessionId)`를 `session-end-trace.js`에 신설 — hook-trace에 의존하지 않고 `fs`로 `.claude/state/hook-trace/<sessionId>/.end`에 ISO를 직접 write. **경로 안전**: hook-trace의 `assertPathToken`을 우회하므로 자체적으로 `sessionId`를 `/^[A-Za-z0-9_.\-]+$/` 검증 + `.`/`..` 거부(hook-trace.js:62,75-83 미러). 전체 try/catch로 감싸 실패해도 throw 안 함(fail-open).

### D2 — Resilient wrapper로 양 경로 통합 + DI 테스트 가능 (B#4)
`markSessionEndResilient(repoRoot, sessionId, ht)`를 export — `ht.markSessionEnd`를 시도하고, `ht` null이거나 throw면 `writeDegradedEndMarker`로 폴백. `main()`/`runSync()` 양쪽이 이걸 호출. `ht`를 인자로 받으므로 테스트가 `ht=null`/throwing-ht를 주입해 degraded 경로를 결정적으로 검증(monkeypatch 불요).

### D3 — fail-loud-open의 locus는 session-end, generic runner는 fail-open 보존 (B#5)
`run-with-flags.js`의 `exit(0)`는 **의도된 fail-open** — 이건 모든 hook(PreToolUse 포함, exit 비0이 tool을 block할 수 있음)을 실행하는 generic runner다. 여기서 blanket `exit(1)`은 다른 hook의 fail-open 계약을 깬다. 따라서 B#5의 표면화는 session-end locus에서 달성: (a) `session-end-marker.js` catch가 degraded marker를 시도 + loud stderr, (b) degraded 경로 자체가 loud stderr(관측 가능). **marker의 존재/부재가 신호** — 존재=정상 종료, 부재=진짜 crash. run-with-flags는 손대지 않고 이 근거를 문서화(Codex adversarial 검토 대상).

### D4 — Idle lease heartbeat는 Stop hook per-turn (B#10)
lease의 `pid`는 SessionStart hook **서브프로세스** PID(즉시 종료)라 PID-liveness로 idle-alive 판별 불가 → mtime heartbeat만이 신호. `renewLease`는 tool write(`recordWrite`)에서만 호출되므로 tool-less 대화 세션은 heartbeat 없음. **fix: `session-end.js`(Stop 이벤트에 per-turn 등록, "Persist session state after each response") main()에 best-effort `renewLease(repoRoot, sid)` 추가.** 이미 per-turn 발화 + session-ledger heartbeat 선례(session-end.js:298-319, loud fail-open)가 있어 자연스러운 locus. `renewLease`는 refresh-only(부재 시 no-op)라 SessionStart에서 생성된 lease만 갱신 → 잘못된 lease 생성 없음.

**Codex R1 F1 흡수 — lease root/id는 Stop event payload 우선**: SessionStart는 `event.cwd`·`event.session_id`로 lease를 획득한다(`session-start-trace-injector.js:30-31,44`). Stop payload도 `cwd`·`session_id`를 실어 보내므로, `process.cwd()`/`resolveSessionId()`만 쓰면 hook launch cwd 불일치·multi-worktree·`CLAUDE_SESSION_ID` 부재 시 renewLease가 다른(또는 없는) lease를 refresh-only no-op으로 건드려 idle 세션이 여전히 stale → false crash. 따라서 `session-end.js`가 이미 파싱하는 stdin JSON(`input`, line 186-194)에서 `input.cwd`·`input.session_id`를 함께 캡처해 `renewLease(input.cwd || process.cwd(), input.session_id || resolveSessionId())`로 SessionStart와 **동일 root/id** 사용.

### D5 — Degraded marker는 lease도 release (Codex R1 F2 흡수, B#4)
D1의 "marker > lease"는 marker 존재로 crash-alert를 억제하지만, degraded 경로는 hook-trace 로드 실패라 `releaseLease`를 못 부른다. `<sid>.lease`가 잔존하면 `evictLRU`가 그 세션을 최대 24h(`LEASE_STALE_MS`) active로 보고 skip → ended-but-unevictable trace 디렉토리가 누적돼 global cap(100MB)을 무력화한다. 따라서 `writeDegradedEndMarker`는 marker write **직후** 같은 sessionId 검증으로 `.claude/state/hook-trace/<sid>.lease`를 best-effort `fs.unlinkSync`(ENOENT 무시)한다 — marker와 lease-release를 hook-trace 독립적으로 함께 수행.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 경로 토큰 검증 | `plugins/mccp/scripts/lib/hook-trace.js:62,75-83` | `PATH_TOKEN_RE` + `.`/`..` 거부 (degraded marker 자체 검증에 미러) |
| marker 경로 | `plugins/mccp/scripts/lib/hook-trace.js:351-356` `markSessionEnd` | `.claude/state/hook-trace/<sid>/.end` = ISO |
| loud fail-open | `plugins/mccp/scripts/hooks/session-end.js:298-319` (ledger heartbeat) | try/catch + `stderr WARNING … (allow)` — never throw |
| lock fd 안전 | (신규) | `openSync` 분리 + write/close를 try/finally |
| 테스트 | `plugins/mccp/scripts/hooks/tests/session-end-trace.test.js` | node --test, `withRepo(mkdtemp)`, `ht.hasEndMarker` 검증 |
| 테스트(lease) | `plugins/mccp/scripts/lib/tests/hook-caps.test.js` | scanCrashAlerts + lease mtime 기반 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/session-end-trace.js` | UPDATE | `writeDegradedEndMarker` + `markSessionEndResilient` 신설·export, main/runSync가 폴백 사용 + degraded loud stderr (B#4) |
| `plugins/mccp/scripts/hooks/session-end-marker.js` | UPDATE | 중첩 catch에서 degraded marker 시도 + loud stderr (B#5) |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | main()에 best-effort `renewLease(cwd, sid)` idle heartbeat (B#10) |
| `plugins/mccp/scripts/state/loop-counter.js` | UPDATE | `tryAcquire` fd 누수 → open 분리 + write/close try/finally (B#17) |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `tryAcquire` 동일 fd 누수 fix (B#17) |
| `CLAUDE.md` | UPDATE | §3.2 line 185 "atomic lock" → "advisory lock (fail-soft ~1s, WARNING; 진정한 mutual-exclusion 아님)" (B#16) |
| `plugins/mccp/scripts/hooks/tests/session-end-trace.test.js` | UPDATE | degraded marker 회귀: ht=null / throwing-ht / `..` sessionId 거부 (B#4) |
| `plugins/mccp/scripts/state/tests/loop-counter.test.js` | UPDATE/CREATE | `tryAcquire` happy + stale reclaim + write-throw 시 재획득 가능(fd 미누수 간접) (B#17) |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | `withStateLock` tryAcquire 동일 회귀 (B#17) |
| `plugins/mccp/scripts/lib/tests/hook-caps.test.js` | UPDATE | renewLease된 세션은 scanCrashAlerts에서 skip(10분 내), stale은 flag (B#10) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.20.4 → 1.20.5 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `v1.20.4` → `v1.20.5` (line 1417, §3.7) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `v1.20.4` → `v1.20.5` (line 154, §3.7) |
| `CHANGELOG.md` | UPDATE | 1.20.5 row |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATE | P2 row status in-progress + Plan cell 경로 (PRD milestone 표) |

**run-with-flags.js는 미변경** — D3 근거(generic fail-open 계약 보존). Files에 포함하지 않음.

## Tasks

### Task 1: writeDegradedEndMarker + markSessionEndResilient (B#4 + Codex F2)
- **Action**: `session-end-trace.js`에 (a) `writeDegradedEndMarker(repoRoot, sessionId)` — sessionId path-token 자체 검증 후 `.claude/state/hook-trace/<sid>/.end`에 `fs.mkdirSync(recursive)` + `fs.writeFileSync(ISO)`, **그 직후 같은 검증으로 `.claude/state/hook-trace/<sid>.lease`를 best-effort `fs.unlinkSync`(ENOENT/기타 오류 무시)** — degraded도 lease-release해 evictLRU가 24h stuck 안 하게(D5/Codex F2). 전체 try/catch로 bool 반환; (b) `markSessionEndResilient(repoRoot, sessionId, ht)` — ht 있으면 `ht.markSessionEnd` 시도, null/throw면 degraded 폴백 + loud stderr(`[mccp:session-end-trace] degraded end marker (hook-trace unavailable) for <sid>`). `main()`(56줄)·`runSync()`(100줄)이 `if(!ht)` 조기 return 전에 resilient 경로 사용. 둘 다 export.
- **Mirror**: hook-trace.js:62/75-83 path 검증, 351-356 marker 경로, 320-324 releaseLease(경로 형태).
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/session-end-trace.test.js`

### Task 2: session-end-marker.js 중첩 catch 표면화 (B#5)
- **Action**: 27-35 catch 블록에서 `require('./session-end-trace').writeDegradedEndMarker(repoRoot, sid)`를 best-effort 시도(event에서 sid/cwd 파생) + stderr를 `[SessionEnd] hook-trace L5 failed — wrote degraded marker: <err>`로 loud화. run-with-flags는 미변경(D3).
- **Mirror**: session-end.js loud fail-open.
- **Validate**: session-end-trace.test.js에 marker.run() 총체실패 시 marker 존재 케이스 추가 or 수동 trace

### Task 3: idle lease heartbeat (B#10 + Codex F1)
- **Action**: `session-end.js` main()의 stdin JSON 파싱(186-194)에서 `stopCwd = input.cwd`·`stopSid = input.session_id`를 outer-scoped 캡처. ledger heartbeat 블록(298-319) 인근에 `try { require('../lib/hook-trace').renewLease(stopCwd || process.cwd(), stopSid || resolveSessionId()) } catch(e){ stderr WARNING (allow) }` 추가 — **SessionStart의 `event.cwd`/`event.session_id`와 동일 root/id**(Codex F1). refresh-only라 lease 부재 시 no-op.
- **Mirror**: session-end.js:298-319 loud fail-open; session-start-trace-injector.js:30-31,44 (event.cwd/session_id로 acquireLease).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/hook-caps.test.js` (renew→scanCrashAlerts skip)

### Task 4: loop-counter fd 누수 (B#17)
- **Action**: `tryAcquire`를 open(EEXIST→false 분리) + `try { writeSync } finally { closeSync }`로 재구성. EEXIST catch는 finally 밖(fd 미생성).
- **Validate**: `node --test plugins/mccp/scripts/state/tests/loop-counter.test.js`

### Task 5: state-writer fd 누수 (B#17)
- **Action**: `state-writer.js:491-501` `tryAcquire` 동일 재구성.
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js`

### Task 6: 회귀 테스트 (B#4/B#10/B#17 + Codex F1/F2)
- **Action**: (a) session-end-trace.test.js — DI로 `markSessionEndResilient(root, sid, null)` → marker 존재; throwing-ht → 폴백; `writeDegradedEndMarker(root, '..')` → no write·no throw; **(F2) `acquireLease` 후 `writeDegradedEndMarker(root, sid)` → `.end` 존재 AND `<sid>.lease` 제거됨**(evictLRU 대상 복귀). (b) hook-caps.test.js — lease renew 후 `now - mtime < 10분` → scanCrashAlerts skip. (c) loop-counter/state-writer — writeSync mock throw 후에도 lock 파일 재획득 가능(fd 고갈 없음 간접 증명) + happy/stale. **(F1)** — lease를 `rootA`로 acquire 후 `renewLease(rootA, sid)`가 refresh하고, `renewLease(rootB, sid)`(다른 root)는 no-op(null 반환)임을 증명 → session-end.js가 event.cwd를 써야 함을 회귀로 고정.
- **Validate**: `node --test` 위 4개 파일 green

### Task 7: 문서 정정 (B#16)
- **Action**: `CLAUDE.md:185` "atomic lock" → "advisory lock (fail-soft: ~1s 후 unlocked 진행 + loud WARNING; 진정한 mutual-exclusion 아님)". §3.6과 상충 없는지 확인(§3.6은 pr-phase/quarantine lock 별개).
- **Validate**: grep 정정 확인

### Task 8: version bump + footer + CHANGELOG (§3.7)
- **Action**: plugin.json 1.20.5, html.js:1417 + markdown.js:154 footer 동기, CHANGELOG 1.20.5 row, PRD P2 row 갱신.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js` (footer 관련 green)

## Validation
```bash
node --test plugins/mccp/scripts/hooks/tests/session-end-trace.test.js
node --test plugins/mccp/scripts/lib/tests/hook-caps.test.js
node --test plugins/mccp/scripts/state/tests/loop-counter.test.js
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
# 전체 스모크
node --test plugins/mccp/scripts/hooks/tests/ plugins/mccp/scripts/state/tests/ plugins/mccp/scripts/lib/tests/
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| degraded marker 경로가 sessionId 미검증 시 path traversal | Low | 자체 PATH_TOKEN_RE + `.`/`..` 거부(hook-trace 미러). 테스트로 `..` 거부 증명 |
| run-with-flags 미변경이 B#5 under-delivery로 판정 | Medium | D3 근거 명시(generic fail-open 계약). marker 보장이 실제 관측 신호. Codex 검토 |
| renewLease per-turn이 진짜 crash를 마스킹 | Low | Stop hook은 살아있는 세션에서만 발화 — crash면 애초에 안 돎. marker/lease 이중신호 유지 |
| fd try/finally 재구성이 EEXIST(락 경쟁) 정상 경로 회귀 | Medium | open을 finally 밖에 분리, EEXIST→false 유지. happy+stale 테스트로 증명 |
| footer version drift(§3.7) | Low | Task 8이 2곳 + plugin.json 동기 체크리스트 |

## Acceptance
- [ ] hook-trace 로드 실패에도 `.end` marker 작성됨 (degraded 회귀 테스트 green)
- [ ] degraded 경로가 loud stderr로 관측됨 (debug-only 아님)
- [ ] `..`/불법 sessionId가 degraded write에서 거부됨 (no write, no throw)
- [ ] idle 대화 세션 lease가 per-turn renew → scanCrashAlerts false-flag 안 함
- [ ] `tryAcquire`(loop-counter/state-writer)가 writeSync throw에도 fd 미누수 (재획득 가능)
- [ ] CLAUDE.md §3.2 "atomic" → "advisory" 정정
- [ ] plugin.json 1.20.5 + footer 2곳 + CHANGELOG 동기
- [ ] 전체 관련 테스트 green
- [ ] run-with-flags fail-open 보존 근거(D3)가 plan/PR body에 문서화
- [ ] (Codex F1) Stop heartbeat가 event.cwd/session_id 우선 사용 — 다른 root의 lease는 no-op 회귀로 고정
- [ ] (Codex F2) degraded marker가 `<sid>.lease`도 release → evictLRU 24h stuck 없음 (회귀 green)

## External Research Provenance

- Source PRD: .claude/prds/audit-remediation-followup.prd.md
- References section sha256: 0eecc0ea19cbb247ddb9b217f324ad3c5a8e7057076f94c97c2366508c21c861
- Stamped at: 2026-07-05T17:05:42.734Z
- Anchor: plan body는 plan-codex receipt의 plan_hash로 hash-anchor됨. PRD ## References 변조 시 다음 /mccp:plan validate에서 mismatch.

## Design Critique

- 검출: `impeccable-detect` SIGNAL=1 (SKILL_AVAIL=1) — Files to Change의 `renderer/html.js`·`renderer/markdown.js` 경로에 heuristic hit.
- 실제 변경: footer **버전 문자열** `v1.20.4 → v1.20.5` 동기(§3.7)뿐 — rendered-surface(layout/hierarchy/color/markdown marker) delta 없음. control-plane/version-sync 성격.
- 4 Output Constraints: N/A (신규 design surface 미도입).
- verdict: **CONVERGED** (rounds 1) — critique-actionable 항목 없음.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2; classification=ok, blocking=false)
- 라운드 수: 1 (R1 — ACCEPT_NOW 2건 모두 plan 흡수로 해소 → R2 불요, cap=1)
- 합치 결론: needs-attention → R1에서 HIGH 1 + MEDIUM 1을 plan에 흡수(D4 재정의 + D5 신설 + Task 1/3/6 갱신 + Acceptance 2건 추가). 흡수 후 unresolved ACCEPT_NOW HIGH/CRITICAL 없음.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Stop heartbeat가 `process.cwd()`/`resolveSessionId()`로 wrong/absent lease refresh (Task 3) | HIGH | ACCEPT_NOW | SessionStart는 `event.cwd`/`event.session_id`로 acquire — 불일치 시 renewLease no-op → idle 여전히 false-crash. **D4/Task 3** event payload 우선으로 흡수 + 회귀. |
  | F2 degraded marker가 `<sid>.lease` release 못 해 evictLRU 24h stuck (D1) | MEDIUM | ACCEPT_NOW | marker>lease가 crash-alert는 억제하나 lease 잔존→ended-but-unevictable 누적으로 global cap 무력화. **D5/Task 1** degraded 경로가 lease도 unlink로 흡수 + 회귀. |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음 — secret/data-loss/auth-bypass/irreversible 무관)
- Codex session 참조: threadId `019f3340-8ca4-7a93-9872-34f83c2f1918`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (D1-D5, Codex R1 F1/F2 absorbed). No new implement-time decisions detected — implementation is a faithful execution of the pre-committed plan (files ⊆ Files to Change). Cross-gate dedupe applied. codex_verdict is NOT stamped as converged, so PR-Codex will review the actual produced diff (dual-review preserved).
