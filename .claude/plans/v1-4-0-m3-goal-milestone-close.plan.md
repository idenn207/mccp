# Plan: v1.4.0 axis C — `/goal` → `/mccp:milestone-close` integration

**Source PRD**: `.claude/prds/v1-4-0-automation-modernization.prd.md`
**Selected Milestone**: M3 — axis C (`/goal` → `mccp:milestone-close`)
**Complexity**: Large (신규 slash command + multi-turn isolation lock + Stop hook 측 lock-aware short-circuit + 신규 receipt gate 후보 — §5 axis-independent 평가)

## Summary

신규 `/mccp:milestone-close <milestone-ref>` 명령이 Anthropic native `/goal` loop를 cooperative guide 패턴으로 흡수해 milestone 종료 acceptance loop를 mccp의 receipt chain custody 안에 anchor한다. **multi-turn isolation lock** (`goal-phase-lock.js` + `goal-phase-guard.js` PreToolUse hook + `stop-review-loop.js` lock-aware short-circuit)으로 `/goal` evaluator가 매 turn 마다 fire하는 Stop hook이 mccp의 quality runner / fix-task / loop-counter 상태에 침투하지 않도록 mechanical 차단한다. **isolation은 hybrid 2-layer**: (1) primary mechanical — Stop hook 측 lock-check short-circuit + PreToolUse 측 mccp write deny, (2) secondary cooperative — 안내 prompt에 "/goal 모드 안에서 mccp:* 명령 호출 금지" 명시. `/goal` 자체는 mccp 내부에서 호출하지 않는다(PRD Principle invariant 위반). 사용자가 `goal-done:<summary>` / `goal-failed:<reason>` / `goal-skipped:<reason>` grammar로 응답하면 lock exit → milestone closure document(`.claude/milestone-closures/<milestone-id>.md`)에 inject → 해당 closure doc을 plan body / PR body의 reference로 stamping해서 기존 plan-codex/implement-codex/pr-codex receipt의 plan_hash가 mechanical anchor 역할. **§5 custody anchor 옵션 평가는 axis-independent re-run**: 첫 cut으로 option (b) closure-doc-body inject + plan-body provenance hash가 axis C에도 충분한지 평가하되, Task 1 WebFetch에서 `/goal` evaluator가 옵션 (c) 신규 receipt field나 (d) envelope extension을 요구하는 signature가 발견되면 plan revision round에서 선택 변경. **cost ceiling honor**: Phase 0 preflight에서 `cost-state.js` cost-tier ≥ critical($100) 시 STOP — `/goal` 무한 루프 진입 자체 거부. native `/goal`의 built-in turn bound + acceptance condition timeout clause를 cooperative prompt에 명시. `/mccp:milestone-close`는 chain의 어디에 위치하는가? **Phase position**: implement-codex receipt가 작성된 이후, pr-codex receipt 작성 이전 (i.e. `/mccp:prp-implement`와 `/mccp:pr` 사이). milestone-close가 acceptance 통과 못 하면 PR 진입 차단(receipt gate 또는 closure doc absence로 mechanical). **새 receipt gate 도입 여부는 Codex R1 평가 대상**: 옵션 A(`mccp-milestone-close-codex` 신규 gate, 새 schema entry) vs 옵션 B(기존 closure doc + pr-codex가 closure doc reference로 anchor, schema entry 0개) — 둘 다 receipt FIELD invariant는 보존, GATE 추가는 invariant 위반 정도가 다름. 본 plan 첫 cut은 옵션 B 채택(invariant 최소 침투); Codex가 A를 권장하면 revision round에서 schema entry 추가. **M3는 integration template doc §3 layer 4 axis C 셀 채움 + §5 matrix axis C 채움(독립 평가 결과) + §8 placeholder → reference 전환 + §9 audit checklist에 Stop-hook isolation 항목 추가 + status mark `M1+M2-validated` → `M1+M2+M3-validated`로 전환**. PRD Open Q #3 (template doc M4 별도 vs 누적) 결정도 본 milestone 종료 시점에 명시 — M3까지 누적 패턴 유지 시 M4 milestone 자체가 redundant이므로 PRD row 삭제 후보로 표시.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Mode-aware detection probe | [plugins/mccp/scripts/lib/ultracode-detect.js](../../plugins/mccp/scripts/lib/ultracode-detect.js) (M2 ship) + [deep-research-detect.js](../../plugins/mccp/scripts/lib/deep-research-detect.js) (M1 ship) | 동일 JSON shape `{ availability, goal_signal, signal_ref, mode, reason }`; env override `MCCP_GOAL_FEATURE=available\|missing\|unknown` 1순위; default availability=`unknown` (phantom 안내 금지); reason enum ∈ {ok, command-missing, no-signal, path-traversal, unknown-default, mode-mismatch, milestone-not-found, cost-ceiling-blocked}. **차이점**: PRD body parsing(M1)이나 plan body parsing(M2)이 아닌 **milestone reference parsing** (PRD `Delivery Milestones` row 또는 plan path → milestone id 추출); signal은 `Status=in-progress` AND `Plan` cell이 채워져 있고 해당 plan이 실제 존재 AND 모든 Task의 Validate 라인 통과 가정(closure 가능성 휴리스틱) |
| Marker syntax (없음) | n/a — M2와 달리 user가 직접 `/mccp:milestone-close <ref>` 호출하므로 plan body marker 불필요 | 본 axis는 explicit user invocation이므로 marker 정규식 없음. signal heuristic은 milestone 상태(PRD row + plan body Task 완료 여부)만으로 산출 |
| Cooperative guide turn (dedicated grammar) | [commands/prp-implement.md](../../plugins/mccp/commands/prp-implement.md) Phase 3.5 (M2 ship: `ultracode-done:`/`failed:`/`skipped:`) + [commands/plan-prd.md](../../plugins/mccp/commands/plan-prd.md) Phase 2.5 (M1) | 응답 grammar `goal-done:<one-line summary, ≥3 words required>` / `goal-failed:<one-line reason>` / `goal-skipped:<one-line reason>` 3종. Phase 0 `skip`/`you decide` 분리 + M1 `paste:` 분리 + M2 `ultracode-*:` 분리 (다른 axes와 disjoint). summary `<3 words`이면 grammar mismatch로 prompt 재출력 |
| Multi-turn isolation lock (token authority split + host-aware tri-state reclaim) | [plugins/mccp/scripts/lib/ultracode-phase-lock.js](../../plugins/mccp/scripts/lib/ultracode-phase-lock.js) (M2 ship, mirrors [pr-phase-lock.js](../../plugins/mccp/scripts/lib/pr-phase-lock.js) v0.2.8 hardening) | `goal-phase-lock.js` enter/exit/heartbeat/detect-stale CLI. lock file `.claude/state/goal-phase.lock`. sidecar token file `<gitdir>/mccp/tmp/goal-token-<run-id>.dat`. `ownership_token_hash` (sha256 of `crypto.randomUUID()`) + stdin-pipe IPC + lease(default 90s — M2의 60s보다 길게: multi-turn `/goal` loop가 단일 evaluation turn보다 길 수 있어 false-positive stale 회피) + heartbeat. reclaim: same-host+pid-alive=NEVER reclaim / same-host+pid-dead=reclaim / cross-host=mtime-only / 0-byte+unparseable=mtime-only. cmdExit/cmdHeartbeat token mismatch=exit 16/15 + no unlink. cmdDetectStale never takes token |
| Lock-aware PreToolUse hook | [plugins/mccp/scripts/hooks/ultracode-phase-guard.js](../../plugins/mccp/scripts/hooks/ultracode-phase-guard.js) (M2 ship) + [pr-phase-guard.js](../../plugins/mccp/scripts/hooks/pr-phase-guard.js) | `goal-phase-guard.js` — lock 활성 중 deny: Edit/Write/NotebookEdit + Bash `node .../receipt/cli.js write` + Bash `.claude/state/`/`.claude/receipts/`/`.claude/milestone-closures/` write + Skill `mccp:*` 호출. allow: Read/Grep/Glob + ToolSearch + Bash `git status/diff/log` + Bash `node .../goal-phase-lock.js exit\|heartbeat\|read`. F1 caller-identity discriminator(`event.session_id` ≠ `lock.owner_session_id` → ALLOW for sub-session callers like `/goal` evaluator if exposed; absent → blanket-enforce + stderr warn). F2 fail-CLOSED on malformed lock (CLAUDE.md `feedback-loud-fail-open` mirror) |
| Stop hook lock-aware short-circuit (M3-specific, axis A/B에는 없는 layer) | [plugins/mccp/scripts/hooks/stop-review-loop.js](../../plugins/mccp/scripts/hooks/stop-review-loop.js) lines 1-90 (`modeFromEnv` 직후 → `gitDiffEmpty` 직전) | `modeFromEnv` 호출 직후 `goal-phase.lock` 존재 + 유효성 1줄 check 추가. 활성 시: `systemMessage`(`[mccp:stop-review-loop] suppressed: goal-phase lock active (run=<run-id>)`) emit + 즉시 pass-through allow (decision={}). 이로써 `/goal` 매 turn 의 Stop hook가 quality runner/loop-counter/fix-task 실행 없이 그대로 native loop를 계속하게 됨. **fail-open 원칙**: lock file parse 실패 시에도 pass-through(loud) — Stop hook가 사용자 차단으로 죽으면 안 됨 |
| Section append into artifact body (idempotent re-run) | M1 `plan-prd.md` Phase 4.0b (`## References`) + M2 `prp-implement.md` Phase 3.5.9 (`## Ultracode Delegation Provenance`) | 신규 closure document `.claude/milestone-closures/<milestone-id>.md` — frontmatter 없음, plain markdown. 본문에 `## Acceptance Condition` / `## Goal Loop Result` / `## Provenance` 섹션. plan body 끝에 `## Milestone Closure Provenance` 신규 section (per-closure: milestone-id + verdict + closure-doc-path + sha256 hex + ISO timestamp). 동일 milestone-close 재호출 시 idempotent replace |
| Custody anchor evaluation (axis-independent) | [docs/automation-modernization/integration-template.md](../../docs/automation-modernization/integration-template.md) §5 matrix axis C column = TBD | M3는 §5 matrix axis C 셀을 **scratch부터 재평가**. 첫 cut 결론: option (b) closure-doc-body + plan-body provenance hash 채택. closure document는 plan body가 reference로 stamping → plan-codex receipt의 plan_hash가 mechanical anchor. 옵션 (c) 신규 receipt field 또는 (a) `mccp-milestone-close-codex` 신규 gate은 Codex가 axis-specific 증거(예: `/goal` evaluator-side event 누설 위험)를 제기하면 revision round에서 채택 |
| Receipt schema invariant (no new fields, new gate 여부는 Codex 평가 대상) | M1/M2 plan + integration template §5 (option (c) rejected) | 첫 cut: receipt schema 무수정 + 신규 gate 무도입. closure doc은 file 자체로 audit 산출물, plan-body provenance hash가 mechanical anchor. **Open Question**: Codex R1이 새 gate `mccp-milestone-close-codex`를 요구하면 옵션 A로 전환(receipt schema 디렉토리에 신규 entry 추가, 기존 gate fields는 무수정). 본 plan에서는 옵션 B를 default로 작성하고 R1 평가 후 결정 |
| Cost-ceiling preflight | [plugins/mccp/scripts/lib/cost-state.js](../../plugins/mccp/scripts/lib/cost-state.js) (read-only) + auto-handoff thresholds | Phase 0 preflight에서 `getCostTier()` 호출 → tier ∈ {warning, critical}이면 STOP(critical) 또는 confirmation 요구(warning). cost-state path는 `cost-state-path.js`로 resolve |
| Plugin hook 등록 (PreToolUse 병렬 등록 + Stop hook 본문 수정) | [plugins/mccp/hooks/hooks.json](../../plugins/mccp/hooks/hooks.json) lines 244-256 + 기존 ultracode-phase-guard 등록 패턴 | `goal-phase-guard.js`를 PreToolUse hook으로 추가 (pr-phase-guard, ultracode-phase-guard와 병렬). **Stop hook 측은 신규 hook 추가 아닌 `stop-review-loop.js` 본문 수정**(early-return one-liner). 이유: 신규 Stop hook을 추가하면 order/priority가 보장 안 되어 race 가능; 기존 hook 진입점 한 곳에서 처리하는 것이 mechanical하게 더 견고 |
| Node test fixtures | M2 test files (`ultracode-detect.test.js`, `ultracode-phase-lock.test.js`, `ultracode-phase-guard.test.js`) | node:test + os.tmpdir() + child_process.spawnSync stdin/stdout pipe + 기존 plan(M1/M2 completed)을 false-positive fixture로 사용. lock test는 concurrent enter race + stale reclaim + cross-host policy + token mismatch + **multi-turn heartbeat 시나리오**(M2와 차별점) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/goal-detect.js` | CREATE | mode-aware probe (`milestone-close` only for M3) — tristate availability + milestone-reference parsing + closure 가능성 휴리스틱 + path-traversal guard. CLI `detect --mode milestone-close --milestone <id-or-prd-path> --json` |
| `plugins/mccp/scripts/lib/tests/goal-detect.test.js` | CREATE | 10 시나리오: env override 3 + milestone status combinations(pending/in-progress/complete × plan present/absent) + path traversal + mode-mismatch + cost-ceiling stub + invalid milestone-id |
| `plugins/mccp/scripts/lib/goal-phase-lock.js` | CREATE | ultracode-phase-lock.js v0.2.8 mirror — enter/exit/heartbeat/detect-stale CLI. lock file `.claude/state/goal-phase.lock`. sidecar `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` (Codex impl-R1 F1 absorption — sidecar는 user `/goal` turn boundary 사이에 raw token이 durable 살아남게 하는 **유일한** 채널. shell var stash는 turn 끝에 휘발됨). **차이점**: lease default 90s (M2의 60s보다 김 — multi-turn loop tolerance). heartbeat 권장 주기 30s (lease의 1/3) |
| `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js` | CREATE | 12 시나리오: 표준 lifecycle + concurrent enter race + token mismatch + 3-state reclaim + 0-byte/unparseable fallback + **multi-turn heartbeat 시나리오** (90s lease + 30s heartbeat 시뮬레이션) + sidecar token file 누락 fallback |
| `plugins/mccp/scripts/hooks/goal-phase-guard.js` | CREATE | PreToolUse hook — lock 활성 중 mccp write 차단. allow/deny matrix. F1 caller-identity discriminator. F2 fail-CLOSED on malformed lock. lock parse error → ALLOW + systemMessage (loud fail-open) |
| `plugins/mccp/scripts/hooks/tests/goal-phase-guard.test.js` | CREATE | 12 시나리오: lock 비활성/활성 × tool 종류 매트릭스 + F1 discriminator (matching/non-matching session_id) + F2 malformed lock fail-CLOSED + Skill `mccp:*` deny + Bash receipt-write deny + Bash `.claude/milestone-closures/*` write deny |
| `plugins/mccp/scripts/hooks/stop-review-loop.js` | UPDATE | `modeFromEnv` 호출 직후, `gitDiffEmpty` 호출 직전에 `checkGoalPhaseLockActive(cwd)` 5-line helper 추가 → 활성 시 stderr `systemMessage` emit + 즉시 pass-through allow. 기존 함수/decision tree 변경 없음 (backward-compat). |
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | UPDATE (또는 CREATE if not exists) | 신규 시나리오 2개: (a) goal-phase.lock 활성 시 quality runner 미실행 + pass-through allow + systemMessage emit 검증, (b) goal-phase.lock parse error 시 loud fail-open (Stop hook가 죽지 않음) |
| `plugins/mccp/commands/milestone-close.md` | CREATE | 신규 slash command body. Phase 0 PREFLIGHT(cost-tier + milestone arg validation + working-tree check) → Phase 1 DETECT(`goal-detect.js`) → Phase 2 LOCK ENTER + COOPERATIVE GUIDE → Phase 3 WAIT(user runs `/goal` out-of-band + responds with grammar) → Phase 4 LOCK EXIT + INJECT(closure doc write + plan-body provenance stamp) → Phase 5 CODEX GATE(첫 cut: option B, plan-codex receipt 추가 없이 closure doc anchor만; Codex R1이 옵션 A 권장 시 신규 gate 추가) |
| `plugins/mccp/hooks/hooks.json` | UPDATE | PreToolUse 배열에 `goal-phase-guard.js` entry 추가 (`pr-phase-guard`, `ultracode-phase-guard`와 병렬 등록). Stop 배열은 무변경 (stop-review-loop.js 본문 수정으로 처리) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` 필드는 PR ship 시점 main HEAD 기준 결정 (axis A/B와 동일 정책, CLAUDE.md §3.7). 본 plan 작성 시점엔 무변경 — Task 11 issue로 명시 |
| `docs/automation-modernization/integration-template.md` | UPDATE | §3 layer 4 axis C 셀 채움 (Stop-hook isolation + PreToolUse layer 양축 명시 — M2와 차별점: M2는 PreToolUse만, M3는 Stop hook 측도 필요) + §5 matrix axis C 셀 채움(axis-independent 평가 결과 + 옵션 (b) 채택 rationale 또는 Codex R1 revision 시 옵션 변경) + §8 placeholder → reference 전환 + §9 audit checklist에 "Stop-hook isolation mechanism (if axis dispatches work to multi-turn native loop)" 항목 추가 + status mark `M1+M2-validated` → `M1+M2+M3-validated` + PRD Open Q #3 (template doc M4 별도 vs 누적) 결정 stamp |
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | UPDATE | M1 row status `in-progress → complete` (M1 ship 후 housekeeping 누락 fix — M2 plan에서도 동일 처리), M2 row status `in-progress → complete` (PR #42 merge 후 stale fix), M3 row status `pending → in-progress` + Plan 셀 본 plan 경로. M4 row는 Codex R1 평가 후 결정(M3 누적으로 M4 redundant 판정 시 row 삭제 또는 status `dropped`로 변경 — 본 plan 첫 cut은 row 유지 + Open Q remark) |
| `CHANGELOG.md` | UPDATE | v1.x.x row에 axis C 항목 추가 (또는 신규 row — version 결정 시점에 따라). content: `/mccp:milestone-close` 신규 command + goal-phase 3축 isolation(detect probe + PreToolUse guard + Stop hook short-circuit) + milestone closure doc anchor + integration template §3/§5/§8/§9 axis C 채움 요약 |
| `.claude/milestone-closures/` | CREATE (directory) | 신규 디렉토리, `.gitignore` 적용 안 함 (closure doc은 git-tracked — receipt chain audit 산출물). README.md placeholder 생성 ("milestone closure documents emitted by /mccp:milestone-close — see docs/automation-modernization/integration-template.md §8 for format spec") |

**Out of file changes (this milestone only)**:
- receipt schema (`plugins/mccp/scripts/receipt/schemas/*.json` 또는 cli.js gate enum) 첫 cut에서는 무수정 — Codex R1이 옵션 A 신규 gate를 권장하면 revision round에서 수정.
- STATE.md frontmatter / envelope schema 무수정.
- `impeccable-detect.js` / `deep-research-detect.js` / `ultracode-detect.js` / `pr-phase-lock.js` / `pr-phase-guard.js` / `ultracode-phase-lock.js` / `ultracode-phase-guard.js` 무수정 — backward-compatible neighbor.
- `plugin.json` `version` 필드 값은 PR ship 시점 main HEAD 기준 결정 (axis A/B와 동일 정책).

## Tasks

### Task 1: WebFetch로 `/goal` native spec 재확인 (PRD risk #1 mitigation — implementation 시작 전 mandatory)

- **Action**: implementation 진입 직전 Anthropic 공식 docs를 WebFetch — Claude Code 최신 `/goal` 명령의 (a) 정확한 invocation 방식(`/goal <condition>` arg 형식), (b) acceptance condition syntax + matching semantics, (c) turn bound built-in 여부 + override 가능 여부, (d) **evaluator-side event/hook 노출 여부** (이것이 옵션 (c) 신규 receipt field 채택 여부의 결정적 증거), (e) `/goal` loop 도중 Claude 응답이 종료될 때 Stop hook가 fire되는지, fire된다면 session_id가 sub-session인지 main인지, (f) `/goal` 모드 진입/종료 시 사용자가 인지 가능한 signal(예: 출력 prefix, banner 등). 결과를 plan body 끝에 `<!-- goal native spec confirmed at <ISO>: stop_hook_fires=<bool>, sub_session_id_exposed=<bool|unknown>, turn_bound_default=<N|n/a>, evaluator_event_exposed=<bool>, summary=<...> -->` HTML comment로 stamp. spec이 본 plan 가정과 차이가 있다면 즉시 ABORT + plan 갱신 round. 특히 (e)가 false(Stop hook이 fire 안 함)이면 Stop hook 측 lock-aware short-circuit Task 7-8 자체가 redundant — plan 간소화. (d)가 true이면 옵션 (c) 신규 receipt field가 axis-specific 증거로 정당화 가능 — §5 matrix 재평가.
- **Mirror**: M2 Task 1 패턴 + PRD risk #1 mitigation pattern + integration template §10 audit checklist
- **Validate**: plan body 끝에 `<!-- goal native spec confirmed at` 줄이 있고, ISO timestamp + 5개 boolean/value 모두 채워져 있음. revision이 필요했다면 Task 2-13 갱신 사항이 plan body에 명시되어 있음.

### Task 2: `goal-detect.js` probe library (milestone reference parsing + closure 가능성 휴리스틱)

- **Action**: `plugins/mccp/scripts/lib/goal-detect.js`를 신규 작성. exports `detect({ mode, milestone, repoRoot, ... }) → { availability, goal_signal, signal_ref, mode, reason }`. CLI: `detect --mode milestone-close --milestone <id-or-prd-path> --json`. 입력은 `--milestone <id>` (PRD `Delivery Milestones` 행 번호 또는 PRD path) 또는 `--prd <path>` (PRD 전체 + auto-pick first `in-progress` row). probe:
  - env override `MCCP_GOAL_FEATURE=available|missing|unknown` (1순위)
  - filesystem probe: best-effort (`/goal`은 native command이므로 manifest 없음. `~/.claude/commands/goal.md` 또는 비슷한 signature 존재 → `available`. 명백한 부재 신호 없음 → default `unknown`)
  - default = `unknown` (phantom 안내 금지)
  - milestone parsing: PRD body의 `Delivery Milestones` table을 markdown row parser로 읽어 `--milestone <id>`와 match. id가 row 번호(`3`) 또는 milestone 이름 부분 일치(`axis C`)면 row 찾음. 찾은 row의 Status가 `in-progress`이고 Plan 셀이 채워져 있고 해당 plan file이 실제 존재하면 closure 가능성 signal=true. row Status가 `complete`(이미 닫힘) 또는 `pending`(아직 시작 안 됨)이면 signal=false + reason
  - path traversal guard: `--milestone` PRD path 또는 plan path 모두 `repoRoot` 안인지 검증. M2의 path-containment 패턴 mirror
  - mode-mismatch: mode가 `milestone-close` 외(`prd`/`plan`/`implement`/`pr`/`review`) → `reason=mode-mismatch` + exit 0
- **Mirror**: `ultracode-detect.js` + `deep-research-detect.js` shape + classification enum + path traversal guard + env override 1순위. **차이점**: PRD body parsing(M1)이나 plan body marker parsing(M2)이 아닌 **PRD `Delivery Milestones` table row parsing** + 휴리스틱 (Status + Plan + plan file existence AND-gated)
- **Validate**: (a) `node plugins/mccp/scripts/lib/goal-detect.js detect --mode milestone-close --prd .claude/prds/v1-4-0-automation-modernization.prd.md --json` → 본 plan ship 후 M3 row `in-progress`이면 `goal_signal=true` + signal_ref에 row 정보; (b) `MCCP_GOAL_FEATURE=missing` → `availability=missing`; (c) traversal 시 exit 0 + `reason=path-traversal`; (d) `--milestone 99` (없는 row) → `reason=milestone-not-found` + exit 0.

### Task 3: `goal-detect.test.js` node test (probe + 휴리스틱 정확성)

- **Action**: `plugins/mccp/scripts/lib/tests/goal-detect.test.js`를 신규 작성. 10 시나리오 커버 —
  1. env override `available`/`missing`/`unknown` 3 path
  2. PRD body에 M3 row Status=in-progress + Plan cell 비어있음 → `goal_signal=false` + `reason=plan-missing`
  3. PRD body에 M3 row Status=in-progress + Plan cell 채워있고 file 존재 → `goal_signal=true` + signal_ref
  4. PRD body에 M3 row Status=complete → `goal_signal=false` + `reason=already-closed`
  5. PRD body에 M3 row Status=pending → `goal_signal=false` + `reason=not-started`
  6. PRD body parsing edge: `Delivery Milestones` table이 PRD에 없음 → `reason=no-milestones-table` + exit 0
  7. `--milestone 99` (out-of-range row number) → `reason=milestone-not-found` + exit 0
  8. `--milestone "axis C"` (partial name match) → row found + signal evaluated
  9. path traversal (`../../etc/passwd`) → `reason=path-traversal` + exit 0
  10. mode=prd/plan/pr → `reason=mode-mismatch` + exit 0
- **Mirror**: `ultracode-detect.test.js` + `deep-research-detect.test.js` fixture/setup/teardown 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/goal-detect.test.js` → 10/10 통과. regression sweep `node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js plugins/mccp/scripts/lib/tests/ultracode-detect.test.js plugins/mccp/scripts/lib/tests/goal-detect.test.js` 통과.

### Task 4: `goal-phase-lock.js` multi-turn isolation lock CLI

- **Action**: `plugins/mccp/scripts/lib/goal-phase-lock.js`를 신규 작성. lock file: `<repoRoot>/.claude/state/goal-phase.lock`. sidecar token file: `<gitdir>/mccp/tmp/goal-token-<run-id>.dat`. Subcommands (ultracode-phase-lock.js 1:1 mirror, **lease만 90s default로 차별화**):
  - `enter --run-id <uuid> [--pid <int>] [--milestone-id <id>] [--owner-session-id <id>]` — `fs.openSync(p, 'wx')` exclusive create. lockBody = `{ ownership_token_hash: <sha256>, pid, host, started_at, mtime, milestone_id, owner_session_id }`. stdout: raw ownership_token. 이미 lock 있으면: stderr `lock already held` + exit 11.
  - `exit --run-id <uuid> [--cwd <path>]` — stdin pipe raw token, hash match → unlink. mismatch/missing → exit 16 + no unlink.
  - `heartbeat --run-id <uuid> [--cwd <path>]` — stdin pipe token, hash match → `fs.utimesSync` mtime 갱신. mismatch → exit 15 + no utimes.
  - `detect-stale [--max-age-ms <ms>] [--cwd <path>]` — never takes token. default max-age-ms=**90000** (M2의 60000보다 김). host-aware tri-state policy: same-host+pid-alive=NEVER reclaim / same-host+pid-dead=reclaim / cross-host=mtime-only / 0-byte/JSON-parse-error/missing-required-field=mtime-only fallback.
  - `read [--cwd <path>]` — JSON dump (debugging only)
- **Mirror**: `ultracode-phase-lock.js` 1:1 (CLI subcommands + lifecycle + token authority split + stdin-pipe IPC + host-aware tri-state reclaim + sidecar token file). 차이점: lease default + lock file name + owner_session_id field 추가 (F1 caller-identity discriminator 위해)
- **Validate**: (a) enter → stdout raw token + lock file 생성; (b) 같은 run-id 두 번째 enter → exit 11; (c) raw token stdin pipe exit → unlink + exit 0; (d) wrong token exit → exit 16 + lock 잔존; (e) sleep 95 + detect-stale → reclaim (90s 초과); (f) lock body host="other" 수동 변조 + detect-stale → cross-host mtime-only; (g) lock body에 `milestone_id` + `owner_session_id` field 포함 검증 (`read` subcommand로 확인)

### Task 5: `goal-phase-lock.test.js` node test (multi-turn heartbeat 시나리오 추가)

- **Action**: `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js`를 신규 작성. 12 시나리오 커버 — M2의 11 시나리오 + multi-turn heartbeat 1개 —
  1. enter → exit normal flow (raw token round-trip via stdin pipe)
  2. concurrent enter race — 단일 winner + loser exit 11
  3. wrong token exit → exit 16 + lock 잔존
  4. heartbeat token match → mtime 갱신 / mismatch → exit 15 + 무변경
  5. detect-stale same-host + pid alive → NEVER reclaim
  6. detect-stale same-host + pid dead → reclaim
  7. detect-stale cross-host → mtime-only (60s 미만 보호, 초과 reclaim 두 케이스)
  8. detect-stale 0-byte → mtime-only fallback
  9. detect-stale JSON parse error → mtime-only fallback
  10. detect-stale missing required field → mtime-only fallback
  11. enter with `--milestone-id` + `--owner-session-id` → lock body field 포함 검증
  12. **multi-turn heartbeat simulation** — enter → 30s sleep × 3회 heartbeat → 90s 경과 후에도 lock 유효(매번 heartbeat가 mtime 갱신)
- **Mirror**: ultracode-phase-lock.test.js 패턴 + spawnSync stdin/stdout pipe
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js` → 12/12 통과

### Task 6: `goal-phase-guard.js` PreToolUse hook (lock active 시 write deny + F1 discriminator + F2 fail-CLOSED)

- **Action**: `plugins/mccp/scripts/hooks/goal-phase-guard.js`를 신규 작성. PreToolUse hook contract — Claude Code hook stdin payload(`{ tool_name, tool_input, session_id?, ... }`) 받음, `<repoRoot>/.claude/state/goal-phase.lock` 읽고 lock 활성 여부 판단. 활성 시:
  - **deny matrix** (Codex impl-R1 F4 absorption — MultiEdit 추가; M2 ultracode-phase-guard.js parity):
    - Edit, Write, **MultiEdit**, NotebookEdit → deny ("goal-phase active: writes blocked. respond with `goal-done:`/`goal-failed:`/`goal-skipped:`")
    - Bash command starts with `node ` and contains `/scripts/receipt/cli.js write` → deny (receipt write)
    - Bash command writes to `.claude/state/` or `.claude/receipts/` or `.claude/milestone-closures/` → deny (state mutation outside lock)
    - Skill `mccp:*` → deny ("mccp:* not allowed during goal-phase; finalize first")
  - **allow matrix**:
    - Read, Grep, Glob → allow (read-only)
    - ToolSearch → allow
    - Bash `git status`/`git diff`/`git log` (read-only) → allow
    - Bash `node .../goal-phase-lock.js exit|heartbeat|read` → allow (lock lifecycle)
  - **F1 caller-identity discriminator** (Codex impl-R1 F3 absorption — non-owner ALLOW path을 read-only tools only로 좁힘): `payload.session_id` exposed AND `lock.owner_session_id` set → if not equal → **ALLOW only for read-only tools** (Read/Grep/Glob/ToolSearch + git read-only Bash + lock lifecycle Bash). Edit/Write/MultiEdit/NotebookEdit/Skill mccp:*/receipt-write는 session 무관하게 DENY 유지 — sub-session `/goal` evaluator도 mutation 불가. if equal → enforce deny (mccp main session attempting illegal write). discriminator absent → blanket-enforce + stderr warn (`feedback-loud-fail-open`). 이 변경으로 closure-document anchor가 mutation custody invariant를 그대로 유지하며 (option B), 신규 mccp-milestone-close-codex receipt gate (option A) 도입 회피
  - **F2 fail-CLOSED on malformed lock**: JSON parse error OR missing required field → emit systemMessage `[mccp:goal-phase-guard] lock malformed; failing CLOSED` + deny ALL tools until lock is fixed (CLAUDE.md `feedback-loud-fail-open` mirror — silent fail-open이면 lock 무력화됨)
  - lock 없음 → allow (no-op)
