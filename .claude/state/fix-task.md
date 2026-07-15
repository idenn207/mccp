# Fix Task — PR-Codex R1 (v1.22.3 M3 absorption, 4th round)

- **Source**: `/mccp:pr` PR-Codex gate, R1, decision `live-activation-m3-pr-codex-absorption`
- **Verdict**: `needs-attention` → receipt `resolution.codex_verdict='divergent'`, `meta.codex_review_actionable_findings=true`
- **Codex summary**: "No ship: the new primary runaway backstop still has untracked and mis-reconciled launch paths."
- **Receipt**: `.claude/receipts/mccp-pr-codex/live-activation-m3-pr-codex-absorption.json` (head `f7c34e4`)
- **Decision**: 3건 **전부 ACCEPT_NOW** (backlog 이연 없음). 흡수 후 `/mccp:pr` 재실행.
- **Verified**: 3건 모두 실제 코드로 재현함 — Codex 주장 액면 수용 아님.

## 왜 전부 흡수인가 (F1 이연 기각 근거)

세 건 모두 **M3이 primary backstop으로 승격시킨 그 메커니즘 안**에 있다. M3의 헤드라인은
"operational USD를 은퇴시켜도 원자 agent-count cap이 막는다"이다. 그 cap에 구멍이 있으면
헤드라인이 거짓이다. F1을 이연하고 ship하는 것은 *중심 정당화가 거짓임을 알면서* 내보내는
것이고, 지난 세 라운드가 반복해 잡아낸 실패 양식(주장이 현실을 앞지름)을 이번엔 알고서
저지르는 셈이다. lock 고갈 발화율이 낮다는 사실은 F1을 **덜 급하게** 만들 뿐 주장을 참으로
만들지 않는다.

---

## F1 — Lock exhaustion grants untracked workers

- **Severity**: HIGH (Codex confidence 0.90)
- **Locus**: `plugins/mccp/scripts/lib/orchestration-runaway.js:405-416` (`reserveWorkers`)

### 현상 (재현됨)

```js
const lock = acquireLock(p);
if (!lock) {
  warn('counter lock exhausted; granting 1 worker (fail-safe degrade ...)');
  return { granted: 1, degraded: true, reason: REASONS.LOCK_EXHAUSTED,
           maxAgents: maxAgents, launched: null, reservationId: null };
}
```

`granted:1`을 주면서 **카운터 write가 없다**. `reservationId:null`이라 나중에 reconcile할
것도 없다. `readCounter`는 이 worker를 영영 보지 못한다. lock 고갈이 반복되면 호출마다
1개씩 **기록되지 않은** worker가 뜨고, `MCCP_ORCHESTRATION_MAX_AGENTS`는 원리상 무한히
우회된다 — agent-count cap이 primary backstop이 된 바로 그 지점에서.

주석은 이를 "fail-SAFE, not fail-open"이라 주장하지만, **기록할 수 없는 launch 권한을
부여하는 것은 cap 관점에서 fail-open이다**.

### 선택지 검토 (Codex 제안 3개 중)

- **(a) stale-reclaim까지 재시도** — **이미 구현돼 있음**. `acquireLock`은 `LOCK_RETRY_MAX`회
  재시도 + `STALE_LOCK_MS` 초과 시 stale lock을 깬다. 따라서 exhaustion은 "살아있는
  holder가 재시도 창 내내 점유"를 의미하며, 더 기다리는 것은 답이 아니다.
- **(c) debt 선기록** — lock이 없어서 원리상 쓸 수 없다. 불가능.
- **(b) fail-closed, no launch** — **채택**.

### 수정 — granted 0 + 인라인 fallback

현 주석의 전제 "One worker is still granted (never 0) — the pipeline is degraded, never
blocked"는 **거짓이다**. 두 호출자 모두 인라인 fallback이 있고, 인라인은 agent를 띄우지
않으므로 cap을 소비하지 않는다:

| 호출자 | granted 0일 때 경로 |
|---|---|
| `work.md:230` (`runawayClamp` → `resolveFleet`) | `MCCP_WORK_ISOLATE_IMPLEMENT=0` 인라인 implement (Step 3.F) |
| `plan.md:200` (`runawayClamp` → `resolveFanout`) | 인라인 Pattern Grounding fallback (fail-open, plan 미차단) |

