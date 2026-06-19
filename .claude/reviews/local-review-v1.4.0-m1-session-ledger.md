# Local Review — v1.4.0-m1 Multi-Session Continuity Primitive

**Reviewed**: 2026-06-19
**Reviewer**: /mccp:code-review (Local Mode)
**Branch**: v1-4-0-multi-session-m1
**Scope**: 9 modified + 7 untracked (이 review는 코드/스키마/문서 surface에 집중; PRD/plan/report 본문 자체는 audit-only)
**Decision**: **REQUEST CHANGES** — 1 HIGH (privacy mask 누락) 차단. 나머지는 follow-up axis로 처리 가능.

---

## Summary

v1.4.0-m1은 session-ledger primitive(scope-aware atomic JSON per-session)를 추가하고, SessionStart/SessionEnd hook에 create/finalize wiring을, derive `sources/state.js`에 `active_session_ledgers` surfacing을 얹습니다. 새 테스트 25/25 모두 통과(`session-ledger.test.js` 16 + `state-source.test.js` 9). schema 설계(F1 namespace 분리, F2 STATE.md 무변동, F3 canonical `created_at`)는 plan에 명시된 Codex absorption 트랙대로 구현됐습니다.

차단 사유는 단 1개 — v1.3.0-m4 privacy guard가 새로 surface된 ledger field(`cwd`/`host`)를 따라가지 못해 STATUS.md/status.html에 raw hostname + absolute path가 노출됩니다. mask.js에 한 줄 추가하면 해소.

## Findings

### CRITICAL

None.

### HIGH

#### H1. Privacy guard 누락 — `active_session_ledgers`가 mask 우회

**Where**: `plugins/mccp/scripts/derive/mask.js:177`

```js
if (s.state && s.state.item) maskItem(s.state.item, root, ['path']);
```

**Issue**: v1.3.0-m4 `applyPathMask`는 `state.item`에서 `['path']`만 normalize하고 `active_session_ledgers[*]`를 walk하지 않습니다. 새 derive surface는 ledger마다 다음을 노출합니다:

| field | 값 예시 | 노출 위험 |
|---|---|---|
| `cwd` | `C:\_project\my\my-claude-code-plugin\.worktrees\v1.4.0-multi-session-m1` | 절대경로 — repo placeholder 미적용 |
| `host` | `DESKTOP-XYZ123` | hostname — 외부 공유 시 환경 식별 |
| `git_branch` | `v1-4-0-multi-session-m1` | 보통 OK |
| `pid` / `project_id` | 1234 / sha256 12-char | 무해 |

`docs/v1.3.0-observability/schema-surface.md`의 §6 (v1.3.0-m4 privacy invariant)이 "envelope + briefing_summary"를 보장 surface로 명시. 새로 추가된 §8 (session-ledger)이 path mask 정책을 끼워 넣지 않으면, `STATUS.md` / `status.html`이 `cwd` 절대경로와 `host`를 그대로 보여줍니다. PRD가 dashboard에서 `active_session_ledgers`를 PM에 surface하는 걸 첫 acceptance criterion으로 잡고 있는 만큼, 첫 공개 surface에 privacy hole이 들어가는 형태입니다.

**Fix**: `mask.js:177`을 두 줄로 확장:

```js
if (s.state && s.state.item) {
  maskItem(s.state.item, root, ['path']);
  if (Array.isArray(s.state.item.active_session_ledgers)) {
    for (const led of s.state.item.active_session_ledgers) {
      maskItem(led, root, ['cwd']);
    }
  }
}
```

`host` masking은 PRD 정책 결정 — hostname을 `<host>` placeholder로 redacat할지 raw로 둘지. M2 dashboard renderer가 이 field를 실제로 표시하는지 확정한 뒤 결정해도 늦지 않지만, M1 ship 전에 **default redact** 권장. 한 번 surface된 후 빼는 건 보안 회귀 처리가 까다롭습니다.

**Test gap**: `state-source.test.js`에 mask round-trip 케이스 없음. `applyPathMask({sources:{state:{item:{active_session_ledgers:[{cwd:'/abs/path'}]}}}}, root)` → `cwd: '<repo>/...'` 형태 검증 추가 필요.

