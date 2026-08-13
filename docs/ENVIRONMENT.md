# 환경변수 카탈로그 (Environment Variables)

`my-claude-code-plugin` (mccp)의 게이트·hook·자동화 layer가 인식하는 환경변수 레퍼런스. 상태(✅ live / 📖 LLM-observed / 🚧 예정 / ♻ ECC fork 이관)와 default, 의미, 설정 위치를 정리합니다. `📖 LLM-observed`는 문서·prompt에 등장하지만 hook/script가 mechanical하게 honor하지 않는 변수 — LLM이 자기 환경에서 읽어 동작을 조정합니다 (사용자가 mechanical 강제를 기대하면 fail-open).

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
| `MCCP_AUTO_CHAIN_SKIP_PR` | `1` | unset | 📖 LLM-observed | **mechanical 미구현** — `auto-chain.js`/`prp-implement` hook이 이 변수를 honor하지 않습니다. `prp-implement.md` Phase 7 직전에 LLM이 본인 환경에서 읽어 `/mccp:pr` invocation을 skip할지 판단하는 prompt-level toggle. 사용자가 mechanical 강제를 기대하면 fail-open (chain은 그대로 PR로 진행됨). W-VERDICT C2 axis M (F-W10-1) 강등 결과 — mechanical 구현은 axis M follow-up patch. |
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
| `MCCP_HOOK_PROFILE` | `minimal` \| `standard` \| `strict` | `standard` | 일괄 hook 활성도 프로파일. `minimal`은 observe·governance 류 무거운 hook을 skip. continuous-learning observer의 child agent도 `minimal`로 호출. |
| `MCCP_DISABLED_HOOKS` | comma-separated hook IDs | unset | 명시적으로 비활성화할 hook ID 리스트. 예: `governance-capture,mcp-health`. |
| `MCCP_SKIP_OBSERVE` | `1` | unset | continuous-learning observer hook을 단발 skip. observer가 자기 자신을 재귀 호출할 때 사용. |
| `MCCP_GATEGUARD` | `off` | (on) | GateGuard fact-force hook을 일시 비활성. setup/repair 중 GateGuard가 막을 때 임시 우회. |
| `GATEGUARD_DISABLED` | `1`/truthy | unset | `MCCP_GATEGUARD=off`와 별개의 GateGuard 비활성 토글. 두 변수 중 하나라도 set이면 GateGuard 우회. [gateguard-fact-force.js:434](../plugins/mccp/scripts/hooks/gateguard-fact-force.js). |
| `GATEGUARD_STATE_DIR` | absolute path | `~/.claude/.../gateguard/` | GateGuard의 fact-force state 저장 디렉토리. unset이면 `HOME`/`USERPROFILE` 기준으로 결정. |
| `MCCP_HOOK_ID` | string | unset | runner가 자식 hook 프로세스에 주입하는 현재 hook ID. observe-runner는 첫 인자 또는 이 변수에서 prefix를 읽어 routing. |
| `MCCP_PLUGIN_ROOT` | absolute path | `CLAUDE_PLUGIN_ROOT` fallback | hook script가 plugin 루트를 resolve할 때 사용. `plugin-hook-bootstrap.js`가 자식에게 inject. |
| `MCCP_HOOK_INPUT_TRUNCATED` | `1`/`true`/`yes` | unset | upstream에서 stdin이 잘렸음을 child hook에 알리는 플래그. 신뢰성 있는 truncation 표시. |
| `MCCP_HOOK_INPUT_MAX_BYTES` | bytes | (hook 별 기본값) | hook stdin 최대 크기 override. |
| `MCCP_OBSERVE_RUNNER_TIMEOUT_MS` | ms | (built-in default) | observe-runner의 child hook 강제 타임아웃. |

### 6.2 Session / SessionStart

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_SESSION_ID` | string | unset | `CLAUDE_SESSION_ID`보다 우선시되는 명시적 session ID override. cost tracker / governance / metrics bridge에서 correlation 키로 사용. |
| `MCCP_SESSION_RETENTION_DAYS` | int | (built-in) | 오래된 session 기록의 보존일수. `session-start.js`가 cleanup 시 read. |
| `MCCP_SESSION_START_CONTEXT` | `off` \| `on` 등 | (on) | SessionStart에서 과거 컨텍스트(MEMORY.md 인덱스 등) inject 여부. `off`로 끌 수 있음. |
| `MCCP_SESSION_START_MAX_CHARS` | int | (built-in cap) | SessionStart에 inject되는 컨텍스트 문자 수 상한. 넘으면 truncation marker가 붙음. |
| `MCCP_SESSION_RECORDING_DIR` | absolute path | (built-in default) | canonical-session 어댑터의 세션 기록 디렉토리. [canonical-session.js:264](../plugins/mccp/scripts/lib/session-adapters/canonical-session.js). |

### 6.3 Quality gate / Governance / Cost monitor

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_QUALITY_GATE_FIX` | `true` | `false` | `quality-gate.js` hook이 자동 fix(`--fix` 플래그 등) 모드로 동작. |
| `MCCP_QUALITY_GATE_STRICT` | `true` | `false` | quality-gate가 strict 모드로 동작 (경고도 실패로). |
| `MCCP_GOVERNANCE_CAPTURE` | `1` | unset | governance capture hook(`governance-capture.js`)을 활성화. 시크릿/정책 위반/승인 요청 같은 governance event를 캡쳐. |
| `MCCP_CONTEXT_MONITOR_COST_WARNINGS` | truthy/falsy | `true` | `ecc-context-monitor`의 cost warning 출력 활성화. 비활성화하면 $50/$80/$100 알림 자체가 안 뜸. [ecc-context-monitor.js:44](../plugins/mccp/scripts/hooks/ecc-context-monitor.js). |
| `MCCP_CONTEXT_MONITOR_COST_MODE` | `notify` \| `notification` \| `info` \| `informational` \| (그 외) | (directive) | cost 메시지의 톤 제어. `notify` 류면 imperative tail("halt/wind down" 같은) 제거 → 비용만 보고. 다른 값/unset이면 default directive 동작. |
| `ECC_DISABLED_MCPS` | comma-separated MCP names | unset | **out-of-scope of axis-P** (install tree). mccp installer가 install 단계에서 skip할 MCP 리스트. [install/apply.js:120](../plugins/mccp/scripts/lib/install/apply.js). `MCCP_*` rename은 별도 install cleanup axis. |

### 6.4 MCP / 외부 도구 경로

| 변수 | 값 | Default | 설명 |
| --- | --- | --- | --- |
| `MCCP_MCP_HEALTH_STATE_PATH` | absolute path | (`~/.claude/...` 안 기본 위치) | `mcp-health-check.js`가 health state를 저장/조회할 경로 override. |
| `MCCP_MCP_CONFIG_PATH` | absolute path | (Claude 표준 위치) | MCP config 위치 override. health check가 사용. |
| `MCCP_MCP_RECONNECT_COMMAND` | shell command | (built-in default) | mcp-health-check이 unhealthy MCP를 만났을 때 재연결을 위해 실행할 명령. [mcp-health-check.js:518](../plugins/mccp/scripts/hooks/mcp-health-check.js). |
| `MCCP_MCP_HEALTH_FAIL_OPEN` | truthy | unset | health check 실패 시 fail-open(통과) 모드. unset이면 fail-closed. [mcp-health-check.js:558](../plugins/mccp/scripts/hooks/mcp-health-check.js). |
| `MCCP_GH_SHIM` | absolute path | unset | GitHub CLI shim 경로. `github-discussions.js`가 `gh` 호출 대신 사용. CI/sandbox에서 유용. |
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
    "MCCP_HOOK_PROFILE": "minimal"
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

## 11. 운영 토글 레퍼런스 (canonical)

> multi-session-work-loop M4에서 `CLAUDE.md` §4 "운영 토글 (환경 변수)" 블록을 그대로 이전한 것이다
> (45,724바이트 · 지시문 전체의 27.2%). PRD Evidence가 지목한 "별도 문서가 있는데도 지시문 안에 같은
> 내용이 중복"의 해소이며, 이 절이 운영 토글의 **canonical 레퍼런스**다.
>
> **잔여(정직 기록)**: 위 §1~§7은 이 절보다 먼저 쓰였고 일부 토글을 더 오래된 서술로 중복 설명한다.
> 두 서술이 어긋나면 **이 절이 우선**이다. 파일 내부 중복 통합은 M4 범위 밖이며 별도 주기 소관이다
> (M4가 닫은 것은 `CLAUDE.md` ↔ `ENVIRONMENT.md` 사이의 파일 간 중복이다).

`.claude/settings.json` 또는 셸에서 설정 — v0.2 자동 게이트 동작을 변경합니다.

