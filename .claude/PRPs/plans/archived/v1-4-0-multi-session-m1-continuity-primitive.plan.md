# Plan: v1.4.0-m1 Multi-Session Continuity Primitive

**Source PRD**: `.claude/prds/v1-4-0-multi-session-first-class.prd.md`
**Selected Milestone**: M1 — continuity primitive (한 worktree의 PR merge가 다른 worktree의 작업 컨텍스트를 0건 손실)
**Complexity**: Medium

## Summary

PRD의 4 Open Questions에 대해 다음 architectural decisions를 채택한다 (R1 absorption 후 PRD 결정 정합).

- **Q-mechanism**: 단일 — **새 per-session ledger** 디렉토리가 cross-worktree 발견의 단일 진실 원천이다. STATE.md는 현행 narrow 역할(`last_event`/`last_decision`/`open_questions`) 그대로 — frontmatter에 anchor 필드 신설하지 않는다. **Codex Implementation R1 F2 absorption**: 처음 plan은 `session_id` + `session_ledger_path` anchor를 STATE.md frontmatter에 추가 + `HASH_EXCLUDE_FRONTMATTER_KEYS`에 포함시키는 방안을 채택했으나, state-writer.update의 hash-match skip 로직(line 580-584)은 hash가 같으면 write 자체를 건너뛴다 — anchor만 변하면 정확히 그 skip 경로에 걸려 *anchor가 디스크에 영구화되지 않는다*. hash에서 빼면서 "anchor는 변해도 STATE.md write 일어남"을 동시에 달성할 수 없는 구조적 모순. 따라서 anchor를 통한 surface는 포기 → 발견은 ledger 디렉토리 scan(`listLedgers()`)으로 단일화. STATE.md 전면 교체 risk도 없음(애초에 안 건드림).
- **Q-storage-trigger**: 하이브리드 storage. **PRD 결정에 맞춰 default = `~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/`** (global, repo-hash namespace, `observer-sessions.js#resolveProjectContext`로 `projectDir` 얻은 뒤 신규 subdir `.session-ledgers/` 사용). **opt-in = `<repo>/.claude/state/session-ledgers/`** (`MCCP_SESSION_LEDGER_SCOPE=repo` 설정 시). default-`hybrid` 시 두 곳 모두 write — global이 primary surface, repo는 audit/dogfood용. **Codex Implementation R1 F1 absorption**: 처음 plan은 namespace `.observer-sessions/`를 재사용했으나, 이 디렉토리는 `observer-sessions.js#writeSessionLease`가 `{sessionId, cwd, pid, updatedAt}` lease 파일을 이미 같은 경로 + 같은 파일명(`<sessionId>.json`)으로 쓰고 있어 schema 충돌 + 상호 덮어쓰기 위험. namespace를 별도 subdir `.session-ledgers/`로 격리해 collision 0건 + 마이그레이션 불요(첫 출시).
- **Q-session-vs-work**: `session_id = Claude session UUID` (env `CLAUDE_SESSION_ID`, 이미 `observer-sessions.js#resolveSessionId`가 sanitize). logical `work_id`는 M1에서 신설하지 않음 — compaction/auto-handoff 가로지르는 chain은 기존 `dispatch_id` + `dispatch_id_completed` 2-phase marker(v1.1.0)가 이미 해결. **하나의 session이 여러 worktree-branch를 가로지르지 않는다**는 invariant를 명문화(같은 cwd에서 새 cycle 시작해도 새 session_id).
- **Q-envelope-reuse**: PRD 사용자 결정 정합 — **envelope의 helper layer를 재사용**(atomic tmp+rename, schema validate 스타일, advisory lock 패턴 — mechanical reuse). **schema document는 분리** (`session-ledger-schema.md` 신설, envelope JSON_SCHEMA는 변경 없음). 두 surface의 lifecycle이 다르므로 envelope `additionalProperties:false` invariant를 깨뜨리지 않음. 사용자 결정 wording("envelope schema 재사용 + 새 session 레이어")은 이렇게 해석한다 — **schema 정의는 분리, helper code는 공유**.

M1 ship 정의(Done = M1 metric 충족):

1. 새 `session-ledger` 모듈 + per-session JSON 파일 atomic write/read + scope-aware resolver(global/repo/hybrid)
2. v1.3.0 derive engine `sources/state.js`에 ledger-aware adapter 추가 — `listLedgers({activeOnly:true})`을 호출해 `item.active_session_ledgers` surface (STATE.md frontmatter는 변경 없음 — F2 absorption)
3. dogfood: 2개 worktree 병렬 cycle 1회. PR#38↔#39 패턴 재발 0회 자성 평가