- **Mirror**: ultracode-phase-guard.js 1:1 + F1/F2 패턴
- **Validate**: dry-run with stub stdin → deny/allow matrix 모두 verifiable. unit test (Task 7)가 main coverage

### Task 7: `goal-phase-guard.test.js` hook PreToolUse contract test

- **Action**: `plugins/mccp/scripts/hooks/tests/goal-phase-guard.test.js`를 신규 작성. 14 시나리오 커버 (Codex impl-R1 F3+F4 absorption — non-owner ALLOW를 read-only만으로 좁힌 정책 + MultiEdit 추가) —
  1. lock 비활성 + Edit → ALLOW
  2. lock 활성 (same session_id) + Edit → DENY (deny matrix)
  3. lock 활성 (same session_id) + Write → DENY
  4. lock 활성 + Bash receipt write → DENY
  5. lock 활성 + Bash `.claude/milestone-closures/foo.md` write → DENY
  6. lock 활성 + Skill `mccp:plan` → DENY
  7. lock 활성 + Read/Grep/Glob → ALLOW (3 시나리오 합쳐도 됨)
  8. lock 활성 + Bash `git status` → ALLOW
  9. lock 활성 + Bash `node .../goal-phase-lock.js heartbeat` → ALLOW
  10. **F1 discriminator (revised, R1 F3 absorption): lock 활성 + payload.session_id ≠ lock.owner_session_id + Edit → DENY** (mutation은 sub-session 무관 항상 차단)
  11. **F1 discriminator (revised): lock 활성 + payload.session_id ≠ lock.owner_session_id + Read → ALLOW** (read-only는 sub-session에서 통과)
  12. **F1 discriminator: discriminator 부재(payload.session_id undefined) + Edit → DENY + stderr warn** (blanket-enforce + loud)
  13. **F2 fail-CLOSED: malformed lock (JSON parse error) + Read → DENY + systemMessage emit** (silent fail-open 방지)
  14. **F4 absorption: lock 활성 + MultiEdit (same OR non-owner session) → DENY** (M2 parity 검증)
