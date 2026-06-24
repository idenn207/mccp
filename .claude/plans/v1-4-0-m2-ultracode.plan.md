# Plan: v1.4.0 axis B — `ultracode` keyword + `/effort ultracode` → `/mccp:prp-implement` integration

**Source PRD**: `.claude/prds/v1-4-0-automation-modernization.prd.md`
**Selected Milestone**: M2 — axis B (ultracode → prp-implement)
**Complexity**: Medium → Large (mechanical isolation lock 신설 + native spec uncertainty)

## Summary

`/mccp:prp-implement`가 Phase 3 EXECUTE의 per-task loop 진입 직전마다 plan task body에 marker(`**Effort**: ultracode` 한 줄 — task의 다른 필드 톤과 정합)가 있는지 mode-aware probe로 검출하고, **availability tri-state(`available | missing | unknown`)** 평가 결과가 `available`(=env-confirmed)일 때만 사용자에게 `/effort ultracode` 모드로 다음 turn 진입을 안내한다. 사용자는 dedicated response grammar(`ultracode-done:<summary>` / `ultracode-failed:<reason>` / `ultracode-skipped:<reason>`)로 답하고, **lock 활성 동안 mccp의 모든 write(Edit/Write/receipt/STATE.md/fix-task)는 mechanical block 된다**. **isolation은 hybrid 2-layer**: (1) primary mechanical — `ultracode-phase-lock.js` enter/exit + PreToolUse hook(`ultracode-phase-guard.js`)이 lock 활성 중 mccp의 write tool + receipt CLI를 차단 (`pr-phase-lock.js` v0.2.8 hardening 패턴 mirror — token authority split + stdin-pipe IPC + host-aware tri-state reclaim), (2) secondary cooperative — 안내 prompt에 "ultracode 모드 안에서 mccp:* 명령 호출 금지" 명시(audit warning + 사용자 인지 강화 — mechanical layer가 잡지 못하는 turn-internal Claude 결정에 대비). **chain-of-custody anchoring은 mechanical**: prp-implement Phase 5 REPORT 단계에서 `ultracode-done:<summary>` / `failed:` / `skipped:` 응답 본문을 implementation report `.claude/PRPs/reports/<plan>-report.md`의 `## Ultracode Delegations` 섹션에 inject, 그 결과 (task index + verdict + summary content)를 plan body 신규 섹션 `## Ultracode Delegation Provenance`에 sha256 digest + ISO timestamp + task index stamp 한다. 이 plan body 자체는 implement-codex receipt의 plan_hash로 anchored — 위임 결과 변조 시 다음 implement-codex validate가 재호출되면 mismatch detect. native `/effort ultracode` 자체는 mccp 내부에서 호출하지 않는다(PRD Principle invariant 위반). probe + injection 양축은 axis A의 `deep-research-detect.js` / `## References` inject과 동일한 mechanic을 mirror하며, isolation lock 양축은 `pr-phase-lock.js` 패턴을 mirror한다. **M2는 integration template doc §5 matrix axis B 셀에 option (b) plan-body provenance hash 채택 + §9 audit checklist에 "isolation lock layer" 신규 항목 추가로 통합 패턴을 확장한다 — 단 cross-axis invariant 잠금은 회피(`M1+M2-validated` mark, M3 ship 전까지 두 axis 표본만 검증).**

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Mode-aware detection probe (tristate availability + AND-gated signal + path-traversal guard) | `plugins/mccp/scripts/lib/deep-research-detect.js` (M1 ship) + integration template §3 probe shape | 동일 JSON shape `{ availability:"available"\|"missing"\|"unknown", ultracode_signal, signal_tasks, mode, reason }`; env override `MCCP_ULTRACODE_FEATURE=available\|missing\|unknown`; reason enum ∈ {ok, command-missing, no-signal, path-traversal, unknown-default, mode-mismatch}; default availability=`unknown` (phantom 안내 금지). M1과 다른 부분: PRD body가 아닌 **plan body** parsing; AND-gated 휴리스틱이 아닌 **정확한 marker 정규식** 검출 (false-positive 방지가 명시적) |
| Marker syntax (task body field) | M1 plan task 본문의 `- **Action**` / `- **Mirror**` / `- **Validate**` field 패턴 | task body 안에 단일 줄 `- **Effort**: ultracode`. 정규식 `^\s*-\s+\*\*Effort\*\*:\s*ultracode\s*$` (단어 경계 strict; trailing space tolerant). Effort 필드가 없거나 다른 값(`standard`, future tier)이면 silent skip. M1 plan + 기존 plan들은 Effort 필드를 안 가지므로 backward-compatible |
| Cooperative guide turn (dedicated grammar separated from prior phases) | `plugins/mccp/commands/plan-prd.md` Phase 2.5 (M1 ship: `paste:` / `skip-research:` / `failed-research:`) | 응답 grammar `ultracode-done:<one-line summary, ≥3 words required>` / `ultracode-failed:<one-line reason>` / `ultracode-skipped:<one-line reason>` 3종. Phase 0 `skip` / `you decide` 토큰과 분리, M1 Phase 2.5 `paste:` 토큰과도 분리. summary `<3 words`이면 grammar mismatch로 prompt 재출력 (audit-trail 정보량 보장) |
| Mechanical isolation lock (token authority split + host-aware tri-state reclaim) | `plugins/mccp/scripts/lib/pr-phase-lock.js` (v0.2.8 hardened, Task 2.6.1-followup F11+F10) | `ultracode-phase-lock.js` enter/exit/heartbeat/detect-stale CLI. lock file `.claude/state/ultracode-phase.lock`. `ownership_token_hash` (sha256 of `crypto.randomUUID()`) + stdin-pipe IPC (raw token via stdin only) + lease(60s default) + heartbeat. reclaim 정책: same-host+pid-alive=NEVER reclaim / same-host+pid-dead=reclaim / cross-host=mtime-only / 0-byte+unparseable=mtime-only. cmdExit/cmdHeartbeat require token + mismatch=exit 16/15 + no unlink. cmdDetectStale never takes token |
| Lock-aware PreToolUse hook (default-deny on writes when lock active) | `plugins/mccp/scripts/hooks/pr-phase-guard.js` | `ultracode-phase-guard.js` PreToolUse hook — lock 활성 중 deny: Edit/Write/NotebookEdit + Bash `node .../receipt/cli.js write` + Bash `.claude/state/` write + Skill `mccp:*` 호출. allow: Read/Grep/Glob + ToolSearch + Bash `git status/diff/log` + Bash `node .../ultracode-phase-lock.js exit\|heartbeat\|read`. lock file parse error → systemMessage emit + ALLOW (CLAUDE.md `feedback-loud-fail-open` mirror) |
| Section append into artifact body (idempotent re-run) | M1 `plan-prd.md` Phase 4.0b (`## References`) + `plan.md` Phase 4 (`## External Research Provenance`) | implementation report에 `## Ultracode Delegations` section append (idempotent — 기존 섹션 통째 replace); plan body에 `## Ultracode Delegation Provenance` 신규 section (per-task: index + name + verdict + sha256 hex + ISO timestamp) |
| Plan-body provenance hash anchor (custody anchor option (b), template §5) | M1 `plan.md` Phase 4 provenance stamping + `docs/automation-modernization/integration-template.md` §5 option (b) | implement-codex receipt의 plan_hash가 plan body 전체를 mechanical anchor. `## Ultracode Delegation Provenance` mutation 시 다음 implement-codex validate에서 plan_hash mismatch 발견. real-time은 아니지만 mutable artifact의 audit trail 보존 (template §5 option (b) — axis A와 동일 선택, 단 axis-specific 평가 명시) |
| Node test fixtures (tmp dir + spawnSync stdin/stdout + false-positive fixture) | `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` (M1) + (있다면) `pr-phase-lock.test.js` | node:test + os.tmpdir() + child_process.spawnSync stdin/stdout pipe + 기존 plan(M1 completed)을 false-positive fixture로 사용. lock test는 concurrent enter race + stale reclaim + cross-host policy + token mismatch 시나리오 |
| Receipt schema invariant (no new fields) | M1 plan body + integration template §5 (option (c) rejected) | M2도 receipt schema 손대지 않음 — custody anchor는 plan body 내부 + 기존 implement-codex plan_hash 메커니즘. PRD Success Metric 2(receipt chain custody) 보존 |
| Plugin hook 등록 (PreToolUse 병렬 등록) | `plugins/mccp/.claude-plugin/plugin.json` 기존 hooks 항목 | `ultracode-phase-guard.js`를 PreToolUse hook으로 추가 — pr-phase-guard와 병렬 등록 (둘 다 PreToolUse — Claude Code hook engine은 모든 hook을 호출하고 첫 deny가 차단). version 필드 bump은 PR ship 시점 main HEAD 기준 결정 (CLAUDE.md §3.7, PRD risk #7) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/ultracode-detect.js` | CREATE | mode-aware probe (`implement` only for M2) — tristate availability + 정확한 marker 정규식 검출 + path-traversal guard. CLI `detect --mode implement --plan <path> --json` |
| `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` | CREATE | deep-research-detect.test.js mirror — 8 시나리오 (env override 3개 + marker present/absent + multiple-marker + path-traversal + mode-mismatch + edge case for narrow regex) |
| `plugins/mccp/scripts/lib/ultracode-phase-lock.js` | CREATE | pr-phase-lock.js mirror — enter/exit/heartbeat/detect-stale CLI. token authority split + stdin-pipe IPC + host-aware tri-state reclaim. lock file `.claude/state/ultracode-phase.lock` |
| `plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js` | CREATE | lock lifecycle + concurrent enter (race) + token mismatch + stale reclaim (3 host policy) + 0-byte/unparseable fallback (8+ 시나리오) |
| `plugins/mccp/scripts/hooks/ultracode-phase-guard.js` | CREATE | PreToolUse hook — lock 활성 중 mccp write 차단. allow/deny matrix. lock parse error → ALLOW + systemMessage(loud fail-open) |
| `plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js` | CREATE | hook PreToolUse contract test — lock 비활성/활성 × tool 종류 매트릭스 (10+ 시나리오) |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 3 EXECUTE의 per-task loop 직전에 sub-phase 3.5 ULTRACODE_DELEGATE 추가 (DETECT → LOCK ENTER → GUIDE PROMPT → WAIT → LOCK EXIT → INJECT QUEUE). Phase 3 종료 직후 PROVENANCE STAMP. Phase 5 REPORT에 `## Ultracode Delegations` section 자동 inject. Phase 6 OUTPUT에 ultracode delegation count + verdict 분포 1줄 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `hooks.PreToolUse` 목록에 `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ultracode-phase-guard.js` 추가. version 필드는 PR ship 시점 main HEAD 기준 결정 (변경 안 함 — Task 11 issue) |
| `docs/automation-modernization/integration-template.md` | UPDATE | §5 matrix axis B 셀 채움 (option (b) 채택 + isolation lock layer rationale) + §8 M2 placeholder → reference 전환 + §9 audit checklist에 "Isolation lock mechanism (if axis dispatches work to user-mode native command)" 항목 추가 + status mark `M1-experimental` → `M1+M2-validated` (cross-axis invariant 잠금 회피 명시) |
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | UPDATE | M1 row status `in-progress → complete` (M1 ship 후 housekeeping 누락 fix — STATE.md drift 패턴 mirror), M2 row status `pending → in-progress` + Plan 셀 본 plan 경로. M3/M4 row 손대지 않음 |
| `CHANGELOG.md` | UPDATE | v1.4.0 row에 axis B 항목 추가 (또는 신규 row — version 결정 시점에 따라). content: marker probe + cooperative guide + mechanical isolation lock + report/plan inject + provenance hash anchor 요약 |

**Out of file changes (this milestone only)**:
- receipt schema (`plugins/mccp/scripts/receipt/schemas/*.json`) 무수정 — invariant.
- STATE.md frontmatter / envelope schema 무수정.
- `impeccable-detect.js` / `deep-research-detect.js` / `pr-phase-lock.js` / `pr-phase-guard.js` 무수정 — backward-compatible neighbor.
- `plugin.json` `version` 필드 값은 PR ship 시점 main HEAD 기준 결정 (axis A와 동일 정책, CLAUDE.md §3.7 hot-fix 절차).

## Tasks

### Task 1: WebFetch로 `/effort ultracode` native spec 재확인 (PRD risk #1 mitigation — implementation 시작 전 mandatory)

- **Action**: implementation 진입 직전 (또는 plan ship 직전) Anthropic 공식 docs를 WebFetch — Claude Code v2.1.139+ ~ v2.1.160 ship된 `/effort ultracode` mode + `ultracode` keyword의 정확한 invocation 방식, workflow agent isolation semantics(mccp의 mechanical lock과 충돌 여부), `/effort` 변형 keyword(`ultraplan` 등)의 존재 확인. 결과를 plan body 끝에 `<!-- ultracode native spec confirmed at <ISO>: <one-line summary, optional revision note> -->` HTML comment로 stamp (plan body 변경 → implement-codex plan_hash 갱신 → audit trail mechanical). spec이 본 plan의 가정과 차이가 있다면, 즉시 ABORT + plan 갱신 round. 특히 (a) marker syntax (`Effort: ultracode`가 native semantics와 충돌하는지), (b) workflow agent가 별도 process를 spawn하는지(=lock의 PID 추적 부족 가능), (c) ultracode 모드 진입/종료 시 hook 호출 가능 여부 확인.
- **Mirror**: PRD risk #1 mitigation pattern — milestone 시작 전 spec 재확인 mandatory + integration template §9 audit checklist (M2가 추가하기 전부터 implicit best practice)
- **Validate**: plan body 끝에 `<!-- ultracode native spec confirmed at` 줄이 있고, 그 줄에 ISO timestamp + 1-line confirmation 또는 plan revision note가 있음. revision이 필요했다면 Task 2-12 갱신 사항이 plan body에 명시되어 있음.

### Task 2: `ultracode-detect.js` probe library (marker 정확 정규식 + tristate availability)

- **Action**: `plugins/mccp/scripts/lib/ultracode-detect.js`를 신규 작성. exports `detect({ mode, plan, repoRoot, ... }) → { availability, ultracode_signal, signal_tasks, mode, reason }`. CLI: `detect --mode implement --plan <path> --json`. 입력은 `--plan <path>` 또는 `--stdin` (plan body raw — backward용 — M2 본문에서는 `--plan`만 사용). probe:
  - env override `MCCP_ULTRACODE_FEATURE=available|missing|unknown` (1순위)
  - filesystem probe: best-effort (Anthropic native command이므로 manifest 없음. `~/.claude/commands/effort.md` 또는 비슷한 signature 존재 → `available`. 명백한 부재 신호 없음 → default `unknown`. M1 deep-research-detect.js와 동일 default policy)
  - default = `unknown` (phantom 안내 금지)
  - marker parsing: plan body를 `\r?\n`으로 split → 정규식 `^\s*-\s+\*\*Effort\*\*:\s*ultracode\s*$` 매칭. matching line이 속한 task heading(가장 가까운 위에 있는 `^### Task \d+:\s+(.+)$`)을 capture. signal_tasks에 `{ index: <N>, name: <heading-text>, line: <line-no> }` push. signal_tasks 길이 > 0 → `ultracode_signal=true`.
  - path traversal guard: `--plan` 경로가 `repoRoot` 안인지 `path-containment.js` 또는 inline `path.resolve` 비교로 검증. traversal 시 `reason=path-traversal` + `ultracode_signal=false` + exit 0.
  - mode-mismatch: mode가 `implement` 외(`prd`/`plan`/`pr`/`review`) → `reason=mode-mismatch` + `ultracode_signal=false` + exit 0.
- **Mirror**: `deep-research-detect.js` shape + classification enum + path traversal guard + env override 1순위 (M1 ship). 차이점: PRD body parsing(M1)이 아닌 **plan body** parsing; AND-gated 휴리스틱(M1)이 아닌 **정확한 marker 정규식** (false-positive 0)
- **Validate**: (a) `node plugins/mccp/scripts/lib/ultracode-detect.js detect --mode implement --plan .claude/PRPs/plans/completed/v1-4-0-m1-deep-research.plan.md --json` → `ultracode_signal=false` + `signal_tasks=[]` (M1 plan에 Effort marker 없음 — false-positive fixture); (b) marker가 있는 fixture file → `ultracode_signal=true` + signal_tasks 길이 ≥ 1 + 각 entry에 index/name/line; (c) `MCCP_ULTRACODE_FEATURE=missing` → `availability=missing`; (d) traversal 시 exit 0 + `reason=path-traversal`.

### Task 3: `ultracode-detect.test.js` node test fixtures (marker 정확성 + false-positive + traversal)

- **Action**: `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js`를 신규 작성. 다음 10 시나리오 커버 —
  1. env override `available` / `missing` / `unknown` 3 path 각각
  2. plan body에 marker 없음 (fixture = `.claude/PRPs/plans/completed/v1-4-0-m1-deep-research.plan.md` 직접 read) → `ultracode_signal=false` + `signal_tasks=[]`
  3. plan body에 단일 marker (test-temp file with `- **Effort**: ultracode` in Task 1 body) → `ultracode_signal=true` + signal_tasks 길이 1 + index=1
  4. plan body에 multiple marker (Task 1 + Task 3 body 각각) → signal_tasks 길이 2 + 정확한 index
  5. marker 정규식 boundary: `**effort**: ultracode` (소문자) → match 안 됨 (case-sensitive intentional); `Effort: ultracode` (asterisks 없음) → match 안 됨; `- **Effort**: ultracode  ` (trailing space) → match
  6. marker가 task heading 위에 있는 stray line (code block 안에 있는 등) → 가장 가까운 위 task heading을 capture (구현 결정: heading 미발견 시 silent skip + warning trace)
  7. `--plan` 경로 traversal (`../../etc/passwd`, absolute path outside repoRoot 등) → `reason=path-traversal` + exit 0
  8. mode=prd/plan/pr/review 시 mode-mismatch → exit 0 + `reason=mode-mismatch`
  9. 환경 변수와 CLI flag 동시 지정 시 env override 1순위
  10. plan file이 존재 안 함 → `reason=plan-missing` + exit 0 (loud fail-open)
- **Mirror**: `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` 의 fixture/setup/teardown + tmp dir pattern
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` → 10/10 통과 + tap output에 fail/skip 없음. regression sweep `node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` 통과.

### Task 4: `ultracode-phase-lock.js` isolation lock CLI (pr-phase-lock.js v0.2.8 hardening mirror)

- **Action**: `plugins/mccp/scripts/lib/ultracode-phase-lock.js`를 신규 작성. lock file: `<repoRoot>/.claude/state/ultracode-phase.lock`. Subcommands (pr-phase-lock.js와 1:1 mirror):
  - `enter --run-id <uuid> [--pid <int>] [--task-index <N>]` — `fs.openSync(p, 'wx')` exclusive create (TOCTOU 회피). lockBody = `{ ownership_token_hash: <sha256 of crypto.randomUUID()>, pid, host: os.hostname(), started_at: <ISO>, mtime: <Date.now()>, task_index: <N> }`. stdout: raw ownership_token (caller가 shell var에 stash → exit/heartbeat에 stdin-pipe로 전달). 이미 lock 있을 시: stderr `lock already held` + exit 11.
  - `exit --run-id <uuid> [--cwd <path>]` — stdin pipe로 raw ownership_token 받음, sha256 재계산 → lock body의 `ownership_token_hash`와 비교. match 시 `fs.unlinkSync(lockPath)`. mismatch/missing/token absent = exit 16 + stderr warn, **NO unlink**.
  - `heartbeat --run-id <uuid> [--cwd <path>]` — stdin pipe token, hash match 시 `fs.utimesSync(lockPath, now, now)`로 mtime 갱신. mismatch = exit 15 + stderr warn, no utimes.
  - `detect-stale [--max-age-ms <ms>] [--cwd <path>]` — never takes token. lock body 읽고 host-aware tri-state policy:
    - same-host(=`os.hostname()` 일치) + pid alive(`process.kill(pid, 0)` 성공) → NEVER reclaim (heartbeat 보호)
    - same-host + pid dead → reclaim (orphan)
    - cross-host → mtime-only (foreign PID 의미 없음)
    - 0-byte / JSON parse error / missing required field → mtime-only fallback (no owner to verify)
    - mtime-only: `Date.now() - mtime > max-age-ms (default 60000)` → reclaim
  - `read [--cwd <path>]` — JSON dump (debugging only)
- **Mirror**: `pr-phase-lock.js:1-80` (CLI subcommands + lifecycle). v0.2.8 hardening 패턴 (Task 2.6.1-followup F11 token authority + F10 helper_manifest + R3-F2 stdin-pipe) 전부 mirror. M2는 별도 lock file (`ultracode-phase.lock`)이므로 namespace 충돌 0 — pr-phase-lock과 병행 운용 가능.
- **Validate**: (a) `node plugins/mccp/scripts/lib/ultracode-phase-lock.js enter --run-id $(uuidgen) --pid $$ --task-index 1` → lock 생성 + stdout raw token; (b) 같은 run-id로 두 번째 enter → exit 11; (c) raw token stdin pipe로 exit → unlink + exit 0; (d) wrong token으로 exit → exit 16 + lock 잔존; (e) sleep 70 + detect-stale → reclaim (60s mtime 초과); (f) lock body 수동 변조 (host="other") + detect-stale → cross-host mtime-only.

### Task 5: `ultracode-phase-lock.test.js` node test (lifecycle + race + 3-state policy + token boundary)

- **Action**: `plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js`를 신규 작성. 다음 시나리오 커버 —
  1. enter → exit normal flow (raw token round-trip via stdin pipe)
  2. concurrent enter — 두 spawnSync가 동시에 enter → 단일 winner + loser는 exit 11 (EEXIST)
  3. wrong ownership_token으로 exit → exit 16 + lock file 잔존 검증
  4. heartbeat — token match → mtime 갱신 검증 / token mismatch → exit 15 + mtime 무변경
  5. detect-stale same-host + pid alive → NEVER reclaim (heartbeat 보호 가정)
  6. detect-stale same-host + pid dead (test 종료된 pid 사용) → reclaim
  7. detect-stale cross-host (host field 수동 변조: `host: "other.example"`) → mtime-only (60s 미만 → 보호, 초과 → reclaim 두 케이스)
  8. detect-stale 0-byte lock body → mtime-only fallback
  9. detect-stale JSON parse error lock body → mtime-only fallback
  10. detect-stale missing required field (ownership_token_hash 부재) → mtime-only fallback
  11. enter --task-index N → lock body에 task_index field 포함 검증 (read subcommand로 확인)
- **Mirror**: pr-phase-lock의 test 파일이 있으면 그 패턴; 없으면 deep-research-detect.test.js fixture pattern + `child_process.spawnSync` stdin/stdout pipe pattern
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js` → 11/11 통과.

### Task 6: `ultracode-phase-guard.js` PreToolUse hook (lock active 시 write deny + loud fail-open)

- **Action**: `plugins/mccp/scripts/hooks/ultracode-phase-guard.js`를 신규 작성. PreToolUse hook contract — Claude Code hook stdin payload(`{ tool_name, tool_input, ... }`) 받음, `<repoRoot>/.claude/state/ultracode-phase.lock` 읽고 lock 활성 여부 판단. 활성 시:
  - **deny matrix**:
    - `Edit`, `Write`, `NotebookEdit` → deny + reason "ultracode 모드 격리 중 — mccp file change 금지"
    - `Bash` tool: command 정규식 매칭 —
      - `node\s+[^|;&]*receipt/cli\.js\s+write` → deny (receipt write 차단)
      - `node\s+[^|;&]*state-writer` → deny (STATE.md write 차단)
      - `(>|>>)\s*\.claude/state/` → deny (shell redirect로 state write 차단)
      - `node\s+[^|;&]*fix-task` → deny (fix-task write 차단)
    - `Skill` tool: skill_name이 `mccp:*` 패턴 → deny (mccp 명령 호출 차단)
  - **allow matrix**:
    - `Read`, `Grep`, `Glob`, `ToolSearch` → allow (read-only)
    - `Bash`: `git\s+(status|diff|log|show|rev-parse|branch|worktree\s+list)` → allow (git read)
    - `Bash`: `node\s+[^|;&]*ultracode-phase-lock\.js\s+(exit|heartbeat|read|detect-stale)` → allow (lock CLI)
    - 그 외 Bash → deny (default-deny)
  - **fail-open 정책**: lock file이 없거나, `JSON.parse` 실패, 또는 expected field 부재 시 — hook은 stderr에 systemMessage로 1줄 trace `[mccp-ultracode-guard] lock parse failed: <reason> — fail-open ALLOW (loud)` 출력 + ALLOW (CLAUDE.md `feedback-loud-fail-open` mirror).
  - **hook trace**: deny/allow 결정을 `.claude/state/hook-trace/<session_id>/ultracode-guard.jsonl`에 append (optional — pr-phase-guard와 같은 패턴이면 mirror).
- **Mirror**: `pr-phase-guard.js` PreToolUse contract + allow/deny matrix + hook trace pattern. M2는 별도 lock file이므로 독립 hook 등록 — pr-phase-guard와 병렬로 PreToolUse hook chain에 들어감.
- **Validate**: hook contract test (Task 7) + dry-run mock으로 (a) lock 비활성 → Edit allow + Bash allow, (b) lock 활성 → Edit deny + receipt write deny + git diff allow + ultracode-phase-lock exit allow, (c) lock file 손상 → systemMessage emit + ALLOW.

### Task 7: `ultracode-phase-guard.test.js` hook contract test

- **Action**: `plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js`를 신규 작성. PreToolUse hook payload mock + lock state mock + assertions:
  1. lock 비활성 + Edit tool → ALLOW
  2. lock 활성 + Edit tool → DENY + deny reason 포함 "ultracode 모드 격리"
  3. lock 활성 + Read tool → ALLOW
  4. lock 활성 + Bash `git diff` → ALLOW
  5. lock 활성 + Bash `git commit -m "x"` → DENY (git write)
  6. lock 활성 + Bash `node plugins/mccp/scripts/receipt/cli.js write ...` → DENY
  7. lock 활성 + Bash `node plugins/mccp/scripts/lib/ultracode-phase-lock.js exit ...` → ALLOW
  8. lock 활성 + Skill `mccp:plan` → DENY
  9. lock 활성 + Skill `impeccable` → ALLOW (non-mccp skill)
  10. lock file missing → ALLOW (no lock to enforce)
  11. lock file invalid JSON → ALLOW + systemMessage(loud fail-open) emit 검증
  12. lock file zero-byte → ALLOW + systemMessage 검증
- **Mirror**: pr-phase-guard test가 있으면 패턴 그대로; 없으면 node:test + mock stdin/stdout pattern
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js` → 12/12 통과.

### Task 8: `plugin.json` PreToolUse hook 등록

- **Action**: `plugins/mccp/.claude-plugin/plugin.json`의 `hooks.PreToolUse` 배열에 `ultracode-phase-guard.js`를 추가 (pr-phase-guard와 병렬 등록 — Claude Code hook engine은 PreToolUse 배열을 순회하며 모든 hook을 호출, 첫 deny가 차단; 같은 tool에 대해 두 hook이 모두 ALLOW일 때만 통과). 기존 PreToolUse hook entry 형식 mirror (어떤 형식인지는 plugin.json 직접 확인 후 결정 — string array 또는 object array). `version` 필드는 변경 안 함 — Task 11 issue (PR ship 시점 main HEAD 기준). `description` / `keywords` 필드도 변경 안 함.
- **Mirror**: 기존 plugin.json `hooks` 항목 구조
- **Validate**: `node -e "const m=require('./plugins/mccp/.claude-plugin/plugin.json'); const arr=(m.hooks||{}).PreToolUse||[]; const ok=arr.some(h=>String(JSON.stringify(h)).includes('ultracode-phase-guard')); console.log(ok?'ok':'FAIL'); process.exit(ok?0:1)"`; `node -e "JSON.parse(require('fs').readFileSync('./plugins/mccp/.claude-plugin/plugin.json','utf8'))"` (JSON 문법 유효성).

### Task 9: `prp-implement.md` Phase 3 ULTRACODE_DELEGATE sub-phase 명세

- **Action**: `plugins/mccp/commands/prp-implement.md`의 Phase 3 EXECUTE 본문을 갱신. per-task loop의 각 task 진입 직전에 sub-phase 3.5 ULTRACODE_DELEGATE 추가:
  1. **3.5.0 DETECT**: 매 task 진입 직전에 `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-detect.js detect --mode implement --plan "$ARGUMENTS" --json` 호출. 결과 `signal_tasks`에 현재 task index 포함 여부 검사.
  2. **3.5.1 분기 매트릭스(2축, integration template §4 mirror)**:
     | availability | current task in signal_tasks | Action |
     |---|---|---|
     | `available` | 포함 | sub-phase 3.5.2 진입 |
     | `unknown` 또는 `missing` | * | silent skip — 기존 Phase 3 본문 진행 (phantom 안내 금지) |
     | `available` | 미포함 | silent skip |
  3. **3.5.2 LOCK ENTER**: `RUN_ID=$(uuidgen); OWNERSHIP_TOKEN=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js enter --run-id $RUN_ID --pid $$ --task-index <N>)`. 실패(exit 11 = 이미 lock 있음) 시 stale detect-stale 호출 → reclaim 가능하면 reclaim 후 재시도 1회, 여전히 실패 시 `[MCCP-GATE-STOP] ultracode lock 진입 실패 (이미 점유 중)` 출력 + end response.
  4. **3.5.3 GUIDE PROMPT**: 다음 메시지를 사용자에게 emit (Korean primary, terminology 유지):
     ```
     Task <N> '<name>' 본문에 ultracode 위임 marker가 있습니다.

     다음 turn에서 '/effort ultracode' 모드로 진입한 뒤 이 task를 처리해 주세요.
     완료 후 mccp 세션으로 돌아와 다음 response grammar 중 하나로 답해 주세요:

       ultracode-done: <≥3 단어 one-line summary of changes>
       ultracode-failed: <one-line reason — attempted but did not complete>
       ultracode-skipped: <one-line reason — intentionally not delegated>

     ── 격리 invariant (mechanical + cooperative) ──
     - lock 활성 동안 mccp는 file change / receipt write / mccp:* 명령을 거부합니다 (PreToolUse hook).
     - ultracode 모드 안에서 mccp:* 명령을 호출하지 마세요 — audit chain이 깨집니다.
     - lock crash 잔존 시 60s 후 자동 reclaim (host-aware policy).

     다른 token / 짧은 summary로 응답하면 prompt가 재출력됩니다.
     ```
  5. **3.5.4 WAIT**: 사용자 응답 검증. 정규식:
     - `^ultracode-done:\s+(\S+\s+\S+\s+\S+.*)$` (summary ≥ 3 words)
     - `^ultracode-failed:\s+(.+)$`
     - `^ultracode-skipped:\s+(.+)$`
     미부합 시 prompt 재출력, auto-answer 금지. (Phase 0 `skip` / `you decide`, M1 Phase 2.5 `paste:` / `skip-research:` / `failed-research:` 와 명시적으로 분리됨.)
  6. **3.5.5 LOCK EXIT**: 응답 수신 직후 `echo $OWNERSHIP_TOKEN | node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js exit --run-id $RUN_ID` (stdin pipe). exit code ≠ 0 시 stderr trace 출력 + 진행 (lock은 reclaim으로 회수).
  7. **3.5.6 QUEUE PUSH**: 응답 verdict + summary + task_index + ISO timestamp를 in-memory delegation queue에 push (Phase 5 REPORT에서 inject용). `failed:` / `skipped:` verdict도 queue에 push (audit trail 보존).
  8. **3.5.7 SKIP IMPLEMENTATION**: 현재 task의 Phase 3 본문(Read MIRROR → Implement → Validate)을 **skip** — ultracode가 처리 완료. log `[ultracode-delegated] Task <N>: <verdict>` 출력. 다음 task로 진행.
  9. **PROVENANCE STAMP (Phase 3 종료 직후)**: per-task loop 종료 후 delegation queue가 비어있지 않으면 plan body 끝에 `## Ultracode Delegation Provenance` section append (idempotent — 기존 섹션 통째 replace):
     ```markdown
     ## Ultracode Delegation Provenance

     <!-- Auto-injected by /mccp:prp-implement Phase 3.5 at <ISO> -->

     - Task <N> '<name>': verdict=<done|failed|skipped> | sha256(summary) = <hex> | stamped at <ISO>
     - Task <M> '<name>': verdict=... | sha256 = ... | stamped at <ISO>
     ```
     sha256 input은 `<verdict>:<summary>` 문자열. plan body 변경 → 다음 implement-codex receipt-write가 plan_hash 재계산.
  10. **Phase 5 REPORT inject**: implementation report에 신규 section `## Ultracode Delegations` 추가 (idempotent). per-delegation: task index + name + verdict + summary 본문 + ISO timestamp.
  11. **Phase 6 OUTPUT**: 기존 출력에 `Ultracode Delegations: <total> (done=<N> failed=<M> skipped=<K>)` 한 줄 추가.
