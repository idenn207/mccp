# PR Review: #88 — fix(session): v1.20.5 SessionEnd marker silent-failure 복구 (audit P2)

**Reviewed**: 2026-07-07
**Author**: idenn207 (박동민)
**Branch**: v1-20-5-session-continuity → main
**Decision**: APPROVE (with comments)

> Self-review: GitHub rejects `--approve` from the PR author, so this review is published via `--comment`. The APPROVE decision is preserved here in the header.

## Summary

audit-remediation PRD의 milestone 1/5. hook 레이어의 5개 silent-failure(B#4 SessionEnd marker 누락, B#5 실패 은폐, B#10 idle 세션 false crash, B#17 fd 누수, B#16 문서 드리프트)를 fail-loud-open으로 닫는다. 변경은 정합적이고, 각 fix가 회귀 테스트로 직접 검증되며(91/91 green), path-traversal 방어는 다층으로 견고하다. **CRITICAL/HIGH 없음.** 남은 항목은 테스트 커버리지 gap과 유지보수성 nit(모두 MEDIUM 이하, non-blocking).

## Cross-Gate Dedupe

- **PR-Codex** (`mccp-pr-codex/audit-remediation-p2-session-continuity.json`): converged, round 1, `codex_verdict='converged'`, findings=[], open_questions=[]. auto-CRITICAL 없음 → Phase 2.5.4 통과. 이미 수렴한 영역은 재도전하지 않음.
- **Security-reviewer**: newly invoked (PR body에 `### Security Reviewer` 부재). path-traversal 표면 집중 리뷰 → CRITICAL/HIGH/MEDIUM 0건, defense adequate.
- **Design**: PR body `## Design Review` 재사용 — SIGNAL=1(footer 경로 heuristic)이나 실제 delta는 버전 문자열뿐(control-plane). impeccable 미invoke 정당.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

- **[Test coverage] SESSION_ID_RE ↔ PATH_TOKEN_RE 동기 drift-guard 부재** — `session-end-trace.js:26`의 `SESSION_ID_RE`는 `hook-trace.js:62`의 `PATH_TOKEN_RE`를 **주석 기반 수동 미러**로 복제한다(load-time 독립성 확보 목적, 설계상 타당). 그러나 두 정규식의 *값*이 일치해야 traversal 방어가 유효한데, 미래에 `PATH_TOKEN_RE`가 강화되어도 미러가 조용히 drift할 수 있고 이를 잡는 테스트가 없다. `require` 양쪽에서 `.source` 동일성을 assert하는 drift-guard 테스트 1건을 권장(load-time 커플링 재도입 없이 값 동기만 강제). — non-blocking, 후속 배치 후보.

- **[Test coverage] 통합 경로 미검증 2건** — (a) `session-end-marker.js:44-57` 중첩 catch의 degraded fallback(runSync throw 시)과 (b) `session-end.js:308-316` B#10 heartbeat wiring(stopCwd/stopSid → renewLease)은 단위 오라클만 검증된다(`renewLease` root-sensitivity는 hook-trace.test.js에서 커버). session-end.js는 module-level stdin 부작용이 있어 통합 테스트가 어렵다는 점은 이해하나, marker 중첩 catch fallback은 순수 함수 조합이라 테스트 가능. — non-blocking.

### LOW

- **[Maintainability] `session-end-trace.js:78` 비-ENOENT unlink 오류 조용한 swallow** — degraded lease unlink의 `catch (err) { if (err.code !== 'ENOENT') { /* best-effort */ } }`는 EPERM 등 예기치 못한 오류를 빈 블록으로 삼킨다. 파일 전체가 fail-loud-open(B#5)을 표방하는데 이 지점만 침묵한다. marker(핵심)는 이미 성공한 뒤라 loud 승격은 과하지만, `debug()` 한 줄이 파일 톤과 일관됨. — 순수 nit.

- **[Correctness] 잔여 gap: `session-end-trace.js` 자체 load 실패 시 degraded marker 미작성** — `session-end-marker.js:38-42`에서 `require('./session-end-trace')`가 throw하면(모듈 파일 자체 파손) degraded marker를 쓸 코드가 없어 marker 미작성 + loud stderr만 남는다. 단, 관측된 root cause는 `hook-trace.js`(lib) load 실패이고 그 시나리오는 정확히 fix됨(session-end-trace.js는 로드되고 loadHookTrace()가 null 반환 → degraded marker write). 이 잔여 gap은 strictly 더 희귀하고 loud하게 표면화되므로 inherent limitation. — informational, 회귀 아님.

- **[Performance] B#10 per-turn lease write** — `session-end.js`(Stop, 매 턴)가 `renewLease`로 매 응답마다 lease 파일 `fs.writeFileSync`를 1회 수행. 작은 JSON이라 무시 가능하며, false crash alert보다 명백히 나은 트레이드오프. — informational.

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (순수 JS, tsc 없음) |
| Lint | Skipped (프로젝트 lint 스크립트 미해당) |
| Tests | **Pass** — 영향 5개 파일 91/91 green |
| Build | N/A (plugin, no build step) |

**Regression note**: `g1-patch.test.js` 3건 실패(`receipt-prompt`/`receipt-skill` G1 module-load)는 **본 PR 19-file changeset에 없는 파일**(receipt-prompt.js/receipt-skill.js)을 대상으로 하며 base 1.20.4에서도 실패하는 pre-existing 결함 — 범위 밖.

## Notable Strengths

- degraded marker 경로가 hook-trace의 실제 경로와 **정확히 일치**(TRACE_DIRNAME/END_MARKER/LEASE_SUFFIX 상수 + sessionDir/leasePath 조합) — `scanCrashAlerts`의 `hasEndMarker`/lease-mtime skip 로직과 정합. fix가 no-op이 될 여지 없음.
- F1(renewLease가 Stop event cwd/sid 사용)이 multi-worktree/relaunch 시나리오의 실질 결함을 정확히 짚음. renewLease refresh-only(lazy create 없음)라 유령 lease 미생성.
- 이슈 ID(B#4/B#5/B#10/B#17/F1/F2) 주석 추적성 우수. loud fail-open(§3.4) 일관 준수.
- 버전 동기 완전(plugin.json + html.js/markdown.js footer + i18n-surface.test.js) — §3.7 drift 방지.

## Files Reviewed

| File | Change |
|---|---|
| `plugins/mccp/scripts/hooks/session-end-trace.js` | Modified — degraded marker + resilient wrapper (B#4/B#5/F2) |
| `plugins/mccp/scripts/hooks/session-end-marker.js` | Modified — 중첩 catch 표면화 (B#5) |
| `plugins/mccp/scripts/hooks/session-end.js` | Modified — idle lease heartbeat (B#10/F1) |
| `plugins/mccp/scripts/state/loop-counter.js` | Modified — fd 누수 (B#17) |
| `plugins/mccp/scripts/state/state-writer.js` | Modified — fd 누수 (B#17) |
| `plugins/mccp/scripts/hooks/tests/session-end-trace.test.js` | Added tests — degraded/traversal/F2 |
| `plugins/mccp/scripts/state/tests/{loop-counter,state-writer}.test.js` | Added tests — B#17 fd-close-on-throw |
| `plugins/mccp/scripts/lib/tests/hook-trace.test.js` | Added test — F1 renewLease root-sensitivity |
| `plugins/mccp/.claude-plugin/plugin.json`, `renderer/{html,markdown}.js`, `renderer/tests/i18n-surface.test.js` | Modified — 1.20.5 버전 동기 |
| `CLAUDE.md`, `CHANGELOG.md` | Modified — 문서 (B#16 정정 + 1.20.5 row) |
| `.claude/{prds,plans,PRPs/reports,notes}/*` | Added — PRD/plan/report/감사 아티팩트 |