- **Mirror**: ultracode-phase-guard.test.js + node:test patterns
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/goal-phase-guard.test.js` → 12/12 통과

### Task 8: `stop-review-loop.js` lock-aware short-circuit (M3-specific layer, axis A/B에는 없음)

- **Action** (Codex impl-R1 F2 absorption — freshness validation 추가; presence-only check는 stale/forged lock에 trivially bypassable이라 거부): `plugins/mccp/scripts/hooks/stop-review-loop.js`를 minimal-diff로 수정. 변경 위치: 메인 hook function 진입부에서 `modeFromEnv(env)` 호출 직후, `gitDiffEmpty(cwd)` 호출 직전. 추가 코드 (~20 lines, inline check — 별도 subprocess 회피해 Stop hook 성능 영향 최소):
  ```javascript
  // M3 axis C — goal-phase lock-aware short-circuit (with freshness validation per Codex impl-R1 F2)
  // /goal 모드 multi-turn loop 도중 fire되는 Stop hook가 mccp의 quality runner/loop-counter/fix-task을
  // 침해하지 않도록 lock 활성 시 즉시 pass-through allow. presence check만으로는 forged/stale lock 우회
  // 가능하므로 host + pid + mtime 3-axis freshness validation 필수 — §3.6 host-aware tri-state policy mirror.
  try {
    const goalLockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    if (fs.existsSync(goalLockPath)) {
      const lockRaw = fs.readFileSync(goalLockPath, 'utf8');
      const lock = JSON.parse(lockRaw);
      if (lock && lock.ownership_token_hash && lock.host && lock.pid) {
        const lockStat = fs.statSync(goalLockPath);
        const ageMs = Date.now() - lockStat.mtimeMs;
        const leaseMs = 90000; // 90s — Task 4 default lease
        const sameHost = lock.host === os.hostname();
        let pidAlive = false;
        if (sameHost) {
          try { process.kill(lock.pid, 0); pidAlive = true; } catch {}
        }
        // suppress iff: same-host+pid-alive OR cross-host+age<lease
        const fresh = (sameHost && pidAlive) || (!sameHost && ageMs < leaseMs);
        if (fresh) {
          debug(process.stderr, `suppressed: goal-phase lock active (run=${lock.run_id || 'unknown'} milestone=${lock.milestone_id || 'unknown'} ageMs=${ageMs})`);
          process.stdout.write(rawInput);
          process.exit(0);
        }
        debug(process.stderr, `goal-lock found but stale or foreign-dead — falling through (sameHost=${sameHost} pidAlive=${pidAlive} ageMs=${ageMs})`);
      }
    }
  } catch (e) {
    // Loud fail-open — log + continue
    debug(process.stderr, `goal-lock check failed: ${e.message}`);
  }
  ```
  기존 `modeFromEnv`/`gitDiffEmpty`/decision tree 변경 없음. `os` import 필요 (`require('os')` 또는 기존 import 라인에 추가). 기존 test가 모두 통과해야 함 (backward-compat).
- **Mirror**: CLAUDE.md `feedback-loud-fail-open` principle + 기존 stop-review-loop.js의 debug() 패턴 + decision tree 진입 순서 보존
- **Validate**: (a) goal-phase.lock 없는 평소 상태 → 기존 동작 그대로(기존 stop-review-loop.test.js 모두 통과); (b) goal-phase.lock 활성 시 quality runner 실행 안 함 + stderr `[mccp:stop-review-loop] suppressed: goal-phase lock active` line + decision={} pass-through; (c) goal-phase.lock JSON parse error 시 stderr `goal-lock check failed:` + 기존 decision tree fall-through (Stop hook가 죽지 않음)

### Task 9: `stop-review-loop.test.js` 신규 시나리오 2개 추가

- **Action**: `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js`를 수정 (or CREATE if not exists). 기존 test 무수정, 2개 시나리오 추가:
  1. **goal-phase lock active suppression**: tmp dir에 valid `.claude/state/goal-phase.lock` 작성(필수 field 포함) + spawnSync child로 stop-review-loop.js 실행 + stub stdin(`{transcript_path: '/tmp/empty.jsonl', cwd: <tmp>}`) → 검증: (a) exit 0, (b) stdout = rawInput pass-through, (c) stderr에 `suppressed: goal-phase lock active` line, (d) quality runner 실행 흔적(loop-counter.json write 등) 없음
  2. **goal-phase lock parse error fail-open**: tmp dir에 0-byte 또는 invalid JSON `.claude/state/goal-phase.lock` 작성 + 동일 stub → 검증: (a) exit 0, (b) stderr에 `goal-lock check failed:` line, (c) 기존 decision tree fall-through(MCCP_STOP_LOOP=off env로 minimal path 확인)
- **Mirror**: 기존 stop-review-loop.test.js의 fixture 패턴 + node:test + os.tmpdir
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` → 기존 시나리오 전부 + 신규 2개 모두 통과