- **Mirror**: M1 `plan-prd.md` Phase 2.5 (cooperative guide turn + dedicated grammar + WAIT) + Phase 0 CO-CREATION (mechanism은 mirror하되 grammar 분리) + M1 `plan.md` Phase 4 provenance hash + `plan-prd.md` Phase 4.0b section append idempotence. M1과 다른 부분: per-task loop 안에서 반복 실행 (M1은 PRD 작성 1회) + mechanical isolation lock 추가 (M1은 lock 없음) + queue-based 누적 (M1은 단일 응답).
- **Validate**: dry-run (manual dogfood, 별도 cycle):
  - (a) plan에 marker 없음 → 모든 task 정상 Phase 3 흐름 진행, plan body에 provenance section 미생성, report에 `## Ultracode Delegations` 미생성, Phase 6 출력에 ultracode line 미포함
  - (b) plan에 marker 1개 (Task N) → DETECT trigger + LOCK ENTER stdout token → GUIDE prompt 출력 → WAIT
  - (c) `ultracode-done: refactored logger module to async stream` 응답 → LOCK EXIT + queue push + 다음 task 정상 진행 → Phase 3 종료 후 provenance section + report section 생성 + Phase 6 line 포함
  - (d) `ultracode-failed: type checker hit infinite loop` → 동일 inject + verdict=failed
  - (e) `done` (짧음, grammar 미부합) → prompt 재출력
  - (f) lock 활성 중 사용자가 mccp:* 호출 시도 → hook deny + clear message
  - (g) lock 잔존 후 다음 prp-implement 진입 → detect-stale reclaim 정상

