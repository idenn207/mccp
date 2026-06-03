# Plan: /mccp:setup — 의존성 자동 설치 + SessionStart 검증 + Codex fallback

**Source**: 사용자 발화(2026-06-04, `/mccp:plan` 인자) + 결정 (AskUserQuestion 4문항)
**Selected Scope**: (1) `/mccp:setup` 신규 command — codex plugin + impeccable npm CLI 감지·설치 + `/codex:setup` 자동 체인 + 인증 실패 fallback env. (2) SessionStart hook에 의존성 검증 추가 — 누락 시 단일 권유 메시지. (3) gate command (plan/prp-implement/pr)에서 `MCCP_CODEX_DISABLED=1` honor — Codex 호출 skip + `codex_skipped:true` receipt.
**Complexity**: Medium
**Branch decision**: 별개 cycle. v0.2.2 plan(`.claude/plans/mccp-v0.2.2.plan.md`)이 진행 중이므로 본 작업은 v0.2.2 머지 후 **v0.2.3**으로 진입 권장. 현 plan은 v0.2.2의 `MCCP_RECEIPT_GATE_MODE` 패치 위에 올라타도록 설계됨.

---

## Summary

mccp v0.2.2가 `plugins/mccp/skills/impeccable/`을 제거(commit 2116c43)하면서 두 가지 공백 발생:

1. **impeccable skill 부재**: 사용자가 `/mccp:impeccable`을 호출하면 0.2.1 캐시가 폐기된 뒤 동작 불능. impeccable은 별도 npm CLI(`impeccable`, v2.3.2, github.com/pbakaus/impeccable)이며 `impeccable skills install`이 Claude harness에 SKILL 파일을 직접 deploy하는 구조다. 사용자 결정: **plugin 형태 대신 npm CLI로 설치**.
2. **codex 의존성의 묵시적 가정**: mccp의 모든 게이트(`/mccp:plan` `/mccp:prp-implement` `/mccp:pr`)는 codex plugin + `codex` CLI 인증 모두를 묵시적 전제로 한다. 미설치/미인증 시 게이트가 auto-fallback으로 빠져 review 없이 통과(v0.2.2가 이 fallback을 detection-grade까지 끌어올리는 작업). 그러나 **fresh install에서는 사용자가 setup을 일일이 수동으로 해야 한다** — `/plugin install` × 2 + `/codex:setup` + `codex login`.

`/mccp:setup`은 이 setup 시퀀스를 idempotent 한 entry point로 통합한다. 각 단계는 (a) 감지 → (b) `AskUserQuestion`으로 의사 확인 → (c) 실제 설치 → (d) 결과 보고 순서. `codex login` 실패 시 fallback: 사용자에게 `MCCP_CODEX_DISABLED=1` env를 `~/.claude/settings.json`에 추가할지 물어보고 동의 시 자동 write — 이 env가 set이면 gate가 Codex 호출 자체를 skip하고 `codex_skipped:true` receipt를 즉시 write (v0.2.2의 validate-cmd.js 명확화 로직이 처리).