### Task 10: `/mccp:milestone-close` 신규 slash command 본문

- **Action**: `plugins/mccp/commands/milestone-close.md`를 신규 작성. 구조:
  - frontmatter (description, argument-hint, allowed-tools)
  - Phase 0 — PREFLIGHT: working-tree check + milestone arg parsing + cost-tier check (≥ critical 시 STOP)
  - Phase 1 — DETECT: `goal-detect.js` 호출 → availability + signal 평가. signal=false 시 silent skip + STOP
  - Phase 2 — LOCK ENTER + COOPERATIVE GUIDE: `goal-phase-lock.js enter` 호출 + raw token shell var stash + 사용자에게 안내:
    ```
    [mccp:milestone-close] /goal mode 진입 안내
    1. 다음 turn에서 `/goal <acceptance condition>` 명령을 직접 실행
       acceptance condition은 milestone 종료 조건 (예: "all tests pass + CHANGELOG updated + PR template filled")
    2. /goal loop가 condition을 만족할 때까지 자동 반복
    3. 종료 후 다음 grammar로 응답:
       - goal-done:<≥3-word summary>
       - goal-failed:<reason>
       - goal-skipped:<reason>
    ⚠ /goal 모드 안에서 mccp:* 명령 호출 금지 (cooperative invariant)
    ⚠ lock 활성 중 mccp의 Edit/Write/receipt-write는 mechanical block됨
    ```
  - Phase 3 — WAIT: 사용자 응답 grammar parse. mismatch 시 prompt 재출력.
  - Phase 4 — LOCK EXIT + INJECT: stdin-pipe로 raw token 전달 후 `goal-phase-lock.js exit`. closure document `.claude/milestone-closures/<milestone-id>.md` 작성 (frontmatter 없음, plain markdown: `## Milestone` `## Acceptance Condition` `## Goal Loop Result` `## Provenance` 4 섹션). plan body 끝(in 원본 source plan)에 `## Milestone Closure Provenance` 섹션 append (milestone-id + verdict + closure-doc-path + sha256(closure-doc 본문) + ISO timestamp).
  - Phase 5 — CODEX GATE: 첫 cut(옵션 B) — 별도 mccp-milestone-close-codex receipt 발행하지 않음. closure doc + plan body provenance stamp가 다음 `/mccp:pr`의 plan_hash anchor에 자동 포함됨. Phase 5 끝에 handoff line: `Next: /mccp:pr` (또는 milestone closure가 통과 못 했으면 `Next: revise plan / re-implement`)