### Task 10: `docs/automation-modernization/integration-template.md` §5/§8/§9 갱신 (M2 reference + isolation lock layer)

- **Action**: `docs/automation-modernization/integration-template.md`을 다음과 같이 갱신:
  - **Status mark (문서 첫 줄 quote)**: `M1-experimental — single-axis sample` → `**M1+M2-validated** — two-axis sample (axis A and axis B shipped). Cross-axis receipt schema invariants are still NOT defined until M3 (`/goal`) ships and validates the option (b) anchor across all three layers. M3 may pick a different custody option (see §5 matrix). Do not lock the option (b) anchor as a global rule.`
  - **§3 Three-layer breakdown 표에 axis B 컬럼 추가** (또는 별도 표): Module(axis B) 행 = `plugins/mccp/scripts/lib/ultracode-detect.js` / `plugins/mccp/commands/prp-implement.md` Phase 3.5 / Phase 3 + Phase 5 inject + `plan.md`-style provenance hash. M2-specific 4th layer 명시: **Isolation lock** = `ultracode-phase-lock.js` + `ultracode-phase-guard.js` (M1 axis A에는 없음 — axis B 특이 사항).
  - **§5 matrix axis B 셀 채움**:
    - (a) body inject only: ✗ rejected — same as axis A
    - (b) body inject + plan-body provenance hash: ✓ **adopted for M2** — axis A와 동일 option, axis 독립 평가 후 동일 선택. 단 axis B는 isolation lock layer를 추가로 도입(option (b) 자체와 직교 — lock은 runtime 격리, hash는 post-hoc 변조 detect)
    - (c) New receipt field: ✗ deferred — axis A와 동일 사유 (cross-axis lock-in risk)
    - (d) Envelope extension: ✗ N/A for M2 — ultracode delegation은 single-session(prp-implement은 단일 mccp turn 내 loop) 패턴이지 dispatch-controller fanout 아님. v1.2.0-m1 dispatch-controller가 ship됐지만 M2는 그 IPC 표면을 활용하지 않는 결정.
  - **§8 M2/M3 placeholder** → **§8 M2 reference (shipped)** + **§9 M3 placeholder (pending)** 분리:
    - **§8 M2 reference**: plan 경로 + ultracode-detect.js + ultracode-phase-lock.js + ultracode-phase-guard.js + prp-implement.md Phase 3.5 + custody anchor option (b) + isolation lock layer + grammar 3종 (`ultracode-done:` / `ultracode-failed:` / `ultracode-skipped:`)
    - **§9 M3 placeholder**: PRD M3 (`/goal` → `mccp:milestone-close`) — pending. M3 진입 시 §5 matrix 재평가 + isolation lock 필요 여부 axis 독립 판단. `/goal` evaluator가 mccp Stop hook과 충돌 가능성(PRD risk #4) 명시.
  - **§10 (기존 §9) audit checklist 신규 항목 추가**:
    - [ ] **Isolation lock mechanism** (if axis dispatches work to user-mode native command that runs outside mccp's audit reach): pr-phase-lock 패턴 mirror (token authority split + stdin-pipe IPC + host-aware tri-state reclaim) + lock-aware PreToolUse hook (default-deny on write + loud fail-open on lock parse error).
    - [ ] **Allow/deny matrix for lock-active state**: documented inline in axis's plan + tested with hook contract test fixture.
    - [ ] **Lock crash recovery**: detect-stale subcommand verified to reclaim via host-aware tri-state policy. Test fixture includes same-host+pid-dead, cross-host, and 0-byte/unparseable scenarios.
  - **§7 Anti-patterns에 신규 행 추가**:
    - "단일 prompt injection으로 isolation 보장 — mechanical lock 없이": Claude가 prompt를 어기면 mccp 상태 침투. PRD Open Q §2가 명시한 "둘 다 leakage 가능"의 mechanical layer 부재 케이스.
    - "lock file을 STATE.md 등 다른 atomic state와 같은 디렉토리에 두기": namespace 충돌. `.claude/state/<feature>-phase.lock` 별도 파일이 invariant.
- **Mirror**: §8/§9 기존 톤 + M1 reference 구조 + Anti-pattern 표 톤
- **Validate**: 
  - `grep -q "M1+M2-validated" docs/automation-modernization/integration-template.md`
  - `grep -q "axis B" docs/automation-modernization/integration-template.md`
  - `grep -q "ultracode-phase-lock" docs/automation-modernization/integration-template.md`
  - `grep -q "Isolation lock mechanism" docs/automation-modernization/integration-template.md`
  - `grep -q "axis-independent" docs/automation-modernization/integration-template.md` (axis-specific 평가 강조 토큰)

### Task 11: PRD M1/M2 row 갱신 (M1 housekeeping fix + M2 in-progress)

- **Action**: `.claude/prds/v1-4-0-automation-modernization.prd.md`의 Delivery Milestones 표:
  - M1 row: `Status` 셀 `in-progress → complete` (M1 ship 후 PRD housekeeping 누락 fix — STATE.md drift 패턴 mirror)
  - M2 row: `Status` 셀 `pending → in-progress`, `Plan` 셀 `— → .claude/plans/v1-4-0-m2-ultracode.plan.md`
  - M3/M4 row 손대지 않음 (in-place strictly)
- **Mirror**: `plan.md` input mode 명세 ("update only the selected row from pending to in-progress")
- **Validate**: `grep -E '^\| 1 \|.*complete' .claude/prds/v1-4-0-automation-modernization.prd.md` + `grep -E '^\| 2 \|.*in-progress.*v1-4-0-m2-ultracode\.plan\.md' .claude/prds/v1-4-0-automation-modernization.prd.md`

### Task 12: CHANGELOG.md 신규 row

- **Action**: `CHANGELOG.md` 상단 v1.4.0 row에 axis B 항목 추가 (또는 신규 row — version 결정 시점에 따라 v1.4.0 row 보강 또는 신규 v1.4.1+ row). content:
  > `axis B — ultracode keyword + /effort ultracode mode delegation via prp-implement Phase 3.5. marker probe (** Effort: ultracode **) + cooperative guide turn (3-grammar: ultracode-done / failed / skipped) + mechanical isolation lock (ultracode-phase-lock.js + ultracode-phase-guard.js PreToolUse hook, pr-phase-lock pattern mirror). ## Ultracode Delegations report inject + ## Ultracode Delegation Provenance plan-body sha256 anchor. PRD risk #7 (version race) honored — plugin.json bump decided at PR ship time.`
- **Mirror**: 기존 CHANGELOG.md row 톤 + axis A row 패턴 (M1 plan Task 6 ship)
- **Validate**: `head -30 CHANGELOG.md | grep 'axis B'` + `head -30 CHANGELOG.md | grep 'ultracode-phase-lock'` + `head -30 CHANGELOG.md | grep 'Ultracode Delegations'`

## Validation

```bash
# Task 1: WebFetch spec confirmation (manual, ship-time mandatory)
# plan body 끝에 ultracode native spec confirmation HTML comment 존재 확인
grep -E '^<!-- ultracode native spec confirmed at' .claude/plans/v1-4-0-m2-ultracode.plan.md

# Task 2+3: probe library + tests
node plugins/mccp/scripts/lib/ultracode-detect.js detect \
  --mode implement \
  --plan .claude/PRPs/plans/completed/v1-4-0-m1-deep-research.plan.md \
  --json
# Expect: ultracode_signal=false + signal_tasks=[] (M1 plan = false-positive fixture)
node --test plugins/mccp/scripts/lib/tests/ultracode-detect.test.js

# Task 4+5: isolation lock + tests
node --test plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js

# Task 6+7: hook + tests
node --test plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js

# Task 8: plugin.json hook 등록
node -e "const m=require('./plugins/mccp/.claude-plugin/plugin.json'); \
  const arr=(m.hooks||{}).PreToolUse||[]; \
  const ok=arr.some(h=>String(JSON.stringify(h)).includes('ultracode-phase-guard')); \
  console.log(ok?'ok':'FAIL'); process.exit(ok?0:1)"
node -e "JSON.parse(require('fs').readFileSync('./plugins/mccp/.claude-plugin/plugin.json','utf8'))"

# Task 9: prp-implement.md Phase 3.5 dogfood (manual, 별도 cycle)
# (a) marker 없는 plan으로 dry-run → 기존 Phase 3 흐름 유지
# (b) marker 있는 plan으로 dry-run → DETECT → LOCK ENTER → GUIDE → WAIT → LOCK EXIT → INJECT
# (c) lock 활성 중 mccp:* 호출 시도 → hook deny

# Task 10: integration template doc
grep -q "M1+M2-validated" docs/automation-modernization/integration-template.md && \
  grep -q "axis B" docs/automation-modernization/integration-template.md && \
  grep -q "ultracode-phase-lock" docs/automation-modernization/integration-template.md && \
  grep -q "Isolation lock mechanism" docs/automation-modernization/integration-template.md

# Task 11: PRD M1/M2 rows
grep -E '^\| 1 \|.*complete' .claude/prds/v1-4-0-automation-modernization.prd.md && \
  grep -E '^\| 2 \|.*in-progress.*v1-4-0-m2-ultracode\.plan\.md' .claude/prds/v1-4-0-automation-modernization.prd.md

# Task 12: CHANGELOG
head -30 CHANGELOG.md | grep 'axis B' && \
  head -30 CHANGELOG.md | grep 'ultracode-phase-lock' && \
  head -30 CHANGELOG.md | grep 'Ultracode Delegations'

# Full regression sweep — 모든 detect/lock/hook test 통과 (regression 0)
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js \
             plugins/mccp/scripts/lib/tests/deep-research-detect.test.js \
             plugins/mccp/scripts/lib/tests/ultracode-detect.test.js \
             plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js \
             plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js

# Receipt schema invariant (mechanical guard)
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement 2>&1 || true
# Expect: schema reject 없음 — receipt 무수정

# 추가 sanity: pr-phase-guard hook과 ultracode-phase-guard hook 병행 등록 무충돌
# (둘 다 PreToolUse — Claude Code hook chain이 양쪽 모두 호출하고 첫 deny가 차단)
node -e "const m=require('./plugins/mccp/.claude-plugin/plugin.json'); \
  const arr=(m.hooks||{}).PreToolUse||[]; \
  const both=arr.filter(h=>{const s=JSON.stringify(h);return s.includes('pr-phase-guard')||s.includes('ultracode-phase-guard');}); \
  console.log('PreToolUse hooks for phase guards:', both.length); process.exit(both.length>=2?0:1)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `/effort ultracode` 모드의 정확한 invocation 방식이 Claude Code v2.1.x 사이에서 mid-cycle 변경 | 중 | Task 1 WebFetch로 spec 재확인 mandatory (implementation 시작 직전). spec 변경 시 detect.js의 probe target + prp-implement Phase 3.5 prompt 텍스트만 갱신; probe shape + isolation lock 패턴 + custody anchor option (b)는 invariant |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| native ultracode 가용성 false-positive로 phantom 안내 발사 | 낮음 → 중 | Tristate default `unknown` + env override 1순위 + 정확한 marker 정규식 (case-sensitive + asterisks-strict). plan에 marker 없으면 sub-phase 3.5 silent skip. test 시나리오 6에 marker 변형(소문자, asterisks 누락) false-positive 회피 검증 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Workflow agent isolation이 prompt + lock hybrid임에도 leakage (Claude가 ultracode 모드 turn 안에서 mccp:* 호출 시도) — PRD Open Q §2 "둘 다 leakage 가능" | 중 | **Mechanical lock이 primary defense** — PreToolUse hook이 lock 활성 중 Edit/Write/receipt write + mccp:* skill 호출 deny. prompt injection은 secondary — 안내 텍스트에 명시. lock 활성 중 호출 시도 시 hook의 clear deny message + audit trace 기록. mechanical layer는 Claude의 in-turn 결정과 무관 (hook이 모든 PreToolUse intercept) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Lock이 crash로 잔존 (사용자가 ultracode 모드에서 mccp로 안 돌아옴) | 중 | host-aware tri-state reclaim (pr-phase-lock과 동일) — same-host+pid-alive=NEVER reclaim (heartbeat 보호), same-host+pid-dead=reclaim (orphan), cross-host=mtime-only 60s. 다음 prp-implement 진입 시 detect-stale 자동 reclaim 시도 1회 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Lock 활성 중 사용자가 git operation 필요 (status, diff, log) → hook이 차단 | 낮음 | allow list 정규식: `git\s+(status\|diff\|log\|show\|rev-parse\|branch\|worktree\s+list)`. git write(commit, push, reset, merge, rebase, checkout 등)는 deny — 변경은 ultracode 모드 안에서만. Task 7 fixture에 git read allow + git write deny 양쪽 검증 |
| prp-implement Phase 3.5에서 LOCK ENTER stdout의 ownership_token이 다음 sub-step 변수 propagation 실패 (shell sub-process 경계) | 낮음 → 중 | LLM이 shell var `OWNERSHIP_TOKEN`에 stash → 같은 step의 후속 Bash 호출에서 cat (`echo $OWNERSHIP_TOKEN \| node ... exit`). LLM contract — 미준수 시 token 사라짐 → lock이 reclaim까지 (60s) 잔존. 손해 없음(다음 prp-implement 진입이 reclaim). Task 1 WebFetch에서 ultracode 모드 진입 후 mccp turn으로 돌아오는 turn에서 shell var가 propagate되는지 확인 필요 — turn 경계 넘어가면 stash가 안 됨 → 대안: lock body에 raw token도 저장하고 `--task-index`로 lookup (token authority split이 무력화되므로 보수적 결정 필요) — 본 plan baseline은 LLM이 turn 내 stash. turn 경계 넘는 경우 detect-stale reclaim에 의존 (60s 후) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| `## Ultracode Delegation Provenance` stamp가 plan body 변경하여 implement-codex receipt plan_hash mismatch | 낮음 | Phase 5 REPORT 직후 receipt-write가 새 plan_hash로 갱신. M1과 동일 mechanism. provenance section은 plan body **마지막**에 append (다른 섹션 영향 0) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| Lock 활성 중 STATE.md write도 deny → continuous learning hook 등 다른 plugin hook이 STATE.md write 시도 → 충돌 | 중 | hook fail-open 정책: deny 시 systemMessage emit + (loud fail-open) **— 단 이 시나리오는 fail-closed가 옳음 (mccp 상태 침투 차단이 목적)**. 정확한 정책은: `ultracode-phase-guard`는 mccp 자체의 write를 deny하지만, 다른 plugin hook(continuous-learning-v2 등)이 PreToolUse 단계에서 무엇을 하는지는 hook chain 순서에 따라 다름. 정책: Bash 명령 정규식이 `node\s+.*\.claude/state/` 패턴 매칭 시 deny — script source 무관. continuous-learning이 STATE.md write 시도하면 lock 활성 중에는 그것도 deny되어 학습 record 누락. 사용자가 ultracode 모드를 자주 안 쓰면 손해 작음. 잔여 risk는 backlog 후보 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| 한 plan에 multiple ultracode marker → 각 task별로 lock enter/exit cycle 반복 (UX 무거움) | 중 | per-task loop이 baseline; batch mode(여러 marker task를 한 ultracode 세션으로 위임)는 v1.4.x patch 후보. 본 plan은 task-단위 isolation을 명시적으로 채택 — ultracode invocation 자체 token cost가 있어 user batching이 효율적인 경우 사용자가 marker를 1개 task에만 두면 됨. plan author의 marker 배치가 batching 정책 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| integration template doc가 axis B isolation lock layer를 cross-axis invariant로 잠금 위험 | 낮음 → 중 | doc §10 audit checklist 항목에 **"if axis dispatches work to user-mode native command"** 조건절 명시 — axis-specific applicability. Status mark `M1+M2-validated` (M3 ship 전까지 invariant 잠금 명시 회피). M3 진입 시 doc audit mandatory (특히 `/goal`이 mccp Stop hook과 충돌하는 다른 isolation 패턴 요구 가능 — PRD risk #4) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| PRD M1 row status fix가 다른 worktree와 race | 낮음 | M1 ship한 worktree(`.worktrees/v1.4.0-m1-deep-research/`)는 cleanup 완료 추정. main에 다른 v1.4.0 PRD PR이 들어오면 rebase 시 PRD body 충돌 — mechanical rebase로 해소. M1 row fix는 본 plan에서 한 줄 변경이므로 conflict surface 최소 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| `ultracode-done:<summary>` summary가 ≥3 단어 강제임에도 audit-trail 정보량 여전히 부족 (사용자가 "fixed it now" 같은 무의미 응답) | 낮음 | grammar 강제는 minimum bar; 의미 강제는 사용자 책임. Codex F-candidate — Phase 5 REPORT에서 summary 본문이 보존되므로 PR Review 단계의 사람 reviewer가 catch. mechanical "useful summary" 강제는 LLM judge 필요(scope creep). 본 plan은 grammar bar만 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->
| ultracode-phase-lock의 `--task-index` field가 lock body에 들어가지만 reclaim 시 활용 안 됨 (단순 audit) | 낮음 | 의도된 design: task_index는 trace/debug용. reclaim 결정은 host/pid/mtime만으로 충분 (pr-phase-lock과 동일 policy). task_index 활용은 v1.4.x feature 후보 (예: 다음 prp-implement 진입 시 같은 task로 resume) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:35:52.787Z"-->

## Acceptance

- [ ] Task 1-12 모두 완료
- [ ] Validation 블록의 모든 명령 exit 0
- [ ] `node --test` 신규 + 기존 test 모두 통과(regression 0) — 특히 false-positive fixture(M1 plan completed)에서 `ultracode_signal=false` 검증 + marker 변형(소문자, asterisks 누락) test 6 통과
- [ ] receipt schema 무변경 — `mccp:receipt-validate`가 v1.4.0 axis B 작업 후에도 모든 gate 통과 (PRD Success Metric 2). custody anchor는 plan body 내부 + 기존 implement-codex plan_hash 메커니즘에만 의존
- [ ] PRD M1 row가 `complete`로 fix + M2 row가 `in-progress` + 본 plan 경로 명시
- [ ] integration template doc가 `M1+M2-validated` mark + §5 matrix axis B 셀 채움(option (b) + isolation lock rationale) + §10 isolation lock audit checklist 항목 + axis-specific lock-in 회피 명시
- [ ] `prp-implement.md` Phase 3.5 ULTRACODE_DELEGATE 명세가 DETECT → LOCK ENTER → GUIDE → WAIT → LOCK EXIT → QUEUE → SKIP IMPLEMENTATION + 종료 후 PROVENANCE STAMP + Phase 5 `## Ultracode Delegations` section 자동 inject + Phase 6 1줄 출력
- [ ] response grammar(`ultracode-done:` / `ultracode-failed:` / `ultracode-skipped:`) 3종이 Phase 0 + Phase 2.5(axis A) grammar와 명시적으로 분리됨 (prp-implement.md 본문에 grammar 표 inline)
- [ ] mccp의 자체 native 기능 재구현 0 — `/effort ultracode` invocation은 사용자 turn에만 위임 (PRD Principle invariant)
- [ ] Mechanical isolation: lock 활성 중 PreToolUse hook이 Edit/Write/receipt write/STATE.md write/mccp:* skill 호출 deny + git read allow + ultracode-phase-lock CLI allow + 명확한 deny message + hook fail-open(systemMessage + ALLOW) on lock parse error
- [ ] `plugin.json` `hooks.PreToolUse` 배열에 `ultracode-phase-guard.js` 등록 (pr-phase-guard와 병렬, JSON 유효성 보존)

## Design Critique

> impeccable critique invoked 2026-06-19 (Phase 5.0, SKILL_AVAIL=1 + SIGNAL=1 — "design" keyword in plan body triggered probe). 본 plan은 backend tooling만 다룬다 — (1) Node.js detection probe library (`ultracode-detect.js`), (2) Node.js lock CLI (`ultracode-phase-lock.js`), (3) Node.js PreToolUse hook (`ultracode-phase-guard.js`), (4) slash command `.md` 본문 spec(`prp-implement.md` Phase 3.5), (5) 내부 docs markdown (`integration-template.md` 갱신). UI element / visual hierarchy / cognitive load 평가 대상 0; Nielsen heuristics / persona walkthrough / browser visualization 모두 비-적용. M1 plan precedent과 동일 — impeccable Skill availability=ok, critique decision = **not-applicable for backend-tooling plan** (Skill loaded, but surface absent). 향후 axis 중 PM 콘솔 UI(STATUS.md / status.html — v1.3.0-m3 PRODUCT.md surface) 변경을 동반하면 그 plan에서 critique 재평가.

## R1 Absorption Annex (binding amendments — apply during Task implementation)

> Codex R1 review (2026-06-19, threadId `019ede9a-1954-7be2-855d-30e436251872`)가 5 findings (1 CRITICAL + 3 HIGH + 1 MEDIUM) 검출. 5건 모두 ACCEPT_NOW로 absorb (DEFER_TO_BACKLOG 0). MCCP_GATE_ROUND_CAP=1 default + 5건 모두 plan body 갱신으로 self-attest → R2 skip. 본 Annex의 amendment는 위 §Patterns to Mirror / §Files to Change / §Tasks / §Risks / §Acceptance section 본문보다 **우선**한다 (binding). prp-implement 진입 시 본 Annex를 첫 단계로 읽고 absorb 사항을 task 본문에 통합한다.

### A1 — F1 absorption (CRITICAL): hook ownership boundary 재설계 + Task 1 plan-finalize gate

**문제**: 현 Task 6/9는 lock active + tool name으로만 hook predicate를 키화. native `/effort ultracode` 모드에서 (a) Claude Code PreToolUse hook이 active한지, (b) active라면 caller info(session_id, command_owner)가 노출되는지 미확정. 두 시나리오 모두 invariant 깸 — (a) hook이 ultracode 모드에서도 active → mccp lock이 delegated worker write까지 deny → 사용자 task 진행 불가; (b) hook이 ultracode 모드에서 inactive → mechanical layer 부재 → cooperative-only로 격하 (PRD Open Q §2의 "둘 다 leakage" trade-off 노출).

**Amendment (binding)**:

1. **Task 1 격상 — plan-finalize gate (mechanical)**: Task 1 WebFetch는 implementation 시작 직전이 아니라 **prp-implement validate-cmd의 pre-gate**로 elevate. plan body 끝에 `<!-- ultracode native spec confirmed at <ISO>: hook_active_in_ultracode=<true|false>, caller_session_id_exposed=<true|false>, marker_collision=<none|<details>>, summary=<one-line> -->` 마커가 없으면 validate-cmd가 schema reject (현 v1.3.1 validate-cmd 패턴 mirror). Task 1의 산출물은 본 마커 stamping + 결과에 따라 본 plan body amend round (Scenario A/B 분기).
2. **Scenario A (hook active in ultracode mode + caller identity exposed)**: lock body에 `owner_session_id` field 추가 (lock enter 시 `process.env.CLAUDE_SESSION_ID` 또는 hook payload에서 capture). hook predicate를 `lock_active AND caller_session_id !== lock.owner_session_id` AND tool/Bash matches deny matrix → deny. ultracode 모드 caller는 session_id mismatch로 allow. Task 7 test fixtures에 caller-identity 2축 (mccp-origin vs ultracode-origin) × tool 종류 매트릭스 추가.
3. **Scenario B (hook inactive in ultracode mode OR caller identity not exposed)**: mechanical lock 무용 — plan을 cooperative-only mode로 amend. Task 4 (lock CLI) + Task 6/7 (hook + tests) 본문은 작성하되 lock 의미는 "mccp-side guard"만 — mccp turn 안에서 다른 mccp 명령이 lock 활성 중 receipt write 시도 시 deny (예: continuous-learning hook 등). ultracode 모드 자체에는 mechanical isolation 없음 — PRD risk 표 + integration template §6 Anti-patterns에 "cooperative-only mode trade-off" 명시. Plan Summary + Risks 갱신.
4. **Task 6 hook predicate 갱신 (Scenario A default + B fallback)**: 우선 Scenario A로 작성하되, Scenario B 대비 `hook payload에서 caller info가 부재할 경우 lock 전체를 advisory-only로 격하 + stderr warn + ALLOW`. Task 7에 두 시나리오 모두 fixture.

### A2 — F2 absorption (HIGH): malformed lock → fail-CLOSED + detect-stale gate

**문제**: Task 6 현 본문은 lock file JSON parse error / 0-byte / missing field 시 systemMessage emit + **ALLOW**. 이는 crash/corruption (lock 메커니즘 자체가 anticipate한 상태)에서 mccp write를 정상 진행 → audit/isolation 무력화.

**Amendment (binding)**:

1. Task 6 hook의 lock parse error 분기를 **DENY**로 전환. message: `[mccp-ultracode-guard] lock file malformed (<reason: parse-error|zero-byte|missing-field>) — DENY (fail-closed). Run 'node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js detect-stale' to clean up, then retry.`
2. **Lock 부재 vs malformed lock 구분**: lock file이 `fs.existsSync` false → no isolation active → ALLOW (정상 path). lock file이 존재하지만 read/parse 실패 → corruption → DENY. 이 구분이 binding.
3. Task 7 test 시나리오 11/12 갱신 — invalid JSON / 0-byte → DENY + deny reason 검증. 별도 fixture 시나리오: lock 부재 → ALLOW (이미 시나리오 10).
4. Risks 표에 "lock file 정상 cleanup 실패 시 mccp 명령 chain 차단 (fail-closed)" risk + mitigation (detect-stale CLI 명시적 안내 + 60s mtime 만료 후 reclaim) 추가.

### A3 — F3 absorption (HIGH): ownership_token sidecar file + shell-var stash 폐기

**문제**: Task 4 + Task 9는 LOCK ENTER stdout의 raw token을 shell var `OWNERSHIP_TOKEN`에 stash → 사용자 turn 경계를 넘어 `/effort ultracode` 진입 → mccp turn으로 복귀 후 LOCK EXIT가 같은 shell var 참조. turn boundary 넘어가면 shell var 사라짐. Risks 표가 이를 인지하지만 fallback이 60s reclaim — abnormal recovery를 normal path로 정상화.

**Amendment (binding)**:

1. **Sidecar token file (new file)**: `<repoRoot>/.git/mccp/tmp/ultracode-token-<run-id>.dat` (mode 0600). Task 4 `enter` subcommand가 lock 생성과 동시에 sidecar file에 raw ownership_token write (이미 `.git/`이 gitignore 안이므로 추가 gitignore 변경 불요 — `.gitignore` §의 `.git/mccp/tmp/`는 이미 gitignore). `exit`/`heartbeat` subcommand는 `--run-id`만 받고 sidecar에서 token read → hash 비교 → unlink (lock + sidecar 둘 다). stdout token return은 backward compat용으로 유지하되 caller(prp-implement) 본문은 sidecar 채널만 사용 (binding).
2. **Task 9 갱신**: Phase 3.5.2 LOCK ENTER에서 shell var stash 제거. Phase 3.5.5 LOCK EXIT는 `node ... lock exit --run-id $RUN_ID`만 호출 (sidecar에서 token 읽음). turn boundary 넘어가도 sidecar 파일이 disk에 있으므로 다음 mccp turn에서 정상 exit 가능.
3. **Cleanup 정책**: exit 정상 종료 시 lock + sidecar 모두 unlink. detect-stale reclaim 시도 시 sidecar도 함께 cleanup (`.git/mccp/tmp/ultracode-token-*.dat` orphan scan). Task 4 `detect-stale` subcommand에 sidecar cleanup 로직 명시.
4. **Permission**: sidecar file mode 0600 (Node `{ mode: 0o600 }`). Windows에서 fs mode는 best-effort (Windows ACL 별도) — Task 5 test에 platform-aware fixture (Linux/macOS 우선).
5. Risks 표 갱신 — token propagation risk (현재 "낮음 → 중") → "낮음" (sidecar로 turn boundary 안전).

### A4 — F4 absorption (HIGH): per-task immediate stamp + sidecar journal (in-memory queue 폐기)

**문제**: Task 9는 delegation 결과를 in-memory queue로 누적 후 per-task loop 종료 직후 plan body에 batch stamp. 세션이 중간(ultracode가 file change를 한 후, stamp 전)에 끊기면 — durable record 0, rerun 시 marker 그대로라 duplicate delegation 위험, plan_hash anchor는 stamp 이후만 작동.

**Amendment (binding)**:

1. **Sidecar journal file (new file)**: `<plan-path>.delegations.jsonl` (append-only newline-delimited JSON). 각 delegation 직후(LOCK EXIT 직후) `fs.appendFileSync`로 한 줄 append: `{ "run_id": "<uuid>", "plan_hash": "<sha256 of plan body before this delegation>", "task_index": <N>, "task_name": "<name>", "verdict": "done|failed|skipped", "summary_sha256": "<hex>", "summary": "<truncated 280 chars>", "stamped_at": "<ISO>" }`. 이 journal은 idempotency ledger.
2. **Idempotency key**: `(plan_hash, task_index, run_id)` triple. 다음 prp-implement 진입 시 sub-phase 3.5.0에서 journal을 읽고 현 task에 이미 entry가 있으면(matching plan_hash + task_index, latest run_id) → sub-phase 3.5 skip + log `[ultracode-delegated-previously] Task <N>: <verdict> from <stamped_at>` + 정상 next task 진행. plan body가 변경되면 plan_hash가 바뀌므로 새 delegation으로 인식 (의도적 — plan 갱신 후 재실행은 새 위임).
3. **Task 9 갱신**:
   - sub-phase 3.5.6 IMMEDIATE STAMP (rename of QUEUE PUSH): LOCK EXIT 직후 `appendFileSync`로 sidecar journal에 한 줄 append. 동시에 plan body에 incremental stamp 한 줄도 atomic append (full PROVENANCE STAMP는 per-task loop 종료 후 final consolidation, 그 시점까지는 plan body에 한 줄씩 누적).
   - sub-phase 3.5.0 DETECT에 journal lookup pre-check 추가 — 이미 delegated된 task는 skip.
   - sub-phase PROVENANCE STAMP (loop 종료 직후)는 sidecar journal에서 read → final `## Ultracode Delegation Provenance` 섹션을 idempotent rewrite (incremental 한 줄들이 final form으로 consolidate).
4. **gitignore**: `<plan-path>.delegations.jsonl`은 plan과 같은 디렉토리. `.gitignore`에 `*.delegations.jsonl` 패턴 추가 (committable plan body와 분리 — delegation history는 working-tree only audit).
5. Files to Change에 `.gitignore` UPDATE + sidecar journal file CREATE (plan 진입 시 자동 생성) 추가.

### A5 — F5 absorption (MEDIUM): Effort field whitelist + Task 1 mechanical plan-finalize gate

**문제**: Task 2 detect.js의 marker 정규식은 `ultracode` 하나만 매칭, 다른 Effort 값(예: 미래 `ultraplan` / typo) silent skip. silent skip은 user intent를 mis-read해도 prp-implement가 normal mode로 진행 → audit 누락. Task 1 WebFetch는 implementation 시점 — plan body 자체가 부정확한 가정 위에 작성된 채로 ship됨.

**Amendment (binding)**:

1. **Task 2 갱신 — strict whitelist + reject unknown**: detect.js의 marker 매칭을 `effort_tier ∈ KNOWN_TIERS` whitelist 기반으로 변경. `KNOWN_TIERS = { 'ultracode' }` (M2 scope). 정규식 `^\s*-\s+\*\*Effort\*\*:\s*([a-z][a-z0-9-]*)\s*$`로 capture → tier value가 whitelist에 없으면 `reason=unknown-effort-tier` + `unknown_tiers: [<list>]` field에 push + `ultracode_signal=false` + stderr warn + exit 0. sub-phase 3.5가 unknown_tiers warn을 사용자에게 표시 (silent fail 회피).
2. **Task 1 격상 — plan-finalize gate (cf. A1)**: A1 absorption와 합쳐 Task 1 산출물은 plan body 끝의 spec confirmation 마커. 마커 없으면 prp-implement validate-cmd가 plan reject. Task 1은 본 plan ship 직후 별도 round로 실행 (validate-cmd가 mechanical block — 본 R1 absorption이 reception path).
3. **Future-tier 정책**: 미래 `ultraplan` 등 추가 tier는 별도 axis의 plan에서 KNOWN_TIERS 확장 (예: M2.5 axis). 본 M2 scope는 `ultracode` 단일 tier — out-of-scope rejection은 explicit warn.
4. Task 3 test 시나리오 4 갱신 — 마커 형식 오류 (asterisks 누락 등)는 silent skip 유지, 그러나 형식 정상 + tier value가 whitelist 밖인 경우는 별도 시나리오 추가 (`reason=unknown-effort-tier` + warn 검증).
5. Risks 표 갱신 — "native spec drift" risk → mitigation에 "plan-finalize gate (mechanical validate-cmd block)" 추가.

### A6 — 신규 risk + acceptance (Annex amendment cumulative)

위 5건 absorption 적용 시 영향 받는 표:

- **Risks 갱신**: F1 Scenario A/B fork risk 추가 / F2 fail-closed risk 추가 (정상 cleanup 누락 시 chain 차단) / F3 sidecar file orphan risk 추가 / F4 sidecar journal race 추가 (concurrent prp-implement runs) / F5 future-tier drift risk 추가.
- **Acceptance 갱신**: hook caller-identity discriminator 동작 / lock malformed fail-CLOSED 동작 / sidecar token + journal durable lifecycle / unknown-tier warn / Task 1 plan-finalize gate (mechanical validate-cmd) 5건 추가.

### Phase 5.4 trigger evaluation

- ACCEPT_NOW × {CRITICAL, HIGH} = 4건 (F1 CRITICAL + F2/F3/F4 HIGH).
- R1 absorption이 모두 self-attest 가능 (위 Amendment 절차로 plan body 갱신 — A1~A5 binding).
- MCCP_GATE_ROUND_CAP default=1 + absorption self-attest → R2 skip.
- DEFER_TO_BACKLOG = 0.
- Auto-CRITICAL catalog (secret/data-loss/migration/auth bypass/external dest/crypto) 매칭 0건 → Phase 5.5 STOP 미트리거.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) with `--impeccable-available` (design scope excluded)
- 라운드 수: 1 (R1만, MCCP_GATE_ROUND_CAP=1 default)
- 합치 결론: needs-attention(R1) → R1 absorption 5/5 적용 완료 (§R1 Absorption Annex A1-A5 binding) → R2 skip (cap=1 + ACCEPT_NOW HIGH/CRITICAL 항목 모두 plan body 갱신으로 self-attest)
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: Global hook cannot both block mccp writes and allow ultracode writes | CRITICAL | ACCEPT_NOW | PRD Open Q §2 "둘 다 leakage 가능"의 mechanical 모순 — hook이 caller boundary 무시. §Annex A1 absorb: Task 1 plan-finalize gate + lock body에 owner_session_id field + hook predicate에 caller-identity discriminator. Scenario A(active+caller exposed) default, Scenario B(inactive 또는 caller hidden) fallback로 amend round. |
  | F2: Malformed lock state fails open and disables the primary defense | HIGH | ACCEPT_NOW | crash/corruption은 lock 메커니즘이 anticipate한 정상 상태 — fail-open이 audit/isolation 무력화. §Annex A2 absorb: hook의 lock parse error 분기를 DENY로 전환 + lock 부재(ALLOW) vs malformed lock(DENY) 구분 + detect-stale 명시적 안내. Task 7 fixtures 갱신. |
  | F3: Ownership token lifecycle is not durable across the required turn boundary | HIGH | ACCEPT_NOW | turn boundary 넘어가는 shell var stash가 normal path — abnormal recovery(60s reclaim)에 의존. §Annex A3 absorb: `.git/mccp/tmp/ultracode-token-<run-id>.dat` sidecar file (mode 0600) via Task 4 lock CLI. Task 9 shell-var 제거. exit/heartbeat가 sidecar 채널만 사용. |
  | F4: Per-task provenance is kept only in memory until the end of the loop | HIGH | ACCEPT_NOW | 세션 중단 시 durable record 0 + rerun marker 그대로라 duplicate 위험 + plan_hash anchor가 stamp 이후만 작동. §Annex A4 absorb: `<plan-path>.delegations.jsonl` sidecar journal (append-only) + idempotency key (plan_hash + task_index + run_id). 다음 prp-implement 진입 시 journal lookup pre-check로 이미 delegated된 task skip. |
  | F5: Marker and native-mode assumptions silently fall through before spec confirmation | MEDIUM | ACCEPT_NOW | plan body가 PRD wording 위에 작성됨 + Task 1 WebFetch가 implementation 시점 → plan body가 wrong assumption으로 ship. §Annex A5 absorb: Effort field whitelist (`KNOWN_TIERS={ultracode}`) + unknown tier explicit reject+warn (silent skip 폐기) + Task 1 plan-finalize gate (mechanical validate-cmd block until spec confirmed marker stamped). |
- Deferred to backlog: 0 — 5건 모두 ACCEPT_NOW (CRITICAL/HIGH ACCEPT_NOW 4건 + MEDIUM ACCEPT_NOW 1건, DEFER_TO_BACKLOG 미발생 → `.claude/plans/codex-findings-backlog.md` 갱신 없음)
- Open Questions: F1 Scenario A vs B fork는 Task 1 WebFetch 결과에 종속 (DIVERGENT_UNRESOLVED-PENDING-SPEC). Auto-CRITICAL 카테고리(secret exposure, data loss, irreversible migration, auth bypass, external destination change, crypto key handling) 매칭 0건 — Phase 5.5 STOP 미트리거.
- Codex session 참조: threadId `019ede9a-1954-7be2-855d-30e436251872` (codex-invoke v0.2.2 wrapper, durationMs=253904, exit 0, classification=ok, blocking=false, advisory=false)

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (5 findings, all ACCEPT_NOW, R1 Absorption Annex §A1-A5 binding). No new implement-time architectural decisions detected (Scenario A/B fork is Task 1 plan-finalize gate output, already pre-committed in §A1). `git diff --name-only origin/main..HEAD` = ∅ ⊆ Files to Change. Cross-gate dedupe applied per `/mccp:prp-implement` Phase 2.5.1.

<!-- ultracode native spec confirmed at 2026-06-19T16:00:00Z: hook_active_in_ultracode=true, caller_session_id_exposed=unknown, marker_collision=none, summary=Workflow runtime runs subagents in isolated environment but in same Claude Code process; PreToolUse hooks active on subagent tool calls (acceptEdits + tool allowlist inheritance per code.claude.com/docs/en/workflows). Caller identity exposure (parent_session_id field in hook payload distinguishing workflow agent vs mccp turn) is not documented — Scenario A default + Scenario B fallback per §A1 amendment applies. marker_collision=none because `**Effort**: ultracode` is plan-file content not user-prompt keyword trigger (native trigger is `ultracode:` keyword in user prompt, pre-v2.1.160 was `workflow`). M2 scope unchanged. -->


