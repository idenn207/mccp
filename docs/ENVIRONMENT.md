# 환경변수 카탈로그 (Environment Variables)

`my-claude-code-plugin` (mccp)의 게이트·hook·자동화 layer가 인식하는 환경변수 레퍼런스. 상태(✅ live / 🚧 예정 / ♻ ECC fork 이관)와 default, 의미, 설정 위치를 정리합니다.

## 스코프

**포함**: mccp/ECC 코드(`plugins/mccp/scripts/**`, `.claude/scripts/**`, `.claude/plans/**`, `docs/v0.2-*.md`)가 `process.env` 또는 `env.X`로 read하거나 plan에서 도입 예정인 변수. 그리고 mccp가 vendor한 impeccable skill이 read하는 변수(§9).

## 설정 위치

mccp 게이트의 표준 설정 위치는 **`settings.json`의 `env` 키**입니다.

- 사용자 단위: `~/.claude/settings.json`
- 프로젝트 단위: `<repo>/.claude/settings.json`

예시:

```json
{
  "env": {
    "MCCP_STOP_LOOP": "enforce",
    "MCCP_STOP_LOOP_CODEX": "1",
    "MCCP_RECEIPT_DEBUG": "1"
  }
}
```

값은 모두 문자열(JSON spec). 모든 `MCCP_*`/`ECC_*` 변수는 **opt-in** — 키를 빼면 안전한 기본값으로 동작합니다.

---

## 1. mccp 게이트 / receipt 운영 (v0.1, ✅ live)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_SKIP_RECEIPT` | `1` | unset | 단일 게이트 호출에 한해 receipt 발급 + 검증을 bypass. **운영용이 아닌 디버깅 용**. |
| `MCCP_RECEIPT_DEBUG` | `1` | unset | receipt 관련 hook에서 진단 stderr 출력을 켭니다. v0.2.7부터 ALLOW path에서 `systemMessage`도 emit합니다 (L2a). |
| `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` | `0` | unset | v0.2.7 advanced opt-out — `MCCP_RECEIPT_DEBUG=1`일 때 ALLOW-path `systemMessage`를 끄고 기존 block-payload inline 모드만 유지. |

**사용처**: [receipt-prompt.js](../plugins/mccp/scripts/hooks/receipt-prompt.js), [receipt-skill.js](../plugins/mccp/scripts/hooks/receipt-skill.js), [receipt/write.js](../plugins/mccp/scripts/receipt/write.js), [receipt/preflight.js](../plugins/mccp/scripts/receipt/preflight.js).

### MCCP_RECEIPT_DEBUG precedence (v0.2.7 C7)

| `MCCP_RECEIPT_DEBUG` | `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` | ALLOW path systemMessage | Block-payload inline | stderr |
| --- | --- | --- | --- | --- |
| unset / `0` | (any) | silent (default) | always on when blocked | silent |
| `1` | unset / `1` (default) | **emit** (L2a active) | always on when blocked | verbose |
| `1` | `0` (opt-out) | silent | always on when blocked | verbose |

---

## 2. mccp Stop-loop (S8, ✅ live since v0.2)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_STOP_LOOP` | `off` \| `observe` \| `enforce` | `observe` | Claude 응답 종료 직전 자동 게이트(lint/typecheck/test/e2e) 동작 모드. `off`=완전 비활성, `observe`=실행 후 stdout verdict만(block X), `enforce`=실패 시 Stop 차단 + `fix-task.md` 생성 + 최대 2회 bounded retry. |
| `MCCP_STOP_LOOP_CODEX` | `0` \| `1` | `0` | Quality runner 통과 후 Codex diff review를 추가로 실행할지. `1`이면 `<repo>/.claude/state/codex-stop-loop-input.txt`에서 사전 기록된 Codex review를 읽어 분류 (`verdict='critical'` 또는 `escalate=true` → 실패). 파일 부재 시 stderr notice 1줄 + fail-open. |

**E2E stage 토글**:

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_STOP_LOOP_E2E` | `1` | unset | Quality runner의 `e2e` stage 활성화. unset이면 e2e는 `skipped`로 처리되어 lint/typecheck/test만 게이트로 작동. [quality/runner.js:90](../plugins/mccp/scripts/quality/runner.js). |

**v0.3 옵션 (🚧)**:

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_STOP_LOOP_QUALITY_CWD` | `cwd` | unset | monorepo 하위 패키지의 `package.json` 기준으로 quality 게이트를 돌리도록 토글. 미설정 시 toplevel 기준(현재 v0.2 동작). v0.3에서 도입 예정. |