M2(cross-session discovery via SessionStart hook injection)는 본 plan 범위 외 — `MCCP_SESSION_LEDGER_SCOPE=global` trigger와 SessionStart hook surface는 M2 plan에서 다룬다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Atomic file write | `plugins/mccp/scripts/lib/dispatch-envelope.js:220-256` | tmp + `renameSync`, 정확히 같은 lifecycle. ledger writer가 그대로 따른다. |
| Advisory lock + retry/stale | `plugins/mccp/scripts/state/state-writer.js:491-535` | `LOCK_MAX_RETRIES=50` × `LOCK_RETRY_MS=20` × `LOCK_STALE_MS=30000`. ledger write에서도 동일 상수 채택 (parallel session 충돌 대응). |
| Schema validation pattern | `plugins/mccp/scripts/lib/dispatch-envelope.js:35-176` | `JSON_SCHEMA` const + `validate()` 손으로 작성 + `additionalProperties:false` + `KNOWN_KEYS Set`. ledger도 동일 패턴. |
| Conditional frontmatter emit | `plugins/mccp/scripts/state/state-writer.js:307-326` | `if (fm.field) out.push(...)`. ledger anchor field 2개(`session_id`, `session_ledger_path`)도 conditional emit — 미설정 STATE.md backward-compat. |
| Session UUID resolution | `plugins/mccp/scripts/lib/observer-sessions.js:127-129` | `resolveSessionId()` — `process.env.CLAUDE_SESSION_ID` sanitize. ledger writer가 그대로 호출. |
| Project-hash namespace | `plugins/mccp/scripts/lib/observer-sessions.js:88-92` | `computeProjectId()` — `sha256(remote || cwd).slice(0,12)`. M2 global scope에서 재사용 예정 (M1은 repo-local만). |
| Derive source adapter | `plugins/mccp/scripts/derive/sources/state.js:1-48` | source 추가는 `index.js`에서 합성 + `degraded` flag fail-open. ledger source는 같은 contract로 추가. |
| Node test runner | `plugins/mccp/scripts/state/tests/state-writer.test.js:1-60` | `mkdtempSync`로 임시 repo → `update/read` round-trip → `assert.match`. ledger tests도 그대로. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/state/session-ledger.js` | CREATE | 새 모듈. per-session ledger의 atomic write/read + schema validate + advisory lock + scope-aware resolver. global `~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/<session_id>.json` (default) + repo `<repo>/.claude/state/session-ledgers/<session_id>.json` (opt-in). storage resolution은 `MCCP_SESSION_LEDGER_SCOPE` env var (`global` default, `repo`, `hybrid`). **F1 absorption**: namespace 별도 subdir(`.session-ledgers/`)로 격리 — 기존 observer-sessions lease(`<projectDir>/.observer-sessions/<sessionId>.json`)와 path collision 없음. |
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | CREATE | round-trip / advisory lock contention / schema reject / stale-cleanup + storage scope resolution (`global`/`repo`/`hybrid` 각각) unit tests. **Codex R1 F3 absorption (plan-codex)**: schema field 명명 통일 contract test 포함 — producer `createLedger` write field 이름이 schema KNOWN_KEYS와 100% 일치 + derive consumer가 같은 이름으로 읽음을 같은 test 안에서 round-trip 검증. **F4 partial absorption (implement-codex)**: TTL-based stale cutoff test — `activeOnly:true`이 24h 이상 finalize 안 된 ledger를 자동 제외. |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | Claude session 부팅 시 ledger 한 건을 *생성*만 (write `session_id`, `created_at`, `cwd`, `git_branch`, `pid`, `host`, `project_id`). 이미 진행 중 worktree 다른 session 발견·표면화 로직은 M2 범위 → 본 PR에서는 *생성*만. **F2 absorption**: state-writer.update를 anchor 목적으로 호출하지 않음 (anchor 자체를 STATE.md에 두지 않음). |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | Claude session 종료 시 ledger의 `ended_at`을 atomic update — finalize semantics. |
| `plugins/mccp/scripts/derive/sources/state.js` | UPDATE | `session-ledger.listLedgers({activeOnly:true})` 호출 → `item.active_session_ledgers`로 합성. **F3 absorption**: scope-aware resolver(`listLedgers`) 통해 호출하므로 global default ledger를 default 상태에서 자동 소비. hardcoded repo path 절대 없음. fail-open(`degraded` flag). 기존 STATE.md 단일 reading은 그대로 — additive surface. session_anchor surface는 없음(F2 absorption). |
| `plugins/mccp/scripts/derive/tests/state-source.test.js` | CREATE OR UPDATE | active ledger 0건/1건/N건 + 누락된 ledger file(상호 환경) 각각 fail-open + `degraded=true` test + scope-aware test(`MCCP_SESSION_LEDGER_SCOPE` env mocking). |
| `docs/v1.4.0-multi-session/session-ledger-schema.md` | CREATE | session ledger v1 schema 정의. envelope schema와 분리 명시. discovery는 ledger 디렉토리 scan(STATE.md anchor 미사용 — F2 absorption 사유). 마이그레이션 path(없음 — additive). 60일 stale 정책 + 24h active TTL cutoff 명시. |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | §3에 session-ledger schema 링크 추가 + §6에 session-ledger.js public API 표면 cross-link. STATE.md frontmatter 표는 변경 없음(F2 absorption — anchor 미도입). v1.3.0 derive baseline ↔ v1.4.0 surface 안전 이전 경로 명시. |
| `docs/v1.4.0-multi-session/state-md-narrowing.md` | CREATE | STATE.md의 역할이 "단일 진실 원천"에서 "이 worktree의 last_event summary + session 발견 위임(ledger 디렉토리)"로 narrow됨을 explainer. v1.3.0 reconciliation 문서와 같은 톤(`state-md-naming-reconciliation.md`). PRD §"Relation to prior PRDs" 정합. STATE.md 자체는 schema-wise 변경 없고 *역할* narrow임을 명시. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` `1.4.0` → `1.5.0`. minor bump — 새 schema surface(session-ledger) 도입. CLAUDE.md §3.7 milestone PR 의무 체크리스트 충족. |
| `CHANGELOG.md` | UPDATE | 신규 row. v1.5.0-m1 — Multi-Session Continuity Primitive 명시. |
| `.gitignore` | UPDATE | `.claude/state/session-ledgers/` 추가 — repo opt-in scope 사용자도 ledger commit accident 방지. |