```bash
# Stop-loop (Claude 응답 종료 직전 자동 게이트)
MCCP_STOP_LOOP=off|observe|enforce       # default: observe (관측만, block 안 함)
MCCP_STOP_LOOP_CODEX=0|1                 # default: 0 (Codex diff review opt-in)

# Receipt 게이트 (Codex adversarial review)
MCCP_RECEIPT_GATE_MODE=soft|hard|off     # v0.2.2 live. default=hard. soft/off는 opt-in only.
MCCP_SKIP_RECEIPT=1                      # 일회성 bypass (한 호출만) ─ live
MCCP_RECEIPT_DEBUG=1                     # 디버그 출력 활성화 ─ live
MCCP_ALLOW_CODEX_UNAVAILABLE=1           # advisory mode (non-approving receipt). terminal /mccp:pr은 거부 ─ live (v0.2.2)
MCCP_CODEX_DISABLED=1                    # Codex 호출 영구 skip. v0.3.5부터 wrapper(codex-invoke.js)가 first-class honor — spawn 직전 short-circuit으로 classification='disabled' 즉시 반환. codex-runner는 codex_outcome='disabled', receipt는 meta.codex_disabled=true + meta.codex_skip_reason='codex_disabled' 자동 stamp. terminal /mccp:pr Phase 0 advisory-rejection 예외 + Phase 0.3 3-way mutex(disabled ⊕ skipped ⊕ dedupe) 통과. codex-bridge는 v0.2.x부터 이미 honor — 두 layer 동기화 완료. /mccp:setup Phase 4가 자동 write.
MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<reason>" # v0.2.4 audited escape. terminal /mccp:pr이 security-reviewer agent unavailable + 이 env var의 specific reason 설정 시 advisory mode 진입. receipt에 meta.security_force_override=true + reason 기록, PR body에 ## Security Reviewer Override section auto-inject (canonical audit source). 1-token reason(=1, =yes)은 schema warning 발동. 1회용 권장.
MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<reason>"        # v0.2.6 audited escape (Codex R1 F4 strict). terminal /mccp:pr에서 impeccable Skill 미가용 + 이 env var의 specific reason 설정 시 force-override 진입. v0.2.4 security와 달리 reason validator가 SCHEMA REJECT — empty/whitespace/1-token banlist(yes/ok/true)/URL-only/<30자/<3단어/placeholder는 receipt write 시점에 차단. receipt에 meta.impeccable_force_override=true + reason 기록, PR body에 ## Impeccable Override section auto-inject (canonical audit source). 1회용 권장.
MCCP_PR_SKIP_CODEX_REVIEW="<reason>"               # v0.2.8 audited escape (Task 2.6.1 C). terminal /mccp:pr에서 Codex review 호출 자체를 skip — cross-gate dedupe 조건은 충족 못 했지만 PR 본문에 review를 inject할 필요가 없는 경우 (예: receipt chain 외부에서 이미 다른 검증을 거친 cherry-pick PR). reason validator는 MCCP_FORCE_PR_WITHOUT_IMPECCABLE과 동일 SCHEMA REJECT 규칙 (empty/1-token/URL-only/<30자/<3단어 → write 시점 차단 + receipt schema invalid). receipt에 meta.codex_skipped_at_pr=true + codex_skip_reason 기록, PR body footer에 ## Codex Review Skipped section auto-inject. F9 mutex preflight: 본 env var는 CODEX_DEDUPE_AT_PR=1과 mutually exclusive — Phase 0.3에서 둘 다 설정 시 STOP exit 1. 1회용 권장.
MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>" # v1.23.0 integrity-unification M3 audited override. terminal /mccp:pr의 M3 ship gate가 non-approving PR-Codex verdict(resolution.codex_verdict ∈ {divergent, critical, unavailable, absent})를 finalize exit 12 + validate --check-ship-verdict로 mechanical HALT하는데, 이 env + substantive reason 설정 시 그 이번 ship만 우회한다. reason validator는 strict SCHEMA REJECT (empty/1-token/URL-only/<30자/<3단어 → Phase 0.4 preflight 즉시 exit 1 + receipt write 시점 재차단). MCCP_PR_SKIP_CODEX_REVIEW과 근본적으로 다름 — 저건 Codex를 아예 skip(review 부재)이고 이건 Codex가 실제로 "No ship"이라 말한 뒤의 override다. **verdict를 converged로 재작성하지 않는다** — receipt는 실제 divergent를 봉인한 채 meta.pr_codex_force_override=true + reason과 ship돼 cross-gate dedupe fail-closed·§3.12 봉인·ledger 승인 술어(M1) 무손상(DD3). Phase 0.3 3-way mutex와 독립(Codex-skip 경로 아님). Phase 4가 ## PR-Codex Override 섹션 auto-inject(raw verdict·reason·drop 건수 명시). 1회용 권장 (예: upstream에서 이미 adversarial-review 거친 cherry-pick PR).
CODEX_DEDUPE_AT_PR=1                               # v0.2.8 internal signal. cross-gate dedupe가 활성화돼 PR step의 Codex 호출이 skip됐음을 receipt가 명시. 사용자가 직접 설정할 일은 없음 — dedupe 로직이 자동 export. F9 mutex preflight: MCCP_PR_SKIP_CODEX_REVIEW와 mutually exclusive.
MCCP_GATE_ROUND_CAP=1|2|3                # v0.2.9 default: 1. R2/R3은 ACCEPT_NOW × {HIGH, CRITICAL} 미해소 시에만 trigger. DEFER_TO_BACKLOG 항목은 .claude/plans/codex-findings-backlog.md에 1줄 append. plan.md/prp-implement.md/pr.md 3 게이트 모두 honor.
MCCP_CODEX_DESIGN_SCOPE_HONOR=0|1        # v0.3.6 default: 1. 축 1 kill switch (디버그용). impeccable 가용 시 codex-invoke wrapper가 focus 앞에 DESIGN_SCOPE_PREAMBLE prepend + codex-result-filter가 design/a11y keyword 매칭 finding을 drop. =0이면 두 layer 모두 no-op (기존 v0.3.5 동작 복원). receipt meta 4 fields(`codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest`)는 어느 쪽이든 audit용으로 작성.

# v1.3.0-m2 Design-critique SKILL first-step + retry loop (see §3.9)
MCCP_DESIGN_CRITIQUE_MAX_RETRY=0|1|2|3    # v1.3.0-m2 default: 2. plan.md/prp-implement.md/plan-prd.md design-critique retry loop의 round cap. =0 → R0 1회만 + DIVERGENT 즉시 (kill-switch, loud stderr warn). cap 도달 시 receipt meta.design_critique_verdict='divergent' stamp + PR step chain-check이 BLOCK. /mccp:pr scope는 무시 (retry 없음).
MCCP_DESIGN_INTENT_REASON="<reason>"      # v1.3.0-m2 audited intent override (axis c). detector positive(axis a) + 좁은 whitelist(axis b)가 모두 miss하지만 작성자가 "본 변경은 design routing"이라고 명시할 때만. strict reason validator (M1 IMPECCABLE_FORCE_OVERRIDE_REASON 룰 mirror — empty/1-token/URL-only/<30자/<3단어 reject). 활성 시 SKILL Read first-step + critique loop 강제 + receipt에 meta.design_intent_reason stamp.
MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<reason>" # v1.3.0-m2 audited escape (PR scope chain-check). /mccp:pr Phase 1.6 preflight가 prior receipt verdict='divergent' 발견 시 BLOCK하지만, 이 env + substantive reason 설정 시 advisory mode 진입. strict reason validator (위와 동일). 활성 시 receipt meta.pr_design_chain_skip_reason stamp + PR body footer에 ## Design Critique Chain Skipped section auto-inject (canonical audit source). cherry-pick PR + prior receipt unavailable 같은 좁은 use case 전용.
MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1  # v1.3.0-m2 test env (M2 acceptance gate dogfood용). =1이면 critique invoke 결과를 [{severity:'HIGH'}] 강제 주입 → oracle ESCALATE → cap 도달 시 DIVERGENT. production code path는 env 무관 — critique invoke 결과만 mock. e2e test에서 retry loop 회귀 보장. MCCP_RECEIPT_DEBUG=1 + 본 env 활성 시 stderr loud warn 강제.

# v1.18.22 Produced-diff design grounding (see §3.9 하단 "Produced-diff grounding lint")
MCCP_DESIGN_GROUNDING=off|warn|enforce    # v1.18.22 default: enforce (fail-closed). /mccp:prp-implement Phase 3.7 post-EXECUTE produced-diff grounding lint. 디자인 trigger 발화(SKILL_AVAIL=1 & (SIGNAL=1|DESIGN_INTENT_ACTIVE=1)) + Phase 2.5.5c capture 아티팩트 존재 시에만 실행 — produced rendered-surface delta(added line만)를 H15(heading depth ≤ 3) anchor로 mechanical(LLM-free) lint. enforce=violations/inconclusive 시 fix-task + bounded retry(MCCP_DESIGN_CRITIQUE_MAX_RETRY 공유 cap, default 2) 후 hard-stop / warn=advisory pass(verdict 정직 기록) / off=skipped(loud stderr warn). 오타·미설정 → enforce. critique loop(§3.9)과 **별도 locus** — 이건 produced diff mechanical, critique은 pre-EXECUTE LLM-judged(중복 아님). rendered surface scope=.css/.scss·.tsx/.jsx/.vue/.svelte/.astro·.html·.claude/cache/*.md (generic .md 제외 — command-doc #### 오발화 회피). H17(nested-card)은 DOM-aware라 added-line 버킷서 enforce 불가 → renderer full-HTML lint 소유. control-plane-only 변경은 no-op. pr/code-review(review-only) 미적용. receipt meta.design_grounding_captured(gate-time bool)+design_grounding_verdict(post-EXECUTE enum: grounded|anchor_clean|inconclusive|violations|skipped) stamp.

# v1.13.0 Stage-aware impeccable command routing (see §3.10)
MCCP_IMPECCABLE_ROUTING_MODE=auto|hybrid|recommend  # v1.13.0 default: auto. 디자인 게이트가 stage-appropriate impeccable 명령(shape/layout/typeset/audit/harden/polish)을 어떻게 다룰지 결정. auto=실제 호출 / hybrid=evaluate(critique/audit)만 invoke·나머지 recommend / recommend=전부 권장만. 미지정·오타 시 auto. critique은 모드 무관하게 §3.9 retry loop가 소유(divergent blocking 보존). pr 게이트는 모드 무관 recommend-only(review-only invariant). prp-implement은 renderingSurface=0(control-plane-only diff)일 때 auto에서도 refine/discovery를 recommend로 강등(Codex F4). receipt에 meta.impeccable_routing_mode + meta.impeccable_commands_routed(structured outcome) stamp.
MCCP_IMPECCABLE_INTENT_COMMANDS="bolder,quieter,overdrive,delight"  # v1.13.0 M2. mood/direction 명령은 diff로 감지 불가 → 기본 recommend-only. 이 env에 나열된 mood 명령은 4중 AND(auto + renderingSurface + designIntentActive(=MCCP_DESIGN_INTENT_REASON 활성) + 본 membership)에서만 prp-implement이 invoke로 승격. 미지정/조건 미충족 시 recommend. comma-separated, 알 수 없는 토큰은 무시. content-detectable 명령(animate/colorize/typeset/adapt)은 본 env와 무관 — diff signal positive-presence로 자동 선별(§3.10 M2).
MCCP_A11Y_AUTO_INVOKE=0|1                 # v1.13.0 M3 default: 1. /mccp:pr 게이트에서 PR diff에 rendered design surface(UI ext)가 있으면 mccp:a11y-architect를 review-only로 auto-invoke해 WCAG 2.2 관점 review를 PR body `## Accessibility Review`에 inject. 트리거는 rendering_surface(Codex finding 유무 아님 — design-scope preamble starvation 회피, Codex R1 F1). 전용 a11y-review pr-phase lock window + mutations finalizer로 review-only 보증(편집 시 hard-stop, R1 F2). receipt meta.a11y_auto_invoked stamp via finalize-receipt --a11y-auto-invoked(R1 F3). =0이면 auto-invoke 비활성(기존 routing-only count 동작 유지). rendering_surface=false면 어느 값이든 skip. remediation은 advisory — 적용은 별도 /mccp:prp-implement cycle.