**사용처/설계**: [docs/v0.2-architecture.md §3](v0.2-architecture.md), [stop-format-typecheck.js](../.claude/scripts/hooks/stop-format-typecheck.js).

---

## 3. mccp v0.2.2 receipt soft-mode + auto-chain (✅ 일부 live, 🚧 일부 signal-only)

> v0.2.2 plan: [.claude/plans/mccp-v0.2.2.plan.md](../.claude/plans/mccp-v0.2.2.plan.md). plugin.json은 아직 0.2.1이지만 plan의 핵심 모듈(`receipt-mode.js`, `codex-invoke.js`, `auto-chain.js`)은 이미 머지되어 아래 3개는 live.

| 변수 | 값 | Default | 상태 | 설명 |
| --- | --- | --- | --- | --- |
| `MCCP_RECEIPT_GATE_MODE` | `hard` \| `soft` \| `off` | `hard` | ✅ live | receipt 게이트 운용 모드. `hard`=chain-of-custody 강제(누락 receipt 차단), `soft`=누락 시 `decision="skipped-soft"` placeholder를 자동 write(다운스트림 validator는 non-approving 처리), `off`=게이트 자체 비활성(개인 디버깅 전용, stderr 큰 경고). 알 수 없는 값은 hard로 fallback + stderr warning. [receipt-mode.js](../plugins/mccp/scripts/lib/receipt-mode.js). |
| `MCCP_ALLOW_CODEX_UNAVAILABLE` | `1` | unset | ✅ live | Codex 호출이 unavailable/blocking으로 떨어졌을 때 wrapper exit 0로 진행하되 receipt body에 `advisory=true`로 stamp (converged receipt 미발급). 미설정이면 unavailable = hard fail. [codex-invoke.js:104,222](../plugins/mccp/scripts/lib/codex-invoke.js), [auto-chain.js:161](../plugins/mccp/scripts/lib/auto-chain.js). |
| `MCCP_AUTO_CHAIN_DISABLE` | `1` | unset | ✅ live | `prp-implement → prp-commit → prp-pr` 자동 chain을 비활성화하는 operator kill switch. `auto-chain.js`의 `shouldAbort()`가 첫 번째로 검사. |
| `MCCP_COST_HARD_CEILING_HIT` | `1` | unset | 🚧 signal | `ecc-context-monitor`가 $100 critical에 도달했을 때 emit하는 신호(spawn된 hook 환경에는 직접 주입 불가하므로 STATE.md `chain_aborted=true`와 함께 기록 — `auto-chain.js`가 양쪽 검사). 사용자가 직접 set할 변수 아님. |

---

## 4. mccp setup / Codex 토글 (🚧 예정)

> setup plan: [.claude/plans/mccp-setup-command.plan.md](../.claude/plans/mccp-setup-command.plan.md).

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_CODEX_DISABLED` | `1` | unset | Codex 호출 자체를 skip하고 즉시 `{verdict:'skipped', reason:'codex_disabled'}` 반환. Codex 미설치/미인증 사용자가 mccp 게이트를 noise 없이 통과시키려고 쓰는 토글. `/mccp:setup` Phase 4가 사용자의 동의를 받아 자동 write. SessionStart 누락 안내도 이 변수가 `1`이면 침묵. |

`MCCP_CODEX_DISABLED` vs `MCCP_ALLOW_CODEX_UNAVAILABLE` 차이:

- `MCCP_CODEX_DISABLED=1` → Codex CLI를 **호출조차 안 함** (의도적 비활성).
- `MCCP_ALLOW_CODEX_UNAVAILABLE=1` → 호출은 하되, 실패하면 advisory mode로 진행 (Codex 일시 장애 대응).

---

## 5. mccp Auto-handoff (S10b, 🚧 미구현)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_AUTO_HANDOFF` | `off` \| `notify` \| `spawn` | `notify` | 누적 비용($50 notice / $80 soft / $100 hard) 임계에서 자동 세션 전환 동작. `off`=no-op, `notify`=desktop notification + stdout meta, `spawn`=tmux new-window 또는 Windows Start-Process(race-lock). **현재 환경변수만 예약된 상태**, S10b 구현 시 wire. |