## Tasks

### Task 1: session-ledger 모듈 + schema 정의

- **Action**: `plugins/mccp/scripts/state/session-ledger.js` 신설. Public API:
  - `resolveLedgerScope({env?, projectContext?})` → `{paths: string[], primary: string, scope: 'global'|'repo'|'hybrid'}`. `MCCP_SESSION_LEDGER_SCOPE`이 unset 또는 `global`이면 `[<projectDir>/.session-ledgers]`만 반환 + primary=global. `repo`면 `[<repo>/.claude/state/session-ledgers/]` + primary=repo. `hybrid`면 [global, repo] 둘 다 + primary=global. **F1 absorption**: namespace `.session-ledgers/` (NOT `.observer-sessions/`) — 기존 observer lease와 path 충돌 없음.
  - `createLedger({sessionId, cwd, gitBranch, scopeOverride?})` → 신규 ledger 생성 (`created_at = nowIso()`, `ended_at = null`). resolveLedgerScope() primary path에 write. hybrid 모드면 두 위치 모두 write (atomic per-file, 두 write 중 한쪽 실패 시 stderr loud warn + 다른 쪽은 진행 — fail-open).
  - `finalizeLedger({sessionId, endedAt?, scopeOverride?})` → resolveLedgerScope() 모든 path에서 같은 sessionId의 `ended_at`을 atomic update. 다른 worktree에서 만든 ledger도 정상 finalize됨 (global path 공유).
  - `readLedger({sessionId, scopeOverride?})` → resolveLedgerScope() path들을 순서대로(global 우선) 탐색 → 첫 match 반환 + schema validate.
  - `listLedgers({activeOnly?: boolean, activeTtlMs?: number, scopeOverride?})` → resolveLedgerScope() 모든 path 스캔 후 dedupe by sessionId (global이 우선). `activeOnly:true`이면 `ended_at===null` AND `created_at`이 `activeTtlMs` 안에 있는 ledger만(default `activeTtlMs = 86_400_000` = 24h — **F4 partial absorption**: heartbeat 없이도 crash-orphaned ledger가 영원히 active로 surface되지 않음. M2가 heartbeat 기반 정확 reclaim 추가).
  - `SCHEMA_VERSION = 'v1'` + `validate(ledger)` (envelope.js와 동일 stylistic pattern).
  - `KNOWN_KEYS` set + `additionalProperties:false` 등가 enforcement.
- Schema fields (v1) — **Codex R1 F3 absorption: 단일 canonical 이름 `created_at` 채택. producer/consumer 모두 동일 이름 사용**:
  - `schema_version`: `'v1'` (const)
  - `session_id`: Claude UUID (sanitized via `observer-sessions.resolveSessionId`)
  - `created_at`: ISO8601 (ledger creation timestamp — STATE.md / receipt schema와 동일 명명. **NOT `started_at`**)
  - `ended_at`: ISO8601 or `null`
  - `cwd`: 절대 경로 (worktree 식별)
  - `git_branch`: string or `null`
  - `pid`: integer (host-aware tri-state 재청구는 M2 범위, M1은 audit 정보만 기록)
  - `host`: `os.hostname()` (M2 cross-machine 충돌 방지 anchor)
  - `project_id`: 12-char hex (computeProjectId; global scope에서 cross-repo 정렬 anchor — M2 discovery 핵심)
  - `claude_version`: string or `null` (sessionStart hook payload에서 추출 시도; 실패 시 null — minimum-spec mode 호환)