`SessionStart` hook은 매 세션 시작 시 한 줄로 누락 항목을 stderr에 emit — 자동 설치는 하지 않음(세션 시작 hook에서 plugin install은 위험). 사용자에게 `/mccp:setup` 실행을 안내만.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 명령 본문에서 외부 CLI를 감지·설치 + AskUserQuestion 안내 | [codex:setup의 setup.md](C:/Users/skypark207/.claude/plugins/cache/openai-codex/codex/1.0.4/commands/setup.md) — `node companion.mjs setup --json` 후 `AskUserQuestion` → `npm install -g @openai/codex` 패턴 | 동일 구조: detection script → ask → install → re-detect → present |
| Bash로 sub-CLI 호출 + JSON stdout 파싱 | [pr.md:108-120](plugins/mccp/commands/pr.md#L108-L120) — `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js dedupe ...` | command 본문에서 Bash 호출, stdout JSON 파싱 |
| Skill을 command 내부에서 invoke | [v0.2.2 plan Phase 5.2](`.claude/plans/mccp-v0.2.2.plan.md`) — `Skill(codex:adversarial-review, ...)` 패턴이 본 plan 종료 후 `node codex-invoke.js`로 교체 예정. setup은 그 전 단계라서 **`Skill(codex:setup)` 직접 호출 유지**. | Skill tool 직접 호출. setup은 invoke 부담 적어 OK |
| Env-driven gate toggle | [v0.2.2 plan Task 4](.claude/plans/mccp-v0.2.2.plan.md) — `MCCP_RECEIPT_GATE_MODE` 토글 패턴 | 동일 — `MCCP_CODEX_DISABLED=1` 추가, `process.env`로 read |
| 의존성 검증 helper | [plugin-hook-bootstrap.js](plugins/mccp/scripts/hooks/plugin-hook-bootstrap.js) — plugin root resolve 패턴 | `~/.claude/plugins/installed_plugins.json` 파싱 helper를 별도 lib로 분리 |
| SessionStart 한 줄 안내 emit | [session-start.js의 STATE.md inject 패턴](plugins/mccp/scripts/state/state-injector.js) | inject 직후/이전에 누락 시 한 줄 stderr 추가. 침습 X |
| settings.json env write | (precedent 없음) | `~/.claude/settings.json` JSON read-modify-write — backup 후 write. test에 fixture |
| Test 패턴 | `plugins/mccp/scripts/lib/tests/` — Node native runner | 신규 fixture: dep-check + settings-writer + mock spawnSync |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/setup.md` | CREATE | 본 plan의 핵심 entry. 4단계 inline 본문 — detect / install-codex-plugin / install-impeccable / chain `/codex:setup`. |
| `plugins/mccp/scripts/lib/dep-check.js` | CREATE | helper. `checkCodexPlugin()` / `checkImpeccableCli()` 반환 `{installed, version?, location?}`. installed_plugins.json 파싱 + `command -v impeccable` (cross-platform: `where` on win32). |
| `plugins/mccp/scripts/lib/tests/dep-check.test.js` | CREATE | 4 fixture: codex-installed / codex-missing / impeccable-installed / impeccable-missing. |
| `plugins/mccp/scripts/lib/settings-writer.js` | CREATE | helper. `~/.claude/settings.json`에 `env.MCCP_CODEX_DISABLED=1` set/unset. atomic write(`.tmp` rename), backup 1 retention. |
| `plugins/mccp/scripts/lib/tests/settings-writer.test.js` | CREATE | fixture: empty settings / has-env-already / corrupt-json / read-only-dir 4종. |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | 의존성 검증 호출. v0.2.2의 state-injector 직전/직후에 한 줄 emit. **silent if env `MCCP_CODEX_DISABLED=1`** — disabled 사용자는 noise 안 받음. |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | schema에 `dep_check: { codex_plugin, impeccable_cli, last_checked }` 필드 추가(선택). session 간 noisy re-warn 방지를 위한 dedupe 키. |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | `dep_check` round-trip test 1개. |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATE | `MCCP_CODEX_DISABLED=1` 진입 시 즉시 `{ verdict: 'skipped', reason: 'codex_disabled' }` 반환. 호출 skip. v0.2.2 plan의 `codex-invoke.js`와 합쳐질 자리. |
| `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` | UPDATE | `MCCP_CODEX_DISABLED=1` set 시 skip 동작 test 1개. |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE (compat) | v0.2.2가 이미 `codex_skipped:true` 처리 명확화 — 본 plan은 `reason='codex_disabled'`도 같은 path로 분류. v0.2.2 머지 후 적용 가능하면 1줄 추가만. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version: 0.2.2 → 0.2.3` (v0.2.2 머지 완료 가정). |
| `docs/gate-design.md` | UPDATE | §"Codex Disable Toggle" 추가 — `MCCP_CODEX_DISABLED`와 `MCCP_ALLOW_CODEX_UNAVAILABLE` 의미 차이 명시. §"Setup Flow" 추가 — `/mccp:setup` 단계와 SessionStart 검증 결합. |
| `CLAUDE.md` | UPDATE | §4 Cheat Sheet에 `/mccp:setup` 추가. §3.3 fallback matrix에 `MCCP_CODEX_DISABLED` 한 행 추가. |
| `README.md` | UPDATE | "설치" 섹션을 `/mccp:setup` 1줄로 단순화. 기존 3단계는 "수동 단계 (setup 미사용 시)"로 보존. |
| `NOTICE` | UPDATE | impeccable 항목에 "현재는 npm CLI(`npm install -g impeccable`)로 설치되며 `impeccable skills install`이 Claude harness에 skill을 배포합니다" 부연. |

---

## Tasks (실행 순서)

### Task 1 — dep-check helper 작성

- **Action**:
  - `plugins/mccp/scripts/lib/dep-check.js`:
    - `function readInstalledPlugins()`: `~/.claude/plugins/installed_plugins.json` 읽고 JSON parse. 파일 없으면 `{ plugins: {} }`.
    - `function checkCodexPlugin()`: `plugins["codex@openai-codex"]?.[0]`을 보고 `{ installed, version, installPath }` 반환. 절대 throw X.
    - `function checkImpeccableCli()`: `spawnSync('where', ['impeccable'])` (win32) 또는 `which impeccable` (posix). exit 0이면 `{ installed: true, path: stdout.trim() }`, 1이면 `{ installed: false }`. `IMPECCABLE_VERSION` 환경 hint도 honor.
    - `function checkAll()`: 위 두 결과 + `{ codex_disabled: process.env.MCCP_CODEX_DISABLED === '1' }` 묶어 반환.
  - CLI mode 지원: `node dep-check.js --json` → checkAll JSON emit (command 본문 Bash에서 호출).
- **Mirror**: `codex-bridge.js`의 module export style + `os.platform()` 분기 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dep-check.test.js`

### Task 2 — settings-writer helper 작성

- **Action**:
  - `plugins/mccp/scripts/lib/settings-writer.js`:
    - `function readSettings()`: `~/.claude/settings.json` 읽고 JSON parse. 파일 없으면 `{}`.
    - `function setEnv(key, value, { dryRun = false } = {})`: settings에 `env[key] = value` set. backup `.bak`로 1개 보존(rotate). atomic: `.tmp` write → rename. dryRun이면 결과 객체만 반환.
    - `function unsetEnv(key)`: `delete settings.env[key]`. env 비면 env 키 자체 삭제. 동일 atomic + backup.
    - 호출 결과 `{ ok, action: 'set'|'unset'|'noop', path, backupPath? }` 반환.
  - CLI mode: `node settings-writer.js set --key MCCP_CODEX_DISABLED --value 1` / `unset --key ...`. `--dry-run`.
  - **불변 보장**: hooks/permissions 등 다른 키는 절대 변경 X. test로 fixture-equal 검증.
- **Mirror**: 기존 atomic write 사용처 없음 — 표준 패턴(`fs.writeFileSync(tmp); fs.renameSync(tmp, target)`).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/settings-writer.test.js`

### Task 3 — /mccp:setup command 본문 작성

- **Action**: `plugins/mccp/commands/setup.md`. 구조:

  ```markdown
  ---
  description: Install mccp's required dependencies (codex plugin + impeccable CLI) and run /codex:setup
  argument-hint: '[--dry-run | --skip-codex | --skip-impeccable]'
  allowed-tools:
    - Bash(node:*)
    - Bash(claude:*)
    - Bash(npm:*)
    - Bash(impeccable:*)
    - AskUserQuestion
    - Skill(codex:setup)
  ---

  ## Phase 1 — Detect

  Bash:
    node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/dep-check.js --json

  Parse stdout. Output a summary table.

  ## Phase 2 — Install codex plugin (if missing and not --skip-codex)

  If `checkCodexPlugin().installed === false`:
    AskUserQuestion 1회 — "Install codex plugin now?" (Install Codex (Recommended) / Skip)
    On Install: Bash
      claude plugin marketplace add openai/codex-plugin-cc --scope user
      claude plugin install codex@openai-codex
    Re-run dep-check, report result.

  ## Phase 3 — Install impeccable CLI (if missing and not --skip-impeccable)

  If `checkImpeccableCli().installed === false`:
    AskUserQuestion 1회 — "Install impeccable CLI globally?" (Install impeccable (Recommended) / Skip)
    On Install:
      npm install -g impeccable
      impeccable skills install   # deploys skill files into ~/.claude/skills/
    Re-run dep-check, report.

  ## Phase 4 — Run /codex:setup (if codex installed)

  Skill(codex:setup)
  Parse output. If "Codex installed but not authenticated":
    AskUserQuestion — "codex login can't run inside Claude. Do one of: (A) run `!codex login` in next message, (B) set MCCP_CODEX_DISABLED=1 in ~/.claude/settings.json now, (C) skip"
    On (B): Bash
      node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/settings-writer.js set --key MCCP_CODEX_DISABLED --value 1

  ## Phase 5 — Final report

  Re-run dep-check. Print final status table. Tell user which gates work (codex_disabled=1 → all gates run in soft-skip mode).

  Forbidden phrases: "수동으로 ~를 하세요" 없이 가능한 한 자동화. 사용자 의사만 묻기.
  ```

- **Mirror**: codex setup.md의 `AskUserQuestion → Bash install → re-run` 흐름.
- **Validate**: 다음 세션에서 본 command 자체 dry-run으로 detection 동작 확인.

### Task 4 — SessionStart 누락 안내

- **Action**: `session-start.js`에 다음 흐름 삽입(state-inject 직전 or 직후 결정):
  - `if (process.env.MCCP_CODEX_DISABLED === '1') return;` — disabled 사용자는 noise 안 받음.
  - `const result = require('../lib/dep-check').checkAll();`
  - 누락 항목 있으면 한 줄 stderr emit: `[mccp] Missing: codex@openai-codex, impeccable. Run /mccp:setup to install.`
  - STATE.md `dep_check.last_checked` 갱신 (24h 이내 동일 set이면 skip — re-warn 노이즈 방지).
- **Mirror**: 기존 session-start.js의 STATE.md inject path.
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/session-start.test.js`에 fixture 추가.

### Task 5 — codex-bridge에서 MCCP_CODEX_DISABLED honor

- **Action**: `codex-bridge.js`의 invocation entry point에서 첫 줄:
  ```js
  if (process.env.MCCP_CODEX_DISABLED === '1') {
    return { ok: true, verdict: 'skipped', reason: 'codex_disabled', ... };
  }
  ```
- v0.2.2가 `codex-invoke.js`로 분리하면 본 코드는 invoke 측으로 이동 필요. 본 plan은 v0.2.2 머지 후 진입이라 transcribe 한 번만.
- **Mirror**: v0.2.2 plan Task 1의 `classification` 어휘 — `'skipped'` 추가.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js`

### Task 6 — settings.json round-trip + integration

- **Action**: setup command Phase 4에서 `settings-writer.js`를 invoke한 결과가 실제로 `~/.claude/settings.json`에 반영되는지 manual smoke. dry-run 모드 + 실모드 양쪽. backup 파일이 `.bak`로 생성되는지 확인.
- **Validate**: manual 1회. test는 Task 2에서 cover.

### Task 7 — docs + version + cheat sheet

- **Action**:
  - `docs/gate-design.md`: §"Codex Disable Toggle" + §"Setup Flow" 추가.
  - `CLAUDE.md`: §4 cheat sheet `/mccp:setup`, §3.3 fallback matrix에 `MCCP_CODEX_DISABLED` 행.
  - `README.md`: 설치 섹션 단순화.
  - `NOTICE`: impeccable 부연.
  - `plugin.json`: 0.2.2 → 0.2.3.
- **Validate**: docs lint 없음 — diff 검토만.

### Task 8 — 최종 dogfood

- **Action**: clean test profile (별도 `CLAUDE_HOME` 또는 docker)에서 `claude` 부팅 → `/mccp:setup` 호출 → 모든 단계가 idempotent 한지 확인 (이미 설치된 경우 skip, 미설치인 경우 install).
  - 시나리오 A: codex 없음 + impeccable 없음
  - 시나리오 B: 둘 다 있음, codex 인증만 안 됨 → `MCCP_CODEX_DISABLED=1` 권유
  - 시나리오 C: `--dry-run`으로 호출 → 어떤 install도 실행 X, plan만 출력
- **Validate**: 3 시나리오 모두 정상 — STATE.md `dep_check` 필드가 시나리오에 맞게 갱신.

---

## Validation

```bash
# Level 1: unit tests
node --test plugins/mccp/scripts/lib/tests/dep-check.test.js
node --test plugins/mccp/scripts/lib/tests/settings-writer.test.js
node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
node --test plugins/mccp/scripts/hooks/tests/session-start.test.js

# Level 2: manual smoke (3 시나리오, Task 8)

# Level 3: receipt chain
node plugins/mccp/scripts/receipt/cli.js status

# Level 4: integration with v0.2.2 receipt soft-mode
MCCP_CODEX_DISABLED=1 node plugins/mccp/scripts/lib/codex-bridge.js --selftest
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `claude plugin install`가 interactive prompt를 띄울 가능성 (NTM 동의 등) | M | M (Bash hang) | 본 plan은 `--scope user` 명시 + `--help` 검토 단계에서 prompt 발견 시 `--yes` 류 flag 추가. Task 3 구현 직전 `claude plugin install codex@openai-codex --dry-run` 으로 확인. |
| `impeccable skills install`이 `~/.claude/skills/` 외 위치를 덮을 가능성 | L | M | 사전 dry-run + install 후 diff 비교. backup 권유 단계 추가 가능. |
| settings.json read-modify-write 동안 사용자가 동시 편집 | L | H (설정 파괴) | atomic rename + backup `.bak` 1개 보존. read-modify 사이 lock은 안 함(과한 복잡도). 실패 시 backup 복구 안내 출력. |
| `MCCP_CODEX_DISABLED=1`가 settings.json에 들어가도 새 세션 spawn 시점에서 환경에 주입되는지 보장 안 됨 | M | M | Claude Code가 settings.json의 `env`를 hook spawn에 주입함을 코드 확인 필요 (Task 2 진입 전). 만약 미주입이면 STATE.md flag 병기로 fallback. |
| v0.2.2 머지 전 본 plan 시작 시 `codex-invoke.js` 부재로 codex-bridge 직접 수정 필요 | M | L | 본 plan은 v0.2.2 머지 후 진입을 가정. 만약 병행 진행 필요하면 v0.2.3 Task 5를 v0.2.2와 동일 코드 위치(`codex-bridge.js`)에 둠. |
| `npm install -g`가 권한 오류 (sudo 필요) | M | M | `npm install -g` 실패 시 stderr 캡처해 "권한 부족: nvm 사용 권장" 메시지로 graceful 종료. AskUserQuestion으로 "user-local로 npm prefix 변경?" 옵션 제공은 v0.2.4 followup. |
| AskUserQuestion이 단계마다 발생해 UX 피로 | L | L | --yes 모드 (`/mccp:setup --yes`) 추가는 v0.2.4 followup. 현재는 명시적 컨펌이 안전. |
| impeccable의 `skills install`이 기존 `mccp:impeccable` skill과 충돌 (0.2.1 cache 잔존 시) | M | L | impeccable이 자체적으로 namespace 분리 (`impeccable:` prefix). 충돌 X. Task 8 시나리오 B에서 확인. |

---

## Acceptance

- [ ] `plugins/mccp/scripts/lib/dep-check.js` + tests 통과 (4 fixture)
- [ ] `plugins/mccp/scripts/lib/settings-writer.js` + tests 통과 (4 fixture, atomic + backup)
- [ ] `/mccp:setup` command 본문 작성 (5 Phase, `--dry-run` `--skip-codex` `--skip-impeccable` 지원)
- [ ] SessionStart hook이 누락 시 한 줄 stderr emit, `MCCP_CODEX_DISABLED=1`이면 silent
- [ ] codex-bridge.js (또는 v0.2.2 머지 후 codex-invoke.js)가 `MCCP_CODEX_DISABLED=1`에서 `verdict='skipped'` 반환
- [ ] STATE.md schema에 `dep_check` 필드 추가, round-trip test
- [ ] docs(gate-design / CLAUDE.md / README.md / NOTICE) 갱신
- [ ] plugin.json version 0.2.3
- [ ] Task 8 manual 3 시나리오 모두 정상

---

## Followups (별도 cycle)

- v0.2.4 — `/mccp:setup --yes` (non-interactive 자동 install)
- v0.2.4 — `claude plugin install` 진입 시 EULA prompt 자동 동의 검토
- v0.2.4 — npm 권한 부족 시 user-local prefix 자동 전환 옵션
- v0.2.4 — settings.json env 변경 시 새 세션 spawn까지 반영 안 됨을 사용자에게 명시 (Claude Code 재시작 안내)
- v0.3.0 — `/mccp:setup`을 `/mccp:work` (단일 entry, [[mccp-v0.2-continuation]] Q4) 하위로 통합 검토

---

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): task task-mpyhluas-of7n9v stalled after 3m44s with `codex app-server connection closed`; cancel attempt blocked by taskkill arg-parsing bug. Treated as `service_unavailable` per /mccp:plan Phase 5.2 fallback signal catalog.

- 호출: `Agent(codex:codex-rescue)` → `codex-companion.mjs task`
- 라운드 수: 0 (반환 전 stall)
- 합치 결론: N/A — adversarial review가 수행되지 않음
- 수용한 제안: N/A
- 거부한 제안 + 근거: N/A
- Open Questions: Codex 자가검토 없이 진행되었으므로 본 plan은 single-model blind spot 위험을 안고 있음 — 사용자 검토 시점에 (a) impeccable npm CLI가 `~/.claude/skills/` 외부에 SKILL을 쓸 가능성, (b) `claude plugin install` interactive prompt 발생 여부, (c) settings.json env 변경 후 새 세션까지 미반영되는 timing — 3건을 인적 검토로 보강 권장 — severity MEDIUM
- Codex session 참조: task-mpyhluas-of7n9v (stalled, session 3710c1f2-e280-40d8-b0d4-9353a6ed7957)