설계: [docs/v0.2-architecture.md §4](v0.2-architecture.md).

---

## 6. ECC hook 인프라 (♻ ECC fork 이관, ✅ live)

ECC에서 가져와 plugin 안에서 그대로 active하게 사용 중인 변수. 대부분 hook runner 내부용이라 사용자가 set할 일은 드물지만, 디버깅/비활성화 시 알아두면 유용.

### 6.1 Hook profile / 제어

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `ECC_HOOK_PROFILE` | `minimal` \| `standard` \| `strict` | `standard` | 일괄 hook 활성도 프로파일. `minimal`은 observe·governance 류 무거운 hook을 skip. continuous-learning observer의 child agent도 `minimal`로 호출. |
| `ECC_DISABLED_HOOKS` | comma-separated hook IDs | unset | 명시적으로 비활성화할 hook ID 리스트. 예: `governance-capture,mcp-health`. |
| `ECC_SKIP_OBSERVE` | `1` | unset | continuous-learning observer hook을 단발 skip. observer가 자기 자신을 재귀 호출할 때 사용. |
| `ECC_GATEGUARD` | `off` | (on) | GateGuard fact-force hook을 일시 비활성. setup/repair 중 GateGuard가 막을 때 임시 우회. |
| `GATEGUARD_DISABLED` | `1`/truthy | unset | `ECC_GATEGUARD=off`와 별개의 GateGuard 비활성 토글. 두 변수 중 하나라도 set이면 GateGuard 우회. [gateguard-fact-force.js:434](../plugins/mccp/scripts/hooks/gateguard-fact-force.js). |
| `GATEGUARD_STATE_DIR` | absolute path | `~/.claude/.../gateguard/` | GateGuard의 fact-force state 저장 디렉토리. unset이면 `HOME`/`USERPROFILE` 기준으로 결정. |
| `ECC_HOOK_ID` | string | unset | runner가 자식 hook 프로세스에 주입하는 현재 hook ID. observe-runner는 첫 인자 또는 이 변수에서 prefix를 읽어 routing. |
| `ECC_PLUGIN_ROOT` | absolute path | `CLAUDE_PLUGIN_ROOT` fallback | hook script가 plugin 루트를 resolve할 때 사용. `plugin-hook-bootstrap.js`가 자식에게 inject. |
| `ECC_HOOK_INPUT_TRUNCATED` | `1`/`true`/`yes` | unset | upstream에서 stdin이 잘렸음을 child hook에 알리는 플래그. 신뢰성 있는 truncation 표시. |
| `ECC_HOOK_INPUT_MAX_BYTES` | bytes | (hook 별 기본값) | hook stdin 최대 크기 override. |
| `ECC_OBSERVE_RUNNER_TIMEOUT_MS` | ms | (built-in default) | observe-runner의 child hook 강제 타임아웃. |

### 6.2 Session / SessionStart

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `ECC_SESSION_ID` | string | unset | `CLAUDE_SESSION_ID`보다 우선시되는 명시적 session ID override. cost tracker / governance / metrics bridge에서 correlation 키로 사용. |
| `ECC_SESSION_RETENTION_DAYS` | int | (built-in) | 오래된 session 기록의 보존일수. `session-start.js`가 cleanup 시 read. |
| `ECC_SESSION_START_CONTEXT` | `off` \| `on` 등 | (on) | SessionStart에서 과거 컨텍스트(MEMORY.md 인덱스 등) inject 여부. `off`로 끌 수 있음. |
| `ECC_SESSION_START_MAX_CHARS` | int | (built-in cap) | SessionStart에 inject되는 컨텍스트 문자 수 상한. 넘으면 truncation marker가 붙음. |
| `ECC_SESSION_RECORDING_DIR` | absolute path | (built-in default) | canonical-session 어댑터의 세션 기록 디렉토리. [canonical-session.js:264](../plugins/mccp/scripts/lib/session-adapters/canonical-session.js). |