---

### MEDIUM

#### M1. `scanState` return 계약 변경 — STATE.md 부재 시 `item:null` → synthetic item

**Where**: `plugins/mccp/scripts/derive/sources/state.js:51-66`

OLD: STATE.md 없으면 `{ ok: true, item: null }`.
NEW: STATE.md 없어도 `{ ok: true, item: { frontmatter:{}, body:{}, resume_state:'idle', controller_active:false, escalate_pending:false, path:null, active_session_ledgers:[...] } }`.

`verdict.js:62 if (stateItem)` 등 모든 `if (state.item)` 사용처가 이제 항상 truthy. verdict 본문 분기(`resume_state === 'giveup'/'in-flight'`, `escalate_pending`, `controller_active`)는 synthetic item에서 전부 `false`로 떨어지므로 **현재는 관측 가능한 회귀 없음** — 그러나 새 consumer가 `if (state.item) → "STATE.md exists"`를 가정하면 깨집니다.

**Fix**: 두 가지 중 택일.
- (a) 계약 유지: STATE.md 없으면 `item: null` 그대로, 별도 `state.active_session_ledgers` field를 source root에 두기 (model 평면 확장).
- (b) `model.js`/`renderer/index.js` 등 모든 `if (item)` 가정을 명시적으로 `if (item && item.path)` 등으로 강제.

`docs/v1.3.0-observability/schema-surface.md` §8에 "scanState item is now non-null even when STATE.md absent — gate on `item.path != null` for STATE.md existence" 한 줄 명시 권장.

#### M2. `withLedgerLock`의 busy-spin retry — SessionStart latency 1초 burst 가능

**Where**: `plugins/mccp/scripts/state/session-ledger.js:178-180`

```js
const start = Date.now();
while (Date.now() - start < LOCK_RETRY_MS) { /* spin */ }
```

20ms × 50회 = 최악 1초 CPU core 점유. SessionStart hook 안에서 발생하면 사용자가 체감하는 startup latency에 직접 가산됩니다. UUID-keyed file이라 실제 contention 빈도는 매우 낮지만, 패턴 자체가 표준 안티 패턴.

**Fix**: Node sync sleep canonical 패턴 사용:

```js
const buf = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) { Atomics.wait(buf, 0, 0, ms); }
// ...
sleepSync(LOCK_RETRY_MS);
```

#### M3. `isStaleLock` TOCTOU race

**Where**: `plugins/mccp/scripts/state/session-ledger.js:174-177`

```js
if (isStaleLock(lockFile)) {
  try { fs.unlinkSync(lockFile); } catch (_e) {}
  continue;
}
```

`isStaleLock` true 판정과 `unlinkSync` 사이에 다른 process가 신선한 lock을 작성하면, 우리가 그 신선한 lock을 지우고 진행합니다. v0.2.8 `pr-phase.lock`(§3.6)이 이미 host-aware tri-state policy + lease anchor로 같은 race를 해결한 코드를 가지고 있습니다 — 그 패턴을 mirror하는 것이 M2 우선 후보.

**Fix (M2 deferral OK)**: 현재 v1.4.0-m1은 backlog에 F4 heartbeat-based active reclaim을 이미 MEDIUM으로 등록했으므로, 그 axis에 묶어서 함께 해소. M1 ship 전 차단 사유는 아님.

#### M4. acquisition 실패 시 lock 없이 진행 — race window open

**Where**: `plugins/mccp/scripts/state/session-ledger.js:181-185`

```js
if (!acquired) {
  process.stderr.write('[mccp:session-ledger] WARNING: could not acquire lock at '
    + lockFile + ' ... proceeding without lock (race window open)\n');
}
```

Loud fail-open 원칙(`CLAUDE.md §3.4`)과 일치하지만, 결과 객체 자체는 `degraded` 표시가 없습니다. ledger 결과에 `degraded: true` 또는 `lock_acquired: false`를 첨부해서 consumer(`listLedgers`/`derive`)가 신호를 surface할 수 있게.

**Fix**: `createLedger`/`finalizeLedger`의 return shape에 `lock_warning: '<msg>' | null` 추가. UI/dashboard가 잠재 race를 가시화할 수 있도록.