- **Mirror**: `dispatch-envelope.js:35-176` (schema + validate — **helper reuse** per Q-envelope-reuse 결정), `state-writer.js:491-535` (lock pattern), `observer-sessions.js:88-109` (computeProjectId + resolveProjectContext + projectDir; new subdir `.session-ledgers/`).
- **Validate**: `node --test plugins/mccp/scripts/state/tests/session-ledger.test.js` — (1) round-trip; (2) lock contention (parallel 2 writes; second waits or skips with `degraded=true`); (3) schema reject (unknown key / missing field); (4) **TTL cutoff (F4 partial)**: `created_at`이 25h 전인 ledger + `ended_at:null`이면 `listLedgers({activeOnly:true})`에서 제외; (5) scope resolution `global`/`repo`/`hybrid` 각각 + env unset = global default; (6) **schema name contract test** — `createLedger({...}).then(readLedger).then(record => assert record.created_at && !record.started_at)` 라운드트립.

### Task 2 (DROPPED — F2 absorption)

원래 plan은 STATE.md frontmatter에 `session_id` + `session_ledger_path` anchor 2개를 추가하고 `HASH_EXCLUDE_FRONTMATTER_KEYS`에 포함시키는 방안이었음. Codex Implementation R1 F2 finding이 정확한 구조적 모순을 지적:

- `HASH_EXCLUDE` = hash 계산에서 빠짐 → 해당 필드만 변할 때 `contentHash(existing) === contentHash(merged)` 성립 → state-writer.js:580-584의 skip 분기 발동 → **disk write 자체가 일어나지 않음** → anchor가 STATE.md에 영구화되지 않음.
- `HASH_EXCLUDE`에서 빼면 → SessionStart마다 hash 달라짐 → 매번 disk write → `git status`에 STATE.md 매번 dirty → PR#38↔#39 last-write-wins 재발.

두 목표(anchor 영구화 + git clean)를 hash exclusion 하나로 달성할 수 없음. **architectural rethink**: STATE.md anchor 자체를 도입하지 않는다. discovery surface는 ledger 디렉토리 scan(`listLedgers()`) 하나로 통합. STATE.md 변경 0 hunk + Task 2/2b 모두 drop.

### Task 3: SessionStart hook이 ledger 생성 (anchor drop per F2)

- **Action**: `plugins/mccp/scripts/hooks/session-start.js`에 ledger 생성 단계 추가:
  - `resolveSessionId(process.env.CLAUDE_SESSION_ID)`로 `sessionId` 획득. 빈 문자열이면 silent skip (CI / minimum-spec mode 안전).
  - `createLedger({sessionId, cwd, gitBranch})` 호출 — storage scope는 `MCCP_SESSION_LEDGER_SCOPE` env가 resolveLedgerScope() 내부에서 결정 (default global).
  - **F2 absorption**: state-writer.update를 anchor 목적으로 호출하지 않음. STATE.md frontmatter는 변경 없음. ledger 자체가 단일 진실 원천 — `listLedgers()`이 발견 채널.
  - 모든 단계 try/catch + stderr loud-fail-open (CLAUDE.md §3.4 "Loud fail-open principle"). hook은 NEVER throw — failure는 stderr `[mccp:session-ledger] WARNING: ... (allow)` 출력 + 정상 진행.
  - 기존 SessionStart inject 로직(STATE.md replay + sessions-tmp 매칭)은 손대지 않음 — additive only.
- **Mirror**: `session-start.js`의 기존 try/catch pattern.
- **Validate**: 수동 dogfood — 2개 worktree 열고 각각 새 Claude 세션 시작 → `~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/` 디렉토리에 2개 ledger 생성 확인. **F1 absorption dogfood**: fresh worktree에서 third Claude 세션 시작 → `listLedgers({activeOnly: true})`이 앞선 2개 active session을 surface하는지 확인 (cross-worktree discovery primitive 검증; M2는 이를 SessionStart hook이 직접 발화하지만 M1 단계에서는 API contract 자체는 검증).

### Task 4: SessionEnd hook이 ledger finalize

- **Action**: `plugins/mccp/scripts/hooks/session-end.js`에 `finalizeLedger({sessionId, endedAt: nowIso()})` 호출 추가. 같은 loud fail-open 패턴. resolveLedgerScope()를 내부에서 resolve해 모든 경로(global + repo if hybrid) finalize.
- **Mirror**: Task 3과 동일.
- **Validate**: 수동 dogfood — Claude 세션 종료 후 ledger의 `ended_at` 채워짐 확인. global path + (hybrid 시) repo path 양쪽 모두 finalize 확인.

### Task 5: v1.3.0 derive engine `sources/state.js` adapter 확장 (F3 absorption)