### 6.3 Quality gate / Governance / Cost monitor

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `ECC_QUALITY_GATE_FIX` | `true` | `false` | `quality-gate.js` hook이 자동 fix(`--fix` 플래그 등) 모드로 동작. |
| `ECC_QUALITY_GATE_STRICT` | `true` | `false` | quality-gate가 strict 모드로 동작 (경고도 실패로). |
| `ECC_GOVERNANCE_CAPTURE` | `1` | unset | governance capture hook(`governance-capture.js`)을 활성화. 시크릿/정책 위반/승인 요청 같은 governance event를 캡쳐. |
| `ECC_CONTEXT_MONITOR_COST_WARNINGS` | truthy/falsy | `true` | `ecc-context-monitor`의 cost warning 출력 활성화. 비활성화하면 $50/$80/$100 알림 자체가 안 뜸. [ecc-context-monitor.js:44](../plugins/mccp/scripts/hooks/ecc-context-monitor.js). |
| `ECC_CONTEXT_MONITOR_COST_MODE` | `notify` \| `notification` \| `info` \| `informational` \| (그 외) | (directive) | cost 메시지의 톤 제어. `notify` 류면 imperative tail("halt/wind down" 같은) 제거 → 비용만 보고. 다른 값/unset이면 default directive 동작. |
| `ECC_ENABLE_INSAITS` | truthy | unset | Insaits security wrapper hook 활성화. [insaits-security-wrapper.js:33](../plugins/mccp/scripts/hooks/insaits-security-wrapper.js). |
| `ECC_DISABLED_MCPS` | comma-separated MCP names | unset | mccp installer가 install 단계에서 skip할 MCP 리스트. [install/apply.js:120](../plugins/mccp/scripts/lib/install/apply.js). |

### 6.4 MCP / 외부 도구 경로

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `ECC_MCP_HEALTH_STATE_PATH` | absolute path | (`~/.claude/...` 안 기본 위치) | `mcp-health-check.js`가 health state를 저장/조회할 경로 override. |
| `ECC_MCP_CONFIG_PATH` | absolute path | (Claude 표준 위치) | MCP config 위치 override. health check가 사용. |
| `ECC_MCP_RECONNECT_COMMAND` | shell command | (built-in default) | mcp-health-check이 unhealthy MCP를 만났을 때 재연결을 위해 실행할 명령. [mcp-health-check.js:518](../plugins/mccp/scripts/hooks/mcp-health-check.js). |
| `ECC_MCP_HEALTH_FAIL_OPEN` | truthy | unset | health check 실패 시 fail-open(통과) 모드. unset이면 fail-closed. [mcp-health-check.js:558](../plugins/mccp/scripts/hooks/mcp-health-check.js). |
| `ECC_GH_SHIM` | absolute path | unset | GitHub CLI shim 경로. `github-discussions.js`가 `gh` 호출 대신 사용. CI/sandbox에서 유용. |
| `GITHUB_TOKEN` | token | unset | GitHub API 인증. `github-discussions.js:44`가 직접 read하므로 등재. 표준 GitHub 환경변수 prefix 그대로. |

### 6.5 mccp installer (`CLAUDE_*` prefix이지만 mccp가 정의)

> 주의: `CLAUDE_*` prefix를 쓰지만 Claude harness 표준이 아닌 **mccp installer 자체 토글**. installer 컨텍스트에서만 의미가 있음.

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `CLAUDE_RULES_DIR` | absolute path | (`HOME` 기준 default) | install-executor가 rule 파일을 배치할 디렉토리 override. [install-executor.js:500](../plugins/mccp/scripts/lib/install-executor.js). |
| `CLAUDE_PACKAGE_MANAGER` | `npm` \| `pnpm` \| `yarn` \| `bun` | (auto-detect) | mccp installer가 사용할 패키지 매니저 명시. unset이면 lockfile 기반 auto-detect. [package-manager.js:167](../plugins/mccp/scripts/lib/package-manager.js). |

---

## 7. continuous-learning v2 / 기타 hook (✅ live)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `CLV2_HOMUNCULUS_DIR` | absolute path | `$XDG_DATA_HOME/clv2/homunculus` 또는 `~/.local/share/clv2/homunculus` | continuous-learning v2 observer가 사용하는 homunculus(작업기억) 디렉토리. `observer-sessions.js`가 read. |
| `COMPACT_THRESHOLD` | int | `50` | `suggest-compact.js`가 컨텍스트 컴팩션 제안을 띄울 turn 임계. |

---

## 8. 빠른 레시피 (`settings.json` 예시)

### v0.2 Stop-loop을 enforce + Codex diff review 활성

