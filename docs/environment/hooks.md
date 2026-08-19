# hook · 세션 · MCP · 설치

> `docs/ENVIRONMENT.md`의 **hooks** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

hook 무게, 세션 수명, governance capture, MCP health, installer 경로를 지배한다. 런타임이 주입하는 이름(`internal`)은 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### MCCP_HOOK_PROFILE

**종류** `enum` — **값** `full` · `lean` · `minimal` — **기본값** 없음 (미설정이 기본)

**한 줄** hook 무게 프로파일.

**소비처** `plugins/mccp/scripts/lib/hook-flags.js:19`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_HOOK_PROFILE": "full"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_HOOK_PROFILE` | `minimal` \| `standard` \| `strict` | `standard` | 일괄 hook 활성도 프로파일. `minimal`은 observe·governance 류 무거운 hook을 skip. continuous-learning observer의 child agent도 `minimal`로 호출. |
```

### MCCP_DISABLED_HOOKS

**종류** `list` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 비활성 hook id 목록.

**소비처** `plugins/mccp/scripts/lib/hook-flags.js:24`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_DISABLED_HOOKS": "a,b"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_DISABLED_HOOKS` | comma-separated hook IDs | unset | 명시적으로 비활성화할 hook ID 리스트. 예: `governance-capture,mcp-health`. |
```

### MCCP_HOOK_ID

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 실행 중 hook id.

**소비처** `plugins/mccp/scripts/hooks/observe-runner.js:73`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "MCCP_HOOK_ID": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_HOOK_ID=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_HOOK_ID` | string | unset | runner가 자식 hook 프로세스에 주입하는 현재 hook ID. observe-runner는 첫 인자 또는 이 변수에서 prefix를 읽어 routing. |
```

### MCCP_HOOK_INPUT_MAX_BYTES

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** hook 입력 바이트 상한.

**소비처** `plugins/mccp/scripts/hooks/config-protection.js:157`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_HOOK_INPUT_MAX_BYTES": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_HOOK_INPUT_MAX_BYTES` | bytes | (hook 별 기본값) | hook stdin 최대 크기 override. |
```

### MCCP_HOOK_INPUT_TRUNCATED

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** 입력 절단 신호.

**소비처** `plugins/mccp/scripts/hooks/config-protection.js:142`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "MCCP_HOOK_INPUT_TRUNCATED": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_HOOK_INPUT_TRUNCATED` | `1`/`true`/`yes` | unset | upstream에서 stdin이 잘렸음을 child hook에 알리는 플래그. 신뢰성 있는 truncation 표시. |
```

### MCCP_PLUGIN_ROOT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 플러그인 루트 경로.

**소비처** `plugins/mccp/scripts/hooks/bootstrap.js:68`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "MCCP_PLUGIN_ROOT": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_PLUGIN_ROOT=<사유를 한 문장으로> /mccp:pr
```

### MCCP_SESSION_ID

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 현재 세션 id.

