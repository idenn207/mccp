# Plan: v1.4.0 Multi-Session — M2 Cross-Session Discovery

**Source PRD**: `.claude/prds/v1-4-0-multi-session-first-class.prd.md`
**Selected Milestone**: M2 — cross-session discovery (새 worktree의 SessionStart hook이 다른 활성 세션을 자동으로 표면화)
**Complexity**: Medium

## Summary

M1(PR #43, c071a54)이 session-ledger primitive(createLedger/finalizeLedger/listLedgers + scope-aware global/repo/hybrid)를 ship했지만 **소비 경로(consumption)**는 없다. SessionStart hook이 자기 ledger를 *쓰기*만 하고 *다른 세션의 ledger를 읽어 사용자/Claude에게 표면화*하지 않는다. 또한 crash-orphan 세션이 24h TTL이 만료될 때까지 false-active로 잡힌다(backlog entry: MEDIUM, 2026-06-19). M2는 이 두 axis를 닫고 PRD M2 metric("새 worktree 시작 후 첫 5턴 안에 manual reconciliation 질문 0회")을 검증 가능한 상태로 만든다.

3개 axis 일괄 처리:
1. **Discovery injection** — SessionStart hook이 `listLedgers({activeOnly:true})` 결과에서 self(`observerSessionId`)를 제외한 항목을 `additionalContext`에 banner로 push. 형식은 기존 `summarizeActiveInstincts`(session-start.js:349-400) 패턴을 그대로 mirror.
2. **Heartbeat schema v2** — ledger에 `last_seen_at` 필드 추가, SessionStart + (옵션) Stop hook이 갱신, `listLedgers({activeOnly:true})`가 host-aware tri-state(CLAUDE.md §3.6 pr-phase-lock pattern)로 정확 reclaim. v1 ledger backward-compat: read 시 `last_seen_at = last_seen_at || created_at`로 lift, write는 항상 v2.
3. **STATUS.md surface** — derive `active_session_ledgers`(이미 m1에서 surface됨)를 v1.3.0-m3 renderer가 새 "Active sessions" 섹션으로 표시. M3 dashboard가 multi-session 가시성을 갖춤.

STATE.md frontmatter는 **건드리지 않는다** — M1 F2 absorption(state-md-narrowing.md §2)이 잠근 결정. anchor/discovery는 전적으로 ledger 디렉토리 스캔.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/state/session-ledger.js:214` (`createLedger`), `:279` (`finalizeLedger`), `:354` (`listLedgers`) | M2 신설 함수는 `updateLedgerHeartbeat({sessionId, projectContext, scopeOverride?})` — 기존 verb pattern 그대로. |
| Schema validator | `session-ledger.js:53-104` (`validate`) hand-rolled, `KNOWN_KEYS` Frozen Set, `additionalProperties:false` strict invariant | v2 schema 추가 시 `KNOWN_KEYS_V2 = Object.freeze(new Set([...KNOWN_KEYS, 'last_seen_at']))`, validator는 `schema_version`으로 분기. |
| Atomic write | `session-ledger.js:202-212` (`writeLedgerAtomic`: tmp + renameSync, `withLedgerLock`: `openSync('wx')` 50 retries × 20ms + 30s stale-clear) | heartbeat update도 동일 facade(`withLedgerLock` + `writeLedgerAtomic`) 재사용 — 새 lock 코드 금지. |
| Host-aware reclaim | `CLAUDE.md §3.6` pr-phase-lock canonical schema + lease/heartbeat (same-host live PID → NEVER reclaim, different-host OR dead-PID → reclaim) | `listLedgers` active filter에 `(host === os.hostname() && processIsLive(pid)) ⇒ active` 추가, 그 외엔 `Date.now() - last_seen_at < heartbeatTtlMs`로 active 판정. |
| Hook fail-open | `session-start.js:549-575` (M1 ledger createLedger try/catch는 throw 안 함, stderr WARN + log + ALLOW) | M2 discovery injection도 동일 — `summarizeOtherActiveLedgers`가 throw하면 stderr WARN + 빈 문자열 반환, hook은 계속. CLAUDE.md §3.4 loud fail-open principle. |
| SessionStart context formatter | `session-start.js:349-400` (`summarizeActiveInstincts`: heading + bullet lines, scope label, max N) | 동일 shape — `summarizeOtherActiveLedgers(observerContext, selfSessionId)` 반환은 `'Other active sessions:\n- [branch] cwd · session_id_short · age'` 형식. self 제외. max 8. |
| Derive engine surface | `plugins/mccp/scripts/derive/sources/state.js:25-46` (`collectActiveSessionLedgers`, fail-open per-source `degraded` flag) | M2 schema bump 후에도 동일 contract 유지. derive consumer(renderer)는 `last_seen_at` 신규 field만 추가로 읽음. |
| Renderer section | `plugins/mccp/scripts/lib/renderer/*` (M3 6-section deterministic verdict + graceful hide on missing data) | "Active sessions" 섹션은 self 외 0건이면 graceful hide(섹션 자체 생략). M3 verdict chain은 건드리지 않음(별도 section). |
| Tests | `plugins/mccp/scripts/state/tests/session-ledger.test.js` (`node --test`, 9 cases for M1), `plugins/mccp/scripts/derive/tests/state-source.test.js` (197 lines) | M2 test 추가는 같은 디렉토리 같은 framework. heartbeat schema-bump backward-compat case 필수, reclaim tri-state case 3건(same-host alive, same-host dead, different-host), discovery banner formatter case. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/state/session-ledger.js` | UPDATE | (1) `SCHEMA_VERSION = 'v2'`, validator + KNOWN_KEYS에 `last_seen_at`(ISO8601 또는 null) 추가, (2) v1 read backward-compat lift, (3) `updateLedgerHeartbeat({sessionId, projectContext, scopeOverride?})` 신설, (4) `listLedgers({activeOnly:true})` filter를 host-aware tri-state로 교체(24h TTL은 fallback). |
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | UPDATE | (1) v2 schema validate case 추가, (2) v1 backward-compat lift case, (3) `updateLedgerHeartbeat` 5 case(idempotent, lock contention, scope-resolve, schema-bump in-place, missing ledger no-op), (4) `listLedgers` tri-state 3 case(same-host live PID, same-host dead PID, different-host). 기존 9 case 회귀 0. |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | (1) `summarizeOtherActiveLedgers(observerContext, observerSessionId)` 신설 helper(같은 파일 내, instinct/learned-skill 패턴 mirror), (2) `createLedger` 직후 `updateLedgerHeartbeat` 호출(자기 ledger heartbeat anchor — M1 createLedger는 한 번만 호출되므로 이후 trigger 필요), (3) `additionalContextParts.push(otherSessionSummary)` 위치는 `summarizeActiveInstincts` push 직후, (4) loud fail-open try/catch facade. |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | `finalizeLedger` 직전에 `updateLedgerHeartbeat`을 한 번 더 호출하여 ended_at이 last_seen_at보다 항상 나중이 되도록 보장(crash-vs-clean 종료 구분 가능). 1줄 + try/catch. |
| `plugins/mccp/scripts/lib/renderer/sections/active-sessions.js` | CREATE | M3 renderer에 새 섹션 추가. derive `active_session_ledgers` 0건이면 빈 문자열 반환(graceful hide). 형식: `## Active Sessions\n- [branch] cwd · session_id_short · age` 또는 `Active sessions: 1 (this worktree)` 단문. M3 6-section verdict는 건드리지 않음. |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | `active-sessions.js` import + section assembly에 추가. M3 absorption 패턴(F4 escape) 그대로. |
| `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` | CREATE | 3 case: 0건(hide), self-only(hide), self + 1 other(render). escapeHtml 자체 회귀 0. |
| `docs/v1.4.0-multi-session/session-ledger-schema.md` | UPDATE | (1) Schema v2 추가 컬럼(`last_seen_at`), (2) §6 "Deferred to M2" → "Done in M2" 또는 "Deferred to M3" 재분류, (3) §3 `updateLedgerHeartbeat` 행 추가, (4) §4 storage scope 그대로(변경 없음). |
| `docs/v1.4.0-multi-session/state-md-narrowing.md` | UPDATE (선택) | "Discovery surface" 표현 강화 — M2가 SessionStart inject로 실제 surface한다고 명시 1-2줄. 빈도 낮음. |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | v1.3.0 schema 표에 session-ledger v2 entry 한 줄 보강(또는 cross-reference). v1.3.0 freeze 원칙 유지 — receipt/envelope/STATE.md frontmatter는 그대로. |
| `CHANGELOG.md` | UPDATE | `[1.7.0]` entry 추가 — v1.4.0-m2 multi-session discovery + heartbeat schema bump 요약. Keep-a-Changelog 표준. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version`을 `1.6.0` → `1.7.0` minor bump(CLAUDE.md §3.7 milestone-ship rule). M3 derive renderer feature add. |
| `.claude/state/STATE.md` | UPDATE | post-merge에서 cycle close roll. M2 작업 진입 시점에는 건드리지 않음(작업 종료/PR 단계). 본 plan은 STATE.md *frontmatter* 변경 금지(F2 absorption invariant — body roll만 허용). |

## Tasks

### Task 1: Schema v2 — `last_seen_at` field + backward-compat lift
- **Action**: `session-ledger.js`에서 `SCHEMA_VERSION = 'v2'` 정의, validator를 schema_version 분기로 재구성(v1: 10키, v2: 11키), `KNOWN_KEYS_V2`에 `last_seen_at` 추가. `readLedger`/`listLedgers`는 v1 ledger을 발견하면 in-memory에서 `last_seen_at = created_at`으로 lift(write는 안 함 — read-only backward-compat). write path(`createLedger`, `updateLedgerHeartbeat`)는 항상 v2 emit.
- **Mirror**: `session-ledger.js:53-104` validator + `KNOWN_KEYS` Frozen Set + `additionalProperties:false` strict invariant 보존.
- **Validate**: `node --test plugins/mccp/scripts/state/tests/session-ledger.test.js` — v1 read lift 1 case + v2 round-trip 1 case + invalid-mix(v1 with last_seen_at present, v2 without) 2 case 추가. 기존 9 case 회귀 0.

### Task 2: `updateLedgerHeartbeat` 신설 + concurrency + hybrid all-or-nothing (Codex R1 F1 absorption)
- **Action**: `updateLedgerHeartbeat({sessionId, projectContext, scopeOverride?})` 추가. 동작: scope-aware path resolve → 각 path에 대해 `withLedgerLock` → read → ledger.last_seen_at = nowIso() → schema-bump if v1(lift first) → writeLedgerAtomic. 누락 ledger no-op(stderr WARN). 반환: `{ok, paths:[updated], errors:[]}` — `createLedger`와 같은 shape. **추가 — hybrid all-or-nothing invariant (Codex R1 F1 absorption)**: scope=`hybrid`일 때 `paths.length >= 2`인데 일부 path만 성공하면 `ok=false`를 반환하고 errors에 partial write 정보를 남긴다. caller(SessionStart hook)는 loud fail-open으로 stderr WARN만 emit하지만 receipt-write 형식의 marker-gated 패턴(dispatch-envelope F2 absorption과 같은 구조)으로 partial-update 상태를 audit 가능하게 한다.
- **Mirror**: `session-ledger.js:279-323` `finalizeLedger` 구조 + dispatch-envelope F2 marker-gated all-or-nothing invariant.
- **Validate**: 새 test 6 case — (a) idempotent(연속 호출 시 mtime + last_seen_at만 진보), (b) lock contention(50 retries 시뮬레이션), (c) scope=hybrid 양쪽 갱신 OK, (d) v1 ledger 발견 시 in-place schema-bump, (e) sessionId 없을 때 `{ok:false}` 반환, **(f) scope=hybrid partial fail → `ok=false` + errors에 실패 path 기록(F1 absorption)**.

### Task 3: `listLedgers` host-aware tri-state reclaim + hybrid v1/v2 reconciliation + PID-reuse guard (Codex R1 F1+F2 absorption)
- **Action**: `listLedgers({activeOnly:true})` 재작성. (1) **Hybrid dedupe 순서 변경 (Codex R1 F1 absorption)**: 같은 `session_id.json`이 global + repo 양쪽에서 발견되면 기존의 global-precedence-first 대신 **newest valid `last_seen_at` wins**(둘 다 v1 lift된 경우 `created_at` 비교, schema_version 불일치 시 v2 우선). mismatch는 `degraded=true` + errors에 path 쌍 기록(향후 user inspection). (2) **active filter — same-host AND fresh heartbeat (Codex R1 F2 absorption)**: ended_at!==null → 비활성. 그 외에는 `(host === os.hostname() && pidIsLive(pid) && (now - last_seen_at) <= heartbeatTtlMs)` → 활성. host 일치 + PID 살아있어도 `last_seen_at` stale이면 PID-reuse 의심 → 비활성(stale). 그 외 host != self는 mtime(last_seen_at)만으로 `<= heartbeatTtlMs` 활성. (3) `heartbeatTtlMs` 기본 5분, 기존 24h TTL은 정의 자체를 제거(false-immortal 위험). `pidIsLive(pid)` helper는 `process.kill(pid, 0)` 단일 호출 + throw 시 dead. Windows에서 `EPERM`은 alive로 처리(권한 부족 ≠ dead).
- **Mirror**: CLAUDE.md §3.6 pr-phase-lock canonical schema의 tri-state policy + lease-based reclaim의 `(PID dead) OR (mtime > 60s)` invariant — mtime 캡을 PID liveness보다 항상 위에 둠. F2의 PID-reuse 위험은 이 캡으로 mechanical 차단.
- **Validate**: 6 case — (a) same-host self-pid alive + fresh heartbeat(active), (b) same-host dead-pid + last_seen_at 10분 전(stale), (c) different-host last_seen_at 1분 전(active), (d) **same-host alive-pid + last_seen_at 10분 전(stale — PID-reuse 의심, F2 absorption)**, (e) `pidIsLive`가 `EPERM` throw(active로 분류 — Windows perm fallback), (f) **hybrid global=v1(stale) + repo=v2(fresh) → fresh repo wins, degraded=true 기록(F1 absorption)**.

### Task 4: SessionStart `summarizeOtherActiveLedgers` injection + path mask + hard budget (Codex R1 F3 absorption)
- **Action**: `session-start.js`에 helper 추가. 동작: `listLedgers({activeOnly:true, projectContext})` → `ledgers.filter(l => l.session_id !== observerSessionId)` → 최대 8건, age 짧은 순 정렬. **모든 field 필드 단위 cap (Codex R1 F3 absorption)**:
  - `cwd`: `derive/mask.js`의 `applyPathMask`를 재사용(기존 receipt mask가 쓰는 그 함수). `applyPathMask`가 절대 경로를 repo-relative로 normalize 후 prefix(`<repo>/`)만 노출. Windows 사용자명/머신-specific 디렉토리 패턴 노출 차단.
  - `git_branch`: 40자 cap(`.slice(0,40)` + 잘린 경우 `…`)
  - `session_id`: 8자 short
  - `age`: ISO duration 한 줄(`5m`, `2h`, `1d`)
  - **per-block hard budget 1024자**: 전체 8건 join 후 1024자 초과 시 마지막 entry부터 drop. 8000자 SessionStart hard cap의 13% 이내로 제한 — `summarizeActiveInstincts`(640자)와 비슷한 footprint 유지.
  형식:
  ```
  Other active mccp sessions in this project:
  - [<git_branch-40c>] <repo-relative-cwd> · <session_id_8c> · <age>
  ```
  helper는 throw 시 빈 문자열. main()에서 `createLedger` 직후 `updateLedgerHeartbeat` 호출(자기 ledger anchor 갱신), 그 후 `summarizeOtherActiveLedgers` 호출, `additionalContextParts.push(otherSessionSummary)` — `summarizeActiveInstincts` push 직후 위치.
- **Mirror**: `session-start.js:349-400` `summarizeActiveInstincts` 형식 + `derive/mask.js#applyPathMask`(M1 ship)의 path normalization + loud fail-open(stderr WARN + 진행).
- **Validate**: 새 unit test 5 case — (a) 0 other ledgers(empty string), (b) self only(empty string), (c) 1 other(banner render with masked cwd), (d) 10 other → 8건만 + 정렬 확인, (e) **1024 char budget hit → 마지막 N건 drop + truncation marker(F3 absorption)**. 추가 manual dogfood — worktree A↔B SessionStart 교차 확인.

### Task 5: SessionEnd anchor + STATE.md frontmatter invariant 유지
- **Action**: `session-end.js`의 `finalizeLedger` 직전에 `updateLedgerHeartbeat` 1회 호출. ended_at이 last_seen_at보다 항상 나중 보장. STATE.md frontmatter는 절대 추가/수정 금지(F2 invariant). loud fail-open.
- **Mirror**: `session-end.js:294-307` 기존 finalize try/catch 구조 안에 1줄 추가.
- **Validate**: `node --test plugins/mccp/scripts/state/tests/session-ledger.test.js`에서 SessionEnd 시퀀스 시뮬레이션 — `createLedger` → `updateLedgerHeartbeat` × N → `finalizeLedger` → 최종 ledger에 ended_at > last_seen_at > created_at.

### Task 6: STATUS.md `## Active Sessions` 섹션
- **Action**: `plugins/mccp/scripts/lib/renderer/sections/active-sessions.js` 신설. derive `state.active_session_ledgers`(self 식별 가능한 경우 self 제외 — but renderer는 self를 모름, 모든 ledger render + 본인 표시는 dashboard consumer 몫). 0건이면 빈 문자열(graceful hide — M3 패턴). escapeHtml/escapeAttr 사용(F4 absorption). `renderer/index.js`에 import + section assembly 합류. M3 6-section verdict는 손대지 않음.
- **Mirror**: `plugins/mccp/scripts/lib/renderer/index.js`의 graceful-hide + escape 패턴. M3 absorption(impeccable P1/P2/P3) 회귀 0.
- **Validate**: 신규 `tests/active-sessions.test.js` 3 case + 기존 renderer test 89/89 회귀 0. `node plugins/mccp/scripts/derive/cli.js render`로 실제 STATUS.md surface 확인.

### Task 7: Schema doc + CHANGELOG + plugin.json
- **Action**: `docs/v1.4.0-multi-session/session-ledger-schema.md`에 v2 row 추가 + §6 reclassify(M2 done items vs M3 deferred). `CHANGELOG.md` `[1.7.0]` entry. `plugins/mccp/.claude-plugin/plugin.json` 1.6.0 → 1.7.0. v1.3.0 schema-surface.md cross-ref(optional 1줄).
- **Mirror**: M1 schema doc 구조 + Keep-a-Changelog 표준 + CLAUDE.md §3.7 minor-bump rule.
- **Validate**: 문서 link 검증 + plugin.json JSON parse OK.

### Task 8: Dogfood — PRD M2 metric 검증
- **Action**: 2개 worktree 병렬 — worktree A(현재 v1.4.0-multi-session-m2)에서 Claude 세션 활성, worktree B(예: main worktree)에서 새 세션 시작. B의 SessionStart 첫 system-reminder에 "Other active mccp sessions" block에 A 세션이 표시되는지 확인. M2 metric: 첫 5턴 동안 manual reconciliation 질문("어떤 작업을 진행할까요?") 0회. 정성 평가.
- **Mirror**: PRD §Success Metrics M2 측정 방식.
- **Validate**: session transcript 확인. fail 시 root cause를 fix-task로 회수.

## Validation

```bash
# Unit tests (node native test runner)
node --test plugins/mccp/scripts/state/tests/session-ledger.test.js
node --test plugins/mccp/scripts/derive/tests/state-source.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js

# 기존 회귀 0 확인
node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js

# E2E derive + render
node plugins/mccp/scripts/derive/cli.js run --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("active_session_ledgers:",j.state.active_session_ledgers.length)'
node plugins/mccp/scripts/derive/cli.js render

# Dogfood — 2개 worktree에서 병렬 Claude 세션 시작 후 SessionStart context grep
grep -A 3 "Other active mccp sessions" .claude/state/last-render.json 2>/dev/null || echo "(dogfood manual — session transcripts에서 확인)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Schema v1→v2 bump이 다른 repo의 기존 v1 ledger를 깨뜨림 | Medium | read-only lift(in-memory) + write-only v2 emit. v1 ledger 파일은 그대로 두고 다음 SessionStart에서 자연스럽게 v2로 re-write됨. 강제 migration 없음. |
| `process.kill(pid, 0)` Windows 호환성 — POSIX 시그널 모델과 의미 차이 | Medium | Node가 Windows에서도 `process.kill(pid, 0)`을 지원(presence check). 동작 검증은 test에 포함. fallback: throw 시 `last_seen_at` 기반 stale 판정으로 자동 degrade. |
| SessionStart에서 ledger 디렉토리가 거대해 listLedgers가 느려짐 | Low | 5분 heartbeat TTL + 24h fallback이 이미 cutoff. directory entry 수가 1000+가 되기 전엔 영향 없음. M3가 retention GC. |
| Hybrid scope에서 SessionStart inject가 같은 ledger를 2번 표시 | Low | `listLedgers`가 이미 sessionId 기준 dedupe(`seen` Map, M1 ship). 새 코드는 이 invariant에 의존만 함. |
| heartbeat write가 git status를 더럽힘(`<repo>/.claude/state/session-ledgers/`가 staged 됨) | Low | M1에서 이미 `.gitignore`에 `.claude/state/session-ledgers/` 등록(schema doc §4). 회귀 검증 시 `git status` 출력 확인. |
| SessionStart `additionalContext`가 8000자 한도 초과 | Low | `summarizeOtherActiveLedgers` 최대 8건 × ~80자 = 640자. `limitSessionStartContext`(session-start.js:135)가 hard cap 보장. |
| Renderer "Active sessions" 섹션이 self를 포함해 confusing | Low | M3 derive surface는 self 식별 불가하므로 모든 항목 render. dashboard UI에서 별도로 self 마킹(이건 후속 axis로 backlog). M2 ship 기준 acceptable. |
| 2 worktree 동시 SessionStart에서 ledger 파일 race | Low | `withLedgerLock`(M1)이 advisory `wx` + 30s stale-clear로 이미 보호. M2가 추가 race surface 만들지 않음. |

## Acceptance

- [ ] schema v2 정의 + v1 backward-compat 검증 통과(2 case)
- [ ] `updateLedgerHeartbeat` 5 unit case 통과
- [ ] `listLedgers` host-aware tri-state 3 case 통과
- [ ] SessionStart에 `Other active mccp sessions` block 표시(dogfood 검증)
- [ ] SessionEnd가 `ended_at > last_seen_at > created_at` 순서 보장
- [ ] STATUS.md `## Active Sessions` 섹션 render(self only 시 graceful hide, +1 시 표시)
- [ ] 기존 회귀 0: session-ledger 9 case + state-source.test 197줄 + renderer 89 case 전부 green
- [ ] CHANGELOG `[1.7.0]` + plugin.json `version=1.7.0` + schema doc v2 row 갱신
- [ ] PRD §Delivery Milestones M2 row `complete`로 update(post-ship)
- [ ] 본 plan에 Codex Adversarial Review 섹션 inject + mccp-plan-codex receipt write + read-back validate 통과

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 + v0.3.6 impeccable-scope-split)
- 라운드 수: 1 (R2 escalate 조건 미충족 — 모든 ACCEPT_NOW HIGH가 R1 body absorption으로 fully resolved)
- 합치 결론: 3 findings(HIGH×2, MEDIUM×1) 전부 ACCEPT_NOW. Task 2/3/4 본문에 mechanical patch로 fully resolved.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 | HIGH | ACCEPT_NOW | Hybrid dedupe가 global-precedence-first면 stale v1이 fresh v2를 가린다 — Task 3에서 newest-`last_seen_at` wins + degraded 기록으로 mechanical 차단. Task 2가 all-or-nothing invariant 추가. |
  | F2 | HIGH | ACCEPT_NOW | PID liveness 단독 NEVER-reclaim은 same-host PID-reuse 시 crashed 세션을 영구 활성으로 둔다 — Task 3에서 (PID alive AND fresh heartbeat) AND 둘 다 필요. 24h fallback TTL 자체를 제거(false-immortal source). |
  | F3 | MEDIUM | ACCEPT_NOW | cwd 30자 prefix는 Windows에서 username/머신 패스 노출 + 8×80 무관하게 git_branch 무한 길이라 8000자 global cap만 신뢰 — Task 4가 `derive/mask.js#applyPathMask` 재사용 + 모든 field cap + 1024자 per-block budget으로 mechanical 차단. |
- Deferred to backlog: 0 (모든 finding이 본 plan body에 mechanical patch로 absorb됨)
- Open Questions: 없음 — auto-CRITICAL catalog(secret/data-loss/auth-bypass/migration/external-dest/crypto) 0건.
- R1 absorption self-attestation: F1+F2+F3 모두 mechanical patch로 plan body에 incorporated. 새 surface(hybrid all-or-nothing 6번째 test case, tri-state 6 test case, banner 5 test case)는 implement 단계에서 Codex F2 absorption test로 회귀 0 검증. R2 escalate 조건(ACCEPT_NOW HIGH 미해소) 미충족 → R1에서 종료.
- Codex session 참조: threadId `019edfda-39f9-7fc0-b429-e072f482b57d` (review at 2026-06-19, verdict=needs-attention before absorption).

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