```json
{
  "env": {
    "MCCP_STOP_LOOP": "enforce",
    "MCCP_STOP_LOOP_CODEX": "1"
  }
}
```

### Codex 미설치 환경 — 게이트는 통과시키되 Codex review만 skip

```json
{
  "env": {
    "MCCP_CODEX_DISABLED": "1"
  }
}
```

> 🚧 `/mccp:setup` command 머지 후 active. 현재는 셸 변수로 set해도 효과 없음.

### receipt 게이트 디버깅

```json
{
  "env": {
    "MCCP_RECEIPT_DEBUG": "1"
  }
}
```

### Hook 무게 줄이기 (observer/governance 류 skip)

```json
{
  "env": {
    "ECC_HOOK_PROFILE": "minimal"
  }
}
```

### 일회성 receipt bypass (한 호출만)

`settings.json`이 아닌 셸에서 일회성으로:

```powershell
$env:MCCP_SKIP_RECEIPT = '1'
# /mccp:plan ... 호출
Remove-Item Env:MCCP_SKIP_RECEIPT
```

> 운영 settings.json에 `MCCP_SKIP_RECEIPT=1`을 영구 set하지 마세요 — chain-of-custody가 깨집니다.

---

## 9. Vendored impeccable skill 변수 (참고)

`.claude/skills/impeccable/` 에는 impeccable plugin의 자체 스크립트가 vendor되어 있고, 자체 환경변수 19종을 read합니다. CLAUDE.md §1.1에 따라 mccp는 impeccable을 **번들하지 않으며**(별도 plugin 설치 권장) mccp 게이트 코드는 이 변수들을 read하지 않습니다 — 본 섹션은 impeccable skill을 직접 사용할 때를 위한 참고입니다.

`IMPECCABLE_VERSION`만 예외적으로 mccp의 [/mccp:setup plan](../.claude/plans/mccp-setup-command.plan.md) `dep-check.js`가 환경 hint로 honor합니다.

### 9.1 Update check (3)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_UPDATE_HOST` | URL | `https://impeccable.style` | skill 버전 확인 host. 본문은 매 24시간마다 lightweight HEAD로 새 skill 버전을 polling. trailing `/`는 자동 strip. |
| `IMPECCABLE_UPDATE_CACHE` | absolute path | `~/.impeccable/update-check.json` | update polling 결과 캐시 파일 경로. 1.2초 fetch timeout이 실패해도 stdout 차단 안 함. |
| `IMPECCABLE_NO_UPDATE_CHECK` | `1` 등 truthy | unset | update polling 전체를 비활성화. 오프라인/샌드박스/CI에서 noise 제거용. `context.mjs:189`. |

**파일**: [context.mjs](../.claude/skills/impeccable/scripts/context.mjs).

### 9.2 Context resolution (1)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_CONTEXT_DIR` | absolute or cwd-relative path | unset | `PRODUCT.md` / `DESIGN.md` 검색 폴백 디렉토리. 검색 순서: ① cwd ② `.agents/context/`·`docs/` ③ 이 변수 ④ cwd 빈 default. "power-user escape hatch"라 주석. `context.mjs:51`. |

### 9.3 Critique storage (1)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_CRITIQUE_META` | JSON 문자열 | unset | critique snapshot의 frontmatter에 들어갈 메타데이터. 키 예: `{"target":"<text>","total_score":<n>,"p0_count":<n>,"p1_count":<n>}`. 내부 계산 `timestamp`·`slug`는 caller 값을 덮어쓰므로 파일명과 frontmatter가 어긋날 일 없음. parse 실패 시 silent ignore. [critique-storage.mjs:200](../.claude/skills/impeccable/scripts/critique-storage.mjs). |

### 9.4 Live mode config (1)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_LIVE_CONFIG` | absolute or cwd-relative path | unset | live mode 설정 파일 경로 override. 미설정 시 ① `<cwd>/.impeccable/live/config.json` ② legacy `<scriptsDir>/config.json` 순으로 fallback. [impeccable-paths.mjs:43](../.claude/skills/impeccable/scripts/impeccable-paths.mjs). |