- **Mirror**: M2 `prp-implement.md` Phase 3.5 (LOCK ENTER + COOPERATIVE GUIDE + WAIT + LOCK EXIT + INJECT) + work.md Phase 0 PREFLIGHT 패턴 + plan.md Phase 5 (Codex gate orchestration — 단, 본 command는 첫 cut 옵션 B로 Codex 호출 생략)
- **Validate**: smoke test (수동) — 본 plan ship 직후 dogfood 세션에서 `/mccp:milestone-close 3` (M3 row) 호출 → Phase 0~5 모두 진입 + closure doc 작성 + plan body provenance stamp 확인. 자동 e2e test는 별도 milestone에 defer

### Task 11: `hooks.json` PreToolUse 등록 + `plugin.json` version 정책 stamp

- **Action**: `plugins/mccp/hooks/hooks.json`의 PreToolUse 배열에 `goal-phase-guard` entry 추가 (pr-phase-guard, ultracode-phase-guard와 병렬 등록). matcher는 `*` (모든 tool — 본문에서 deny matrix로 filter). Stop 배열 무변경.
  ```json
  {
    "matcher": "*",
    "hooks": [
      { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/goal-phase-guard.js\"" }
    ],
    "description": "mccp v1.x.x M3 — goal-phase isolation: deny mccp writes during /goal multi-turn loop",
    "id": "mccp:goal-phase-guard:pre"
  }
  ```
  `plugins/mccp/.claude-plugin/plugin.json` `version` 필드는 본 task에서 변경하지 않음 — PR ship 시점 main HEAD 기준으로 결정 (CLAUDE.md §3.7). 본 plan body 끝에 `<!-- version-bump-policy: deferred to PR ship per CLAUDE.md §3.7; current=1.6.0 (axis B m2 ship 후) -->` HTML comment stamp.