즉 fail-closed가 파이프라인을 막지 않는다. cap의 불변식이 **"모든 agent launch는 기록된다"**로
예외 없이 성립한다.

- `reserveWorkers` lock-exhausted → `{ granted: 0, degraded: true, reason: LOCK_EXHAUSTED,
  reservationId: null, launched: null }`.
- `implement-dispatch/budget.js#resolveFleet` + `plan-fanout/budget.js#resolveFanout`:
  주입된 `runawayClamp`가 `n === 0`을 반환하면 `run:false` + reason `LOCK_EXHAUSTED`로
  skip (fleet 0 구성 금지).
- `work.md` / `plan.md`: `granted === 0`이면 예약 아티팩트를 쓰지 않고(예약 자체가 없음)
  인라인 경로로 강등 + loud stderr.
- 주석의 "fail-SAFE" 서술을 정정 — cap이 primary가 된 이상 이 표현은 부정확했다.

---

## F2 — Fan-out actual launch count is not mechanically derived

- **Severity**: MEDIUM (Codex confidence 0.84) — **도달 가능성은 3건 중 가장 높음**
- **Locus**: `plugins/mccp/commands/plan.md:285-298`

### 현상 (재현됨)

```bash
--actual "${FANOUT_ACTUAL_N:-$RES_GRANTED}"
```

바로 위 표는 `skipped:true` → **0**, Workflow 미가용/미호출 → **0**이라 규정한다. 그런데
그 값을 전달하는 수단이 **LLM이 설정하는 셸 변수**이고, 미설정 시 default가 `$RES_GRANTED`다.
표가 0이라 규정한 경로들이 정확히 LLM이 그 추론 단계에 도달하지 않을 경로다.

commit된 항목은 `open[]`에서 제거돼 **lease 만료 대상이 아니다**. 따라서 이건 pending
유령보다 나쁜 **영구 유령**이다 — 이 follow-up이 없앴다고 주장한 바로 그 문제를 재생산한다.

### 수정 — 모르면 commit하지 않는다 (pending 유지)

default를 0으로 뒤집는 것은 **오답**이다. 두 오류 방향은 비대칭이 아니라 서로 반대다:

- default → granted: 영구 over-count → headroom 잠식 (availability 실패, 현재 버그)
- default → 0: under-count → cap이 over-permissive (**safety 실패** — cap이 절대 틀리면
  안 되는 방향, 코드 주석 551-556행이 스스로 명시)

정답은 **default를 두지 않는 것**이다. `FANOUT_ACTUAL_N`이 unset/empty면 **reconcile을
호출하지 않고 pending으로 남긴다**. pending은 정확히 "모름"의 표현이고 자기치유한다 —
lease까지는 counted로 남아 safety를 지키고(보수적), 실제로 안 떴으면 lease가 만료시켜
headroom을 돌려준다. 2단계 설계가 pending 상태를 가진 이유가 바로 이것이다.

- `plan.md`: `${FANOUT_ACTUAL_N:-...}` default 제거 → unset이면 reconcile skip + loud warn.
- 가능하면 Workflow 결과를 아티팩트로 남겨 `actualN`을 **기계적으로** 파생 (Codex 권고).
  LLM 변수 의존 자체가 F2의 근인이다.
- `work.md:358-360`은 **무결함** — `ACTUAL_N`을 `$ROUTE`에 대한 `case`로 기계 파생한다.
  F2는 plan.md 전용.

---

## F3 — Malformed reconcile actual count releases reservations as zero

- **Severity**: HIGH (Codex confidence 0.82) — 현재 호출자로는 미도달, 수정은 가장 저렴
- **Locus**: `plugins/mccp/scripts/lib/orchestration-runaway.js:574-582` (`runCli`)

### 현상 (재현됨)

```js
const actualN = Number(args.actual);               // --actual 누락 → Number(undefined) = NaN
const out = reconcileReservation({ ..., actualN });// :476 non-finite → 0으로 강제
...
if (!out.reconciled && Number.isFinite(actualN) && actualN > 0) { return 11; }
return 0;                                          // reconciled=true → exit 0
```

`--actual` 누락 → `NaN` → `reconcileReservation`이 0으로 강제 → 예약 전체를 delta로 차감하고
`open[]`에서 제거(commit) → 슬롯 반납 → **exit 0(성공)**. 실제 worker가 떴다면 cap이
under-count한다. `--actual` 뒤에 다른 플래그가 오면 `args.actual = true` → `Number(true) = 1`로
현실과 무관하게 1이 된다.