# v1.23.1 Plan-Codex 의도 컨텍스트 게이트 + v1.23.9 M1.5 오심 탐지 (see CLAUDE.md §3.13 · §3.13.1)
MCCP_SKIP_INTENT_GATE="<reason>"           # v1.23.1 audited override. /mccp:plan의 intent gate가 **판정으로서** block(`incomplete`/`conflict_unresolved`/`skipped-unproven`/`inconclusive`/`mislabel_unresolved`)일 때 **이번 호출의 mechanical HALT만** 해제한다. **운영 실패에는 적용되지 않는다** — review payload 판독 불가·adjudication 미도착(timeout)·adjudication JSON 파손·post-write `plan_hash` 불일치는 override 지점(`plan-codex-runner.js`의 `deriveIntentGateDecision` 호출) **이전에** exit하며, 이는 결함이 아니라 경계다: 앞의 셋은 봉인할 리뷰 자체가 완료된 적이 없어(판정 입력 부재) receipt에 쓸 내용이 없고, 마지막은 자기가 주장하는 plan과 불일치하는 receipt를 봉인하는 것이라 감사 코퍼스를 오염시킨다. 이들의 복구는 override가 아니라 원인 제거(재실행·adjudication 작성·JSON 수정)다. strict reason validator(≥30자·≥3단어·placeholder/URL-only/banlist 거부 — `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`와 동일 규칙). **verdict를 세탁하지 않는다** — receipt는 실제 blocking verdict를 봉인한 채 `meta.intent_gate_force_override=true` + reason과 함께 작성되므로, cross-gate dedupe는 여전히 fail-closed고(PR-Codex 실발화) 감사 corpus도 거짓이 되지 않는다(DD6, M3 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`와 동형). `cli.js write --gate mccp-plan-codex`가 in-scope fail-closed로 막힐 때의 유일한 비-runner 통로이기도 하다. 1회용 권장.
MCCP_INTENT_ADJUDICATION_TIMEOUT_MS=1800000 # v1.23.1 default: 1800000(30분). plan-codex-runner가 adjudication 파일을 기다리는 bounded 상한. 초과 시 `incomplete`로 종료하고 receipt를 쓰지 않는다(무한 대기 금지). runner는 대기 중 lease lock에 heartbeat를 찍어 동시 runner가 자신을 live로 인식하게 한다.
MCCP_INTENT_MISLABEL=enforce|warn|off      # v1.23.9 M1.5 default: **enforce**(2026-08-13 실측 — 아래). 오심 탐지 축(§3.13.1)의 효력을 정한다. `enforce` = `inconclusive`(리뷰어가 `INTENT:` 계약 불응) / `mislabel_unresolved`(리뷰어가 지목한 id를 저자가 지목 안 했고 응답도 없음)에서 **receipt 미작성** → `/mccp:prp-implement` 진입 불가. `warn` = receipt가 **blocking verdict를 봉인한 채** 작성되고 chain은 통과하되 `isIntentApproved`는 false 유지 → cross-gate dedupe가 닫힌 채라 PR-Codex가 실제로 발화한다(warn이 공짜가 아닌 지점). `off` = 판정 억제가 아니라 **경로 미진입** — 계약 문단을 리뷰어 프롬프트에 붙이지 않고(따라서 focus가 v1.23.4와 byte-identical) claims를 파싱조차 하지 않아 M1과 end-to-end 등가다. 오타·미설정 → default + loud stderr warn. **default가 `enforce`인 것은 실측 결과다** — Task 0이 production 경로로 10회 측정해 finding 50건 전부 유효 주장, 리뷰 단위 `full` 도달률 **100%**를 얻었고(2026-08-13), 사전 선언된 규칙 ≥95%가 이 값을 정했다. 근거·한계·재현법은 `docs/codex-intent-context/reviewer-contract-compliance.md`. 측정 표본은 **단일 fixture 10회 반복**이라 실제 plan에서 계약 준수가 떨어지면 liveness 비용이 `enforce`에서 곧바로 나타난다 — 그때의 복구는 이 토글을 `warn`으로 두고 실제 plan으로 재측정하는 것이지 임계를 사후에 낮추는 것이 아니다. `warn`에서는 **UI10이 달성되지 않는다**. `MCCP_SKIP_INTENT_GATE`와의 관계는 순서가 정한다: mode가 먼저 판정하고 여전히 blocking일 때만 override가 적용되므로, warn이 통과시킨 경우 `intent_gate_force_override`는 `false`로 봉인된다(적용되지 않은 override를 참으로 기록하지 않는다).

# Silent-hook UX (v0.2.7 — Observability Surface)
MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0                 # v0.2.7 advanced opt-out. MCCP_RECEIPT_DEBUG=1일 때 L2a ALLOW-path systemMessage emit을 끄고 기존 block-payload inline 모드만 유지. Default(unset 또는 =1)는 L2a active. 자세한 precedence는 docs/ENVIRONMENT.md §1.

# Auto-chain (v0.2.2)
MCCP_AUTO_CHAIN_DISABLE=1                # kill switch ─ live
MCCP_AUTO_CHAIN_SKIP_PR=1                # commit-only chain (직접 push cycles 용) ─ LLM-observed (mechanical 미구현; auto-chain.js는 honor하지 않음, W-VERDICT C2 axis M)