- **Mirror**: ultracode-phase-guard 등록 패턴 (PR #42 diff 참조 가능). CLAUDE.md §3.7 hot-fix 절차
- **Validate**: hooks.json JSON syntax 유효 (e.g. `node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json'))"` 통과). PreToolUse 배열에 `mccp:goal-phase-guard:pre` id 존재 grep 확인.

### Task 12: `integration-template.md` axis C 셀 채움 + status mark 갱신 + PRD Open Q #3 결정

- **Action**: `docs/automation-modernization/integration-template.md`를 수정:
  - §3 Three-layer breakdown — layer 4 (axis-specific) axis C 셀: `goal-phase-lock.js` + `goal-phase-guard.js` PreToolUse + `stop-review-loop.js` lock-aware short-circuit. **M2와 차별점 명시**: M2(axis B)는 PreToolUse layer만 필요(단일-turn 위임), M3(axis C)는 Stop hook 측 short-circuit도 필요(multi-turn loop 동안 Stop hook가 fire). 이로써 §3 layer 4가 "isolation lock (1축 또는 2축 — 축 수는 native 명령의 turn 모델에 따라 결정)"으로 일반화.
  - §5 matrix axis C 셀 채움. 첫 cut: option (a) ✗ rejected, (b) ✓ adopted (closure-doc-body inject + plan-body provenance hash, M1+M2와 같은 mechanic) — axis-independent 평가 결과 동일 결론 도달. (c) ✗ deferred (axis-specific 증거 없음 — Codex R1 평가에서 옵션 (c) 권장 시 revision round에서 변경), (d) ✗ N/A (single-session). **Codex R1 결과에 따라 본 셀 갱신**: R1이 (c) 신규 receipt field 권장 시 (c) ✓ adopted로 전환 + 신규 gate `mccp-milestone-close-codex` 도입 rationale 추가.
  - §6 Anti-patterns 보강: "Stop hook side-effect leakage during multi-turn native loop (e.g. /goal evaluator) without Stop-hook side isolation" 항목 추가 — axis C 시점에 발견된 새로운 anti-pattern.
  - §8 placeholder → reference 전환 (M2 axis B 패턴 mirror): Plan 경로, Detection probe 경로, Probe tests, Cooperative guide turn, Injection step, Custody anchor option, Grammar, Isolation lock layer 양축 명시, Stop-hook short-circuit 명시.
  - §9 audit checklist 신규 항목 2개 추가:
    - `[ ] Stop-hook isolation mechanism (if axis dispatches work to multi-turn native loop)`: `stop-review-loop.js` lock-aware early-return short-circuit + tests for (a) lock active suppression + (b) malformed lock loud fail-open
    - `[ ] Multi-turn lock lease sizing`: native loop turn 수 expected upper bound × per-turn duration > lease(default 90s)이면 heartbeat orchestration 필수 + dogfood validation
  - 헤더 status mark: `**M1+M2-validated**` → `**M1+M2+M3-validated**` (3-axis sample). 본문에 명시: cross-axis invariant 잠금은 여전히 회피 (3개 sample도 일반화 충분 안 됨 — 새 axis는 axis-independent 평가 유지). PRD Open Q #3 (template doc M4 별도 vs 누적) 결정 stamp: **결정 = 누적 패턴 유지, M4 별도 milestone redundant** — PRD M4 row는 본 milestone-close 종료 시 status `dropped` + remark `M1+M2+M3 누적으로 충족, M4 별도 milestone 불필요 (2026-XX-XX)`.
  - 끝 줄(extended marker) 갱신: `extended 2026-XX-XX with axis C (M3) reference + Stop-hook isolation layer + 3-axis sample status mark`
- **Mirror**: M2의 integration-template.md update 패턴 (M1 reference + M2 reference + status mark 진행)
- **Validate**: `grep -c "axis C" docs/automation-modernization/integration-template.md` → ≥10 (axis C 언급 명시적). status mark grep → `M1+M2+M3-validated` 1회. §8 axis C 모든 sub-bullet 채워짐. §9 신규 항목 2개 추가됨. M4 결정 stamp 확인.

### Task 13: PRD + CHANGELOG + milestone-closures README 마무리

- **Action**:
  - `.claude/prds/v1-4-0-automation-modernization.prd.md` 업데이트:
    - M1 row Status `complete` (already complete — 무수정 또는 누락 fix 시 변경)
    - M2 row Status `in-progress → complete` + Plan cell 무수정 (PR #42로 이미 ship — stale 정리)
    - M3 row Status `pending → in-progress` + Plan cell `[.claude/plans/v1-4-0-m3-goal-milestone-close.plan.md](../plans/v1-4-0-m3-goal-milestone-close.plan.md)`
    - M4 row Status `pending → dropped` + remark "M1+M2+M3 누적으로 충족 (Task 12 결정)" — 또는 Codex R1이 M4 별도 milestone 유지 권장 시 row 유지 + Open Q remark
    - Open Questions 섹션: #1 Stop hook 격리 결정(mechanical lock + Stop hook short-circuit hybrid 채택) stamp, #3 template doc 결정 stamp
  - `CHANGELOG.md` 업데이트: v1.x.x row에 axis C 항목 추가 — content: `/mccp:milestone-close` 신규 command + goal-phase 3축 isolation(detect + PreToolUse guard + Stop hook short-circuit) + milestone closure doc anchor + integration template §3/§5/§8/§9 axis C 채움 요약 + PRD Open Q #1/#3 결정 stamp
  - `.claude/milestone-closures/README.md` 신규 작성: 1-paragraph spec — closure document 4-section format + emit 경로 + audit-trail invariant ("이 디렉토리의 파일은 직접 편집 금지 — `/mccp:milestone-close` 출력물. mutation 시 다음 plan-codex validate에서 plan_hash mismatch로 detect됨")
- **Mirror**: M2 plan Task 12-13의 PRD/CHANGELOG 업데이트 패턴 + axis A의 milestone reference 자료 구조
- **Validate**: PRD M3 row Status 갱신 grep 확인 + CHANGELOG entry grep 확인 + `.claude/milestone-closures/README.md` 1-paragraph spec 작성 확인

## Validation

```bash
# unit tests — 4개 신규 test file + 1 update
node --test plugins/mccp/scripts/lib/tests/goal-detect.test.js
node --test plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js
node --test plugins/mccp/scripts/hooks/tests/goal-phase-guard.test.js
node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js

# regression sweep — M1/M2 patterns 유지 검증
node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js
node --test plugins/mccp/scripts/lib/tests/ultracode-detect.test.js
node --test plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js
node --test plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js
node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js

# hooks.json JSON syntax check
node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json', 'utf8'))"

# goal-detect CLI smoke (env override + missing milestone)
MCCP_GOAL_FEATURE=missing node plugins/mccp/scripts/lib/goal-detect.js detect --mode milestone-close --prd .claude/prds/v1-4-0-automation-modernization.prd.md --json
node plugins/mccp/scripts/lib/goal-detect.js detect --mode milestone-close --milestone 99 --json

# goal-phase-lock CLI smoke
RUN_ID=$(node -e "console.log(require('crypto').randomUUID())")
TOKEN=$(node plugins/mccp/scripts/lib/goal-phase-lock.js enter --run-id "$RUN_ID" --pid $$ --milestone-id m3-test)
echo "$TOKEN" | node plugins/mccp/scripts/lib/goal-phase-lock.js exit --run-id "$RUN_ID"

# template doc axis C 채움 확인
grep -c "axis C" docs/automation-modernization/integration-template.md
grep -q "M1+M2+M3-validated" docs/automation-modernization/integration-template.md

# PRD M3 row 갱신 확인
grep -E "^\| 3 \|" .claude/prds/v1-4-0-automation-modernization.prd.md

# smoke test (수동) — dogfood:
# /mccp:milestone-close 3
# (Phase 0~5 진입 + closure doc 작성 + plan body provenance stamp 확인)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `/goal` evaluator-side Stop hook fire 여부 spec 미확정 → Stop-hook short-circuit 자체가 redundant 또는 부족 | HIGH | Task 1 WebFetch 결과로 결정. fire 안 함 → Task 7-8 simplify; fire하지만 sub-session이면 F1 discriminator로 해결; fire하고 main session이면 본 plan의 short-circuit이 정확함 |
| Multi-turn loop 도중 lock heartbeat 누락 → stale 판정 + 다른 worktree에서 reclaim | MED | lease 90s + heartbeat 권장 주기 30s + dogfood validation으로 실제 turn duration 측정. 필요 시 lease 길이 조정 (Codex R1 평가 대상) |
| 새 receipt gate 추가가 cross-axis schema invariant lock-in | MED | 첫 cut 옵션 B (gate 무추가, closure doc + plan-body anchor만)로 보수적 시작. Codex R1이 옵션 A 권장 시 revision round에서 추가 (axis-specific 증거 요구) |
| `stop-review-loop.js` 본문 수정이 기존 5+ 시나리오 회귀 유발 | MED | minimal-diff (5줄 추가, 기존 함수 무수정) + 기존 stop-review-loop.test.js 전부 통과 검증을 Task 9 acceptance에 포함 |
| `/goal` cost ceiling 충돌 (PRD Risk #3) — 무한 루프 | MED | Phase 0 preflight에서 cost-tier ≥ critical 시 STOP + cost-tier ≥ warning 시 confirmation. cost-state.js read-only 호출이라 기존 cost-tracker hook과 충돌 없음 |
| F1 caller-identity discriminator 작동 안 함 (`/goal` evaluator의 session_id가 main session과 동일) | MED | discriminator 부재 시 blanket-enforce + stderr warn (loud fail-open) 채택. 사용자가 명시적으로 lock exit 후 재진입해야 함 — UX cost는 cooperative prompt에 명시 |
| Template doc axis C 셀 채움이 axis A/B 셀과 inconsistent (예: axis-specific 평가 결과 달라짐) | LOW | §6 anti-pattern "first axis's custody anchor is generalized to a cross-axis invariant"가 본 risk를 명시적으로 방어. axis-independent 평가가 invariant |
| milestone-closures 디렉토리가 git-tracked인데 sensitive content가 들어갈 가능성 | LOW | closure document spec(Task 13)에 "no secrets, no PII — public-facing audit artifact" 명시. 추후 derive engine privacy guard (v1.3.0-m4 패턴) 적용 검토 — 본 milestone scope 외 |

## Acceptance

- [ ] Task 1 (WebFetch native spec) 통과 — plan body 끝 HTML comment stamp 완료
- [ ] Task 2-3 (goal-detect.js + tests) 통과 — 10/10 tests, false-positive fixture로 false-positive 0 확인
- [ ] Task 4-5 (goal-phase-lock.js + tests) 통과 — 12/12 tests, multi-turn heartbeat 시나리오 verified
- [ ] Task 6-7 (goal-phase-guard.js + tests) 통과 — 12/12 tests, F1 discriminator + F2 fail-CLOSED 검증
- [ ] Task 8-9 (stop-review-loop.js short-circuit + tests) 통과 — 기존 시나리오 회귀 0, 신규 2 시나리오 통과
- [ ] Task 10 (`/mccp:milestone-close` command) — 본문 작성 완료 + 수동 dogfood smoke 통과
- [ ] Task 11 (hooks.json 등록) — JSON syntax 유효 + PreToolUse 배열에 entry 추가
- [ ] Task 12 (template doc axis C) — §3/§5/§6/§8/§9 모두 갱신 + status mark M1+M2+M3-validated + PRD Open Q #3 결정 stamp
- [ ] Task 13 (PRD + CHANGELOG + milestone-closures README) — M1/M2 row stale 정리 + M3 in-progress + M4 결정 stamp + CHANGELOG entry + README spec 작성
- [ ] Validation 명령 모두 통과 (regression sweep + unit + smoke)
- [ ] PRD Success Metric 2 (receipt chain custody) — `mccp:receipt-validate` 모든 gate 통과 (옵션 B 채택 시 gate 무추가, 옵션 A 채택 시 신규 gate 추가 후 validate 통과)
- [ ] PRD Success Metric 4 (통합 template 재사용) — integration-template.md §3/§5 matrix 비교에서 M3가 M1+M2와 동일 호출 layer 패턴 + axis-specific 4th layer만 차이로 명시

<!-- version-bump-policy: deferred to PR ship per CLAUDE.md §3.7; current=1.6.0 (axis B m2 ship 후) -->

<!-- goal native spec confirmed at 2026-06-19T13:00:00Z (source: https://code.claude.com/docs/en/goal):
  stop_hook_fires=true (/goal IS a session-scoped prompt-based Stop hook — evaluator IS the Stop hook firing each turn),
  sub_session_id_exposed=false (same session_id as parent — F1 caller-identity discriminator does NOT differentiate /goal evaluator turns from user turns; lock activation itself is the only signal — Tasks 6/8 design correct),
  turn_bound_default=none (no built-in cap; user includes "or stop after N turns" clause in condition itself),
  evaluator_event_exposed=false (no separate event surface — evaluator is just a Stop hook firing on small fast model, default Haiku),
  summary=/goal wraps a session-scoped prompt-based Stop hook. The evaluator runs on the small fast model (Haiku), judges acceptance condition vs conversation surface only (no tool calls), returns yes/no + short reason. Cost typically negligible. v2.1.139+. 4000-char condition limit. One goal per session. Visible `◎ /goal active` indicator. `/goal clear|stop|off|reset|none|cancel` for early termination. Requires trust dialog; fails if disableAllHooks or allowManagedHooksOnly. Resume restores active goal but resets counters. Non-interactive `-p` supported.
  plan_alignment: spec confirms Task 8 (Stop hook short-circuit) is necessary. Task 6 F1 discriminator session_id check trivially equal during /goal mode — blanket-enforce + deny-matrix remains the primary protection. cooperative-guide prompt should mention `◎ /goal active` indicator for user wayfinding and `/goal clear` for early exit.
-->

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 — escalate 조건 미충족, ACCEPT_NOW × {HIGH, CRITICAL} finding 0건)
- 합치 결론: `verdict=approve` / `classification=ok` / `blocking=false` — Codex가 branch diff target(main 대비)을 review했고 worktree commit 전 상태라 diff가 비어있어 material finding을 anchor 불가. 본 plan에 대한 직접적 design-level objection 없음. focus questions 3축(custody anchor 옵션, stop-review-loop.js 결합도, multi-turn lock heartbeat orchestration)은 implementation cycle 도중 dogfood 검증 + M2 ship 후 누적된 운영 신호로 재평가
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | n/a | n/a | n/a | Codex가 diff 부재로 finding anchor 불가 — triage 대상 없음 |
- Deferred to backlog: 0건
- Open Questions:
  - **CQ1 — custody anchor option (b) vs (a) `mccp-milestone-close-codex` 신규 gate** (severity MEDIUM) — 본 plan 첫 cut 옵션 B 채택. implementation Task 10 도중 `/goal` evaluator-side event signature가 노출되면 §5 matrix axis C 셀 재평가 + revision round 트리거. dogfood validation까지 잠정 채택
  - **CQ2 — `stop-review-loop.js` 5-line in-function insertion 결합도** (severity LOW) — minimal-diff invariant + backward-compat test sweep (Task 9 acceptance에 명시)로 결합도 cost 통제. 별도 Stop hook 신설 시 order/priority 보장 못 함 — mechanical 우위는 in-function insertion. dogfood 회귀 발견 시 separate-hook으로 전환 검토
  - **CQ3 — `/goal` multi-turn loop heartbeat orchestration 주체** (severity MEDIUM) — 첫 cut: slash command body가 heartbeat 호출 책임 (사용자 응답 대기 중 background heartbeat은 hook이 fire 안 되므로 불가). 사용자 mid-loop pause 시 lock이 90s 후 stale 판정될 수 있음 — Task 1 WebFetch에서 `/goal` 모드 turn duration 측정 후 lease 길이 재조정 또는 사용자 측 heartbeat 안내 prompt 추가 검토. dogfood signal 우선
- Codex session 참조: threadId=`019edfdc-761f-7ef0-b7f2-c9c5b8a715d8` (durationMs=54855, summary="No-ship finding cannot be supported: the branch diff against main is empty")

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 — escalation 평가: 4 finding 모두 plan body absorption으로 fully resolved → R2 불필요. MCCP_GATE_ROUND_CAP=1 default 준수)
- 합치 결론: `verdict=needs-attention` / `classification=ok` / `blocking=false` — Codex가 working-tree(0 staged + 0 unstaged + 1 untracked) review 후 4 substantive finding(3 HIGH + 1 MEDIUM) 도출. R1 absorption으로 모두 ACCEPT_NOW, plan body Task 4/6/7/8 entries + 본 review section의 absorption notes로 fix specify
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Goal lock token cannot survive WAIT turn | HIGH | ACCEPT_NOW | shell var stash가 user `/goal` turn boundary에서 휘발됨. Task 4가 이미 sidecar token file `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` 정의했으나 Task 10 Phase 4가 shell var stash 가정 — implementation 시 Phase 4 LOCK EXIT 단계에서 `cat <sidecar-path>`로 raw token 읽어 stdin pipe로 `goal-phase-lock.js exit` 호출. **Test 추가**: Task 5 시나리오 12를 "separate process enter→user-turn-simulation→exit" 형태로 강화. |
  | F2 — Stop hook bypass trusts any valid-looking lock | HIGH | ACCEPT_NOW | Task 8 short-circuit이 presence-only check라 stale/forged lock에 bypass됨. Plan body Task 8 absorption 완료 — ~20-line inline freshness validation(host match + pid alive + mtime < 90s lease, §3.6 tri-state mirror) 추가. **Test 추가**: Task 9 시나리오를 4개로 확장 (lock active+fresh=suppress, lock stale=fall-through, lock foreign-dead=fall-through, lock parse-error=fall-through). |
  | F3 — F1 allows post-implementation edits without receipt gate | HIGH | ACCEPT_NOW | F1 discriminator ALLOW path이 Edit/Write 포함 → sub-session `/goal` edit이 implement-codex receipt 밖에서 landing. Plan body Task 6 absorption 완료 — non-owner ALLOW를 read-only tools(Read/Grep/Glob/ToolSearch + git read-only + lock lifecycle Bash)로 좁힘. Edit/Write/MultiEdit/NotebookEdit/Skill mccp:*는 session 무관 항상 deny. option B(closure doc anchor) 유지하면서 mutation custody invariant 보존, option A(신규 gate) 도입 회피. **Test 추가**: Task 7 시나리오 10을 "non-owner + Edit=DENY"로 flip + 시나리오 11 신규 "non-owner + Read=ALLOW" 추가. |
  | F4 — Write guard omits MultiEdit | MEDIUM | ACCEPT_NOW | M2 ultracode-phase-guard.js와 parity 누락. Plan body Task 6 deny matrix에 MultiEdit 추가 + Task 7 시나리오 14 신규(MultiEdit deny same+non-owner 양축). |
- Deferred to backlog: 0건
- Open Questions:
  - **CIQ1 — sidecar token file 누락 fallback UX** (severity LOW) — sidecar 파일이 일부 환경에서 lost되거나 user가 mid-loop에서 다른 worktree로 이동 시 exit subcommand가 token mismatch (exit 16)로 실패해 lock이 mtime 만료(90s)까지 잔존. Implementation 시 milestone-close.md Phase 4에 sidecar 부재 detect + 사용자 안내 prompt(`detect-stale` 호출 + recovery instruction) 추가.
  - **CIQ2 — `/goal` evaluator의 edit tool 호출 가능 여부 (Task 1 WebFetch에 종속)** (severity MEDIUM) — F3 absorption이 sub-session mutation을 mechanical block하지만, `/goal` evaluator가 acceptance condition을 만족시키기 위해 edit을 시도하는 use-case가 있다면 user가 명시적으로 `/goal` 종료 후 `/mccp:prp-implement` 재실행하는 cooperative 패턴이 강제됨. Task 1 WebFetch 결과에서 `/goal` 모드가 read-only assessment loop면 absorption 정확. 호출 가능한 경우 milestone-close.md cooperative guide prompt에 UX cost 명시 + 사용자 retraining.
  - **CIQ3 — Codex가 `mccp-milestone-close-codex` 신규 gate(option A) 권장** — plan-codex의 CQ1을 implement-codex가 axis-specific 증거(F3)로 정당화. R1 absorption은 option B + strict read-only policy로 동등 보안 도달 — gate 추가 회피. dogfood signal 후 option A 재평가 가능 (revision round trigger 조건: closure-doc-only audit이 incident 발생 시 root-cause 추적에 부족하다고 판단되면).
- Codex session 참조: threadId=`019edff7-6b81-7351-94e4-71ba3713aad3` (durationMs=297813, classification=ok, blocking=false, advisory=false, status=needs-attention)

### Security Reviewer

- 호출: `Agent(security-reviewer, "review proposed implementation: lock token authority + PreToolUse deny matrix + Stop hook bypass surface")` — 독립 보안 lens (Codex F1-F4 absorption 외 별도)
- 발견: 6 finding (1 CRITICAL + 2 HIGH + 3 MEDIUM) — Codex와 중복 0건
- YAGNI Triage (security findings):
  | # | Sev | Title | Verdict | Absorption |
  |---|---|---|---|---|
  | S1 | CRITICAL | Sidecar token file 모드 0o600 plan 명시 누락 — implementer가 mirror 코드(`ultracode-phase-lock.js:299` `fs.openSync(sp, 'w', 0o600)`)에서 mode 인자 누락 시 token이 world-readable로 노출 → 로컬 권한 상승 | ACCEPT_NOW | Task 4 Action에 명시 추가: "sidecar token file MUST `fs.openSync(sp, 'w', 0o600)` (mirror parity)". Task 5 시나리오에 `fs.statSync(sidecarPath).mode === 0o600` (POSIX) / restricted ACL (Windows) 검증 추가 |
  | S2 | HIGH | `goal-detect.js` path traversal guard가 startsWith 직접 호출 시 symlink 우회 가능 | ACCEPT_NOW | Task 2 Action에 명시: `fs.realpathSync(milestone)` → resolved path가 `fs.realpathSync(repoRoot)` 내부인지 startsWith 검증 (`ultracode-phase-lock.js:231-243` F8 mirror). Task 3 시나리오 9를 "symlink-pointing-outside-repo → reason=path-traversal"로 강화 |
  | S3 | HIGH | `goal-phase-guard.js` Bash 차단 정규식이 mixed slashes / `bash -c` wrapper / symlink alias로 우회 가능 | ACCEPT_NOW | Task 6 Bash 정책을 fail-closed로 전환: lock 활성 중 **모든 Bash command 차단**, allow는 명시적 whitelist (`git status/diff/log`, `node .../goal-phase-lock.js {exit\|heartbeat\|read}`). 정규식 매칭 부담 제거 + 우회 surface 0. Test 시나리오에 `bash -c "node ..."`, mixed slashes, env-var expansion 3 case 추가 |
  | S4 | MEDIUM | Stop hook freshness validation fail-open 메커니즘 plan 명시 부족 | ACCEPT_NOW (doc) | Task 8 inline pseudo-code에 주석 추가: "`JSON.parse` 실패(0-byte 포함) → catch 분기로 fall-through, 기존 Stop-loop decision tree 정상 진입. 즉 forged-empty lock은 suppress가 아닌 normal-stop 처리 — silent fail-open invariant 보존". Validate 항목에 "0-byte lock → fall-through" 명시 |
  | S5 | MEDIUM | `.claude/milestone-closures/` git-tracked + sanitization 없음. `/goal` evaluator output에 credential/PII 포함 시 commit 노출 | ACCEPT_NOW (best-effort) | Task 10 Phase 4 closure-doc write 직전에 `plugins/mccp/scripts/derive/mask.js#applySecretMask` 호출 추가 (v1.3.0-m4 5-regex catalogue 재사용). Task 13 README spec에 명시: "evaluator output은 mask 통과한 형태로만 inject — raw paste 금지". 추후 milestone에서 mechanical enforcement (closure-doc write 시 pre-commit hook으로 mask diff verify) |
  | S6 | MEDIUM | Sidecar mkdir-before-lock H2 rationale plan 명시 부족 | ACCEPT_NOW (doc) | Task 4 Action에 H2 absorption note 추가: "sidecar dir `mkdirSync` MUST be invoked BEFORE lock `fs.openSync(p, 'wx')` — mkdir 실패 시 lock 생성 자체를 abort해 orphaned lock(=ownership channel 없음) 회피 (`ultracode-phase-lock.js:254` H2 mirror)". Task 5 시나리오에 "sidecar mkdir EACCES mock → cmdEnter exit non-zero + lock 미생성" 추가 |
- Open Questions (security): 0건 (모두 absorbable)
- Verdict: S1 CRITICAL + S2/S3 HIGH 발생 → Phase 2.5.5 spec "CRITICAL/HIGH security findings → MCCP-GATE-STOP" trigger. **Receipt 미발행 — 사용자 review 후 재호출 시 본 절의 absorption commitment를 implementation이 자동 적용**

### Design Review

<!-- placeholder: filled by Phase 2.5.5b impeccable detect (likely skipped — implement mode default no design signal) -->