#### M5. observer-sessions lease와 surface 중복

**Where**: `plugins/mccp/scripts/lib/observer-sessions.js:137-151` vs `state/session-ledger.js`

`writeSessionLease`가 이미 `{ sessionId, cwd, pid, updatedAt }`을 per-session JSON으로 기록 중. session-ledger가 `{ session_id, cwd, pid, host, created_at, ended_at, git_branch, project_id, claude_version }`을 또 기록.

`session-start.js:538` 이후 즉시 `:562`에서 ledger도 작성 — 같은 hook에서 두 파일 시스템 surface를 만듭니다. Plan의 F1 absorption("namespace separation")이 의도였지만, 결과적으로:

1. 두 schema 모두 read consumer가 생기면 deduplication 복잡도 ↑
2. lease가 cleanup되는 시점과 ledger가 finalize되는 시점이 sync 안 됨 → discovery drift

**Fix (관찰 + 문서화)**: `docs/v1.4.0-multi-session/state-md-narrowing.md`에 "왜 lease를 확장하지 않고 별도 ledger를 만들었는가" 명시. M2 또는 M3에서 lease를 ledger의 thin reader projection으로 축소하는 게 자연스러운 다음 step.

#### M6. 새 docs가 untracked — schema-surface.md anchor link 깨짐 위험

**Where**: 
- `docs/v1.3.0-observability/schema-surface.md:227` → `[session-ledger-schema.md](../v1.4.0-multi-session/session-ledger-schema.md)`
- `docs/v1.3.0-observability/schema-surface.md:229` → `[state-md-narrowing.md](../v1.4.0-multi-session/state-md-narrowing.md)`

`docs/v1.4.0-multi-session/` 전체가 untracked (`?? docs/v1.4.0-multi-session/`). PR에 함께 staged하지 않으면 main에서 dead link.

**Fix**: `git add docs/v1.4.0-multi-session/`를 commit에 포함시키도록 prp-commit 단계에서 확인.

---

### LOW

#### L1. `state-source.test.js:84` 테스트 이름이 derive 경로 오인 가능

`test('listLedgers schema-name contract: surfaces created_at (NOT started_at) - F3', ...)` 본문은 `sessionLedger.listLedgers({ projectContext: ctx })`를 직접 호출. 실제 derive는 `listLedgers({ activeOnly:true, cwd: repoRoot })`로 부릅니다. 계약 자체는 둘 다 똑같은 schema를 surface하므로 결과는 같지만, "F3 derive contract"를 의도하면 derive 경로(`stateSource.collectActiveSessionLedgers(repo)`) 호출이 더 정확합니다.

#### L2. `session-start.js:565`의 `cwd: process.cwd()` vs `git_branch: gitBranch(projectRoot)`

ledger record는 user가 Claude를 띄운 cwd를 잡지만, git_branch는 repo root에서 probe. 의미적으로는 OK이지만, multi-worktree 환경에서 `cwd`가 sub-dir이면 ledger를 사용해 "어떤 worktree?"를 식별할 때 추가 normalize 필요. 주석 한 줄 권장.

#### L3. `validate()` strict 모드의 unknown-key 차단이 미래 호환 비용 가중

`KNOWN_KEYS` Set 외 모든 키를 거부 (`session-ledger.js:89-92`). schema bump 없이는 caller가 새 field를 못 더 추가합니다. v1.3.0 envelope이 `additionalProperties:false`로 갔으니 일관됨 — 의도된 것 같지만, M2/M3에서 `heartbeat_at`, `worker_dispatch_id` 추가 시 schema_version `v1` → `v2` 마이그레이션 작업이 필수가 됩니다. CHANGELOG에 미리 노트 권장.

#### L4. `STATE.md` body가 변경 없음

diff 확인 시 frontmatter만 timestamp 갱신, body는 그대로(`v1.3.0-m5 진입` 안내). 이번 PR의 ship 내용(v1.4.0-m1)이 STATE.md body에 반영되지 않음. backlog가 이미 이 패턴 자체를 HIGH로 등록해 둔 상태(`codex-findings-backlog.md` 2026-06-19 entry). 이번 cycle에서는 의도된 패턴 유지로 OK이지만, PR merge 시 chore body roll PR 별도 생성 권고 (이전 v1.3.0 cycle과 동일 패턴 — `mccp-v1.3.0-cycle.md` 메모리 참조).