**소비처** `plugins/mccp/scripts/hooks/cost-tracker.js:130`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SESSION_ID": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_SESSION_ID=<사유를 한 문장으로> /mccp:pr
```

### MCCP_SESSION_START_CONTEXT

**종류** `enum` — **값** `off` · `on` — **기본값** 없음 (미설정이 기본)

**한 줄** STATE.md 주입 여부.

**소비처** `plugins/mccp/scripts/hooks/session-start.js:167`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SESSION_START_CONTEXT": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SESSION_START_CONTEXT` | `off` \| `on` 등 | (on) | SessionStart에서 과거 컨텍스트(MEMORY.md 인덱스 등) inject 여부. `off`로 끌 수 있음. |
```

### MCCP_SESSION_START_MAX_CHARS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 주입 블록 문자 상한.

**소비처** `plugins/mccp/scripts/hooks/session-start.js:172`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SESSION_START_MAX_CHARS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SESSION_START_MAX_CHARS` | int | (built-in cap) | SessionStart에 inject되는 컨텍스트 문자 수 상한. 넘으면 truncation marker가 붙음. |
```

### MCCP_SESSION_RETENTION_DAYS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 세션 산출물 보존 일수.

**소비처** `plugins/mccp/scripts/hooks/session-start.js:160`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SESSION_RETENTION_DAYS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SESSION_RETENTION_DAYS` | int | (built-in) | 오래된 session 기록의 보존일수. `session-start.js`가 cleanup 시 read. |
```

### MCCP_SESSION_RECORDING_DIR

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 세션 기록 디렉토리.

**소비처** `plugins/mccp/scripts/lib/session-adapters/canonical-session.js:264`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SESSION_RECORDING_DIR": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_SESSION_RECORDING_DIR=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SESSION_RECORDING_DIR` | absolute path | (built-in default) | canonical-session 어댑터의 세션 기록 디렉토리. [canonical-session.js:264](../plugins/mccp/scripts/lib/session-adapters/canonical-session.js). |
```

### MCCP_GOVERNANCE_CAPTURE

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** governance hook 활성.

**소비처** `plugins/mccp/scripts/hooks/governance-capture.js:255`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_GOVERNANCE_CAPTURE": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_GOVERNANCE_CAPTURE` | `1` | unset | governance capture hook(`governance-capture.js`)을 활성화. 시크릿/정책 위반/승인 요청 같은 governance event를 캡쳐. |
```

### MCCP_OBSERVE_RUNNER_TIMEOUT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** observe runner 상한.

**소비처** `plugins/mccp/scripts/hooks/observe-runner.js:78`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_OBSERVE_RUNNER_TIMEOUT_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_OBSERVE_RUNNER_TIMEOUT_MS` | ms | (built-in default) | observe-runner의 child hook 강제 타임아웃. |
```

### MCCP_MCP_CONFIG_PATH

**종류** `list` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** MCP 설정 경로 목록.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:55`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_CONFIG_PATH": "a,b"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_MCP_CONFIG_PATH` | absolute path | (Claude 표준 위치) | MCP config 위치 override. health check가 사용. |
```

### MCCP_MCP_HEALTH_FAIL_OPEN

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** MCP 검사 실패 시 진행.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:558`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_HEALTH_FAIL_OPEN": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_MCP_HEALTH_FAIL_OPEN` | truthy | unset | health check 실패 시 fail-open(통과) 모드. unset이면 fail-closed. [mcp-health-check.js:558](../plugins/mccp/scripts/hooks/mcp-health-check.js). |
```

### MCCP_MCP_HEALTH_STATE_PATH

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** MCP 상태 파일 경로.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:48`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_HEALTH_STATE_PATH": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_MCP_HEALTH_STATE_PATH=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_MCP_HEALTH_STATE_PATH` | absolute path | (`~/.claude/...` 안 기본 위치) | `mcp-health-check.js`가 health state를 저장/조회할 경로 override. |
```

### MCCP_MCP_HEALTH_TTL_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** MCP 캐시 TTL.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:203`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_HEALTH_TTL_MS": "1"
  }
}
```

### MCCP_MCP_HEALTH_TIMEOUT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** MCP probe 상한.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:305`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_HEALTH_TIMEOUT_MS": "1"
  }
}
```

### MCCP_MCP_HEALTH_BACKOFF_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** MCP 재시도 backoff.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:216`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_HEALTH_BACKOFF_MS": "1"
  }
}
```

### MCCP_MCP_RECONNECT_COMMAND

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** MCP 재연결 명령.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:518`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_RECONNECT_COMMAND": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_MCP_RECONNECT_COMMAND=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_MCP_RECONNECT_COMMAND` | shell command | (built-in default) | mcp-health-check이 unhealthy MCP를 만났을 때 재연결을 위해 실행할 명령. [mcp-health-check.js:518](../plugins/mccp/scripts/hooks/mcp-health-check.js). |
```

### MCCP_MCP_RECONNECT_TIMEOUT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 재연결 명령 상한.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:539`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MCP_RECONNECT_TIMEOUT_MS": "1"
  }
}
```

### MCCP_GH_SHIM

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** gh CLI 대체 경로.

**소비처** `plugins/mccp/scripts/lib/github-discussions.js:38`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_GH_SHIM": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_GH_SHIM=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_GH_SHIM` | absolute path | unset | GitHub CLI shim 경로. `github-discussions.js`가 `gh` 호출 대신 사용. CI/sandbox에서 유용. |
```

### MCCP_CODE_CLI

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** claude CLI 경로.

**소비처** `plugins/mccp/scripts/lib/find-code-cli.js:70`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_CODE_CLI": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
MCCP_CODE_CLI=<사유를 한 문장으로> /mccp:pr
```

### MCCP_GITIGNORE_LOCK_WAIT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** gitignore lock 대기 상한.

**소비처** `plugins/mccp/scripts/lib/gitignore-provision.js:509`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_GITIGNORE_LOCK_WAIT_MS": "1"
  }
}
```

### MCCP_A3_READ_USER_MEMORY

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** derive의 메모리 읽기 허용.

**소비처** `plugins/mccp/scripts/derive/cli.js:349`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_A3_READ_USER_MEMORY": "on"
  }
}
```

