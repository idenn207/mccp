# Plan: v1.0.1 axis-P — Hook Tidy + ECC→MCCP env namespace

**Source**: free-form (이전 분석 답변 5축 + 사용자 신규 요청 F축)
**Selected Milestone**: v1.0.1 patch cycle, **axis-P** (신규 — roadmap-index 등록 필요)
**Complexity**: Large
**Worktree (proposed)**: `c:\_project\my\my-claude-code-plugin-v1.0.1-axis-p`
**Branch (proposed)**: `v1.0.1-axis-p`

## Summary

mccp의 hooks.json + scripts/hooks tree를 ECC fork 잔재 정리 + mccp v0.2+ 게이트와의 중복 제거 관점에서 청소. 동시에 user-facing **`ECC_*` 환경변수 prefix를 모두 `MCCP_*`로 hard-cut rename**해 ECC + mccp를 동시 설치한 사용자가 각 plugin을 독립적으로 제어할 수 있게 함. backward-compat alias는 두지 않음(alias가 곧 충돌 원천이므로 사용자 요청 의도에 반함).

축 B(환경 부적합 — tmux/desktop-notify/statusline)는 본 plan에서 제외 (사용자 명시).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/.claude-plugin/plugin.json` | plugin slug = `mccp`, namespace prefix = `mccp:` (commands) / `MCCP_` (env) — 일관 유지 |
| Hook script removal | 과거 axis 작업(commit `f5732b4` axis-k) | 단일 파일 삭제 + hooks.json 등록 해제 + 관련 require/import grep 0건 확인 |
| Env-var rename | `scripts/lib/hook-flags.js` 같은 단일-책임 lib | env var 읽기는 한 곳에 집중. lib 한 곳 수정 + 호출자 grep으로 검증 |
| Receipt write | `commands/plan.md` Phase 5.6 | `cli.js write --gate <gate> --decision <slug>` 형태로 chain-of-custody 기록 |
| CHANGELOG | `CHANGELOG.md` v1.0.0 entry | "Breaking" + "Migration" 섹션 명시, env rename은 breaking으로 표기 |
| Worktree | STATE.md `[[project_v0_4_0_orchestrator]]` 메모 | 단일 worktree에서 단일 axis, branch명 `v<semver>-axis-<letter>` |

## Files to Change

### A축 — dead code 삭제

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/pre-write-doc-warn.js` | DELETE | pure `require('./doc-file-warning.js')` shim. hooks.json은 doc-file-warning.js를 직접 호출 |
| `plugins/mccp/scripts/hooks/auto-tmux-dev.js` | DELETE | Windows에서 무의미 + 본인 호출처(bash-hook-dispatcher PRE_BASH_HOOKS)에서도 제거 |
| `plugins/mccp/scripts/hooks/bash-hook-dispatcher.js` | UPDATE | PRE_BASH_HOOKS 배열에서 `auto-tmux-dev` 엔트리 + `require('./auto-tmux-dev')` 삭제 |
| `plugins/mccp/scripts/hooks/insaits-security-wrapper.js` | DELETE | InsAIts 회사 전용 정책 hook. mccp 개인용에 무의미 |
| `plugins/mccp/scripts/hooks/insaits-security-monitor.py` | DELETE | 위 wrapper의 Python 본체 |

### C축 — ECC 잔재 / mccp 게이트와 중복

| File | Action | Why |
|---|---|---|
| `plugins/mccp/hooks/hooks.json` | UPDATE | `pre:observe:continuous-learning` + `post:observe:continuous-learning` 등록 해제 (v1 deprecated, v2가 별도 skill로 존재) |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `pre:governance-capture` + `post:governance-capture` 등록 해제 (opt-in이 default off, 매 tool call 2회 no-op spawn) |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `post:session-activity-tracker` 등록 해제, metrics는 `ecc-metrics-bridge`로 일원화 |
| `plugins/mccp/scripts/hooks/observe-runner.js` | KEEP (not delete) | hook은 off하되 파일은 보존 — v2 migration 시 참조 코드로 활용 가능. README 한 줄 deprecated 표시 |
| `plugins/mccp/scripts/hooks/governance-capture.js` | KEEP (not delete) | 동일 이유 |
| `plugins/mccp/scripts/hooks/session-activity-tracker.js` | KEEP (not delete) | metrics 통합 후에도 standalone tool로 유용 |