- **Action**: `plugins/mccp/scripts/derive/sources/state.js`의 `scanState`에 추가 로직:
  - 기존 STATE.md 읽기는 그대로.
  - **F3 absorption**: `session-ledger.listLedgers({activeOnly: true})` 호출 — scope-aware resolver 통해 default global ledger를 default 환경에서 자동 소비. hardcoded repo path 없음.
  - 각 ledger를 `item.active_session_ledgers: Array<{session_id, cwd, git_branch, created_at, host, pid, project_id}>`로 합성. derive surface 필드 이름은 Task 1 schema와 100% 일치 — `created_at`(NOT `started_at`), `git_branch`(NOT `branch`).
  - **F2 absorption**: `item.session_anchor`는 surface하지 않음 (STATE.md에 anchor 자체가 없음).
  - ledger read 실패 시 그 ledger만 skip + `degraded=true` (entire scan 차단 안 함 — 기존 fail-open contract 유지).
- **Mirror**: `derive/sources/state.js:1-48` (기존 scanState + degraded flag), `derive/sources/envelopes.js` (디렉토리 스캔 + per-file fail-open).
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/state-source.test.js` (신규 또는 확장) — (1) ledger 0건 → `active_session_ledgers: []`, (2) 1건 active + 1건 finalized → active만 surface, (3) 1건 corrupt JSON → 그 ledger skip + `degraded=true`, (4) **scope-aware test (F3)**: `MCCP_SESSION_LEDGER_SCOPE=global` env 설정 + 두 다른 worktree에서 ledger 생성 → derive가 같은 active list 반환, (5) **schema name contract**: `active_session_ledgers[0].created_at` exists + `started_at` does not exist (Task 1 producer schema와 같은 단어를 derive consumer가 surface 검증).

### Task 6: 문서

- **Action**: 3개 문서 작성/갱신:
  - `docs/v1.4.0-multi-session/session-ledger-schema.md` 신설. v1 schema + envelope 분리 사유 + discovery는 ledger 디렉토리 scan(STATE.md anchor 없음 — F2 absorption 사유 명시) + GC 정책(M1: 24h active TTL cutoff + 60일 finalized retention은 수동 정리; M2 backlog: heartbeat 기반 정확 reclaim).
  - `docs/v1.3.0-observability/schema-surface.md` 확장. §3에 STATE.md frontmatter 표 변경 없음 명시(F2 absorption 사유) + §6에 session-ledger 링크 + session-ledger.js public API 표면. v1.3.0 derive baseline ↔ v1.4.0 surface 안전 이전 경로 명시.
  - `docs/v1.4.0-multi-session/state-md-narrowing.md` 신설. STATE.md 자체는 schema-wise 변경 없고 *역할*이 narrow됨(이 worktree의 last_event summary + session 발견 위임)을 explainer + PRD §"Relation to prior PRDs" cross-link.
- **Mirror**: `docs/v1.3.0-observability/state-md-naming-reconciliation.md` (톤 + 표 + cross-link 패턴).
- **Validate**: 수동 review — schema-surface.md에 session-ledger schema가 §2.1 receipt 처럼 introducing version + strictness 표시되는지.

### Task 7: plugin.json + CHANGELOG + .gitignore bump

- **Action**:
  - `plugins/mccp/.claude-plugin/plugin.json` `version`: `1.4.0` → `1.5.0` (minor bump — 새 schema surface 도입). 결정 사유는 PR 본문에 명시. CLAUDE.md §3.7 "milestone PR 의무 체크리스트" 충족.
  - `CHANGELOG.md`에 새 row (v1.5.0-m1 — Multi-Session Continuity Primitive).
  - `.gitignore`에 `.claude/state/session-ledgers/` 추가 (repo opt-in scope에서도 accidental commit 방지).
- **Mirror**: PR #33 (v1.3.0-m1)의 chore commit. CLAUDE.md §3.7 hot-fix 절차.
- **Validate**: `node -e 'console.log(JSON.parse(require("fs").readFileSync("plugins/mccp/.claude-plugin/plugin.json")).version)'` → `1.5.0`. `grep -n session-ledgers .gitignore`.

## Validation

```bash
# Unit tests (M1 직접 모듈)
node --test plugins/mccp/scripts/state/tests/session-ledger.test.js
node --test plugins/mccp/scripts/derive/tests/state-source.test.js  # 또는 확장 위치

# 전체 derive 회귀 (M1 source.js 수정이 다른 source에 leak 없음 확인)
node --test plugins/mccp/scripts/derive/tests/

# 전체 state 회귀 (state-writer 무변경 confirm)
node --test plugins/mccp/scripts/state/tests/

# Derive end-to-end (active ledger 1+ 환경에서)
node plugins/mccp/scripts/derive/cli.js run --json | grep -i session

# STATUS.md renderer 무회귀 (v1.3.0-m3 surface)
node plugins/mccp/scripts/derive/cli.js render
# .claude/cache/STATUS.md에 active session 표시 안 됨을 확인 (M3 surface는 M1 변경 무시 — adapter 추가만)

