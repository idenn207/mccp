# Plan: v1.4.0 Multi-Session — M3 Friction Zero

**Source PRD**: `.claude/prds/v1-4-0-multi-session-first-class.prd.md`
**Selected Milestone**: M3 — friction 0 (`2~5 worktree 병렬 cycle을 reconciliation 질문 없이 완주`, **2026-06-20 promoted to active cycle**)
**Complexity**: Small-Medium

## Summary

M1(PR #43, c071a54) + M2(PR #46, 33600ac) ship 후, PRD M3 metric("한 cycle 내 2~5 worktree 병렬 작업의 reconciliation friction 0회")은 **두 가지 잔여 gap** 때문에 아직 0이 아니다.

1. **STATUS.md "Active Sessions" 섹션이 self를 식별 못 함** — `active-sessions.js:9-10` 주석이 "renderer does not know which ledger is 'self'"라고 명시한 그대로. derive `state.js#collectActiveSessionLedgers`가 `session_id` field는 surface하지만 *현재 worktree의 self* 식별 없음 → 사용자가 STATUS.md를 봐도 "어느 행이 이 worktree인지" 즉시 안 보임 → reconciliation 질문 trigger.
2. **Reconciliation friction을 측정할 primitive 부재** — M3 metric은 "정성 grep + Primary 운영자 정성 평가"인데 정성 평가만으로는 ship 시점에 "0회"라고 confidence 가지기 어려움. SessionStart hook이 "Other active mccp sessions" banner를 inject할 때 그 사실을 append-only sidecar(`.claude/state/m3-friction-events.jsonl`)에 1줄 record하면 cycle 종료 시 banner 발화 횟수 vs reconciliation 질문 횟수를 정량 비교 가능.

부가로 stale backlog 1건 정리:

3. **M2 heartbeat backlog row가 stale** — `.claude/plans/codex-findings-backlog.md` 2번째 row(2026-06-19, MEDIUM, F4 heartbeat-based active reclaim)는 M2 PR #46이 이미 ship한 host-aware tri-state reclaim으로 absorb 완료. M3가 같은 cycle의 closure 일환으로 row를 "ABSORBED in v1.4.0-m2 (PR #46)"로 마킹.

이 3개 axis를 한 PR 단위로 묶고 2 worktree 병렬 dogfood로 PRD M3 metric을 검증한다. STATE.md / session-ledger schema / envelope schema는 **건드리지 않는다** — M1 F2 invariant(`docs/v1.4.0-multi-session/state-md-narrowing.md`) + M2 schema v2 freeze 모두 유지. derive surface 1 field(`self_session_id`) 추가는 v1.3.0 schema-surface.md의 additive-only invariant를 따른다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Renderer section graceful hide | `plugins/mccp/scripts/lib/renderer/sections/active-sessions.js:39` (`if (ledgers.length === 0) return null`) | M3 self 식별이 빠진 경우(env unset)에는 self 표시 없이 기존 모든 row render — graceful degrade. M2 ship 동작 회귀 0. |
| Derive source fail-open | `plugins/mccp/scripts/derive/sources/state.js:25-46` (`collectActiveSessionLedgers` try/catch + `degraded` flag) | `self_session_id` resolve 실패(env unset / sanitize fail)는 null 반환 + degraded 미설정(부재가 정상 경로). |
| Session ID resolve | `plugins/mccp/scripts/lib/observer-sessions.js:127-129` (`resolveSessionId`) | derive consumer도 같은 helper로 self ID resolve — sanitize 일관. |
| Append-only sidecar | `plugins/mccp/scripts/hooks/session-start.js`의 hook-trace ledger 패턴(`.claude/state/hook-trace/<session_id>/*.jsonl`) | M3 friction-events sidecar는 `<repo>/.claude/state/m3-friction-events.jsonl` 단일 파일 + `{ts, event, session_id, worktree_branch}` JSON line append. `fs.appendFileSync` 1 syscall — race 시에도 단일 line atomicity는 POSIX/Win32 모두 < PIPE_BUF 보장. M3 cycle 종료 후 수동 회수. |
| Loud fail-open in hooks | CLAUDE.md §3.4 + `session-start.js`의 try/catch + stderr WARN + ALLOW | friction sidecar write 실패는 stderr WARN + 진행. hook 절대 throw 안 함. |
| Backlog absorption marking | `.claude/plans/codex-findings-backlog.md` row 패턴(`| Date | Severity | Source plan | Finding |`) | absorb 표시는 row를 삭제하지 않고 Finding 칼럼 끝에 `**ABSORBED in v1.4.0-m2 (PR #46)** — host-aware tri-state reclaim shipped via M2 Task 3` 1줄 append. audit trail 보존. |
| Plan-doc cross-link | `docs/v1.4.0-multi-session/state-md-narrowing.md` + `session-ledger-schema.md` | M3 measurement doc도 같은 디렉토리 + 같은 톤. `docs/v1.4.0-multi-session/m3-friction-metric.md` 신설. |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` (M2 ship) + `plugins/mccp/scripts/derive/tests/state-source.test.js` | M3 회귀 추가는 같은 framework(`node --test`) + 같은 디렉토리. self-marker render 3 case + derive surface 2 case. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/sources/state.js` | UPDATE | `collectActiveSessionLedgers`가 env → cwd-match → null fallback chain으로 self resolve. item에 2 field 추가: `self_session_id`(string or null), `self_resolution`(`'resolved' \| 'resolved-by-cwd' \| 'env-missing' \| 'unresolved'` 4 enum). 항상 emit — null fallback 금지(F3 absorption). 기존 `active_session_ledgers` array 변경 없음 — additive-only. |
| `plugins/mccp/scripts/derive/tests/state-source.test.js` | UPDATE | self resolution chain 5 case(env resolved, cwd-resolved, env-missing, unresolved invalid, ledger 0건 + env resolved). 기존 회귀 0. |
| `plugins/mccp/scripts/lib/renderer/sections/active-sessions.js` | UPDATE | `self_session_id`가 set일 때 매칭 row의 첫 칼럼을 `**this worktree** \`<id>\``로, 그 외는 그대로. graceful degrade — self 식별 불가 시 M2 동작 그대로. escapeHtml 회귀 0. |
| `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` | UPDATE | self-marker case 3건(self 있음 + other 1건, self만 있음, self_session_id=null) + 기존 회귀 0. |
| `plugins/mccp/scripts/lib/friction-telemetry.js` | CREATE | 순수 append-only sidecar API. `recordBannerInjected({sessionId, projectBranch})` 함수 단 1개. `<repo>/.claude/state/m3-friction-events.jsonl`에 JSON line 1줄 append. fail-open(stderr WARN). **in-band cap 없음(F1 absorption)** — concurrent rewrite race로 인한 telemetry loss 차단. retention은 offline cleanup으로 deferred. `.git`이 file/directory 양쪽 모두 인식해 worktree에서 정상 작동. |
| `plugins/mccp/scripts/lib/tests/friction-telemetry.test.js` | CREATE | 6 case — round-trip append, fail-open(invalid path), concurrent 2-process append regression(F1 absorption — loss 0건), Windows newline 호환, EACCES throw 시뮬레이션, worktree `.git` file detection. |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | §3 derive source/state.js 표에 2 field 추가(`self_session_id`, `self_resolution` 4 enum). M3 contracted surface로 등록 + additive-only invariant 명시. |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | `summarizeOtherActiveLedgers`가 실제로 1+ other를 render한 경우(banner inject된 경우)에만 `friction-telemetry.recordBannerInjected` 호출 — loud fail-open. M2 ship 로직 변경 없음. |
| `.gitignore` | UPDATE | `.claude/state/m3-friction-events.jsonl` 추가. measurement는 worktree-local. PR squash가 더럽히지 않도록. |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 2번째 row(2026-06-19, MEDIUM, F4 heartbeat) Finding 칼럼에 `**ABSORBED in v1.4.0-m2 (PR #46)** — host-aware tri-state reclaim shipped` 1줄 append. row 자체는 보존(audit). |
| `docs/v1.4.0-multi-session/m3-friction-metric.md` | CREATE | M3 metric 정의 + sidecar format + dogfood protocol(2 worktree 병렬, first 5 turns reconciliation count). PRD §Success Metrics M3 정성 평가 보강. |
| `docs/v1.4.0-multi-session/state-md-narrowing.md` | UPDATE (선택) | "Discovery surface"가 self/other 구분까지 갖춤을 1줄 추가. 빈도 낮음. |
| `CHANGELOG.md` | UPDATE | `[1.8.0]` entry — v1.4.0-m3 Multi-Session Friction Zero 요약. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` `1.7.0` → `1.8.0` minor bump(CLAUDE.md §3.7 milestone-ship 규칙). |
| `.claude/state/STATE.md` | NO-OP | 본 plan은 STATE.md frontmatter 변경 금지(M1 F2 invariant). body roll은 별도 PR(post-merge housekeeping). |

## Tasks

### Task 1: derive `state.js`에 contracted `self_session_id` + `self_resolution` enum (Codex R1 F3 absorption)

- **Action**: `plugins/mccp/scripts/derive/sources/state.js#collectActiveSessionLedgers`가 self 식별을 **deterministic + audited fallback chain**으로 resolve. 처음 plan은 `process.env.CLAUDE_SESSION_ID` 한 source만 사용 + unset 시 null fallback이었으나, Codex F3가 정확히 지적: env unset + ledger present + degraded 미설정이 silent ambiguity를 만들어 consumer가 *"old surface / missing env / failed resolution"* 을 구분 못 함. M3가 해소하려는 friction source 자체를 silent fallback로 보존하는 모순. 해소:
  - **resolution chain (순서대로 시도)**:
    1. `process.env.CLAUDE_SESSION_ID` sanitize via `observer-sessions.resolveSessionId` — `resolved` enum
    2. ledger 중 `cwd === process.cwd()` 또는 `path.resolve(cwd) === path.resolve(process.cwd())` 매칭 1건 → 그 session_id를 self로 — `resolved-by-cwd` enum (cwd 기반 deterministic fallback — Codex F3 recommendation: "deterministic from current cwd/project plus ledger data")
    3. 양쪽 모두 실패 → null + `env-missing` 또는 `unresolved` enum
  - **2 surface field**(둘 다 conditional optional이 아니라 **항상** emit — Codex F3 contract):
    - `self_session_id`: string or null
    - `self_resolution`: `'resolved' | 'resolved-by-cwd' | 'env-missing' | 'unresolved'` 4 enum. **항상 set** — null fallback 금지. consumer가 ambiguity 0건 구분 가능.
  - 둘 다 `derive surface schema-surface.md §3`에 1줄 documented(M3가 같이 갱신). additive-only는 유지(기존 field 변경 0).
- **Mirror**: `observer-sessions.js:127-129` (resolveSessionId env) + M2 session-ledger.js#listLedgers의 cwd-aware filter 패턴 + state.js:25-46 try/catch + v1.3.0 schema-surface.md additive-only.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/state-source.test.js` — (a) `CLAUDE_SESSION_ID` env 설정 시 `self_session_id === sanitize(env)` + `self_resolution === 'resolved'`, (b) env unset + cwd 매칭 ledger 1건 → `self_session_id === ledger.session_id` + `self_resolution === 'resolved-by-cwd'`, (c) env unset + cwd 매칭 0건 → `null` + `self_resolution === 'env-missing'`, (d) env set + invalid → `null` + `self_resolution === 'unresolved'`, (e) ledger 0건 + env set → `self_session_id === sanitize(env)` + resolution `'resolved'`. 기존 case 회귀 0.

### Task 2: renderer `active-sessions.js`에 self/other 시각 구분 추가

- **Action**: `renderActiveSessions`가 `model.sources.state.item.self_session_id`를 읽어 매칭 row를 시각 구분. 매칭 기준: ledger의 `session_id`가 `self_session_id`와 정확히 같으면 self row. **md format**: 첫 칼럼을 `**this worktree** \`<8c id>\``로 (mdRows에서 `'**this worktree** \`' + shortId + '\`'`), html에서 `<td>` 안에 `<strong>this worktree</strong> <code>...</code>` + 부모 `<tr class="self">`. escapeHtml + escapeAttr 유지. `self_session_id`가 null이거나 매칭 0건이면 M2 ship 행동 그대로(=null fallback). graceful degrade.
- **Mirror**: `active-sessions.js:39` graceful hide pattern + M3 v1.3.0-m3 renderer의 escapeHtml/escapeAttr 회귀 0.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` — (a) self_session_id=null + ledgers 2건 → 두 row 모두 일반(M2 회귀), (b) self_session_id set + matching ledger 1건 → 그 row만 self-marker, (c) self_session_id set + 매칭 0건(stale env) → 모든 row 일반 + 별도 banner 없음(silent degrade). 기존 회귀 0.

### Task 3: `friction-telemetry.js` append-only sidecar primitive (Codex R1 F1 absorption — drop in-band cap)

- **Action**: `plugins/mccp/scripts/lib/friction-telemetry.js` 신설. Public API 1개:
  - `recordBannerInjected({sessionId, projectBranch, now?})` → `void`. record JSON line `{ts: nowIso(), event:'banner-injected', session_id, project_branch}` to `<repo>/.claude/state/m3-friction-events.jsonl`. `fs.appendFileSync(file, line, {flag:'a'})` — POSIX/Win32 모두 single write < PIPE_BUF(4KB)는 atomic. line 형식은 minified JSON + `\n` 종료(JSONL 표준).
  - **순수 append-only, in-band cap 없음 (Codex R1 F1 absorption)**: 처음 plan은 25-line rolling cap을 in-band(append 직후 read-all → slice → tmp+rename)으로 적용했으나, Codex F1이 정확히 지적: 두 SessionStart process가 동시에 트리거되면 process X가 stale snapshot을 read → process Y가 새 line append → process X가 rename으로 Y의 append를 덮어쓰기 → **telemetry event loss**. M3 metric이 정확히 그 event count에 의존하므로 silent data loss invariant 위반. 해소: cap 자체를 **write path에서 제거**. retention은 offline cleanup으로 deferred — runaway 우려는 SessionStart 단발 호출 frequency × M3 dogfood cycle 길이(<1d) × per-cycle file size estimate(< 5KB)로 실증적으로 작음. 장기 retention은 본 cycle 후속 v1.5.x backlog axis(`.claude/plans/codex-findings-backlog.md`)로 이월.
  - **resolveLogPath()**: derive engine처럼 `process.cwd()` 기반 repo root 탐색. `.git` directory 또는 file(worktree) 양쪽 모두 인식 (CLAUDE.md memory의 known issue — pr.md `.git/` hardcode 결함 회피). 부재 시 fail-open(`null` 반환 + caller noop).
  - All failures: stderr WARN(`[mccp:friction-telemetry] WARN: ... (allow)`) + 함수 noop. NEVER throw.
- **Mirror**: hook-trace ledger의 append-only JSONL 패턴 + CLAUDE.md §3.4 loud fail-open. M2 active-sessions.js의 graceful degrade tone.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/friction-telemetry.test.js` — (a) round-trip append + read all parse OK, (b) invalid repoRoot → noop + stderr WARN(test에서 capture), (c) **concurrent append regression (F1 absorption)** — 2 processes(child_process.fork)가 동시에 record 호출 시 결과 line count == 2건(loss 0), (d) Windows CRLF/LF mix line read robust, (e) appendFile EACCES throw 시뮬레이션 → noop, (f) **worktree `.git` file detection** — `.git`이 file일 때도 resolveLogPath가 repo root 정상 인식. 기존 회귀 0.

### Task 4: SessionStart hook에 banner-inject signal wiring

- **Action**: `plugins/mccp/scripts/hooks/session-start.js`의 `summarizeOtherActiveLedgers`(M2 ship) 결과가 비어있지 않은 경우에만 `friction-telemetry.recordBannerInjected({sessionId, projectBranch: gitBranch})` 1회 호출. M2 ship된 inject 로직(`additionalContextParts.push(otherSessionSummary)`) 직후 try/catch facade. 모든 실패 stderr WARN + 진행. 정량 측정의 producer side만 — consumer(누가 read해서 정성/정량 비교하는가)는 dogfood operator(M3 Task 7).
- **Mirror**: session-start.js 기존 try/catch + loud fail-open + M2 banner inject 직후 위치(=동일 lifecycle phase에서 signal emit).
- **Validate**: M2의 `summarizeOtherActiveLedgers` test가 0 other 시 empty string 반환을 이미 검증. 본 Task는 wiring만 — 별도 unit test 없이 dogfood로 직접 검증(Task 7). 회귀 시 `summarizeOtherActiveLedgers` 호출 0건 → friction-telemetry 호출 0건이므로 sidecar 미생성.

### Task 5: stale backlog row 정리 + .gitignore

- **Action**: `.claude/plans/codex-findings-backlog.md`의 row 2(2026-06-19 MEDIUM F4 heartbeat) Finding 칼럼 끝에 ` **ABSORBED in v1.4.0-m2 (PR #46)** — host-aware tri-state reclaim shipped via M2 session-ledger.js#listLedgers.` 1줄 append. row 삭제는 안 함 — audit trail 보존. `.gitignore`에 새 1줄 `.claude/state/m3-friction-events.jsonl` 추가. measurement는 worktree-local, PR squash가 더럽히지 않도록.
- **Mirror**: 기존 backlog row 패턴 + .gitignore 컨벤션(`§52-54 .worktrees/` 인근에 batch).
- **Validate**: `grep -n "m3-friction-events.jsonl" .gitignore` 1건. `grep -n "ABSORBED in v1.4.0-m2" .claude/plans/codex-findings-backlog.md` 1건.

### Task 6: 측정 문서 + plugin.json/CHANGELOG bump

- **Action**:
  - `docs/v1.4.0-multi-session/m3-friction-metric.md` 신설 — PRD M3 metric 정의 보강. §1 sidecar schema(`{ts, event, session_id, project_branch}`), §2 cycle 종료 시 회수 절차(`cat .claude/state/m3-friction-events.jsonl | wc -l` vs transcript reconciliation grep), §3 dogfood protocol(2 worktree 병렬 + first 5 turn 정량 비교 + Primary 운영자 정성 평가).
  - `docs/v1.4.0-multi-session/state-md-narrowing.md`에 1줄 추가 — "Discovery surface는 v1.4.0-m3에서 self/other 구분까지 갖춤(STATUS.md `this worktree` 마커)."
  - `CHANGELOG.md`에 `[1.8.0]` entry 추가 (Keep-a-Changelog 표준): Added — self_session_id derive surface + STATUS.md self/other 시각 구분 + m3-friction-events.jsonl sidecar. Fixed — backlog stale row absorption tracking. v1.4.0-m3 milestone close.
  - `plugins/mccp/.claude-plugin/plugin.json` version `1.7.0` → `1.8.0`.
- **Mirror**: M1/M2 ship의 plugin.json + CHANGELOG row 패턴. CLAUDE.md §3.7 minor-bump 규칙.
- **Validate**: `node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json')).version)"` → `1.8.0`. CHANGELOG row + doc cross-link 정상.

### Task 7: Full-cycle multi-worktree dogfood — PRD M3 metric 검증 (Codex R1 F2 absorption)

처음 plan은 worktree B만 평가하는 4 criteria였으나, Codex F2가 정확히 지적: PRD M3 metric은 "*한 cycle 내* 2~5 worktree 병렬 *cycle을 완주*"인데 처음 plan은 B의 *부팅 직후 5턴*만 측정 + sidecar B-local만 + A 또는 추가 worktree 미검증. resume/merge/cleanup phase friction 미관찰. 해소: **full-cycle protocol**.

- **Action**: 2 worktree 병렬 cycle 1회(2026-06-20 M3 ship 기준 최소치 — PRD가 "2~5"라 2가 lower bound). worktree A(현재 v1.4.0-multi-session-m3) + worktree B(main 또는 다른 axis branch). 각각 Claude 세션 활성 유지.
- **Reconciliation friction taxonomy** (정성 평가 기준 — 다음 4 카테고리 어느 하나라도 발화 시 friction 1건 카운트):
  1. **Cold disambiguation**: "어떤 작업을 진행할까요?" / "지금 무엇을 하실 건가요?" / "이전에 하던 작업이 X인가요 Y인가요?"
  2. **STATE drift question**: "STATE.md와 실제 상태가 다른데 어떤 게 맞나요?" / "git log와 STATE.md 사이에 차이가 있어요"
  3. **Manual cross-worktree probe**: "다른 worktree에서 뭘 하고 있나요?" / "B는 지금 어느 PR에 작업 중인가요?" — banner가 있는데도 사용자가 manual probe해야 했다면 friction.
  4. **Resume reconciliation**: `/mccp:resume` 직후 또는 PR merge 직후 또는 fix-task 적용 직후 5턴 안에 (1)/(2)/(3) 류 질문.
- **Pass criteria** (모든 항목 동시 충족 시 acceptance):
  1. **Both worktrees banner present** — A + B 모두 SessionStart system-reminder에 "Other active mccp sessions"가 상대 row와 함께 표시.
  2. **Aggregate friction count == 0** — A 세션 + B 세션 + cycle 안 모든 후속 SessionStart 세션의 transcript에서 taxonomy 4 카테고리 합산 0회 (정성). cycle 종료 시 `cat A/.claude/state/m3-friction-events.jsonl B/.claude/state/m3-friction-events.jsonl | wc -l`로 producer-side count 보조 확보.
  3. **Self marker correctness** — A의 STATUS.md `## Active Sessions`에서 `**this worktree**` 마커가 A의 self row에만, B 쪽에서도 동일 invariant.
  4. **Phase coverage** — 측정 범위가 SessionStart 직후 5턴 + (a) cycle 안 1+ resume 발화, (b) cycle 안 1+ PR merge 또는 fix-task 적용, (c) cycle 종료 시 worktree cleanup 직전 — 세 phase 모두에서 위 taxonomy 0회.
  5. **`self_resolution=resolved` 또는 `resolved-by-cwd`** — 두 worktree 모두 `node plugins/mccp/scripts/derive/cli.js run --json | jq .state.self_resolution`가 `env-missing` 또는 `unresolved` 미반환(degraded path 아닌 happy path 확인 — Codex F3 absorption 검증).
- **Mirror**: M1/M2 dogfood 절차 + 본 plan F2 absorption — producer-side instrumentation + user-side outcome 분리.
- **Validate**: 5 criteria 모두 충족 시 acceptance. 실패 시 root cause를 fix-task로 회수 후 PR amend.

## Validation

```bash
# Unit tests (M3 직접 추가)
node --test plugins/mccp/scripts/lib/tests/friction-telemetry.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js
node --test plugins/mccp/scripts/derive/tests/state-source.test.js

# 전체 derive 회귀 (state.js 수정이 다른 source에 leak 없음 확인)
node --test plugins/mccp/scripts/derive/tests/

# 전체 renderer 회귀 (active-sessions section 수정이 다른 section에 leak 없음)
node --test plugins/mccp/scripts/lib/renderer/tests/

# E2E derive + render
node plugins/mccp/scripts/derive/cli.js run --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("self_session_id:",j.state.self_session_id,"active:",j.state.active_session_ledgers.length)'
node plugins/mccp/scripts/derive/cli.js render
# .claude/cache/STATUS.md에서 "## Active Sessions" 섹션 + this worktree 마커 확인

# plugin.json freshness
node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json')).version)"
# → 1.8.0

# Dogfood (수동, Task 7)
# 1) worktree A에 Claude 세션 활성 유지 (이 worktree)
# 2) worktree B에서 새 Claude 세션 시작 (예: main worktree)
# 3) B의 SessionStart context에 "Other active mccp sessions" block + A 세션 row 확인
# 4) B의 첫 5턴 transcript에 "어떤 작업을 진행" 질문 0회 (grep)
# 5) cat .claude/state/m3-friction-events.jsonl — banner-injected event 1줄 이상
# 6) cat .claude/cache/STATUS.md — "## Active Sessions" + **this worktree** 마커가 B의 self row에만
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `self_session_id` matching이 hybrid scope에서 dedupe 이전/이후 mismatch → self가 다른 row로 표시 | Low | `listLedgers`(M2 ship)가 이미 sessionId 기준 dedupe(M1 invariant). renderer는 dedupe 후 결과만 보므로 self/other 1:1 매칭. test case (c) silent degrade가 안전망. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `CLAUDE_SESSION_ID` env 사용자 환경에서 unset → self 식별 0건 (Codex R1 F3) | Resolved | env resolve 실패 시 cwd 매칭 ledger로 deterministic fallback. 양쪽 모두 실패 시 `self_resolution` enum이 `env-missing`/`unresolved`로 명시 — consumer가 ambiguity 0건 구분. derive contract로 schema-surface.md §3에 등록. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `m3-friction-events.jsonl` sidecar가 git status를 더럽힘 (Task 5 .gitignore 누락 시) | Low → Mitigated | Task 5에서 .gitignore 추가 + sidecar는 `.claude/state/` 안 — `.worktrees/` gitignore와 별도. 회귀 검증 시 `git status` clean 확인. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Sidecar in-band cap rewrite가 concurrent SessionStart에서 telemetry event loss (Codex R1 F1) | Resolved | in-band cap 제거 → 순수 append-only. Codex F1 recommendation 그대로 — retention은 offline cleanup으로 deferred(v1.5.x backlog axis). concurrent regression test(Task 3 case c)가 invariant 검증. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Append-only retention 미관리로 sidecar가 long-term growth | Low | M3 dogfood는 single cycle(<1d) 가정. SessionStart 호출 빈도 × 1-line(<200byte)로 24h < 5KB estimate. v1.5.x backlog axis로 offline cleanup tool 신설 — `.claude/plans/codex-findings-backlog.md` 신규 row append(Task 5 부수 작업). |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| friction-telemetry write 실패 시 SessionStart hook 전체가 fail (loud fail-open 누락) | Low → Mitigated | Task 3/4 모두 try/catch + stderr WARN + ALLOW invariant 명시. CLAUDE.md §3.4. test case (b)(e)가 검증. hook은 NEVER throw. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| renderer self-marker로 inject되는 markdown 문자열에 `**` 폭주 / escape 누락 | Low → Mitigated | escapeHtml + escapeAttr 유지. Task 2 test case 3건이 회귀 0 검증. md는 GitHub flavor 안전 — `**...**` 안에 `` `id` `` 중첩 표준 패턴. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| STATUS.md의 self 마커가 dashboard consumer를 confuse (예: B 세션이 A의 STATUS.md를 읽으면 잘못된 self 마커) | Low | STATUS.md는 generation 시점 self를 마킹 — read 시점에 다른 세션이라면 stale. derive는 generation 시점에 새로 호출되므로 cache stale은 v1.3.0-m4 trigger가 5s debounce로 회수. PR body에 명시. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| backlog row absorption marking 표기 drift (다른 PR가 같은 row를 또 absorb 표기) | Low | row를 삭제하지 않고 Finding 칼럼만 append → 다중 absorption도 history로 보존. v1.2.x cycle backlog 운영 패턴과 일관. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| plugin.json bump이 다른 cycle PR과 겹쳐 1.8.0 vs 1.7.1 충돌 | Low | 현재 활성 worktree 중 plugin.json을 touch하는 건 v1.4.0-multi-session-m3 본 plan뿐. v1.4.0-automation-m3 worktree는 doc 위주 axis. PR merge 순서에 따라 작은 conflict 가능하지만 mechanical patch. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| dogfood pass criteria producer-side bias — banner inject 측정만으로는 user-side outcome 보증 못 함 (Codex R1 F2) | Resolved | Task 7가 full-cycle protocol로 재설계: A+B 양쪽 transcript + sidecar aggregate + 4 카테고리 friction taxonomy + 3 phase coverage(SessionStart / resume·merge·fix-task / cleanup). producer-side(sidecar count) vs user-side(taxonomy zero) 명시 분리. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Worktree 안에서 `.git`이 file이라 telemetry resolveLogPath가 repo root 인식 실패 — CLAUDE.md memory의 pr.md `.git/` hardcode 결함 재현 | Medium → Mitigated | Task 3에서 `.git`이 file/directory 양쪽 모두 인식하도록 명시. Task 3 test case (f)가 worktree 환경 회귀 검증. |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance

- [ ] Task 1, 2, 3, 4, 5, 6, 7 모두 complete
- [ ] `node --test plugins/mccp/scripts/derive/tests/` 모두 green (신규 + 기존)
- [ ] `node --test plugins/mccp/scripts/lib/renderer/tests/` 모두 green (신규 + 기존)
- [ ] `node --test plugins/mccp/scripts/lib/tests/friction-telemetry.test.js` 6 case 모두 green (concurrent regression + worktree `.git` 인식 포함)
- [ ] STATE.md / session-ledger schema / envelope schema 변경 0 hunk (M1 F2 + M2 freeze invariant)
- [ ] derive surface 2 field만 additive (`self_session_id` + `self_resolution`) — v1.3.0 schema-surface.md §3에 contracted surface로 등록 + additive-only 준수
- [ ] `self_resolution` enum 4값(`resolved`/`resolved-by-cwd`/`env-missing`/`unresolved`) 모두 항상 emit — null fallback 금지(F3 absorption contract)
- [ ] friction-telemetry는 순수 append-only — in-band cap 없음 + concurrent regression test green(F1 absorption invariant)
- [ ] `plugin.json` version `1.8.0` + CHANGELOG `[1.8.0]` entry
- [ ] `.gitignore`에 `m3-friction-events.jsonl` 1줄 추가
- [ ] backlog row 2(F4 heartbeat) Finding 칼럼에 ABSORBED 마킹 + 신규 row(sidecar offline retention) append
- [ ] PRD §Delivery Milestones M3 row `complete`로 update(post-ship)
- [ ] 2-worktree full-cycle dogfood pass criteria 5건 모두 충족 — both worktrees banner, aggregate friction taxonomy count == 0, self marker 양쪽 모두 매칭, 3 phase coverage(SessionStart/resume·merge/cleanup), self_resolution=resolved 또는 resolved-by-cwd 검증(F2+F3 absorption)
- [ ] 본 plan에 Codex Adversarial Review 섹션 inject + mccp-plan-codex receipt write + read-back validate 통과

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 + v0.3.6 impeccable-scope-split — `--impeccable-available` flag emit됨)
- 라운드 수: 1 (R2 escalate 조건 미충족 — 모든 ACCEPT_NOW HIGH가 R1 body absorption으로 fully resolved)
- 합치 결론: R1 verdict `needs-attention`. 3 findings(HIGH×2 + MEDIUM×1) 전부 ACCEPT_NOW. Task 1/3/7 본문 + Files-to-Change + Risks + Acceptance 5 섹션 정합 amend로 mechanical patch fully resolved.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 | HIGH | ACCEPT_NOW | Sidecar in-band cap(read-all → slice → tmp+rename)이 concurrent SessionStart에서 다른 process의 새 append를 덮어쓸 수 있어 telemetry event loss. M3 metric이 정확히 event count에 의존하므로 silent data loss invariant 위반. Task 3에서 cap 자체 제거 + 순수 append-only로 단순화 + concurrent 2-process regression test 추가. 장기 retention은 v1.5.x backlog axis로 이월(Task 5에 신규 backlog row append). |
  | F2 | HIGH | ACCEPT_NOW | 기존 dogfood pass criteria 4건이 worktree B만 검증 + sidecar B-local + first 5 turns만 관찰. PRD M3 metric은 *full-cycle 2-5 worktree outcome*이라 user-side outcome 보증 불가. Task 7을 full-cycle protocol로 재설계: A+B 양쪽 transcript + sidecar aggregate + 4 카테고리 friction taxonomy(cold disambiguation / STATE drift / cross-worktree probe / resume reconciliation) + 3 phase coverage(SessionStart 5턴 / resume·merge·fix-task / cleanup). |
  | F3 | MEDIUM | ACCEPT_NOW | `self_session_id`가 unversioned + env unset 시 silent null fallback + degraded 미설정 → consumer가 *old surface / missing env / failed resolution* 구분 불가. M3 friction source 자체를 silent fallback로 보존하는 모순. Task 1에서 resolution chain(env → cwd-match → null) + `self_resolution` enum 4값 contracted surface 추가 + schema-surface.md §3 등록 + 5 test case. |
- Deferred to backlog: 1 (F1 부분 — sidecar offline retention tool) → `.claude/plans/codex-findings-backlog.md` 신규 row append 예정.
- Open Questions: 없음. auto-CRITICAL catalog(secret/data-loss/auth-bypass/migration/external-dest/crypto) 0건 — F1의 telemetry event loss는 user data loss와 별개(measurement artifact only) + 본 absorption에서 producer-side append-only invariant + user-side taxonomy aggregate 두 layer 모두로 보장. M3 ship scope 명확화: derive contract(F3) + sidecar primitive(F1) + full-cycle dogfood(F2) 3 axis 단일 PR.
- Codex session 참조: threadId `019ee478-e27d-7aa0-aa41-4095f27b45c2` (codex-invoke wrapper thread; durationMs=280963; classification=ok; impeccable-available flag honored — design/a11y findings 0건).

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