# work context isolation (v1.20.2 M1 — implement 스텝 격리 위임)
MCCP_WORK_ISOLATE_IMPLEMENT=0|1          # v1.20.2 default: 1 (격리 on). /mccp:work Step 3의 implement를 격리된 단일 worker Agent로 위임 — worker가 파일 탐색·edit·validate·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고 메인(controller)은 요약(변경 파일·receipt path·verdict)만 회수해 메인 피크 컨텍스트를 얇게 유지. dispatch-controller substrate(prepareDispatch/envelope schema/3-flag attribution)를 single-worker로 재사용. worker는 implement까지만 — commit/PR은 controller Step 4/5 전용(Codex F1: worker env·prompt로 auto-chain 금지 + Step 3.gate가 mccp-pr-codex receipt 유입 시 invariant HALT). 동기 단일 worker는 skipHeartbeat(Codex F2: stale-reclaim 대상 제외, orphan 없음). receipt는 3 attribution 플래그로 controller session에 anchor(repo-relative ipc path — Codex F3). =0이면 인라인 Skill(mccp:prp-implement) fallback(loud stderr, implement diff/validate가 메인에 누적 — baseline). 미지정/오타 시 격리(보수적 default = 상위 축). prepare-single 실패 시 자동 인라인 fallback. standalone /mccp:prp-implement엔 미적용(격리 locus는 work.md 오케스트레이터 한정). v1.20.7 M2a부터 이 축이 =1일 때 하위 축 MCCP_WORK_IMPLEMENT_WORKFLOW가 Task-격리 vs Workflow-격리를 결정.
MCCP_WORK_IMPLEMENT_WORKFLOW=0|1         # v1.20.7 M2a default: 0 (Task-격리 유지). MCCP_WORK_ISOLATE_IMPLEMENT!=0(격리 활성)일 때의 하위 축 — implement 위임 채널을 Task에서 Workflow primitive의 agent()로 등가 이전(병렬화 전, M2b seam). =1 AND prepare-single 성공(dispatch-workflow-args.json 존재) AND Workflow tool이 세션에서 가용이면 /mccp:work Step 3.W(Workflow agent() → {result, dispatchId} 회수), 그 외(=0/미설정/오타, args 부재, tool 미가용)면 Step 3.I(기존 Task dispatch). 두 격리 경로 모두 Step 3.gate 통합 reconcile(deriveVerdict 3자: 반환값 ∧ envelope ∧ receipt-store)로 수렴 — 기존 envelope-only merge를 대체하며 F1 invariant(mccp-pr-codex leak → invariant-violation HARD HALT) + F2 reconciliation(status·receipt slug 집합·envelope pending 불일치 → reconcile-mismatch) + F3 anchor 검증(marker + 3-플래그 == expectedAnchor 아니면 unanchored)을 회수 채널 불문 적용. Codex F1 lifecycle 경계: Task fallback은 Workflow 호출 개시 전(started 표식 이전)에만 허용 — 개시 후 회수 실패는 두 번째 경쟁 worker 방지를 위해 fail-closed HALT(resumeFromRunId 재개 지시). fail-open: Workflow throw/미가용은 implement를 막지 않고 Task 경로로 강등. dual-review 무손상. standalone /mccp:prp-implement엔 미적용.

# N-worker parallel implement (v1.20.10 M2b — implement 병렬화 스캐폴드)
MCCP_WORK_IMPLEMENT_PARALLEL=on|off|0|1   # v1.22.1 live-activation M1부터 default: on (발화 반전 — 이전 v1.20.10 M2b default 0에서 flip). `off`/`0`이 **단일 opt-out 축**(parseParallelMode default on). MCCP_WORK_IMPLEMENT_WORKFLOW의 하위 축 — Workflow 경로에서 implement를 N-worker parallel로 돌릴지. 미설정(=on) AND partition oracle이 N>1 서로소 partition 산출 AND resolveFleet run=true(merge_strategy·budget·catastrophic-USD 통과)이면 /mccp:work Step 3.WP(parallel(fleet.map(...)) + worktree 격리), 그 외는 Step 3.W(단일). **v1.22.3 M3 — operational tier 통과 요구 폐기**: sticky critical/`hard_ceiling`($100)에서도 발화하며, USD 차단은 catastrophic-USD(default $500)만 담당(`MCCP_ORCHESTRATION_USD_BOMB=1`로 M1 복원). 구조적 gate: MCCP_WORK_MERGE_STRATEGY가 worktree-merge가 아니면 무조건 N=1로 fail-close(아래). **opt-out 계약(Codex F1)**: `off`/`0` → 단일 worker Task(legacy) 경로 정확 복원(MCCP_WORK_IMPLEMENT_WORKFLOW default는 미변경 — 병렬 opt-out이 낯선 Workflow single leg로 새지 않음). dual-review 무손상(per-worker Implement-Codex + N-way mergeVerdicts fail-closed 집계). standalone /mccp:prp-implement엔 미적용.
MCCP_WORK_MERGE_STRATEGY=disable-parallel|worktree-merge  # v1.21.0 M4부터 default: worktree-merge (Task 0 live dogfood이 상관 입증 → flip). 병렬 실행의 **구조적 gate** — resolveFleet이 이 값이 worktree-merge가 아니면 무조건 N=1로 fail-close(same-worktree A2 fallback은 atomic-merge 보호 실장 전까지 여전히 금지). M2b(v1.20.10)는 live 상관 미실측으로 default disable-parallel였으나, M4가 isolation:'worktree' worktree가 `<repo>/.claude/worktrees/wf_<runId>-<N>`에 생성·컨트롤러 enumerable·잔존하고 worker-seeded envelope로 collect-worktrees가 correlate함을 live 입증(run wf_1f689994-fb8/wf_98047bb7-1b1) → default를 worktree-merge로 승격. 병렬 실제 발화 조건은 v1.22.1 M1(PARALLEL default on — opt-out 축) + v1.22.3 M3(operational USD 비차단)을 거쳐 현재 **opt-out 안 함 + worktree-merge + N>1 partition + catastrophic-USD 미도달**이다 — cost-state green 요구는 폐기. `MCCP_WORK_MERGE_STRATEGY=disable-parallel` 명시 시 M2a 단일 동작으로 back-compat 강등. 미지정/기타 값 → worktree-merge(default).
MCCP_WORK_PARALLEL_MAX=4                  # v1.20.10 M2b default: 4. partition oracle의 maxWorkers cap + resolveFleet의 N 상한. partition 수가 이를 초과하면 작은 partition을 병합해 cap으로 맞춘다. 비정상 값 → default.
MCCP_WORK_PARALLEL_BUDGET=150000         # v1.20.10 M2b default: 150000. worker당 최소 예상 토큰. resolveFleet이 minRemaining=이 값×N으로 환산 → Workflow가 budget.total 설정 시(사용자 +Nk) budget.remaining()<minRemaining이면 spawn 없이 skip. budget.total+budgetRemaining을 caller가 공급하면 resolveFleet이 감당 가능 N으로 cap(2 미만이면 budget-insufficient→N=1). 비정상 값 → default + loud warn.
MCCP_WORK_PARALLEL_AUTODISABLE_TIER=""     # v1.22.3 M3부터 default: **empty**(resolveFanout 미러 — 어떤 operational tier도 fleet을 막지 않음). 명시 지정 시(comma-separated subset of {green,notice,warning,critical}) 해당 tier를 다시 차단하며, 명시 override는 default·usdBomb 무관 **항상 우선**. `MCCP_ORCHESTRATION_USD_BOMB=1`이면 default가 M1의 critical-only로 복원. cost-state missing/corrupt는 default costFailOpen이면 green 가정 run; `=0`이면 옛 cost-state-unknown fail-closed skip. parse 실패/unknown token → default + warn.

# aggregate adversarial-verify (v1.20.12 M3 — /mccp:work Step 3.verify, see §1.4)
MCCP_WORK_MERGED_VERIFY=off|warn|enforce  # v1.20.12 M3 default: enforce (fail-closed). 위 3 병렬 축과 **직교(⊥)**. /mccp:work의 implement가 끝난 뒤(어떤 경로든 — 단일 Step 3.W/I·병렬 Step 3.WP·인라인 Step 3.F) **commit(Step 4) 전** Step 3.verify가 통합 diff를 worker 밖에서 1회 cross-model(Codex `codex-invoke.js adversarial-review`) 판정한다(PRD Open Question 1(c) pipeline-스테이지 답). `verify.js#decideMergedVerify`: `converged`→pass(Step 4 진행) · `divergent`/`critical`→HALT · `unavailable`×{enforce→HALT, warn→advisory pass} · `off` 또는 변경 없음→skipped. **DD6 — 단일 경로에서도 발화**하므로 병렬이 `disable-parallel`로 gated여도 M3 verify-네이티브화가 runtime 가치를 갖는다. **DD2 — invoker는 여전히 Codex(cross-model)**, same-model skeptic 치환 아님(dual-review 무손상). `MCCP_CODEX_DISABLED=1`이면 classification=disabled→verdict=skipped(pass). pass 시 신규 gate `mccp-implement-verify` receipt에 `meta.merged_verify_verdict`/`meta.merged_verify_rounds` stamp(audit anchor, non-invasive — 어떤 command chain에도 미진입). HALT은 runtime 1차 enforcement(receipt 무관 차단); 병렬 경로 HALT은 patch reverse-apply(F4)로 parent 복원, 단일/인라인은 uncommitted 변경 보존. 미지정/오타 → enforce(loud fail-closed). 복구: working tree에서 cross-cut 회귀 수정 후 재실행 **또는** `MCCP_WORK_MERGED_VERIFY=warn` advisory pass. /mccp:prp-implement standalone엔 미적용(verify locus는 work.md 오케스트레이터 한정).

