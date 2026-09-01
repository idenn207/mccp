# 비용 · 구독 · briefing

> `docs/ENVIRONMENT.md`의 **cost** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

비용 모델(USD 대 구독), 핸드오프 임계, briefing stamp, 컨텍스트 모니터를 지배한다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### MCCP_COST_STATE_DECAY_HOURS

**종류** `int` — **값** 자유 문자열 — **기본값** `6`

**한 줄** cost 마커 decay 시간.

**소비처** `plugins/mccp/scripts/lib/cost-state.js:42`

**사용 예시**

```json
{
  "env": {
    "MCCP_COST_STATE_DECAY_HOURS": "6"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_COST_STATE_DECAY_HOURS=6                       # v1.22.0 M3 default: 6(시간). cost-current.json의 mtime이 이 시간보다 오래되면 `cost-state.js#readState()`(decayed reader)가 green view(`cost_usd:0`·tier green·`hard_ceiling_reached:false`)를 반환 → tier 소비처(fleet/fanout/briefing/breakpoint)가 한 번 튄 sticky critical에 영구 잠기지 않음. **명시적 raw/decayed 분리**(Codex F1): `readStateRaw()`(raw, 관측/write-side)·`readState()`(decayed, tier 게이트)·`readStateOrThrow()`(raw, auto-chain 전용 — 불변). `writeStateMerged`는 명시적 write-side decay로 stale floor를 리셋해 첫 fresh write가 monotonic MAX 계승을 끊음(sticky 자기치유). Axis 2: `ecc-context-monitor` STATE.md producer가 subscription-aware SET(구독권은 USD 아니라 context overflow에서만 `chain_aborted`)·`abort_owner='cost'`+`cost_abort_at` provenance stamp·decay-clear(4중 stable AND)·legacy sweep(marker 없는 cost-origin flag). `=0`이면 decay/sweep 완전 비활성(kill switch) → M2 판정 byte-identical. 음수/비유한 → default + loud warn. **auto-chain divergence는 의도적**: auto-chain은 raw `readStateOrThrow`+`isStale(1h)` fail-safe stale-abort 유지(decay 창 6h ≫ 1h라 활성 세션 무발화, 세션 경계 무활동에서만 발화·첫 write 후 자기치유).
