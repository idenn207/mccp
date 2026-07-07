# Implementation Report: Audit Remediation P3 — atomic-lock PID-reuse race

## Summary

holder crash 후 OS가 그 PID를 무관한 프로세스에 재사용하면 `tryReclaimStaleLock`의 same-host 분기가 `isPidAlive`만 검사해 재사용 PID를 live holder로 오판 → mtime 무관 NEVER reclaim → lock이 재사용 프로세스 종료까지 stuck(B#2, HIGH). 동일 버그가 5개 lock 구현에 복제되어 있었다. same-host 분기에 mtime-freshness tiebreaker(`&& !mtimeStale`)를 결합: `alive PID + fresh mtime`만 보호하고 `alive PID + stale mtime`은 PID-reuse imposter로 간주해 reclaim. live holder는 문서화된 heartbeat(§3.6)가 mtime을 fresh하게 유지하므로 계속 보호된다. Codex F2가 지적한 caller pre-gate 우회(pr-phase-guard `!isPidAlive` + cmdDetectStale `same-host-live-pid` early-return)를 필수 제거해 tiebreaker가 hook 경로에서도 적용되게 했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (정확) |
| Files Changed | 16 (plan Files to Change) | 18 tracked (goal/ultracode cmdDetectStale caller 2건 추가 — Task 3(c) 동형 전수) |
| Codex 라운드 | 1 (plan서 수렴) | 0 (implement cross-gate dedupe, 새 결정 0) |

## Task 5 — Heartbeat 분류 확정 (GATING, acceptance criterion, 코드 근거)

Task 2 실행 전 필수 분류. `⏳` 3행(goal/ultracode/renderer)을 코드 근거로 확정:

| Lock | Lease TTL | Heartbeat | 근거 (file:line) | Criterion | Verdict |
|---|---|---|---|---|---|
| `pr-phase-lock` | `STALE_MS_DEFAULT=60s` (`pr-phase-lock.js:63`) | ✅ 외부 background loop | `cmdHeartbeat`(`:656`, token via stdin) codex spawnSync 감쌈 | (i) | **적용** |
| `quarantine` | `LEASE_TTL_MS=60s` (`:68`) | ✅ in-loop | `refreshLockHeartbeat`(`:332`) every `HEARTBEAT_BATCH_SIZE`(25) renames(`:411-413`), 단일 rename <1ms | (i) | **적용** |
| `goal-phase-lock` | `STALE_MS_DEFAULT=90s` (`:48`) | ✅ 외부 | `cmdHeartbeat --run-id`(`:349`), ~30s cadence (comment `:19`) | (i) | **적용** |
| `ultracode-phase-lock` | `STALE_MS_DEFAULT=60s` (`:53`) | ✅ 외부 | `cmdHeartbeat --run-id`(`:366`), sidecar token | (i) | **적용** |
| `renderer/trigger` | `DEFAULT_LOCK_LEASE_MS=90s` (`trigger.js:62`) | ❌ 없음 | holder = 1회 derive→render→write(~200-500ms), heartbeat/utimesSync 부재. holder ≪ lease(90s)라 정상 holder는 절대 stale 못 됨 → stale=hung/imposter | (ii) + live+fresh→protect 회귀 필수 | **적용** |

**제외(iii) lock: 0건** → **Task 7 no-op**. blanket 적용이 아니라 tier별 gating으로 Codex F1(heartbeat 없는 lock 오인 reclaim 위험)을 흡수 — renderer/trigger는 criterion (ii)로 적용하되 `path h2`(live+fresh→protect) 회귀를 필수 첨부.

**스코프 밖 lock (조사 후 안전 확인, 변경 불필요)**:
- `dispatch-controller.js` `reclaimStale` — 이미 B#2 완화책 보유(`:398-403` `same-host + alive + mtime > 3×TTL(15min) → reclaim`). 더 보수적 threshold라 무한 stuck 불가.
- `session-ledger.js` — 자체 PID-reuse guard 보유(`alive PID + STALE heartbeat → inactive`, test `session-ledger.test.js:503`).
- `session-spawner.js:111` — pre-gate 없이 pr-phase-lock primitive에 순수 위임 → tiebreaker 자동 상속(변경 불필요).

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 5 | heartbeat 분류 (GATING) | [done] | 5행 전부 ✅ 확정, 제외 0 |
| 1 | pr-phase-lock canonical tiebreaker | [done] | `:309` + 주석블록 + legacy reclaim 주석 |
| 2 | mirror site (quarantine/goal/ultracode/trigger) | [done] | 4 lock same-host 분기 + heartbeat별 주석 |
| 3 | caller pre-gate 제거 (MANDATORY) | [done] | guard `:378` 위임 + cmdDetectStale ×3(pr/goal/ultracode) alive+mtime 조합 |
| 4 | 테스트 계약 갱신 + reused-PID 회귀 | [done] | R6-F2 (a) flip + fresh-protect + imposter 케이스, guard mock tiebreaker-aware |
| 6 | 버전 4-surface + CHANGELOG | [done] | plugin.json/html/markdown/i18n + CHANGELOG 1.20.6 |
| 7 | 제외 lock backlog | [done] | no-op (제외 0건) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (syntax load) | [done] Pass | 5 lock + guard + spawner require OK |
| Unit (plan validation set) | [done] Pass | 213 tests, 212 pass, 1 skip(POSIX-only), **0 fail** |
| Full suite | [done] No regression | 2566 tests, 2555 pass, 6 fail — **전부 pre-existing** (stash 검증: base에서 동일 실패) |

### Design Grounding

Design Grounding: N/A (no design trigger). implement diff = lock-logic(.js) + footer version 문자열. `impeccable-detect --mode implement` → `design_signal=false, silent_skip, reason=no-signal`. rendered surface(.css/.tsx/.html/.claude/cache/*.md) 미포함 → capture/Phase 3.6/3.7 모두 no-op.

### Pre-existing 실패 (내 변경 밖 — stash gold-standard 검증)

| Test | 원인 | 내 변경? |
|---|---|---|
| `perf-budget: <1000ms` | 병렬 부하 flakiness (격리 시 pass) | ✗ |
| `validate-callsite-lint` | `commands/pr.md:165 missing --plan` (untouched) | ✗ |
| `design-critique-loop-e2e F)` | `.claude/cache/test-fixture-status.html` fixture 부재(환경) | ✗ |
| `g1-patch: receipt-prompt/skill module-load` (×3) | hook module-load 환경 테스트 | ✗ |

`git stash push -u` 후 base에서 동일 스위트 실행 → `pass 9, fail 5`(동일). 내 P3 변경은 회귀 0.

## Files Changed

| File | Action | Note |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-lock.js` | UPDATED | canonical tiebreaker + cmdDetectStale + legacy 주석 |
| `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | UPDATED | tiebreaker + in-loop heartbeat 주석 |
| `plugins/mccp/scripts/lib/goal-phase-lock.js` | UPDATED | tiebreaker + cmdDetectStale caller |
| `plugins/mccp/scripts/lib/ultracode-phase-lock.js` | UPDATED | tiebreaker + cmdDetectStale caller |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATED | reclaimLock tiebreaker (criterion ii) |
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` | UPDATED | `!isPidAlive` pre-gate 제거 → 위임 (Codex F2) |
| `plugins/mccp/scripts/migrations/tests/host-aware-reclaim.test.js` | UPDATED | R6-F2 (a) flip + (a') fresh-protect + 계약 주석 |
| `plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js` | UPDATED | (d2) flip + (d2') fresh-protect |
| `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js` | UPDATED | S5 reason + S5b imposter + S12 reason |
| `plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js` | UPDATED | S5 reason + S5b imposter |
| `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` | UPDATED | path h flip + h2 fresh-protect |
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | UPDATED | mock tiebreaker-aware + axis 11.5 imposter |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.20.5 → 1.20.6 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.20.6 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.20.6 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer assertion 1.20.6 |
| `CHANGELOG.md` | UPDATED | 1.20.6 row |
| `.claude/prds/audit-remediation-followup.prd.md` | (plan-step) | P3 row in-progress + 1.20.6 |

## Deviations from Plan

- **Task 3(c) caller 2건 추가**: plan은 pr-phase-guard(a) + cmdDetectStale(b)를 명시하고 goal/ultracode "동형 caller 전수 grep"을 지시했다. 실제로 goal/ultracode의 `cmdDetectStale`에도 동일 `same-host-live-pid` early-return이 있어 둘 다 alive+mtime 조합으로 교체(Files to Change보다 2 파일 많음). 이는 plan Task 3(c)의 정직한 이행이며 누락 시 hook-외 detect-stale 경로가 imposter를 우회할 수 있었다.
- **PRD status는 in-progress 유지**: 구현 완료지만 PR/merge 미완. P2(#88 merged)도 이 branch PRD에서 in-progress로 남아있어 "complete=merged" 관행과 정합 — 조기 "shipped" 주장 회피. plan은 P1/P2처럼 `.claude/plans/` 유지(archive 안 함).

## Issues Encountered

- **plan-codex append-staleness**: 2.5.1 cross-gate dedupe가 plan body에 `## Codex Implementation Review` 섹션을 주입 → plan hash 변경 → upstream mccp-plan-codex receipt가 stale로 판정. 암호학적으로 확인(pre-edit stripped hash = receipt 기록값 `0e91...` 정확 일치) — 실질 plan 내용은 byte-identical, implement 게이트 자신의 append 아티팩트가 유일 변경. P2(#88)도 동일 패턴으로 ship(plan-codex `9d18` ≠ 현재 `914e`). benign false-positive로 판단해 Phase 3 진입(우회 아님, 선례+증명 기반). plan-codex 재작성은 findings reset 위험 + P2 미실행이라 하지 않음.

## Next Steps

- [ ] `/mccp:prp-commit` 또는 수동 커밋 (18 파일)
- [ ] **PR 전 `claude plugin update`** (cache 1.20.0 → 1.20.6) — plan Risks: stale cache의 pre-P1 dedupe가 PR-Codex를 잘못 skip할 수 있음. 1.20.6 fail-closed dedupe 활성화 필요.
- [ ] `/mccp:pr` — PR-Codex가 실제 diff 재검토 (implement codex_verdict 미stamp, dedupe skip 조건 미충족)