# plugin.json check
node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json')).version)"

# Dogfood (수동, M1 metric 검증)
# 1) 2개 worktree 열어서 각각 새 Claude 세션 시작
# 2) ~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/ 에 ledger 2개 생성 확인 (default global, F1 absorption namespace)
# 3) 두 worktree에서 git status 확인 — STATE.md는 dirty가 아님(애초에 변경하지 않으므로 — F2 absorption)
# 4) 한 worktree에서 PR squash merge → main의 STATE.md가 다른 worktree의 작업 컨텍스트 손실 0건 확인
#    (ledger는 global path이고 STATE.md는 변경 없음 → PR diff에 ledger 안 들어감)
# 5) F1 absorption 검증: fresh 3rd worktree에서 새 Claude 세션 시작 → listLedgers({activeOnly:true})이 앞선 2개 active ledger 발견됨 (REPL로 검증)
#    (M2가 SessionStart hook으로 자동 surface하는 기반 contract 검증)
# 6) F4 partial absorption 검증: 25h 전 created_at + ended_at:null인 ledger는 activeOnly:true에서 제외됨 (unit test로 검증)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| STATE.md anchor 추가 시 hash-skip 분기와 dirty churn 사이 구조적 모순 (Codex Implement R1 F2) | Resolved | Anchor 자체를 도입하지 않음. discovery surface는 ledger 디렉토리 scan(`listLedgers()`) 단일화. STATE.md schema 변경 0 hunk. v0.3.6 axis 2 invariant 자동 유지. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Ledger namespace가 `observer-sessions.js` lease 파일과 path 충돌 (Codex Implement R1 F1) | Resolved | namespace를 `.session-ledgers/`로 격리(`.observer-sessions/` 재사용 안 함). schema collision 0건. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| derive가 global default ledger를 default 환경에서 못 읽음 (Codex Implement R1 F3) | Resolved | derive sources/state.js가 `listLedgers({activeOnly:true})` 호출 — scope-aware resolver가 default global path 자동 처리. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Crash-orphaned ledger가 영원히 active로 surface (Codex Implement R1 F4 partial) | Mitigated (M1) → Backlog (M2 heartbeat) | M1 ships TTL cutoff: `activeOnly:true` 필터가 `created_at`이 24h 전인 ledger를 자동 제외. crash-orphan은 최대 24h만 false-active. M2 ships heartbeat-based 정확 reclaim — `codex-findings-backlog.md`에 entry 추가. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| v1.3.0 derive engine + STATUS.md renderer + briefing stamp가 ledger surface 무시 | Low | derive `sources/state.js`는 본 plan Task 5에서 갱신. STATUS.md renderer는 `item.active_session_ledgers`를 surface하지 않음 — M3 dashboard 변경은 M2 plan 범위. briefing stamp는 receipt meta만 다룸 — 영향 없음. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Global ledger 경로 cross-repo contamination | Low → Mitigated | `computeProjectId(remote || cwd)` sha256 12-char namespace + projectDir 분리 → 다른 repo는 다른 projectId 디렉토리. M2에서 cross-repo discovery 정책 결정. |
| Storage scope env 변경 시 ledger split-brain | Medium | env 변경은 개발자 의도. `MCCP_SESSION_LEDGER_SCOPE=hybrid` 권장 → discovery는 union. session-ledger 문서에 명시. session-ledger.js에 env-change detect + stderr warn은 M2 후보. |
| Schema validation의 unknown key reject가 기존 사용자 ledger와 충돌 | None | v1 첫 출시 + 새 namespace. 마이그레이션 불요. |
| `CLAUDE_SESSION_ID` env 미설정 환경에서 ledger 생성 실패 | Low | `resolveSessionId` 빈 문자열 반환 시 silent skip. 기존 STATE.md만 보던 single-session 운영은 영향 없음. PRD §Users "CI 환경의 mccp" 예외 정합. |
| dispatch-controller 환경에서 worker session이 controller와 같은 SESSION_ID로 ledger 충돌 | Low | controller-spawned worker는 별도 Claude 프로세스 없이 Agent 도구 호출이므로 별도 `CLAUDE_SESSION_ID` 안 가짐. ledger는 controller session 하나만 생성 — 충돌 구조적으로 불가. |
| Repo-local opt-in 시 `.claude/state/session-ledgers/`가 git commit으로 leak | Mitigated | `.gitignore`에 `.claude/state/session-ledgers/` 추가. default global path는 `~/.local/share/` 라 git 영향 zero. |
| Producer/consumer schema name drift (Codex Plan R1 F3) — `created_at` vs `started_at` | Mitigated | Task 1 schema에 `created_at` 단일 canonical 명명 + contract test + Task 5 derive surface 동일 명명 사용. |
| M1 dogfood가 PRD#38↔#39 패턴 재발 없음을 *negative confirmation*으로만 검증해 false negative 가능 | High | M1 metric 자체가 정성 평가 (PRD 명시). M2(SessionStart hook이 다른 worktree의 active session을 명시적으로 표면화)가 positive confirmation 역할. M1 dogfood step 5(fresh 3rd worktree에서 listLedgers로 앞선 active 발견)가 *positive primitive 검증* — API contract 자체는 M1에서 입증. PR 본문에 명시. |