> 파일 삭제 대신 hooks.json 등록 해제로 가는 이유: A축의 진짜 dead code(zero reference)와 달리 이들은 lib 차원에서 다시 쓸 수 있는 코드이고, restore가 한 줄 등록으로 가능한 게 사용성/안정성 면에서 유리.

### D축 — noise / overlap / DRY

| File | Action | Why |
|---|---|---|
| `plugins/mccp/hooks/hooks.json` | UPDATE | `post:edit:design-quality-check` 등록 해제 — mccp는 backend CLI plugin이라 frontend drift warning이 항상 false positive |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `post:edit:console-warn` 등록 해제 — Stop의 `check-console-log`가 같은 검사를 batch로 수행 |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `pre:mcp-health-check` + `post:mcp-health-check`의 matcher를 `"*"` → `"^mcp__"` 로 좁힘 |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `pre:edit-write:suggest-compact` 등록 해제 — 동일 역할의 `strategic-compact` skill이 존재 |
| `plugins/mccp/scripts/hooks/bootstrap.js` | CREATE | 새 entry point. CLAUDE_PLUGIN_ROOT trust + 단일 실패 메시지. hooks.json의 ~3000자 inline `node -e` bootstrap을 한 줄로 압축 |
| `plugins/mccp/hooks/hooks.json` | UPDATE | 모든 inline bootstrap 명령을 `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/bootstrap.js" <hook-id> <script-rel> <profiles>` 형태로 치환 |
| `plugins/mccp/scripts/hooks/plugin-hook-bootstrap.js` | UPDATE | resolver 로직을 새 `bootstrap.js`와 공유. CLAUDE_PLUGIN_ROOT 빈 경우 fallback 1회 시도 후 loud-fail |