# plan fan-out (v1.20.4 M1 — GROUND 다관점 read-only 병렬 조사)
MCCP_PLAN_FANOUT=on|off                    # v1.22.1 live-activation M1부터 default: on (발화 반전 — 이전 v1.20.4 default off에서 flip). `off`/`0`으로 opt-out. 미설정(=on) + PRD artifact mode(`.prd.md` 입력) + catastrophic-USD 미도달 시에(**v1.22.3 M3** — operational tier autoDisable·hard_ceiling 조건은 폐기: sticky critical에서도 발화) /mccp:plan Phase 2.5가 4개 read-only 관점(architect/security/test/explorer)을 Workflow primitive로 병렬 fan-out → pure synthesize → plan body `## Multi-Perspective Fan-out` 주입. **cost fail-open**(live-activation M1): cost-state 부재 시 green 가정 run(COST_FAILOPEN) — MCCP_ORCHESTRATION_COST_FAIL_OPEN=0으로 옛 fail-closed skip 복원. read-only agent(도구 부재)라 파일 변형·receipt write 구조적 불가 → Codex dual-review·receipt chain 무손상(fan-out 결과는 plan_hash에 포함돼 review됨). skip/Workflow throw/미가용 → 인라인 Pattern Grounding fallback(fail-open, plan 절대 안 막음). free-form(비-PRD) 입력엔 미적용.
MCCP_PLAN_FANOUT_BUDGET=<tokens>           # v1.20.4 default: 150000. 관점당 최소 예상 토큰. resolveFanout이 minRemaining=이 값×fleetSize(4)로 환산 → Workflow가 budget.total 설정 시(사용자 +Nk 지시) budget.remaining() < minRemaining이면 agent() 0회 skip(Codex F2 사전 가드). budget.total 미설정 시 구조적 상한(fleetSize+effort:'low')만 유효. 비정상 값 → default + loud stderr warn.
MCCP_PLAN_FANOUT_AUTODISABLE_TIER=""       # v1.22.3 M3부터 default: **empty**(어떤 operational tier도 fan-out을 막지 않음 — 이전 M1 default `critical`에서, 그 이전 v1.20.4 `notice,warning,critical`에서 순차 narrow). 운영자 철학상 operational 지출은 폭탄이 아니며, 폭주 방지는 catastrophic-USD + 원자 agent-count cap이 담당한다. 이 env에 명시 지정하면(comma-separated subset of {green,notice,warning,critical}) 해당 tier를 **다시 차단** — 명시 override는 default·usdBomb 무관하게 **항상 우선**. `MCCP_ORCHESTRATION_USD_BOMB=1`이면 default가 M1의 critical-only로 복원. cost-state missing/corrupt는 default costFailOpen이면 green 가정 run(COST_FAILOPEN); `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0`이면 옛 cost-state-unknown fail-closed skip. hard_ceiling_reached는 M3부터 usdBomb에서만 별도 skip. parse 실패/unknown token → default + warn.

# diverse-agent review — /mccp:plan 승인 발급자 (v1.23.1 M1, see §1.4)
MCCP_PLAN_REVIEW=codex|multi-agent|hybrid  # v1.23.1 M1 default: **multi-agent**(미설정 시). `/mccp:plan` Phase 5 게이트의 승인을 누가 발급하는지 선택. `codex`=v1.23.0 경로 정확 복원(Phase 5.2z, `review_*` 필드 미생성) · `multi-agent`=L1(mechanical) + L2(4관점 refute 패널) · `hybrid`=L1+L2+L3(Codex). **미상·오타 → `codex` + loud warn**(DD7) — 이 축의 실패 모드는 "검증이 꺼짐"이 아니라 "**승인 발급자 오인**"이라, 안전한 착지가 `parseMergedVerifyMode`처럼 "가장 엄격한 신규 모드"가 아니라 "**이미 검증된 기존 경로**"다(두 파서의 fallback 방향이 반대인 것은 의도적). multi-agent 승인은 cross-gate dedupe를 **구조적으로 만족하지 못하므로**(DD2 — skip 술어가 `source ∈ {codex,hybrid}` 요구) terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다: cross-model은 제거된 게 아니라 반복 지점(plan)에서 ship 지점으로 **이동**했다. receipt에 present-only `resolution.review_verdict`/`review_source`/`review_proof` + `meta.review_l3_invoked`/`review_l3_reason`/`review_wall_clock_ms` stamp(전부 `receipt_hash` 봉인 대상 — carve-out 없음, DD6).
MCCP_PLAN_REVIEW_QUORUM="3of4"             # v1.23.1 M1 default: `3of4`. L2 통과 임계 `<M>of<N>` — M=필요 응답 수(**≥2 강제**: 1은 패널의 어휘를 쓴 단일 심판일 뿐) · N=발화 관점 수(≤4, fleet 상한). 오타·불만족(of<required)·상한 초과 → default + loud warn.
MCCP_PLAN_REVIEW_ROLES_MIN=3               # v1.23.1 M1 default: 3. 통과에 필요한 **고유 역할** 수 K. quorum의 M과 **다른 축**이다 — M은 "몇 개가 응답했나", K는 "서로 다른 렌즈가 몇 개였나". 같은 역할이 중복 응답해 M을 채우는 것을 막는 것이 K의 유일한 목적이므로 별 토글로 유지한다(중복 응답은 M에는 계수되고 K에는 계수되지 않는다). 범위 밖·비정수 → default + warn.
MCCP_PLAN_REVIEW_L3=0|1                    # v1.23.1 M1 default: 0. `hybrid` 모드에서 L3(Codex) 발화 여부의 kill switch. mode와 별 축인 이유는 Codex 사용량 소진 시 mode를 건드리지 않고 L3만 끌 수 있어야 하기 때문. `mode=hybrid ∧ L3 미발화`는 `hybrid`가 **아니므로** verdict `unavailable`(HALT) + source는 정직하게 `multi-agent`이며 `codex_verdict`를 forward하지 않는다 — "요청했다"와 "일어났다"를 구분하지 않으면 dedupe가 없는 cross-model 확증을 인정한다.
MCCP_PLAN_REVIEW_BUDGET=150000             # v1.23.8 M4 default: 150000. L2 패널 리뷰어 1명당 최소 예상 토큰. `cli.js emit-workflow-args`가 **`--granted`로 fleet을 상한한 뒤** `minRemaining = 이 값 × fleet.length`를 payload에 emit하고, `workflows/plan-review.js`가 Workflow `budget.total` 설정 시(사용자 `+Nk` 지시) `budget.remaining() < minRemaining`이면 패널을 발화하지 않는다. M1에서는 payload에 키 자체가 없어 값이 항상 0이었고 그 조건은 **구조적으로 도달 불가**였다(게이트가 실행될 수 없는 소스로 존재). `plan-fanout/budget.js#parseFanoutMinPerAgent` 미러 — 0·음수·비수치·미상 → **default + loud warn**이며 **절대 0으로 가지 않는다**(0은 게이트를 완화하는 게 아니라 꺼버린다). 빈 값은 "미설정"이라 warn 없이 default. `budget.total` 미설정(비계량 턴)이면 어떤 값이든 무발화 — 그것이 M1 이전 동작이고 test로 고정돼 있다.
# **`MCCP_PLAN_REVIEW_L1`은 존재하지 않는다 (의도적)** — L1은 DD3의 gatekeeper이고 LLM-free·저비용이다. 끌 수 있게 만들면 "mechanical 실패를 LLM의 '괜찮아 보임'이 덮을 수 없다"는 불변식이 env 하나로 무력화된다. L1을 우회하려면 `MCCP_PLAN_REVIEW=codex`(승인자 자체를 교체)를 쓴다.

