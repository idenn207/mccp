# 외부 도구가 소유하는 이름

> `docs/ENVIRONMENT.md`의 **external** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

mccp가 정의하지 않지만 mccp 경로가 읽는 이름이다. 값의 의미는 그 도구가 소유하므로 여기서는 mccp가 그것을 어떻게 쓰는지만 적는다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### CLAUDE_PLUGIN_ROOT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 주입된 플러그인 루트.

**소비처** `plugins/mccp/scripts/hooks/bootstrap.js:68`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "CLAUDE_PLUGIN_ROOT": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
CLAUDE_PLUGIN_ROOT=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_PLUGIN_ROOT` | absolute path | `CLAUDE_PLUGIN_ROOT` fallback | hook script가 plugin 루트를 resolve할 때 사용. `plugin-hook-bootstrap.js`가 자식에게 inject. |
```

### CLAUDE_SESSION_ID

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 주입된 세션 id.

**소비처** `plugins/mccp/scripts/hooks/cost-tracker.js:130`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "CLAUDE_SESSION_ID": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
CLAUDE_SESSION_ID=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SESSION_ID` | string | unset | `CLAUDE_SESSION_ID`보다 우선시되는 명시적 session ID override. cost tracker / governance / metrics bridge에서 correlation 키로 사용. |
```

### CLAUDE_PID

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** Claude Code PID.

**소비처** `plugins/mccp/scripts/lib/session-processes.js:946`

**상태** `internal` — 런타임이 주입하는 이름이다. 보통 직접 설정하지 않지만 test에서 고정할 수 있다.

**사용 예시**

```json
{
  "env": {
    "CLAUDE_PID": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
CLAUDE_PID=<사유를 한 문장으로> /mccp:pr
```

### CLAUDE_RULES_DIR

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** ECC rule 디렉토리.

**소비처** `plugins/mccp/scripts/hooks/bootstrap.js:68`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "CLAUDE_RULES_DIR": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
CLAUDE_RULES_DIR=<사유를 한 문장으로> /mccp:pr
```

### CLAUDE_PACKAGE_MANAGER

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** installer 패키지 매니저.

**소비처** `plugins/mccp/scripts/hooks/bootstrap.js:68`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "CLAUDE_PACKAGE_MANAGER": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
CLAUDE_PACKAGE_MANAGER=<사유를 한 문장으로> /mccp:pr
```

### GITHUB_TOKEN

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** gh 인증 토큰.

**소비처** `plugins/mccp/scripts/lib/github-discussions.js:38`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "GITHUB_TOKEN": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
GITHUB_TOKEN=<사유를 한 문장으로> /mccp:pr
```

### ECC_DISABLED_MCPS

**종류** `list` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** ECC 비활성 MCP 목록.

**소비처** `plugins/mccp/scripts/hooks/mcp-health-check.js:55`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "ECC_DISABLED_MCPS": "a,b"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `ECC_DISABLED_MCPS` | comma-separated MCP names | unset | **out-of-scope of axis-P** (install tree). mccp installer가 install 단계에서 skip할 MCP 리스트. [install/apply.js:120](../plugins/mccp/scripts/lib/install/apply.js). `MCCP_*` rename은 별도 install cleanup axis. |
```

### CLV2_HOMUNCULUS_DIR

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** CLv2 instinct 디렉토리.

**소비처** `plugins/mccp/scripts/hooks/observe-runner.js:73`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "CLV2_HOMUNCULUS_DIR": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
CLV2_HOMUNCULUS_DIR=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `CLV2_HOMUNCULUS_DIR` | absolute path | `$XDG_DATA_HOME/clv2/homunculus` 또는 `~/.local/share/clv2/homunculus` | continuous-learning v2 observer가 사용하는 homunculus(작업기억) 디렉토리. `observer-sessions.js`가 read. |
```

> **아래 IMPECCABLE_\* 항목의 파일명과 행 번호는 impeccable 3.5.0 본문을 기준으로
> 측정됐다.** v1.31.3부터 이 저장소는 impeccable 본문을 벤더하지 않으므로 그 경로로
> 가는 링크가 없다. 값을 확인하려면 자신이 설치한 채널의 본문을 보라 — 어느 본문이
> 열리는지는 `node plugins/mccp/scripts/lib/impeccable-detect.js resolve`가 경로째로
> 알려준다. 설치 위치는 사용자·버전마다 다르므로 여기에 절대경로를 적지 않는다.

### IMPECCABLE_FORCE_OVERRIDE_REASON

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** impeccable 게이트 override.

**소비처** `plugins/mccp/commands/prp-implement.md:224`

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_FORCE_OVERRIDE_REASON": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_FORCE_OVERRIDE_REASON=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_DESIGN_INTENT_REASON="<reason>"      # v1.3.0-m2 audited intent override (axis c). detector positive(axis a) + 좁은 whitelist(axis b)가 모두 miss하지만 작성자가 "본 변경은 design routing"이라고 명시할 때만. strict reason validator (M1 IMPECCABLE_FORCE_OVERRIDE_REASON 룰 mirror — empty/1-token/URL-only/<30자/<3단어 reject). 활성 시 SKILL Read first-step + critique loop 강제 + receipt에 meta.design_intent_reason stamp.
```