## Acceptance

- [ ] Task 1, 3, 4, 5, 6, 7 모두 complete (Task 2/2b는 F2 absorption으로 drop — STATE.md frontmatter 변경 없음)
- [ ] `node --test plugins/mccp/scripts/state/tests/` 모두 green (신규 + 기존)
- [ ] `node --test plugins/mccp/scripts/derive/tests/` 모두 green
- [ ] STATE.md schema 변경 0 hunk (F2 absorption — state_version 유지, frontmatter 미수정)
- [ ] envelope schema 변경 없음 (v1.2.0 envelope JSON_SCHEMA 그대로)
- [ ] Patterns mirrored, not reinvented (atomic write / advisory lock / session UUID resolve 모두 기존 모듈 재사용)
- [ ] `.gitignore`에 `.claude/state/session-ledgers/` 추가 (repo opt-in mode 안전망)
- [ ] session-ledger namespace = `.session-ledgers/` (NOT `.observer-sessions/` — Codex Implement R1 F1)
- [ ] session-ledger schema field 명명이 `created_at`로 통일 (Plan-Codex R1 F3) + producer→consumer contract test 통과
- [ ] storage scope default = `global` (`~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/`) — PRD 결정 정합
- [ ] derive sources/state.js가 `listLedgers()` scope-aware 호출 (Codex Implement R1 F3) — hardcoded repo path 0건
- [ ] `listLedgers({activeOnly:true})`에 24h TTL cutoff 적용 (Codex Implement R1 F4 partial) — crash-orphan 영구 active 차단
- [ ] `plugin.json` version `1.5.0` bump + CHANGELOG row
- [ ] 2개 worktree dogfood 수동 검증: ledger 2건 생성 + git status에 STATE.md 변경 없음 + PR squash merge가 다른 worktree 컨텍스트 0건 손실
- [ ] PR 본문에서 4 Open Questions 모든 결정 사유 명시 + PRD `Open Questions` 섹션 amend (M1 결정 lock-in)
- [ ] M2(SessionStart discovery + heartbeat 기반 정확 active filter) scope는 별도 plan으로 분리 명시 + `.claude/plans/codex-findings-backlog.md` entry 작성

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 fully resolved via plan body absorption; cap=1)
- 합치 결론: R1 verdict `needs-attention`. Plan이 PRD 결정과 storage trigger(`~/.claude` default + repo opt-in) + envelope schema 재사용 wording을 *뒤집어* 적었던 모순, STATE.md anchor를 semantic hash에 포함시켜 dirty churn으로 PR#38↔#39 시나리오 재현 가능성, ledger schema producer↔consumer field 명명 불일치 — 4건 finding 모두 plan body 수정(storage scope env 추가, `HASH_EXCLUDE_FRONTMATTER_KEYS` 확장, schema canonical 명명 `created_at` 단일화, derive surface 정합) + dogfood step 추가로 R1 내 absorption 완료. PRD 결정 라인과 plan 결정 라인을 단일 source of truth로 정합.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Repo-local ignored ledgers do not solve cross-worktree continuity | HIGH | ACCEPT_NOW | M1 metric(`continuity`) 정의 자체를 깨뜨림. global default(`~/.local/share/ecc-homunculus/projects/<projectId>/`)로 storage scope 결정 정정 + dogfood step 5(fresh 3rd worktree에서 listLedgers로 앞선 active 발견) 추가. |
  | F2 — STATE.md session anchors reintroduce volatile merge churn | HIGH | ACCEPT_NOW | `HASH_EXCLUDE_FRONTMATTER_KEYS`에 `session_id` + `session_ledger_path` 추가. v0.3.6 axis 2 invariant 유지 + git status 깨끗 유지 + last-write-wins 회피. Task 2 + Risks + Acceptance 3 곳 정합. |
  | F3 — Ledger schema inconsistent across producer and consumer | MEDIUM | ACCEPT_NOW | Implementation 시작 전 cheap fix. `created_at` 단일 canonical 명명 채택(envelope `worker_started_at` 별도 namespace 유지). Task 1 schema + Task 1.6 contract test + Task 5 derive surface 정합. |
  | F4 — Plan contradicts PRD's recorded storage and envelope decisions | HIGH | ACCEPT_NOW | PRD ↔ plan single source of truth 회복. storage = global default + repo opt-in (PRD 결정 그대로). envelope schema = helper code reuse + schema document 분리(사용자 결정 wording "envelope schema 재사용 + 새 session 레이어" 해석). Summary 결정 라인 정정 + Risks 모순 제거. |