# orchestration live-activation (v1.22.1 M1 — 발화 반전 cost fail-open + cost-state 독립 runaway 안전판)
MCCP_ORCHESTRATION_COST_FAIL_OPEN=0        # v1.22.1 M1 default: on(미설정=fail-open). resolveFanout/resolveFleet의 cost-state **부재** 처리 축. default(미설정 또는 `=0` 아님) → cost-state null/corrupt를 green 가정 run(COST_FAILOPEN reason). `=0` kill switch → 옛 fail-closed COST_STATE_UNKNOWN skip 정확 복원(back-compat). cost-state가 없어도(예: 새 세션, subscription, telemetry 미기록) 자동화가 진행. **주의(v1.22.3 M3)**: 이 축은 cost-state **부재**만 다룬다 — **존재하는** sticky critical/hard_ceiling은 M1에서 여전히 발화를 막았고, 그 축을 연 것이 아래 M3 두 토글이다.
MCCP_ORCHESTRATION_MAX_AGENTS=24           # v1.22.1 M1 default: 24. cost-state와 **독립적인** catastrophic-runaway 절대 상한(orchestration-runaway.js). 세션 키(CLAUDE_SESSION_ID) 누적 worker-launch 카운터(.claude/state/orchestration-runaway.json, cost-state.js lock 패턴 mirror)가 이 값을 초과 예정이면 fleet N을 **남은 headroom**으로 clamp하며, headroom이 0이면 **`granted:0`(`cap-exhausted`)**. 반복/재귀/재시도 누적이 telemetry 부재를 우회 못 하게 하는 최후 안전판. **v1.22.3 M3 follow-up(PR-Codex R1 F1, 5라운드) — floor 1 폐기**: 이전 서술은 "degraded로 1로 clamp(0 아님 — 단일 worker는 항상 진행)"였고 그게 이 값을 cap이 아니라 **병렬도 throttle**로 만들었다. `reserveWorkers`는 grant한 만큼을 **기록**하므로, cap 도달 후 모든 호출이 1개씩 grant+기록해 `launched`가 25, 26, 27… **무한 증가**했다(cap=4 실측: 5,6,7,8,9). 반복/재귀 dispatch — 정확히 이 cap이 존재하는 이유인 그 시나리오 — 가 상한 없이 초과할 수 있었고, operational USD를 은퇴시킨 M3에서 이 카운터가 **유일한** 구조적 backstop이므로 "cap이 막는다"는 헤드라인이 거짓이었다. floor의 명분("파이프라인을 완전히 막지 않는다")은 호출자의 **인라인 fallback**이 이미 제공한다 — cap이 이미 써버린 agent를 나눠주는 것으로 제공하는 게 아니다. `n===0`은 `cap-exhausted`(검증됨, 답은 no)로, `lock-exhausted`(검증 불가)와 구분된다. loud fail-open parse(비정상 값 → default 24 + warn). **v1.22.3 M3 변경 2건**: (1) clamp가 fail-open 경로 전용이 아니라 **전 run 경로**(metered 포함)에 적용된다 — operational USD가 더 이상 metered 경로도 막지 않으므로 agent-count가 양쪽의 primary backstop이다. (2) 발화 caller(work.md/plan.md)는 read-then-bump가 아니라 **원자 `reserveWorkers`**(단일 lock 임계구역 check-and-bump)를 쓴다 — 재진입/동시 dispatch가 같은 pre-bump 값을 관측해 각자 full fleet을 grant하던 TOCTOU 봉인(Codex F2). **lock 고갈 시 `granted:0`(fail-closed)** — PR-Codex R1 F1: 이전엔 1을 주며 "fail-safe"라 불렀으나 lock이 없으면 write도 없어 그 worker는 **기록되지 않고** `reservationId`도 없어 reconcile 대상이 아니다. 고갈이 반복되면 호출당 1개씩 untracked launch가 새어 cap이 원리상 무한 우회된다 — cap이 primary backstop이 된 바로 그 지점에서. 기록할 수 없는 launch를 허가하는 것은 cap 관점에서 fail-open이다. 더 기다리는 건 답이 아니고(`acquireLock`이 이미 재시도 + stale 파괴를 하므로 고갈 = 살아있는 holder가 창 내내 점유), debt 선기록은 lock 부재로 원리상 불가. 두 호출자 모두 **인라인 fallback**(work.md → 인라인 implement / plan.md → 인라인 Pattern Grounding)을 갖고 인라인은 agent를 안 띄워 cap을 미소비하므로 fail-closed가 파이프라인을 막지 않는다 — 불변식 **"모든 agent launch는 기록된다"**가 예외 없이 성립. 두 budget 오라클은 clamp `n===0`을 `run:false`+`lock-exhausted` skip으로 해석하고(`n>=1` 가드에 걸려 무시되면 수정이 무력), `resolveWorkRoute`는 신규 `reserveDenied` 축(prep-parallel이 쓰는 `dispatch-cap-denied.json` 아티팩트 — shell-state 독립)으로 **inline 강제**한다(fleet만 skip하면 task/workflow-single이 여전히 단일 worker를 untracked로 띄워 같은 누수가 축소된 채 잔존). read-only firing-preview는 bump 없는 pure `clampForRunaway`를 계속 쓴다(관측이 headroom을 소비하면 안 됨 — test가 정적 검증). **preview와 발화 경로는 같은 공식을 공유한다**(R1 F1 5라운드): read-only 불변식은 "mutate 금지"이지 "답의 모양 고정"이 아니므로, preview만 floor 1을 유지하면 발화가 거부될 상황에서 "1개 뜬다"고 보고하는 **false green-light**가 된다 — M2 Codex F1이 `effective_fire`로 막으려던 바로 그 실패 유형. 순수성(I/O·bump 없음)이 read-only를 보장하지, 공식이 보장하는 게 아니다. **v1.22.3 M3 follow-up(PR-Codex R1 F2) — 예약은 2단계(pending → committed)**: `reserveWorkers`는 이제 슬롯을 영구 소진하지 않고 `reservationId`를 반환하며 grant를 **pending**(`open[]`)으로 기록한다. 실제 launch 수가 확정되는 지점(work.md **Step 3.route** — 유일한 reconcile 지점 / plan.md **2.5.3**)에서 `reconcile --reservation <id> --actual <n>`으로 **정정 후 commit**한다: `workflow-parallel`→granted · `workflow-single`/`task`→**1**(강등돼도 단일 worker는 실제로 뜨므로 전량 release는 over-permissive) · `inline`/`skipped`→0. 이 정정이 없던 시절엔 prepare-fleet 실패·route fallback·fan-out budget skip 경로가 worker 0개로 끝나면서 headroom만 갉아(**유령 예약**) 이후 실제 작업을 조기에 N=1로 강등시켰다 — cap이 primary backstop이라는 M3 주장 자체의 정확성 결함. `launched`는 committed + pending 합(보수적)이며, **pending만** `MCCP_ORCHESTRATION_RESERVATION_LEASE_MS` 후 만료된다(committed는 영구 — 실 launch는 절대 미카운트 안 됨). **v1.22.3 M3 follow-up(Implement-Codex R1 F1, 7라운드) — 예약을 공통 pre-launch 경계로 이동**: 4·5·6라운드가 전부 `reserveWorkers` **안팎의** 구멍을 닫는 동안, 진짜 결함은 **그 함수가 불리는 범위**였다. 예약은 `resolveFleet`의 주입 `runawayClamp` 안에서만 일어났고 `resolveFleet`은 work.md의 **4중 가드**(`ISOLATE≠0 ∧ PARALLEL≠off ∧ merge-strategy=worktree-merge ∧ partitions) 뒤에서만 실행됐다. 그런데 Step 3.route는 **무조건** 돌며 `task`/`workflow-single`을 반환하고 둘 다 worker를 **실제로 spawn**한다 — 예약 없이. 즉 **cap은 병렬 fleet worker만 세어 왔고**, default 단일 worker 구성(`PARALLEL=off`·merge-strategy 비활성·single-partition plan·budget-insufficient)에서는 `launched`가 **영원히 0**이었다(A/B 실측: cap=4, 9회 호출 → BEFORE 9개 spawn·counter 0 / AFTER 4개 spawn·counter 4). "모든 agent launch는 기록된다"는 불변식은 **한 번도 참인 적이 없었고**, 6라운드 fix-task의 sweep 기준 (c)"예약 미시도 = cap 미소비"는 정확히 거꾸로였다(실제로는 **기록 없이 cap 소비**). cap을 소비할지 정하는 건 예약 시도 여부가 아니라 **route**(agent가 뜨는가)다. 이제 Step 3.route가 fleet 예약이 없고 `route.js#requiresReservation($ROUTE)`가 참이면 `orchestration-runaway.js reserve --n 1`로 **공통 경계에서 예약**하고, `granted:0`이면 `ROUTE=inline`으로 강등(기록 불가능한 launch 금지), 아니면 즉시 `--actual 1` commit 후 launch한다. commit 실패는 HALT(route가 pre-launch 경계라 중단해도 un-spawn할 게 없다). `requiresReservation`은 순수 오라클이고 `route.test.js`가 ROUTES enum **전수**를 검증해(5→6라운드의 "새 enum 값을 만들고 소비처를 안 고침" 실패 형태 방어) 새 route가 분류 없이 추가되면 실패한다.
MCCP_ORCHESTRATION_RESERVATION_LEASE_MS=600000  # v1.22.3 M3 follow-up default: 600000(10분). **pending** 예약의 lease(orchestration-runaway.js). reserve 후 route에 닿지 못한 채(크래시·중단 턴) 방치된 예약을 이 시간 뒤 자동 회수해 세션이 영구 N=1로 자기중독되는 것을 막는다(R1 F3) — `cost-state.js#decayIfStale`의 시간축 자기치유 미러. **만료가 안전한 이유는 구조적**이다: pending 창(reserve→route)은 `work.md`가 route를 "worker를 spawn하기 전" 경계로 명시(M2a Codex F1)하므로 launch가 0이며, 따라서 만료-drop이 실제 worker를 미카운트할 수 없다. commit된 예약은 `open[]`에서 제거돼 만료 대상이 아니다. fan-out은 route 경계가 없어(Workflow 호출 자체가 launch 지점) 호출 후 전 경로를 명시 commit한다. **v1.22.3 M3 follow-up(PR-Codex R1 F2, 5라운드) — debt 마커**: 그 "전 경로 명시 commit" 전제가 한 경로에서 깨져 있었다. plan.md의 fan-out은 reconcile이 3회 재시도 후 실패하면 `"cap may under-count"`를 경고하고 **진행**했고(fan-out은 plan을 막으면 안 되므로 halt 불가), 예약은 pending으로 남아 lease가 **실제로 뜬 agent를 prune**했다. 당시 주석은 잔여 오차를 "conservative over-count until the lease resolves it"이라 적었으나, lease는 오차를 해소하는 게 아니라 안전한 over-count를 **위험한 under-count로 뒤집는다** — cap이 절대 틀리면 안 되는 over-permissive 방향. 이제 reconcile CLI가 `actual > 0`인데 commit 못 하면 **lock-free debt 마커**(`orchestration-runaway.json.debt/<id>.json`)를 남겨 `readCounter`·`reconcileReservation`이 그 항목을 만료 대상에서 제외한다(마커가 lock-free여야 하는 이유: debt를 만드는 유일한 상황이 정확히 lock 획득 실패이므로 마커에 또 lock을 요구하면 순환). 마커는 **기존 pending 항목을 고정**할 뿐 카운트를 더하지 않아 이중 계산이 없고, 뒤늦은 reconcile이 commit하며 마커를 청소한다. `work.md`는 route가 launch **전** 경계라 그냥 HALT하면 되므로(exit 1) debt가 불필요 — 두 경로의 비대칭은 의도된 것이다. `0`은 kill switch가 **아니다** — 만료 비활성은 자기중독 복원이므로 비정상 값으로 취급해 default + loud warn. read-side(`readCounter`)는 만료된 pending을 **뷰에서만** 제외하고 write는 하지 않는다(preview의 read-only 불변식 보존 — test가 디스크 불변 검증). **v1.22.3 M3 follow-up(Implement-Codex R1 F2, 7라운드) — pin은 launch *전*에**: 5라운드는 debt 마커를 reconcile **실패 시**(사후) 기록했는데, 그건 reconcile 블록에 **도달했을 때만** 작동한다. fan-out은 Workflow 호출 자체가 launch 지점이라, 호출 후 컨트롤러가 timeout/crash하면 그 블록에 영영 못 닿고 pending이 lease에 prune된다 — 실 launch 소실. 중간 초안의 "started 마커" 안은 오답이었다: `readCounter`는 **debt 마커만** 존중하므로, 사후 핸들러만 읽는 마커는 정확히 그 핸들러를 놓쳤을 때 무의미하다. 이제 plan.md 2.5.2는 **Workflow 호출 직전에 진짜 debt 마커를 pin**하고(`orchestration-runaway.js mark-debt`), pin 실패 시 **Workflow를 호출하지 않는다**(기록 불가능한 launch 금지 → 인라인 Pattern Grounding, fan-out은 GROUND 보강이라 plan 미차단). 정상 경로의 2.5.3 reconcile이 commit하며 `clearDebt`로 청소한다. **PR-Codex R1(5라운드 PR 게이트) — pin은 영구, 시간축 decay 기각**: 7라운드는 pin의 영구 고정이 자기중독을 재도입한다며 `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS` 시간축 decay를 얹었으나, PR-Codex가 반려했다 — 마커가 컨트롤러 death 후에도 존재한다는 것 자체가 그 agent들이 실제로 떴다는 증거이므로, aging-out은 `readCounter`가 실 launch를 차감하게 만드는 **under-count**(cap이 절대 틀리면 안 되는 over-permissive 방향)다. 따라서 `readDebtIds`의 decay를 제거하고 pin을 **영구**로 되돌렸다(`parseDebtDecayHours`·`ENV_DEBT_DECAY_HOURS` 삭제). 영구 pin이 남기는 자기중독은 bounded다: counter가 session-keyed라 다음 세션에 리셋되고, dead-controller 사건당 ≤fleetSize(≤4)/`MAX_AGENTS`만 소진 — bounded·self-resetting liveness 비용이 cap을 절대 우회하지 않는 것의 정당한 대가다(회귀 test: aged 마커도 실 launch 카운트 유지 + 다른 session은 fresh).
# orchestration operational-USD firing-block 은퇴 (v1.22.3 M3 — 발화 실패 지점 보완)
MCCP_ORCHESTRATION_CATASTROPHIC_USD=500    # v1.22.3 M3 default: 500(USD). **대체 bomb detector**(Codex F1). M3이 operational USD tier($50 notice/$80 warning/$100 critical + hard_ceiling)를 발화 blocker에서 은퇴시키면서, 그와 **분리된 훨씬 높은** 임계를 신설했다 — `cost_usd >= 이 값`이면 resolveFleet/resolveFanout이 `skip(CATASTROPHIC_USD)` + auto-chain이 `cost-catastrophic` abort. 실측 sticky $186.92는 통과하고 진짜 폭주 비용은 차단한다. `MCCP_ORCHESTRATION_USD_BOMB`과 **무관하게 항상 유효**(운영자가 catastrophic까지 끄려면 아주 큰 값 지정). loud fail-open parse(비정상/음수/0 → default 500 + warn).
MCCP_ORCHESTRATION_USD_BOMB=0|1            # v1.22.3 M3 default: off. **back-compat kill switch**(Codex F4) — M1 operational-USD bomb-detector를 전 표면에서 정확 복원한다: resolveFleet/resolveFanout의 `hard_ceiling_reached` skip(`HARD_CEILING`) + critical tier autoDisable(`TIER_CRITICAL`) + auto-chain의 `cost-hard-ceiling` abort. 표준 vocabulary `1|true|yes|on`(대소문자 무시)이 on, `0|false|no|off|미설정`이 off. **unknown non-empty → off + loud stderr warn** — 이건 rollback path라 오타로 bomb이 조용히 비활성되면 안 된다(정직 warn 필수). catastrophic-USD 축과 독립.