### IMPECCABLE_VERSION

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** impeccable 버전 문자열.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_VERSION": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_VERSION=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  `IMPECCABLE_VERSION`만 예외적으로 mccp의 [/mccp:setup plan](../.claude/plans/mccp-setup-command.plan.md) `dep-check.js`가 환경 hint로 honor합니다.
  | `IMPECCABLE_VERSION` | semver/string | unset | impeccable CLI 버전 hint. 본래 impeccable 자체는 이 변수를 read하지 않지만, mccp의 `/mccp:setup` dep-check가 CLI 미설치 환경에서 fallback hint로 honor. |
```

### IMPECCABLE_NO_UPDATE_CHECK

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** 업데이트 확인 끔.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_NO_UPDATE_CHECK": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_NO_UPDATE_CHECK` | `1` 등 truthy | unset | update polling 전체를 비활성화. 오프라인/샌드박스/CI에서 noise 제거용. `context.mjs:189`. |
```

### IMPECCABLE_UPDATE_HOST

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 업데이트 확인 호스트.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_UPDATE_HOST": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_UPDATE_HOST=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_UPDATE_HOST` | URL | `https://impeccable.style` | skill 버전 확인 host. 본문은 매 24시간마다 lightweight HEAD로 새 skill 버전을 polling. trailing `/`는 자동 strip. |
```

### IMPECCABLE_UPDATE_CACHE

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 업데이트 캐시 경로.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_UPDATE_CACHE": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_UPDATE_CACHE=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_UPDATE_CACHE` | absolute path | `~/.impeccable/update-check.json` | update polling 결과 캐시 파일 경로. 1.2초 fetch timeout이 실패해도 stdout 차단 안 함. |
```

### IMPECCABLE_CONTEXT_DIR

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 컨텍스트 해석 디렉토리.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_CONTEXT_DIR": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_CONTEXT_DIR=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_CONTEXT_DIR` | absolute or cwd-relative path | unset | `PRODUCT.md` / `DESIGN.md` 검색 폴백 디렉토리. 검색 순서: ① cwd ② `.agents/context/`·`docs/` ③ 이 변수 ④ cwd 빈 default. "power-user escape hatch"라 주석. `context.mjs:51`. |
```

> 위 원문 보존 블록은 원 숫자(U+2460 계열)를 v1.29.0 문서 그대로 둔다 — Validation 3의 고아 대조가 정규화 없이 일치를 요구한다. 그 글자는 터미널에서 빈 칸으로 보이므로 검색 순서를 평문으로 적는다: (1) cwd (2) `.agents/context/`·`docs/` (3) 이 변수 (4) cwd 빈 default.

### IMPECCABLE_CRITIQUE_META

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** critique 메타 경로.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_CRITIQUE_META": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_CRITIQUE_META=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_CRITIQUE_META` | JSON 문자열 | unset | critique snapshot의 frontmatter에 들어갈 메타데이터. 키 예: `{"target":"<text>","total_score":<n>,"p0_count":<n>,"p1_count":<n>}`. 내부 계산 `timestamp`·`slug`는 caller 값을 덮어쓰므로 파일명과 frontmatter가 어긋날 일 없음. parse 실패 시 silent ignore. `critique-storage.mjs:200`. |
```

### IMPECCABLE_LIVE_CONFIG

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** live mode 설정 경로.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_CONFIG": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_LIVE_CONFIG=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_CONFIG` | absolute or cwd-relative path | unset | live mode 설정 파일 경로 override. 미설정 시 ① `<cwd>/.impeccable/live/config.json` ② legacy `<scriptsDir>/config.json` 순으로 fallback. `impeccable-paths.mjs:43`. |
```

> 위 원문 보존 블록은 원 숫자(U+2460 계열)를 v1.29.0 문서 그대로 둔다 — Validation 3의 고아 대조가 정규화 없이 일치를 요구한다. 그 글자는 터미널에서 빈 칸으로 보이므로 순서를 평문으로 적는다: (1) `<cwd>/.impeccable/live/config.json` (2) legacy `<scriptsDir>/config.json`.

### IMPECCABLE_LIVE_DEBUG_EVENTS

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** live 이벤트 디버그.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_DEBUG_EVENTS": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_DEBUG_EVENTS` | `1`/`true`/`yes` | unset | live 이벤트 디버그 로그를 stderr에 출력. manual-edit 트러블슈팅용. |
```

### IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** apply soft deadline.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS` | int (ms) | `120000` | live apply event soft deadline. hard timeout 이전에 graceful wind-down 신호. |
```

### IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** apply hard timeout.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS` | int (ms) | `150000` | live apply event hard timeout. 이 시간 안에 끝나지 않으면 강제 종료. |
```

### IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 수동 편집 복구 횟수.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS` | int | `DEFAULT_REPAIR_ATTEMPTS` (소스 상수) | manual-edit 흐름에서 copy-edit agent 실패 시 재시도 횟수. `live-commit-manual-edits.mjs:172`. |
```

### IMPECCABLE_LIVE_COPY_AGENT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** copy-edit agent 이름.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_LIVE_COPY_AGENT=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT` | `auto` \| `codex` \| `claude` \| `chat` \| `mock` \| `off` (`0`/`false`/`none`) | `auto` | copy-edit agent 선택 모드. `auto`=codex→claude→chat 순 fallback, `mock`=테스트용 가짜 결과, `off`=agent 사용 안 함. `live-copy-edit-agent.mjs:435`. |
```

### IMPECCABLE_LIVE_COPY_AGENT_MODEL

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** copy-edit agent 모델.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT_MODEL": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_LIVE_COPY_AGENT_MODEL=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT_MODEL` | model name | unset | codex/claude 모델 명시 override. set 시 `--model <name>` 인자로 전달. |
```

### IMPECCABLE_LIVE_COPY_AGENT_EFFORT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** copy-edit agent effort.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT_EFFORT": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_LIVE_COPY_AGENT_EFFORT=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT_EFFORT` | codex effort level (`low` \| `medium` \| `high`) | `low` | codex 모델의 `model_reasoning_effort` 설정. 본 변수는 codex provider 경로에서만 적용. |
```

### IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** copy-edit agent 상한.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS` | int (ms) | `120000` | copy-edit agent subprocess 타임아웃. live-server와 live-commit-manual-edits 양쪽에서 read. |
```

### IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** agent 결과 mock.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:256`