- Deferred to backlog: 0 → 본 R1에서 모든 finding absorption 완료. `.claude/plans/codex-findings-backlog.md` 추가 entry 없음.
- Open Questions: 없음. PRD의 4 Open Questions는 본 plan에서 모두 답변(Summary 본문) — M1 lock-in. PR body에서 PRD `Open Questions` 섹션을 amend 예정.
- Codex session 참조: `019ede8d-1d40-7ac0-85d6-4e98cdaafa7d` (codex-invoke wrapper thread; durationMs=211994).

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; impeccable-available flag emitted)
- 라운드 수: 1 (R1 fully absorbed via plan body amendments; cap=1; verdict=needs-attention with 4 findings)
- 합치 결론: Codex가 3 HIGH + 1 MEDIUM finding을 추출 — 모두 plan body 재구성으로 absorb. F1 (storage namespace collision)은 `.session-ledgers/`로 격리, F2 (STATE.md anchor와 hash-skip 모순)는 anchor 자체를 도입하지 않고 ledger 디렉토리 scan으로 단일화 (Task 2/2b drop), F3 (derive hardcoded repo path)는 `listLedgers()` scope-aware 호출로 정합, F4 (crash-orphan ledger 영구 active)는 M1에서 24h TTL cutoff로 partial absorb + M2 heartbeat backlog. Plan body의 Summary/Files to Change/Tasks/Risks/Acceptance 5섹션 정합 amend 완료.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Ledger files collide with `.observer-sessions/<sessionId>.json` lease files | HIGH | ACCEPT_NOW | observer-sessions.js:124가 같은 path를 lease로 이미 사용 (`writeSessionLease`). schema 충돌 + 상호 덮어쓰기 위험. namespace를 `.session-ledgers/` subdir로 격리 — Task 1 + Files to Change + plan Summary 3 곳 동시 amend. |
  | F2 — STATE.md anchor 영구화와 git-clean이 hash-skip 분기에서 양립 불가 | HIGH | ACCEPT_NOW | state-writer.js:580-584 hash-match → skip-write 검증. HASH_EXCLUDE에 anchor 넣으면 hash 같아져서 write 자체 skip → anchor 비영구. 빼면 매 SessionStart마다 disk write → git dirty 재발. **architectural rethink**: STATE.md frontmatter anchor 자체를 도입하지 않음. Discovery는 ledger 디렉토리 scan 단일화. Task 2/2b 완전 drop. |
  | F3 — derive sources/state.js가 hardcoded repo path 스캔하면 global default ledger 미소비 | HIGH | ACCEPT_NOW | scope-aware `listLedgers()` 호출로 통일. Task 5 amend (derive 호출 패턴). global default가 default 환경에서 자동 소비되어 cross-worktree continuity 작동. |
  | F4 — `ended_at:null` only active 필터 + SessionEnd fail-open + pid audit-only → crash-orphan 영구 active | MEDIUM | ACCEPT_NOW (partial) + DEFER_TO_BACKLOG (heartbeat) | M1 absorb: `listLedgers({activeOnly:true, activeTtlMs=86_400_000})`이 `created_at`이 24h 이상 지난 ledger를 자동 제외 — crash-orphan은 최대 24h만 false-active. cheap 1-line fix. heartbeat 기반 정확 reclaim은 M2 plan으로 backlog (`.claude/plans/codex-findings-backlog.md` 추가). |
- Deferred to backlog: 1 (F4 heartbeat 부분) → `.claude/plans/codex-findings-backlog.md`에 entry 추가 예정.
- Open Questions: 없음. R1 안에서 모든 finding plan body 재구성으로 absorb 완료. M1 ship scope 명확화: ledger primitive만 (discovery/heartbeat는 M2).
- Codex session 참조: `019ede9f-1de7-70b2-b8b4-ece2583c53aa` (codex-invoke wrapper thread; durationMs=299599; classification=ok; impeccable-available flag honored — design/a11y findings 없음).

### Security Reviewer

> security-reviewer Skill 미가용 (mccp plugin 환경) — 본 변경은 user input/auth/crypto/secrets/SQL/SSRF 영역을 건드리지 않음 (session UUID는 이미 sanitize됨, ledger는 local fs JSON). 자동 fallback skip 적용. `SECURITY_SKIPPED_REASON="security-reviewer agent unavailable in mccp plugin runtime; M1 changes touch no auth/crypto/secrets/input-validation surfaces"`.

### Design Review

> impeccable Skill probe 통과 + Codex wrapper에 `--impeccable-available` flag emit됨 → Codex가 design scope (visual/color/typography/spacing/animation) finding을 배출하지 않음. 본 변경은 UI 표면 0건 (backend continuity primitive) — design surface 신호 0. signal=0이므로 impeccable Skill 직접 호출 sub-step skip.