```

### MCCP_HANDOFF_THRESHOLDS_USD

**종류** `list` — **값** 자유 문자열 — **기본값** `50,80,100`

**한 줄** 핸드오프 임계 USD 3단계.

**소비처** `plugins/mccp/scripts/lib/cost-thresholds.js:23`

**멤버 어휘**

**허용 토큰** — 열거 없음. 멤버가 USD 임계 숫자 3단계라 열거 어휘가 존재하지 않는다.

**미상 멤버** — 멤버가 어휘가 아니라 오름차순 USD 정수 3개다 — 개수가 3이 아니거나, 비유한/비양수거나, notice<warning<critical을 어기면 목록 전체를 버리고 기본값 50,80,100으로 되돌리며 stderr에 사유를 남긴다 (cost-thresholds.js:31 parseEnvOverride)

**사용 예시**

```json
{
  "env": {
    "MCCP_HANDOFF_THRESHOLDS_USD": "50,80,100"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_HANDOFF_THRESHOLDS_USD="50,80,100"  # default. comma-separated notice,warning,critical USD thresholds. parse 실패 또는 invariant 위반 시 default + stderr warn.
```

### MCCP_SUBSCRIPTION

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** 구독 비용 모델.

**소비처** `plugins/mccp/scripts/lib/subscription.js:18`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_SUBSCRIPTION": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  # cost-model-subscription (v1.20.16 M1 — MCCP_SUBSCRIPTION opt-in)
  MCCP_SUBSCRIPTION=0|1|on                   # v1.20.16 default: off. =1|on(대소문자 무시)이면 5개 자동화 소비처(resolveFanout·resolveFleet·shouldSkipBriefing·auto-chain shouldAbort·breakpoint-detector detect)가 USD cost-state/tier 게이트를 우회하고 폭주 방지를 context overflow 축(context_remaining_pct + tool_count, ecc-metrics-bridge가 매 PostToolUse 채움)으로 대체. **전면 fail-open**(신호 부재/stale → 진행 — 구독권 목적이 unblock, 폭주 방지는 positive critical 신호에서만 발화, Codex F1 사용자 수용). 미설정 시 5개 소비처 판정 byte-identical(종량제 회귀 0). 단 context-current.json writer(ecc-context-monitor L238)는 subscription 무관하게 항상 best-effort stamp(Codex F3 — 판정 무변, 1회 telemetry write side-effect, 실패는 hook 진행 무영향). 각 소비처 구조 게이트(fanout: mode/prd-mode / fleet: opt-in/merge-strategy/single-partition/budget / briefing: env-off/codex-disabled/pr-phase-lock)와 auto-chain 다른 abort trigger(kill-switch·receipt·previous-step·STATE.md chain_aborted)는 불변. 신호 신뢰도 + calibrated 2차 임계는 M2 harness-cost 축 이연(codex-findings-backlog.md).
```

### MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT

**종류** `int` — **값** 자유 문자열 — **기본값** `35`

**한 줄** 컨텍스트 경고 임계.

**소비처** `plugins/mccp/scripts/lib/subscription.js:19`

**사용 예시**

```json
{
  "env": {
    "MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT": "35"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT=35     # v1.20.16 default: 35. context 잔여% warning 임계(remaining ≤ 값 → warning). ecc-context-monitor calibrated 잔여% 재사용. invariant 0<critical<warn≤100 위반 시 default + loud warn.
```

### MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT

**종류** `int` — **값** 자유 문자열 — **기본값** `25`

**한 줄** 컨텍스트 critical 임계.

**소비처** `plugins/mccp/scripts/lib/subscription.js:20`

**사용 예시**

```json
{
  "env": {
    "MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT": "25"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT=25 # v1.20.16 default: 25. context 잔여% critical 임계(remaining ≤ 값 → critical → 소비처 skip/abort/handoff). overflow의 primary enforced 축.
```

### MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN

**종류** `int` — **값** 자유 문자열 — **기본값** `0`

**한 줄** 도구 호출 경고 임계.

**소비처** `plugins/mccp/scripts/lib/subscription.js:21`

**사용 예시**

```json
{
  "env": {
    "MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN": "0"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN=0             # v1.20.16 default: 0(disabled). tool_count warning 임계(count ≥ 값 → warning). 0=비활성(근거 없는 임계 날조 회피 — opt-in). critical>0 설정 시 0≤warn<critical invariant.
```

### MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL

**종류** `int` — **값** 자유 문자열 — **기본값** `0`

**한 줄** 도구 호출 critical 임계.

**소비처** `plugins/mccp/scripts/lib/subscription.js:22`

**사용 예시**

```json
{
  "env": {
    "MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL": "0"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL=0         # v1.20.16 default: 0(disabled). tool_count critical 임계(count ≥ 값 → critical). 0=비활성(보조 축). 설정 시 context 축과 most-severe 합성. invariant 위반 → 축 disable + warn.
```

### MCCP_BRIEFING

**종류** `enum` — **값** `auto` · `off` — **기본값** `auto`

**한 줄** briefing stamp 정책.

**소비처** `plugins/mccp/scripts/lib/briefing/cost-guard.js:82`

**값별 결과**

- `auto` — 비용 tier와 PR-phase lock을 보고 briefing 실행 여부를 스스로 정한다.
- `off` — briefing stamp를 실행하지 않는다 (ENV_OFF).

**제거된 값** — `always`는 파서에 존재한 적이 없다. 넣어도 `auto`로 동작했고 이제는 그 사실이 stderr warn으로 보인다. 항상 실행하는 모드가 필요하다는 판단은 게이트 의미를 바꾸는 별개 변경이다. 값은 **대소문자를 구분한다** — `OFF`는 열거 밖이라 `auto`로 되돌아간다.

**사용 예시**

```json
{
  "env": {
    "MCCP_BRIEFING": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_BRIEFING=on|off|auto                # default: auto. =off → receipt write가 LLM briefing 호출을 전혀 안 함(disabled enum 아닌 'env-off' canonical reason). =on → cost-tier 무시하고 항상 호출(debug only — production은 권장 안 함). =auto → cost-tier ∈ autoDisableTiers 시 자동 disable + 그 외 호출. ─ live (M1)
```

### MCCP_BRIEFING_AUTODISABLE_TIER

**종류** `list` — **값** 자유 문자열 — **기본값** `notice,warning,critical`

**한 줄** briefing 자동 해제 tier.

**소비처** `plugins/mccp/scripts/lib/briefing/cost-guard.js:102`

**멤버 어휘**

**허용 토큰** — `plugins/mccp/scripts/lib/briefing/cost-guard.js#allowed`에서 파생된다. 오늘의 토큰은 `green` · `notice` · `warning` · `critical`이다.

**미상 멤버** — 토큰 하나라도 열거 밖이면 override 전체가 무효가 된다 (briefing/cost-guard.js:108 parseTierOverride)

**사용 예시**

```json
{
  "env": {
    "MCCP_BRIEFING_AUTODISABLE_TIER": "notice,warning,critical"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_BRIEFING_AUTODISABLE_TIER="notice,warning,critical"  # default. MCCP_BRIEFING=auto 모드에서 어떤 cost-tier가 briefing을 자동 disable할지 지정. comma-separated subset of {green,notice,warning,critical}. parse 실패 시 default. =critical만 설정 시 $50 notice tier에서도 호출(predictable monthly cost는 cost-state $50 ceiling가 이미 보장).
```

### MCCP_CONTEXT_MONITOR_COST_MODE

**종류** `enum` — **값** `directive` · `notify` — **기본값** `directive`

**한 줄** 비용 모니터 모드.

**소비처** `plugins/mccp/scripts/hooks/ecc-context-monitor.js:79`

**값별 결과**

- `directive` — 비용 메시지에 «멈추라»는 지시형 꼬리를 붙인다.
- `notify` — 금액만 보고하고 지시형 꼬리를 뗀다. 별칭 `notification`·`info`·`informational`도 같은 결과로 정규화된다.

**제거된 값** — 문서가 가르치던 `off`·`observe`·`enforce`는 **셋 다 파서에 존재한 적이 없고** 어느 값을 넣어도 directive로 동작했다. 이 저장소의 `.claude/settings.json`도 실제로 `off`를 쓰고 있었다. 비용 경고를 끄려던 것이라면 오늘 쓸 것은 별도 축인 `MCCP_CONTEXT_MONITOR_COST_WARNINGS`(bool, 기본 on)다.

**사용 예시**

```json
{
  "env": {
    "MCCP_CONTEXT_MONITOR_COST_MODE": "notify"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_CONTEXT_MONITOR_COST_MODE` | `notify` \| `notification` \| `info` \| `informational` \| (그 외) | (directive) | cost 메시지의 톤 제어. `notify` 류면 imperative tail("halt/wind down" 같은) 제거 → 비용만 보고. 다른 값/unset이면 default directive 동작. |
```

### MCCP_CONTEXT_MONITOR_COST_WARNINGS

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** 비용 경고 출력.

**소비처** `plugins/mccp/scripts/hooks/ecc-context-monitor.js:52`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_CONTEXT_MONITOR_COST_WARNINGS": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_CONTEXT_MONITOR_COST_WARNINGS` | truthy/falsy | `true` | `ecc-context-monitor`의 cost warning 출력 활성화. 비활성화하면 $50/$80/$100 알림 자체가 안 뜸. [ecc-context-monitor.js:44](../plugins/mccp/scripts/hooks/ecc-context-monitor.js). |
```