# cost-model-subscription (v1.20.16 M1 — MCCP_SUBSCRIPTION opt-in)
MCCP_SUBSCRIPTION=0|1|on                   # v1.20.16 default: off. =1|on(대소문자 무시)이면 5개 자동화 소비처(resolveFanout·resolveFleet·shouldSkipBriefing·auto-chain shouldAbort·breakpoint-detector detect)가 USD cost-state/tier 게이트를 우회하고 폭주 방지를 context overflow 축(context_remaining_pct + tool_count, ecc-metrics-bridge가 매 PostToolUse 채움)으로 대체. **전면 fail-open**(신호 부재/stale → 진행 — 구독권 목적이 unblock, 폭주 방지는 positive critical 신호에서만 발화, Codex F1 사용자 수용). 미설정 시 5개 소비처 판정 byte-identical(종량제 회귀 0). 단 context-current.json writer(ecc-context-monitor L238)는 subscription 무관하게 항상 best-effort stamp(Codex F3 — 판정 무변, 1회 telemetry write side-effect, 실패는 hook 진행 무영향). 각 소비처 구조 게이트(fanout: mode/prd-mode / fleet: opt-in/merge-strategy/single-partition/budget / briefing: env-off/codex-disabled/pr-phase-lock)와 auto-chain 다른 abort trigger(kill-switch·receipt·previous-step·STATE.md chain_aborted)는 불변. 신호 신뢰도 + calibrated 2차 임계는 M2 harness-cost 축 이연(codex-findings-backlog.md).
MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT=35     # v1.20.16 default: 35. context 잔여% warning 임계(remaining ≤ 값 → warning). ecc-context-monitor calibrated 잔여% 재사용. invariant 0<critical<warn≤100 위반 시 default + loud warn.
MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT=25 # v1.20.16 default: 25. context 잔여% critical 임계(remaining ≤ 값 → critical → 소비처 skip/abort/handoff). overflow의 primary enforced 축.
MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN=0             # v1.20.16 default: 0(disabled). tool_count warning 임계(count ≥ 값 → warning). 0=비활성(근거 없는 임계 날조 회피 — opt-in). critical>0 설정 시 0≤warn<critical invariant.
MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL=0         # v1.20.16 default: 0(disabled). tool_count critical 임계(count ≥ 값 → critical). 0=비활성(보조 축). 설정 시 context 축과 most-severe 합성. invariant 위반 → 축 disable + warn.
MCCP_COST_STATE_DECAY_HOURS=6                       # v1.22.0 M3 default: 6(시간). cost-current.json의 mtime이 이 시간보다 오래되면 `cost-state.js#readState()`(decayed reader)가 green view(`cost_usd:0`·tier green·`hard_ceiling_reached:false`)를 반환 → tier 소비처(fleet/fanout/briefing/breakpoint)가 한 번 튄 sticky critical에 영구 잠기지 않음. **명시적 raw/decayed 분리**(Codex F1): `readStateRaw()`(raw, 관측/write-side)·`readState()`(decayed, tier 게이트)·`readStateOrThrow()`(raw, auto-chain 전용 — 불변). `writeStateMerged`는 명시적 write-side decay로 stale floor를 리셋해 첫 fresh write가 monotonic MAX 계승을 끊음(sticky 자기치유). Axis 2: `ecc-context-monitor` STATE.md producer가 subscription-aware SET(구독권은 USD 아니라 context overflow에서만 `chain_aborted`)·`abort_owner='cost'`+`cost_abort_at` provenance stamp·decay-clear(4중 stable AND)·legacy sweep(marker 없는 cost-origin flag). `=0`이면 decay/sweep 완전 비활성(kill switch) → M2 판정 byte-identical. 음수/비유한 → default + loud warn. **auto-chain divergence는 의도적**: auto-chain은 raw `readStateOrThrow`+`isStale(1h)` fail-safe stale-abort 유지(decay 창 6h ≫ 1h라 활성 세션 무발화, 세션 경계 무활동에서만 발화·첫 write 후 자기치유).

