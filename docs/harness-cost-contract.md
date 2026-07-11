# Harness-cost cache contract (`harness-cost-<sid>.json`)

> cost-model-subscription M2 — Axis A. 이 문서는 PRD Open Question 3
> ("harness 실비에 어떻게 접근하는가")의 canonical 답변입니다.

## 왜 존재하는가

Claude Code 런타임은 **정확한 per-process 세션 비용**(`cost.total_cost_usd`)을
statusLine 에게만 stdin 으로 넘겨줍니다. Stop 훅(cost-tracker)이나 PostToolUse
훅(ecc-context-monitor)은 이 값을 직접 받지 못하므로, 예전에는 transcript 를
직접 합산한 **추정치**에 의존했습니다. 추정치는 두 가지 이유로 실비보다 부풀려
집니다:

- 하드코딩된 rate table 은 Opus 의 >200K-token 2x tier 나 1h-cache 2x tier 를
  표현하지 못합니다(장기 세션에서 과대·과소 계상).
- transcript 전체 합산은 `--resume` 경계를 넘어 수행된 작업을 **중복 계산**합니다
  (`cost.total_cost_usd` 는 per-process 라 이 문제가 없음).

M2 Axis A 는 번들 statusline(`ecc-statusline.js`)이 매 렌더마다 이 권위값을
per-session 캐시 파일로 흘려보내는 **writer 를 배선**합니다. 소비 측
(cost-tracker · ecc-context-monitor)은 이미 이 캐시를 우선 신뢰하도록 되어
있었습니다 — M2 는 비어 있던 생산 측을 채웁니다.

## 스키마

```
파일: <os.tmpdir()>/harness-cost-<sessionId>.json
```

```json
{ "ts": 1751000000, "cost_usd": 45.12 }
```

| 필드 | 타입 | 의미 |
|---|---|---|
| `ts` | Number | cost 샘플 시각 — **epoch SECONDS** (밀리초 아님) |
| `cost_usd` | Number | 누적 세션 비용 USD, `≥ 0` |

`sessionId` 는 `session-bridge.js#sanitizeSessionId` 로 정제된 값(경로 traversal
차단, `[a-zA-Z0-9_-]` 만, ≤ 64자)이어야 합니다.

## 읽기 계약 (단일 validator)

`plugins/mccp/scripts/lib/harness-cost.js` 의 `readHarnessCostRecord(sessionId,
maxAgeSeconds)` 가 **모든 검증의 단일 SoT** 입니다. 다음 중 하나라도 걸리면
`null` 을 반환합니다:

- 파일 부재 / JSON parse 실패
- `ts` 또는 `cost_usd` 가 유한하지 않음
- `cost_usd < 0`
- age(`floor(now_s) - ts`)가 `[0, maxAgeSeconds]` 밖 — **stale(초과) 또는
  future(음수) 모두 reject**

공개 함수는 이 validator 위의 얇은 adapter 입니다:

- `readHarnessCost(sessionId, maxAge) → number | null` (cost-tracker 하위호환)
- `readHarnessCostMeta(sessionId, maxAge) → { cost_usd, ts } | null`
  (freshness guard 용 `ts` 노출)

기본 age 상한은 소비 측이 각자 넘깁니다(현재 두 소비처 모두 `300`초).

## 쓰기 계약

`writeHarnessCost(sessionId, costUsd) → { ok }` 는 pid+nonce tmp → atomic rename
(writeWarnState / writeBridgeAtomic mirror). **best-effort — 절대 throw 하지
않습니다.** `sessionId` falsy 또는 `costUsd` 가 비유한/음수면 no-op(`{ ok: false }`).

## 커스텀 statusline (opt-in · 비강제)

번들 statusline 을 쓰지 않는 사용자(예: [ccstatusline](https://github.com/sirmalloc/ccstatusline))
는 캐시 writer 를 **강제받지 않습니다**(PRD Out-of-scope). writer 가 없으면
소비 측은 조용히 transcript-sum fallback 으로 되돌아갑니다 — **회귀 0**.

정확한 표시 추정을 원하는 커스텀 statusline 사용자는 렌더 시 다음 3줄을
추가하면 됩니다(Node 기준):

```js
// statusline 스크립트 안에서, stdin JSON(`data`)을 파싱한 직후:
const c = data.cost && data.cost.total_cost_usd;
if (typeof c === 'number' && Number.isFinite(c) && c >= 0 && data.session_id) {
  require('/path/to/plugins/mccp/scripts/lib/harness-cost')
    .writeHarnessCost(String(data.session_id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64), c);
}
```

또는 별도 프로세스로 chaining:

```bash
your-statusline | tee >(node -e '<위 로직으로 harness-cost 캐시 write>')
```

## 역할 경계 (정직성)

- **Axis A(본 writer)** 는 *표시 추정* + *cost-state 정확화* 를 개선하며,
  writer-active 설치(번들 statusline · opt-in wired)에만 적용됩니다. Success
  Metric "추정치 ↔ 실비 괴리 < 20%" 는 **writer-active scope 로 정직하게
  한정**됩니다.
- 커스텀 statusline 사용자의 실제 고통(게이트가 부풀린 cost-state 로 오발화)은
  writer 와 **완전히 독립인 Axis B** 가 해결합니다 —
  `MCCP_HANDOFF_THRESHOLDS_USD` env override 를 tier · `hard_ceiling` ·
  STATE.md abort 채널(`session_end_imminent` / `chain_aborted`) 전부에
  도달시켜 writer 없이도 즉시 unblock.
- 이미 튄 sticky 값(cost-state monotonic-MAX · 이미 set 된 STATE.md abort flag)의
  **reset/decay 는 M2 scope 밖** — M3(time-based decay) 몫입니다. M2 는 신규
  추정이 올바른 임계·실비를 쓰도록 만듭니다.