**상태** `test-only` — test 전용이다. 운영 환경에서 설정하지 않는다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT` | JSON 문자열 | unset | `mock` 모드 결과 강제 — `parseCopyEditBatchResult`로 parse, 실패 시 throw. set 안 하면 default mock result(`status:'done'`, applied 모든 entry id) 사용. |
```

### IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** agent write mock.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:256`

**상태** `test-only` — test 전용이다. 운영 환경에서 설정하지 않는다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES` | JSON `{ "rel/path": "content" }` | unset | `mock` 모드에서 cwd 안에 가짜 파일 write 시뮬레이션. cwd 밖 path는 skip. parse 실패 시 throw. |
```

### IMPECCABLE_LIVE_COPY_AGENT_MOCK_DELAY_MS

**종류** `int` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** agent mock 지연.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:256`

**상태** `test-only` — test 전용이다. 운영 환경에서 설정하지 않는다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_LIVE_COPY_AGENT_MOCK_DELAY_MS": "1"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_LIVE_COPY_AGENT_MOCK_DELAY_MS` | int (ms) | `0` | `mock` 모드의 인공 지연 시간. 테스트에서 race condition 시뮬레이션용. |
```

### IMPECCABLE_PALETTE_SEED

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 팔레트 생성 시드.

**소비처** `plugins/mccp/scripts/lib/impeccable-detect.js:135`

**상태** `undocumented-default` — 코드에 리터럴 기본값이 적혀 있지 않다. 미설정 시의 동작은 소비처가 정한다 — 추정해서 적지 않았다.

**사용 예시**

```json
{
  "env": {
    "IMPECCABLE_PALETTE_SEED": "<사유를 한 문장으로>"
  }
}
```

한 호출에만 적용하려면 셸에서 앞에 붙인다:

```bash
IMPECCABLE_PALETTE_SEED=<사유를 한 문장으로> /mccp:pr
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `IMPECCABLE_PALETTE_SEED` | string | unset | palette generation seed. 명시 `--from` 인자보다 우선순위 낮음. set 시 `hashUnit(value)`로 deterministic seed, unset이면 `Math.random()`. `palette.mjs:472`. |
```