같은 파일 551-556행 주석이 "actualN > 0에서 미commit은 cap이 실 launch를 under-count하는,
이 cap이 절대 틀리면 안 되는 방향"이라 못박았는데, **malformed 입력에선 그 가드가 발화하지
않는다** (exit 검사가 `Number.isFinite(actualN)`을 요구하므로 NaN은 통과).

### 수정 — 검증 후 호출

- `runCli`: `--actual`을 **필수 non-negative integer**로 검증. 위반 시
  `reconcileReservation`을 **호출하지 않고** 하드 nonzero exit(usage 2) — 예약은 손대지 않음.
- `args.actual === true`(값 없는 플래그)도 invalid로 판정.
- 회귀 test: `--actual` 누락 / `--actual --session x` / `--actual abc` / `--actual -1` →
  예약 불변 + nonzero exit.

---

## 부수 발견 (이번 PR 무관, pre-existing — backlog 후보)

`finalize-receipt.js:269`의 `timeoutMs: 60000`이 만료돼 `spawnSync ETIMEDOUT` + exit 127을
냈으나 **receipt write는 이미 성공**했다 (`validate ok:true`, schema 유효). 명령 본문은
`FINALIZE_EXIT != 0`이면 GATE-STOP이라 정상 receipt에도 게이트가 멈춘다 — write 성공 /
caller 실패 보고라는 정직성 갭. `git diff origin/main..HEAD`에 이 줄이 없으므로 본 PR이
만든 것이 아니다. 별도 cycle.

---

## Acceptance

- [x] F1: lock-exhausted → `granted:0`; 두 budget 오라클이 `run:false`(`lock-exhausted`)로 skip;
      두 command body가 인라인 강등; "fail-SAFE" 주석 정정
- [x] F2: `plan.md` default 제거 → unset이면 reconcile skip(pending 유지) + loud warn
- [x] F3: `runCli` `--actual` 검증 후 호출; invalid → 예약 불변 + nonzero exit
- [x] 회귀 test 3축 (runaway 51 + fleet/fanout/route/reconcile 포함 1133개 중 pre-existing 1건 외 green)
- [ ] `/mccp:pr` 재실행 → PR-Codex R1 재판정

### 구현 중 확장된 범위 (fix-task 원안보다 넓음 — 근거)

- **F1은 `route.js`까지 가야 성립**. 원안은 "두 budget 오라클 skip + 인라인 강등"이었으나,
  `resolveFleet`이 `run:false`를 줘도 work.md는 `FLEET_N=1`로 내려가 route가 `task`/
  `workflow-single`을 고른다 — **단일 worker 1개를 여전히 untracked로 띄운다**. 누수가
  1/4로 줄 뿐 불변식은 그대로 깨진다. 그래서 route에 `reserveDenied` 축을 신설해 inline을
  강제했다. 신호 전달은 shell var가 아니라 `dispatch-cap-denied.json` 아티팩트 —
  Step 3.route는 별도 Bash invocation이라 shell var면 게이트가 조용히 no-op 된다(§3.9 교훈).
  단, 이 축은 reserve를 **실제로 시도한** 경우에만 켜진다: env-off/single-partition/
  merge-strategy skip은 clamp 이전에 반환하므로 기존 단일 worker 경로는 무영향.
- **budget 오라클의 `c.n >= 1` 가드가 F1을 무력화할 뻔했다**. `granted:0`은 그 가드에 걸려
  **무시**되고 N이 full fleet로 남는다 — `n===0`을 `>=1` 분기보다 **먼저** 처리해야 수정이
  실효를 갖는다. 두 오라클 모두 회귀 test로 고정.
- **F2의 "기계적 파생"(Codex 권고)을 실제로 구현**. LLM 변수 의존 자체가 근인이므로
  신규 `plan-fanout/reconcile.js#deriveFanoutActualN`로 매핑을 코드에 옮기고, LLM 역할을
  "Workflow 결과를 아티팩트에 받아적기"로 축소했다. 아티팩트 부재 → `null` → reconcile
  미호출(pending 유지) — default를 두지 않는다는 원안 결정 그대로.