### E축 — policy revisit

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/gateguard-fact-force.js` | UPDATE | "첫 Edit per-file 강제 조사"를 critical path glob(`scripts/lib/**`, `commands/**`, `hooks/**`)로 limit. 일반 디렉토리는 no-op |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `mccp:stop:review-loop` description에 default observe 명시 + comments 주석 |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `mccp:stop:auto-handoff` 등록 해제 (memory `feedback-cost-not-stop-signal` 정책: cost notify는 노이즈) |
| `plugins/mccp/scripts/hooks/quality-gate.js` | UPDATE | heavy lint/typecheck는 Stop으로 위임. PostEdit는 syntax fast-fail만 |
| `plugins/mccp/scripts/hooks/bash-hook-dispatcher.js` | UPDATE | POST_BASH_HOOKS 배열에서 `post-bash-pr-created` 엔트리 제거 (`/mccp:pr` 게이트가 PR 단일 경로) |
| `plugins/mccp/scripts/hooks/post-bash-pr-created.js` | DELETE | 위 dispatcher 외 참조처 없음 (grep으로 재검증 후 결정) |

### F축 — `ECC_*` → `MCCP_*` env var hard-cut rename (NEW)

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/hook-flags.js` | UPDATE | `ECC_HOOK_PROFILE` → `MCCP_HOOK_PROFILE`, `ECC_DISABLED_HOOKS` → `MCCP_DISABLED_HOOKS`. JSDoc도 동기 |
| `plugins/mccp/scripts/hooks/run-with-flags.js` | UPDATE | spawn env에서 set하는 `ECC_PLUGIN_ROOT`/`ECC_HOOK_ID`/`ECC_HOOK_INPUT_TRUNCATED`/`ECC_HOOK_INPUT_MAX_BYTES` → `MCCP_*` |
| `plugins/mccp/scripts/hooks/plugin-hook-bootstrap.js` | UPDATE | spawn env 동일 + reader 로직(`CLAUDE_PLUGIN_ROOT || ECC_PLUGIN_ROOT`) → `MCCP_PLUGIN_ROOT` |
| `plugins/mccp/scripts/hooks/observe-runner.js` | UPDATE | `ECC_PLUGIN_ROOT`/`ECC_HOOK_ID`/`ECC_OBSERVE_RUNNER_TIMEOUT_MS` → `MCCP_*` (off 상태지만 코드 정합 유지) |
| `plugins/mccp/scripts/hooks/config-protection.js` | UPDATE | `ECC_HOOK_INPUT_TRUNCATED`/`ECC_HOOK_INPUT_MAX_BYTES` → `MCCP_*` |
| `plugins/mccp/scripts/hooks/governance-capture.js` | UPDATE | `ECC_GOVERNANCE_CAPTURE`/`ECC_SESSION_ID`/`ECC_HOOK_INPUT_*` → `MCCP_*` |
| `plugins/mccp/scripts/hooks/cost-tracker.js` | UPDATE | `ECC_SESSION_ID` → `MCCP_SESSION_ID` |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | `ECC_CONTEXT_MONITOR_COST_WARNINGS`/`ECC_CONTEXT_MONITOR_COST_MODE`/`ECC_SESSION_ID` → `MCCP_*`. 파일 자체는 이름 유지(C축에서 off되지만 파일은 보존) |
| `plugins/mccp/scripts/hooks/ecc-metrics-bridge.js` | UPDATE | `ECC_SESSION_ID` → `MCCP_SESSION_ID` |
| `plugins/mccp/scripts/hooks/gateguard-fact-force.js` | UPDATE | `ECC_GATEGUARD`/`ECC_DISABLED_HOOKS`/`ECC_SESSION_ID` → `MCCP_*`. 사용자 안내 메시지(line 763)도 동기 |
| `plugins/mccp/scripts/hooks/mcp-health-check.js` | UPDATE | 모든 `ECC_MCP_*` → `MCCP_MCP_*` (8개), `ECC_HOOK_INPUT_*` → `MCCP_*` |
| `plugins/mccp/scripts/hooks/session-activity-tracker.js` | UPDATE | `ECC_SESSION_ID` → `MCCP_SESSION_ID` |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | grep 매치 라인 전부 |
| `plugins/mccp/scripts/hooks/block-no-verify.js` | UPDATE | 주석(line 9) "ECC_DISABLED_HOOKS" → "MCCP_DISABLED_HOOKS" |
| `plugins/mccp/scripts/hooks/quality-gate.js` | UPDATE | `ECC_QUALITY_GATE_FIX`/`ECC_QUALITY_GATE_STRICT` → `MCCP_QUALITY_GATE_*` |
| `plugins/mccp/scripts/lib/session-bridge.js` | UPDATE | `ECC_SESSION_ID` → `MCCP_SESSION_ID` |
| `plugins/mccp/scripts/lib/session-adapters/canonical-session.js` | UPDATE | `ECC_SESSION_RECORDING_DIR` → `MCCP_SESSION_RECORDING_DIR` |
| `plugins/mccp/scripts/lib/github-discussions.js` | UPDATE | `ECC_GH_SHIM` → `MCCP_GH_SHIM` |
| `plugins/mccp/hooks/hooks.json` | UPDATE | description string 내 "ECC_GOVERNANCE_CAPTURE=1" 등 문자열 일괄 치환 |
| `CLAUDE.md` | UPDATE | §4 운영 토글 cheat sheet에 ECC_* 잔재 0건 보장 |
| `docs/ENVIRONMENT.md` | UPDATE | env var 명세 일괄 rename |
| `docs/v0.2-state-schema.md` | UPDATE | ECC_* 참조 라인 정리 |
| `CHANGELOG.md` | UPDATE | `## [v1.0.1] - YYYY-MM-DD` 항목 추가. "### Breaking" 섹션에 env var rename 매트릭스 |
| `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js` | UPDATE | env var assertion rename |
| `plugins/mccp/skills/configure-ecc/SKILL.md` | KEEP | `ECC_ROOT`는 ECC origin marketplace를 가리키는 사용자 env (mccp가 set 안 함). out-of-scope |
| `plugins/mccp/skills/continuous-learning-v2/hooks/observe.sh` | KEEP | C축에서 off된 observe-runner의 변종. v2 mccp-native skill로 migrate되기 전까지 ECC_* 호환 유지 (별도 axis) |

### F축 — out-of-scope (수동 설치 미지원 정책)

mccp는 **marketplace 배포만 허용**하고 수동 설치를 지원하지 않습니다 (사용자 확정 정책, 2026-06-15). 따라서 `plugins/mccp/scripts/lib/install/` + `plugins/mccp/scripts/lib/install-executor.js` + `plugins/mccp/scripts/lib/install-targets/` 트리는 **활성 코드 경로 외**에 있고, 본 plan에서는 env var rename 대상에서 제외합니다. 해당 트리의 추가 정리(전체 삭제 또는 deprecate)는 별도 cleanup axis로 분리해 따로 다룹니다.

| File | Status | Why deferred |
|---|---|---|
| `plugins/mccp/scripts/lib/install/apply.js` (`ECC_DISABLED_MCPS`) | OUT-OF-SCOPE | install 트리는 marketplace 배포 경로에서 사용되지 않음. F축 hard-cut 대상 아님 |
| `plugins/mccp/scripts/lib/install-executor.js` (`CLAUDE_ECC_NAMESPACE = 'ecc'`) | OUT-OF-SCOPE | 동일 + env var가 아니라 install-time 디렉토리 namespace constant |
| `plugins/mccp/scripts/lib/install-targets/claude-{home,project}.js` | OUT-OF-SCOPE | 동일 (constant 참조처) |

## Tasks

### Task 0: precondition — roadmap-index 등록 + worktree 생성

- **Action**:
  1. `c:\Users\skypark207\.claude\projects\C---project-my-my-claude-code-plugin\memory\mccp-roadmap.md` 인덱스에 `axis-p` 한 줄 등록 (memory `[[mccp-roadmap]]` 정책)
  2. `git worktree add -b v1.0.1-axis-p c:\_project\my\my-claude-code-plugin-v1.0.1-axis-p main`
  3. 새 worktree에서 본 plan 파일 commit (working-tree only이지만 worktree 진입점 마커 역할)
- **Mirror**: 기존 axis-K commit 메시지 `feat(v1.0.1): axis K — pr-phase-guard ...` 스타일
- **Validate**: `git worktree list` 에 v1.0.1-axis-p 라인 + roadmap-index에 axis-p 1줄 등록 확인

### Task A.1: pure shim 삭제

- **Action**: `plugins/mccp/scripts/hooks/pre-write-doc-warn.js` 삭제. `grep -r "pre-write-doc-warn"` 결과 0건 재검증
- **Mirror**: 기존 dead code 삭제 PR 패턴 (axis-K도 비슷한 cleanup)
- **Validate**: `node --check` 없음(JS만), `npm test`가 import error 0건

### Task A.2: auto-tmux-dev.js 삭제 + dispatcher 정리

- **Action**:
  1. `bash-hook-dispatcher.js`에서 `const { run: runAutoTmuxDev } = require('./auto-tmux-dev');` 제거
  2. PRE_BASH_HOOKS 배열에서 `runAutoTmuxDev` 엔트리 제거
  3. `auto-tmux-dev.js` 삭제
- **Mirror**: 동일
- **Validate**: `node -e "require('./plugins/mccp/scripts/hooks/bash-hook-dispatcher')"` 무에러 + 관련 hook 테스트 pass

### Task A.3-A.4: InsAIts 회사용 hook 2개 삭제

- **Action**: `insaits-security-wrapper.js` + `insaits-security-monitor.py` 삭제. hooks.json grep 0건 재검증
- **Validate**: `grep -r insaits plugins/mccp` 결과 0건 (테스트 fixture 포함)

### Task C.1: hooks.json — observe(v1) + governance + session-activity-tracker 등록 해제

- **Action**: hooks.json에서 `pre:observe:continuous-learning`, `post:observe:continuous-learning`, `pre:governance-capture`, `post:governance-capture`, `post:session-activity-tracker` 5개 엔트리 제거. 스크립트 파일은 보존
- **Mirror**: hooks.json은 JSON Schema 따름 — 엔트리 한 개 제거 시 array 순서 그대로 유지
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json','utf8'))"` pass + Claude Code restart 후 trace shard에 5개 hook 발화 0건

### Task D.1: hooks.json — design-quality-check + console-warn dedup + suggest-compact 정리

- **Action**: 위 3개 엔트리 등록 해제
- **Validate**: 동일 (trace shard 0건 발화)

### Task D.2: mcp-health-check matcher 좁히기

- **Action**: hooks.json `pre:mcp-health-check` + `post:mcp-health-check`의 `"matcher": "*"` → `"matcher": "^mcp__"`
- **Mirror**: Claude Code hook matcher는 정규식 — 다른 hook에서 `^mcp__` 사용처 없으면 first usage (description에 reasoning 한 줄 추가)
- **Validate**: 일반 Bash/Edit/Write 사용 시 mcp-health-check 발화 0건 (trace 확인)

### Task D.3: hooks.json bootstrap DRY-up

- **Action**:
  1. `plugins/mccp/scripts/hooks/bootstrap.js` 신규 작성. 책임: CLAUDE_PLUGIN_ROOT trust + 빈 경우 `~/.claude/plugins/mccp` fallback 1회 시도 + 실패 시 stderr loud-fail. argv 받아 `run-with-flags.js` 또는 직접 hook script로 위임
  2. hooks.json의 모든 inline `node -e` bootstrap 명령(약 30개)을 `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/bootstrap.js" <hook-id> <hook-rel-path> <profiles>` 형태로 치환
  3. `plugin-hook-bootstrap.js`는 새 bootstrap.js와 helper 함수 공유 (코드 중복 0건)
- **Mirror**: 기존 `mccp:receipt-prompt` 엔트리의 `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/receipt-prompt.js"` 형태 — 이미 trust 기반
- **Validate**:
  - `git diff hooks.json | wc -l`이 ~2000줄 감소
  - `CLAUDE_PLUGIN_ROOT=""` 강제 unset 시 stderr에 명확한 한 줄 메시지
  - 모든 hook 발화 정상 (trace 1턴 확인)

### Task E.1: gateguard scope-down

- **Action**: `gateguard-fact-force.js` 본문에서 file path glob check 추가. critical paths만 enforce, 나머지는 즉시 pass
- **Mirror**: 기존 file glob 처리는 `plugins/mccp/scripts/lib/` 어딘가에 utility가 있을 가능성 — grep 후 재사용
- **Validate**: 신규 일반 파일 첫 edit이 block 안 됨 + critical path(예: `plugins/mccp/scripts/lib/utils.js`) edit은 여전히 block

### Task E.2: stop:auto-handoff 등록 해제 + post-bash-pr-created 제거

- **Action**:
  1. hooks.json `mccp:stop:auto-handoff` 엔트리 제거
  2. bash-hook-dispatcher의 POST_BASH_HOOKS에서 `post-bash-pr-created` 제거
  3. `post-bash-pr-created.js` 파일 삭제 (grep 0건 재검증 후)
- **Validate**: Stop 시 trace shard에 auto-handoff 발화 0건 + `/mccp:pr` 사용 시 영향 0건

### Task E.3: quality-gate 경량화

- **Action**: `quality-gate.js` 본문에서 heavy 검사(typecheck/lint 전체)를 Stop으로 위임. PostEdit는 syntax/parse fast-fail만 (수 백 ms 이내)
- **Mirror**: `stop-format-typecheck.js`의 batch 처리 패턴
- **Validate**: 단일 Edit 후 quality-gate 시간 측정 → <500 ms

### Task F.1: env var inventory snapshot

- **Action**: 본 plan의 §"Files to Change → F축"이 이미 inventory. 실행 전 grep 한 번 더 돌려 stale 0건 확인
- **Validate**: `grep -rn "ECC_[A-Z]" plugins/mccp --include="*.js" --include="*.py" --include="*.sh"` 와 plan의 매트릭스 1:1 매칭

### Task F.2: code-side rename (hooks + libs)

- **Action**: §F축 매트릭스의 각 파일을 순서대로 치환. 단순 string replace가 아니라 다음 규칙:
  - env var 읽기: `process.env.ECC_X` → `process.env.MCCP_X`
  - env var 쓰기 (child spawn): `env: { ECC_X: ... }` → `env: { MCCP_X: ... }`
  - 주석/JSDoc/log 메시지 내 문자열 동기
  - **반드시 보존**: `'ecc'` 리터럴 namespace constant (CLAUDE_ECC_NAMESPACE), ECC fork 라이선스 attribution, `configure-ecc` skill 이름, `ECC_ROOT`(ECC origin marketplace path 변수 — mccp가 set 안 함)
- **Validate**: 각 파일 단위 commit + `grep -n "ECC_[A-Z]" <file>` 결과가 보존 대상만 남는지 1:1 확인

### Task F.3: settings.json / hooks.json description / docs 동기

- **Action**:
  - `plugins/mccp/hooks/hooks.json`의 description string 내 ECC_* → MCCP_*
  - `.claude/settings.json` + `.claude/settings.local.json`의 env var 키 rename (있는 경우)
  - `CLAUDE.md`, `docs/ENVIRONMENT.md`, `docs/v0.2-state-schema.md` 동기
  - `CHANGELOG.md`에 v1.0.1 axis-P 엔트리 + "### Breaking" 섹션에 변경 매트릭스 (ECC_X → MCCP_X 표)
- **Validate**: `grep -n "ECC_[A-Z]" CLAUDE.md docs/ENVIRONMENT.md` 결과 0건

### Task F.4: tests + final verification

- **Action**:
  - `plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js` assertion rename
  - 전체 test suite 1회 (`node --test plugins/mccp/scripts/hooks/tests/*.test.js`)
  - manual sanity: `MCCP_HOOK_PROFILE=minimal` 환경에서 Stop hook이 minimal 프로파일 적용 확인
- **Validate**: 327개+ test 통과 + manual env toggle 기대대로 동작

## Validation

```bash
# 전체 hook script JS syntax 무결성
find plugins/mccp/scripts/hooks -name "*.js" -exec node --check {} \;

# hooks.json 유효 JSON
node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json','utf8'))"

# 테스트 스위트
node --test plugins/mccp/scripts/hooks/tests/*.test.js

# ECC_ 잔재 0건 (skill/license/configure-ecc/install 보존 대상 제외)
grep -rn "ECC_[A-Z]" plugins/mccp/scripts plugins/mccp/hooks plugins/mccp/.claude-plugin CLAUDE.md docs \
  | grep -v "configure-ecc/SKILL.md" \
  | grep -v "continuous-learning-v2/" \
  | grep -v "scripts/lib/install/" \
  | grep -v "scripts/lib/install-executor.js" \
  | grep -v "scripts/lib/install-targets/" \
  | wc -l
# expected: 0

# hooks.json 명령어 길이 감소 (DRY-up 검증)
node -e "const j=JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json','utf8'));let tot=0;for(const ev of Object.values(j.hooks))for(const e of ev)for(const h of e.hooks)tot+=h.command.length;console.log('total command chars:',tot)"
# expected: ~80% 감소 (before: ~70k chars, after: ~14k chars 추정)
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| F축 rename이 누락 파일을 남겨 hook이 silent fail | MEDIUM | HIGH | Task F.4 final grep + manual env toggle smoke test |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| hooks.json DRY-up이 plugin install path detection 깨뜨림 | MEDIUM | HIGH | `bootstrap.js`가 단계적 fallback (env → 표준 path → loud-fail). install 시나리오 5종 수동 확인 (CLAUDE_PLUGIN_ROOT 정상/빈/잘못된/marketplace cache/dev worktree) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| C축 hook off가 다른 hook의 입력 데이터를 끊음 | LOW | MEDIUM | observe-runner ledger는 ecc-context-monitor가 읽음 — context-monitor도 off 함께. 검증: trace shard 1턴 확인 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| E축 gateguard scope-down이 critical path edit을 놓침 | LOW | MEDIUM | glob 범위에 `plugins/mccp/scripts/lib/**`, `plugins/mccp/commands/**`, `plugins/mccp/hooks/**` 포함. 보수적으로 시작 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| ECC_* alias 없는 hard cut이 사용자 settings.local.json 깨뜨림 | HIGH | LOW | CHANGELOG breaking section + STATE.md에 migration note. mccp 단독 사용자만 영향이고, 본인 환경의 settings.local.json은 Task F.3에서 동기 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `bash-hook-dispatcher.js`의 PRE_BASH_HOOKS 배열 수정이 다른 hook 깨뜨림 | LOW | MEDIUM | `auto-tmux-dev` 한 줄 제거만. 배열 순서 보존. 단위 테스트가 dispatcher 전체 동작 검증 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off` 환경에서 Phase 5 게이트가 skip되어 dual-review 실종 | KNOWN | n/a | 사용자 영구 합의 (memory `feedback-codex-permanent-bypass`). chain-of-custody만 receipt에 기록. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] Task 0: roadmap-index에 axis-p 엔트리 + worktree `v1.0.1-axis-p` 존재
- [ ] A축: 4개 파일 삭제 + `grep -r <filename>` 0건
- [ ] C축: hooks.json에서 5개 엔트리 등록 해제 + trace shard 1턴에서 발화 0건
- [ ] D축: design-quality-check/console-warn/suggest-compact 등록 해제 + mcp-health-check matcher `^mcp__`로 좁힘 + hooks.json command 총 문자 수 80%+ 감소
- [ ] E축: gateguard critical-path-only + auto-handoff 등록 해제 + quality-gate latency <500 ms + post-bash-pr-created 삭제
- [ ] F축: `ECC_*` 잔재 0건 (보존 대상 allowlist 제외) + CHANGELOG breaking 매트릭스 + tests pass
- [ ] 전체 hook 트레이스 1턴 확인: 일반 Edit/Write/Bash 사용 시 silent regression 0건
- [ ] commit 메시지 컨벤션 따름: `feat(v1.0.1): axis P — hook tidy + ECC→MCCP env namespace`

## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class skip per v0.3.5)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- classification: `disabled` (spawn-before short-circuit, durationMs=0)
- 라운드 수: 0
- 합치 결론: n/a — Codex review가 영구 bypass 환경에서 실행되지 않음. chain-of-custody는 receipt `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'`로 audit
- YAGNI Triage: n/a
- Deferred to backlog: 0
- Open Questions: 사용자 영구 정책 합의 (memory `feedback-codex-permanent-bypass`)
- Codex session 참조: n/a

### Security Reviewer

> security-reviewer unavailable, skipped (auto-fallback): codex-permanent-bypass policy + axis-P 변경 범위가 secrets/auth/crypto/SQL/SSRF/path-traversal 외 (hook tidy + env var rename). receipt에 `security_skipped=true` + reason 기록되어 downstream `/mccp:pr`이 strict-gate honor.

### Design Review

> impeccable unavailable, skipped (auto-fallback): mccp는 backend CLI plugin이라 visual/typography/spacing surface 없음. axis-P 변경 100%가 hook script + env var + docs로, design 검토 대상 없음 (mccp-implement-codex strict gate honors `impeccable_skipped=true`).

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- classification: `disabled` (v0.3.5 first-class skip)
- durationMs: 0 (spawn-before short-circuit)
- 라운드 수: 0
- 합치 결론: n/a — Codex review가 영구 bypass 환경에서 실행되지 않음. chain-of-custody는 receipt에 `meta.codex_disabled=true`로 기록
- YAGNI Triage: n/a
- Open Questions: 사용자 영구 정책 합의 (memory `feedback-codex-permanent-bypass`)
- Codex session 참조: n/a