### 9.5 Live event timing & debug (3)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS` | int (ms) | `150000` | live apply event hard timeout. 이 시간 안에 끝나지 않으면 강제 종료. |
| `IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS` | int (ms) | `120000` | live apply event soft deadline. hard timeout 이전에 graceful wind-down 신호. |
| `IMPECCABLE_LIVE_DEBUG_EVENTS` | `1`/`true`/`yes` | unset | live 이벤트 디버그 로그를 stderr에 출력. manual-edit 트러블슈팅용. |

**파일**: [live-server.mjs](../.claude/skills/impeccable/scripts/live-server.mjs).

### 9.6 Live copy-edit agent (8)

`live-copy-edit-agent.mjs`가 codex/claude/chat 중 하나로 copy-edit 작업을 위임하는 방식을 제어합니다.

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_LIVE_COPY_AGENT` | `auto` \| `codex` \| `claude` \| `chat` \| `mock` \| `off` (`0`/`false`/`none`) | `auto` | copy-edit agent 선택 모드. `auto`=codex→claude→chat 순 fallback, `mock`=테스트용 가짜 결과, `off`=agent 사용 안 함. [live-copy-edit-agent.mjs:435](../.claude/skills/impeccable/scripts/live-copy-edit-agent.mjs). |
| `IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS` | int (ms) | `120000` | copy-edit agent subprocess 타임아웃. live-server와 live-commit-manual-edits 양쪽에서 read. |
| `IMPECCABLE_LIVE_COPY_AGENT_EFFORT` | codex effort level (`low` \| `medium` \| `high`) | `low` | codex 모델의 `model_reasoning_effort` 설정. 본 변수는 codex provider 경로에서만 적용. |
| `IMPECCABLE_LIVE_COPY_AGENT_MODEL` | model name | unset | codex/claude 모델 명시 override. set 시 `--model <name>` 인자로 전달. |
| `IMPECCABLE_LIVE_COPY_AGENT_MOCK_DELAY_MS` | int (ms) | `0` | `mock` 모드의 인공 지연 시간. 테스트에서 race condition 시뮬레이션용. |
| `IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT` | JSON 문자열 | unset | `mock` 모드 결과 강제 — `parseCopyEditBatchResult`로 parse, 실패 시 throw. set 안 하면 default mock result(`status:'done'`, applied 모든 entry id) 사용. |
| `IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES` | JSON `{ "rel/path": "content" }` | unset | `mock` 모드에서 cwd 안에 가짜 파일 write 시뮬레이션. cwd 밖 path는 skip. parse 실패 시 throw. |
| `IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS` | int | `DEFAULT_REPAIR_ATTEMPTS` (소스 상수) | manual-edit 흐름에서 copy-edit agent 실패 시 재시도 횟수. [live-commit-manual-edits.mjs:172](../.claude/skills/impeccable/scripts/live-commit-manual-edits.mjs). |

### 9.7 Palette / 기타 (2)

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `IMPECCABLE_PALETTE_SEED` | string | unset | palette generation seed. 명시 `--from` 인자보다 우선순위 낮음. set 시 `hashUnit(value)`로 deterministic seed, unset이면 `Math.random()`. [palette.mjs:472](../.claude/skills/impeccable/scripts/palette.mjs). |
| `IMPECCABLE_VERSION` | semver/string | unset | impeccable CLI 버전 hint. 본래 impeccable 자체는 이 변수를 read하지 않지만, mccp의 `/mccp:setup` dep-check가 CLI 미설치 환경에서 fallback hint로 honor. |

---

## 10. 변경 이력 관리

새 환경변수를 도입하거나 default를 바꿀 때:

1. 이 파일에 행 추가/수정 (변수명·values·default·설명·사용처).
2. [CLAUDE.md §4 "운영 토글"](../CLAUDE.md) cheat sheet 동기화 — 사용자 첫 진입점이라 거기서 vis가 가장 큽니다.
3. live 변수면 `plugins/mccp/.claude-plugin/plugin.json` version bump 검토.
4. 🚧 → ✅ 전환 시 §3~§5에서 §1~§2 (또는 적절한 live 섹션)로 이동.

새 변수의 prefix는:

- mccp가 도입한 거면 `MCCP_*`
- ECC fork에서 가져온 거면 `ECC_*` 유지 (rename은 깨질 위험)
- 다른 plugin/skill 거면 그 prefix 그대로 (`IMPECCABLE_*`, `CLV2_*` 등) — 본 문서는 mccp가 read하거나 vendor한 skill에 한정해 등재