# v1.23.1 multi-session-work-loop M3 — 증거 write guard (see §3.6 세 번째 lock)
MCCP_EVIDENCE_CONFLICT_GUARD=enforce|warn|off  # v1.23.1 default: enforce (fail-closed). 모든 receipt write(store.writeReceipt/updateReceipt · briefing/completion-ledger 메타 stamp)와 claim mutation을 감싸는 evidence write lock의 동작 축. enforce = lock 미획득·claim fence 거부·덮어쓰기 관측이 전부 throw(단 hash-carved 메타 stamper 2건은 fail-open + loud skip — 의도적 비대칭) / warn = 관측과 이벤트 기록은 그대로 두되 **차단하지 않음**(정체된 receipt 복구용 kill switch, race window 개방) / off = guard 전체 비활성(lock·fence·덮어쓰기 검출 모두 없음, loud stderr warn). 미지정·오타 → enforce. 이 토글이 M3이 추가하는 **유일한** 신규 축이다(B3 토글 증가 억제) — lease(5s)·claim TTL(15분)·retry 예산은 상수이고 test 주입만 허용한다. 복구 절차: `EVIDENCE_LOCK_UNAVAILABLE` 에러가 lock 절대경로 + 잔여 lease + 재시도 지침을 포함하므로, 정지한 holder는 lease 만료 후 자동 reclaim되고 재실행이 1차 복구다.

# v1.23.10 multi-session-work-loop M5 — 상태 진실원 저널 (see §3.2 · docs/multi-session-work-loop/state-truth-source-design.md)
MCCP_STATE_JOURNAL=enforce|shadow|off  # v1.23.10 default: enforce. STATE.md를 append-only 저널의 **파생 투영물**로 두는 축. enforce = `state-writer.update()`가 레코드 append → 재투영 → 기존 `renderState` 경로로 STATE.md를 쓴다(렌더 바이트·공개 시그니처 불변) / shadow = 저널 append는 **계속하되** STATE.md 쓰기만 M5 이전 직접 경로로 되돌린다(회귀 진단 데이터를 남기는 것이 이 값의 목적 — 회귀 test가 "shadow 산출 == M5 이전 산출 byte-identical" ∧ "저널 레코드 수 == enforce" 두 축을 단언한다) / off = 저널 비활성 + loud warn. 미지정·오타 → enforce + loud warn. **운영 계약**: ① 발동은 **수동 전용**(자동 강등 경로 없음 — 그쪽은 `.degraded` 마커의 일이고 append 실패라는 관측 사실에 매인다) ② 지속은 **프로세스 수명**(env를 지우면 다음 프로세스는 enforce로 복귀, 상태 파일에 기록하지 않으므로 sticky하지 않다) ③ 우선순위는 **마커 > 토글**(`.degraded`가 있으면 enforce여도 직접 경로이며, 토글은 마커를 지우지 못한다 — 지우는 것은 `journal checkpoint --reseed` 하나뿐) ④ `shadow`가 되돌리는 것은 STATE.md **쓰기 경로만**이다. 이 토글이 M5가 추가하는 **유일한** 신규 축이다(UI11 — 보존 기간·용량 상한·세그먼트 회전 임계는 전부 상수이고 test 주입만 허용). 진단: `node plugins/mccp/scripts/state/cli.js journal verify --json`(content_hash 전수 · 투영↔디스크 일치 · degraded 마커 · malformed 라인 · ledger seed 무결성 5축, 하나라도 실패 시 비영점 exit).

# Auto-handoff (v0.3.0 S10b — live, v1.1.0 honest quarantine)
MCCP_AUTO_HANDOFF=off|notify             # default: notify. cost-tier 검출 + STATE.md write + stderr 배너. 실제 세션 spawn은 아래 experimental flag에 종속됨. (spawn은 v1.1.0+ deprecated alias — flag 없으면 notify로 강등됨, ledger에 experimental_spawn_requested=true 기록.)
MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1   # v1.1.0+ opt-in. PATH에 claude binary 필요. 미설정 + MCCP_AUTO_HANDOFF=spawn 요청 시 notify로 강등 + fallback_reason='spawn-experimental-flag-missing'. IDE-launched sessions에서 spawn은 거의 항상 실패하므로 default 미설정 권장.
MCCP_HANDOFF_THRESHOLDS_USD="50,80,100"  # default. comma-separated notice,warning,critical USD thresholds. parse 실패 또는 invariant 위반 시 default + stderr warn.

# v1.2.0-m1 Orchestrator (dispatch-controller)
MCCP_ORCHESTRATOR_POLL_MS=500            # default. dispatch-watcher polling 간격. 낮추면 envelope detection 빠름, CPU 증가. ─ live (M1)
MCCP_DISPATCH_CONTEXT=0|1                # default: 0. =1 시 mccp-receipt write가 controller-context marker 자동 stamp + 3 attribution flags(--dispatched-by-controller-session/--worker-dispatch-id/--ipc-envelope-path) 모두 require. 누락 시 fail-closed exit 12 (F2 absorption). marker detect는 env=1 OR 3 flag 중 하나라도 공급 OR ipc-envelope 파일 존재 중 하나 — detect되면 3 flag 전부 require(부분 공급은 write 시점 fail-closed, receipt/write.js#detectDispatchContext). 따라서 worker가 prompt 지시대로 3 flag를 forward하면 env=0에서도 anchor가 보장되고, 완전 미forward는 reconcile F3(work v1.20.7)가 unanchored로 별도 HALT한다. env=1은 완전 미forward를 write 시점에 즉시 잡는 추가 강제 옵션 — work.md/dispatch-cli.js는 이 env를 자동 set하지 않는다(LLM 매개 Task/Workflow dispatch는 Bash export를 worker 프로세스에 전달하지 못하므로, 세션-레벨 settings.json으로만 활성). ─ live (M1)

# v1.3.0-m2 LLM Briefing stamp (cost-tier × env policy × PR-phase guard)
MCCP_BRIEFING=on|off|auto                # default: auto. =off → receipt write가 LLM briefing 호출을 전혀 안 함(disabled enum 아닌 'env-off' canonical reason). =on → cost-tier 무시하고 항상 호출(debug only — production은 권장 안 함). =auto → cost-tier ∈ autoDisableTiers 시 자동 disable + 그 외 호출. ─ live (M1)
MCCP_BRIEFING_AUTODISABLE_TIER="notice,warning,critical"  # default. MCCP_BRIEFING=auto 모드에서 어떤 cost-tier가 briefing을 자동 disable할지 지정. comma-separated subset of {green,notice,warning,critical}. parse 실패 시 default. =critical만 설정 시 $50 notice tier에서도 호출(predictable monthly cost는 cost-state $50 ceiling가 이미 보장).

# v1.3.0-m4 Refresh trigger (debounce + render lock — ops debug only)
MCCP_RENDER_TRIGGER_DEBOUNCE_MS=5000     # default. Content debounce window in ms for `triggerRender`. 짧추면 burst trigger가 render thrash 위험, 길게 두면 STATUS.md가 늦게 따라옴. ─ live (M4)
MCCP_RENDER_LOCK_LEASE_MS=90000          # default. `.claude/cache/.render.lock` 의 lease 길이. host-aware tri-state reclaim(§3.6) — same-host live PID는 lease 만료해도 NEVER reclaim. 단일 render는 ~200-500ms이므로 90s는 generous safety margin. ─ live (M4)
```