#### L5. `plugin.json` 1.4.1 → 1.5.0 점프 — CHANGELOG는 1.4.0 entry가 Unreleased로 남아있음

CHANGELOG.md의 `## [1.4.0] — Unreleased`가 그대로 있고, 그 위에 `## [1.5.0] — Unreleased`가 추가됩니다. v1.4.0 cycle에서 미ship된 항목이 있다면 정리하거나, v1.4.0 entry를 v1.5.0과 병합할지 PRD/plan 결정 필요. CLAUDE.md §3.7 "milestone PR 의무 체크리스트" 확인.

---

## Validation Results

| Check | Result |
|---|---|
| New tests (`session-ledger.test.js` + `state-source.test.js`) | **25/25 PASS** (1855ms) |
| Type check | N/A (JavaScript only) |
| Lint | Not invoked (no project lint config detected) |
| Existing renderer/derive tests | Not run in this review — recommend running before PR |
| Build | N/A |

> **권장**: PR 생성 직전 `node --test plugins/mccp/scripts/derive/tests/ plugins/mccp/scripts/lib/renderer/tests/` 전체 실행해 M1 계약 변경(M1 finding)이 기존 dashboard 테스트를 깨지 않는지 확인.

## Files Reviewed

### Added (untracked but in-scope)
- `plugins/mccp/scripts/state/session-ledger.js` — 423 lines, schema + atomic IO + scope resolver
- `plugins/mccp/scripts/state/tests/session-ledger.test.js` — 16 tests
- `plugins/mccp/scripts/derive/tests/state-source.test.js` — 9 tests

### Modified
- `plugins/mccp/scripts/derive/sources/state.js` — +53 lines (collectActiveSessionLedgers + scanState 계약 변경)
- `plugins/mccp/scripts/hooks/session-start.js` — +35 lines (createLedger wiring)
- `plugins/mccp/scripts/hooks/session-end.js` — +19 lines (finalizeLedger wiring)
- `plugins/mccp/.claude-plugin/plugin.json` — version 1.4.1 → 1.5.0
- `docs/v1.3.0-observability/schema-surface.md` — +10 lines (§8 신설)
- `CHANGELOG.md` — +22 lines (1.5.0 entry)
- `.gitignore` — +6 lines (session-ledgers/ 추가)
- `.claude/state/STATE.md` — 4 lines (frontmatter timestamp만)
- `.claude/plans/codex-findings-backlog.md` — +1 line (M2 deferred F4 entry)

### Audit-only (이 review에서 본문 채점하지 않음)
- `.claude/PRPs/plans/completed/v1-4-0-multi-session-m1-continuity-primitive.plan.md`
- `.claude/PRPs/reports/v1-4-0-multi-session-m1-continuity-primitive-report.md`
- `.claude/prds/v1-4-0-multi-session-first-class.prd.md`
- `docs/v1.4.0-multi-session/session-ledger-schema.md` (untracked)
- `docs/v1.4.0-multi-session/state-md-narrowing.md` (untracked)

---

## Next Steps

1. **차단 해소 (H1)**: `mask.js:177`에 ledger path mask 한 블록 추가 + 테스트. ~15분.
2. **계약 변경 명시 (M1)**: `schema-surface.md` §8에 "scanState item now always non-null; gate on `item.path != null`" 한 줄.
3. **untracked docs staging (M6)**: `git add docs/v1.4.0-multi-session/` 확인.
4. (선택) **busy-spin → Atomics.wait (M2)**: 한 함수 교체. ~10분.
5. M3/M4/M5는 M2 cycle backlog로 위임. F4 heartbeat axis와 함께 묶는 것 권장.

이 5단계 정리되면 PR 진입 가능합니다. 게이트 chain(`/mccp:pr`)이 이 review를 receipt chain 입력으로 받지 않는 local mode이므로, PR mode review가 별도로 필요합니다.
