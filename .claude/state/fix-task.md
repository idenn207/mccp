# Fix Task — PR-Codex R1 (v1.22.3 M3 absorption, 5th round)

- **Source**: `/mccp:pr` PR-Codex gate, R1, decision `live-activation-m3-pr-codex-absorption`
- **Verdict**: `needs-attention` → receipt `resolution.codex_verdict='divergent'`, `codex_actionable_findings=true`
- **Codex summary**: "No-ship: the new primary runaway backstop still permits unbounded post-cap launches and one fan-out failure path can erase real launches from the counter after the lease expires."
- **Receipt**: `.claude/receipts/mccp-pr-codex/live-activation-m3-pr-codex-absorption.json` (head `09838cb`, validate `ok:true`)
- **Decision**: 2건 **전부 ACCEPT_NOW** (backlog 이연 없음). 흡수 후 `/mccp:pr` 재실행(6라운드).
- **Verified**: 2건 모두 실제 코드로 재현함 — Codex 주장 액면 수용 아님. F1은 합성 실측으로 무한 초과 재현.
- **review-only 불변식**: 지켜짐 (`mutations:[]`, `lock_exit_ok:true`). a11y는 `rendering_surface=false`로 skip.

## 왜 또 전부 흡수인가 (4라운드와 동일 규칙)

두 건 다 **M3이 primary backstop으로 승격시킨 그 메커니즘 안의 구멍**이다. 4라운드에서 확립한
규칙이 그대로 적용된다: M3 헤드라인은 "operational USD를 은퇴시켜도 원자 agent-count cap이
막는다"이고, cap에 구멍이 있으면 헤드라인이 거짓이다.

4라운드는 `reserveWorkers`의 **lock 고갈** 구멍을 닫았다(granted 0 fail-closed). 그런데
**cap 도달** 구멍은 열린 채였다 — 같은 함수, 인접한 분기. Codex가 그 인접 구멍을 짚었다.
"lock 고갈은 닫았으니 cap은 지켜진다"고 믿은 것이 이번 라운드의 실패 양식이다.

---

## F1 — Session cap is not actually enforced once reached

- **Severity**: HIGH (Codex confidence 0.90)
- **Locus**: `plugins/mccp/scripts/lib/orchestration-runaway.js:198-210` (`clampForRunaway`) + `:438-446` (`reserveWorkers`)

### 현상 (합성 실측으로 재현)

`clampForRunaway`는 cap 초과 시 **0을 반환하는 분기가 없다** — 항상 floor 1:

```js
if (launchedSoFar + requestedN > maxAgents) {
  return { n: 1, degraded: true, reason: REASONS.RUNAWAY_CLAMP, maxAgents: maxAgents };
}
```

`reserveWorkers`는 그 `decision.n`을 **조건 없이** 누적·기록한다:

```js
const launched = cur.launched + decision.n;
const open = cur.open.concat([{ id: reservationId, n: decision.n, ... }]);
```

`MCCP_ORCHESTRATION_MAX_AGENTS=4` 실측 (requestedN=1 반복):

```
call#1 granted=1 launched=1 reason=ok
call#4 granted=1 launched=4 reason=ok
call#5 granted=1 launched=5 reason=runaway-clamp   ← cap 초과 시작
call#9 granted=1 launched=9 reason=runaway-clamp   ← 무한 증가
```

cap=4인데 `launched`가 5,6,7,8,9…로 **상한 없이** 증가한다. `degraded=true`가 붙을 뿐
매 호출이 1개씩 grant되고 영구 기록된다.

### 왜 M3 헤드라인이 거짓이 되는가

이건 cap이 아니라 **병렬도 throttle**이다. 반복/재귀 dispatch(정확히 cap이 존재하는 이유인
그 시나리오)는 `MAX_AGENTS`를 한 번에 1개씩, 무한히 초과할 수 있다. operational USD를
은퇴시킨 지금 이 카운터가 **유일한 구조적 backstop**이므로, 이 구멍은 M3이 내세운
"원자 cap이 막는다"를 정면으로 거짓으로 만든다.

CLAUDE.md §4의 현재 서술("이 값을 초과 예정이면 fleet N을 degraded로 1로 clamp(0 아님 —
단일 worker는 항상 진행)")은 **설계 의도로 floor 1을 명시**하고 있다. 즉 코드 버그가 아니라
**설계와 헤드라인의 불일치**다. 둘 중 하나를 고쳐야 한다.

### 수정 방향

두 갈래 중 택일 — **(a) 채택 권장**:

- **(a) cap을 진짜 cap으로**: `reserveWorkers`가 lock 안에서 remaining headroom을
  계산해 `remaining === 0`이면 **granted 0**(4라운드 F1의 lock-고갈 처리와 동일한
  fail-closed), 아니면 `min(requestedN, remaining)`. 4라운드에서 확인한 전제가 여기서도
  성립한다: 두 호출자(work.md → 인라인 implement, plan.md → 인라인 Pattern Grounding)가
  **인라인 fallback을 갖고 있고 인라인은 agent를 안 띄워 cap을 미소비**하므로, granted 0이
  파이프라인을 막지 않는다. 불변식 "모든 agent launch는 기록된다"가 "cap을 넘는 launch는
  없다"로 강화된다.
- **(b) 이름·문서 정정**: cap이 아니라 throttle임을 인정하고 `MAX_AGENTS`를
  `MAX_PARALLEL`류로 개명 + M3 헤드라인에서 "절대 상한" 주장 철회. 이 경우 operational USD
  은퇴를 정당화하던 backstop이 사라지므로 **M3의 설계 전제 자체를 재검토**해야 한다.

(a)가 옳다. M3이 USD를 은퇴시킨 근거가 "cap이 막는다"였으므로, cap을 실제로 막게 만드는
것이 주장과 현실을 일치시키는 유일한 방향이다.

- **주의 — read-only 불변식 보존**: `clampForRunaway`는 firing-preview(`orchestration-preview.js`)가
  쓰는 **pure no-bump 오라클**이다. preview는 floor 1(0 미반환)을 유지해야 한다(관측이
  headroom을 소비하거나 0을 보고해선 안 됨). 따라서 **0 반환은 `reserveWorkers`의
  write-side 판정에만** 도입하고 `clampForRunaway` 시그니처는 건드리지 말 것.
  기존 preview read-only test가 이 경계를 지킨다.
- **두 budget 오라클**: `implement-dispatch/budget.js` · `plan-fanout/budget.js`가 이미
  `n===0` → `run:false` + `lock-exhausted` skip을 해석하므로(4라운드 F1), 신규 0 경로도
  같은 skip으로 수렴한다. `resolveWorkRoute`의 `reserveDenied` → inline 강제도 재사용.

---

## F2 — Failed fan-out reconcile can under-count real spawned agents

- **Severity**: HIGH (Codex confidence 0.86)
- **Locus**: `plugins/mccp/commands/plan.md:325-343` (fan-out reconcile 재시도 루프)

### 현상 (코드가 자백함)

`FANOUT_ACTUAL_N > 0`(실제 agent가 떴음이 **확정**된 상태)인데 reconcile이 3회 재시도 후
실패하면, 경고만 남기고 진행한다:

```bash
if [ "$RECONCILED" = "1" ]; then
  rm -f "$GITDIR_FANOUT/fanout-reservation.json"
else
  echo "[mccp:plan-fanout] WARNING: reservation $RES_ID uncommitted after 3 attempts; \
token kept ... The runaway cap may under-count this fan-out." 1>&2
fi
```

예약은 `open[]`에 **pending으로 잔존** → `MCCP_ORCHESTRATION_RESERVATION_LEASE_MS`(default
10분) 만료 → `readCounter`가 뷰에서 prune → **실제로 뜬 agent가 카운터에서 사라진다**.

### 주석의 근거가 스스로 틀렸다

같은 블록의 주석은 이렇게 적혀 있다:

> The residual error direction is a conservative over-count until the lease resolves it.

앞부분은 맞다(pending은 `launched`에 포함되므로 over-count = 보수적 = 안전). 하지만
lease가 그걸 "resolve"하는 방식이 **prune**이다 — 안전한 over-count를 **위험한
under-count로 뒤집는다**. lease는 오차를 해소하는 게 아니라 방향을 안전에서 위험으로
바꾼다. 주석은 이 뒤집힘을 못 본 채 "resolve"라고 불렀다.

### lease 만료의 건전성 전제가 깨진다

`orchestration-runaway.js` 주석이 lease 만료의 안전성을 이렇게 정당화한다:

> Expiry is sound ONLY because the pending window is structurally launch-free:
> work.md pins Step 3.route as the "before any worker is spawned" boundary

그리고 CLAUDE.md §4는 fan-out에 대해 이렇게 보충한다:

> fan-out은 route 경계가 없어(Workflow 호출 자체가 launch 지점) 호출 후 전 경로를 명시 commit한다.

F2가 바로 **"전 경로 명시 commit"이 성립하지 않는 경로**다. reconcile 3회 실패 경로는
launch **후**인데 commit하지 않는다. 즉 lease 만료의 건전성 전제(pending 창은
구조적으로 launch-free)가 fan-out에서 위반된다. 전제가 깨지면 만료는 실제 worker를
미카운트한다 — lease가 원래 감수하는 실패 양식(over-permissive)이 "여기선 발생할 수 없다"던
근거가 사라진다.

### 수정 방향

**known-nonzero launch를 절대 expirable로 두지 않는다.** `FANOUT_ACTUAL_N > 0`인데
commit 불가면 둘 중 하나:

- **(a) 비만료 debt 레코드**(권장): `open[]`의 pending과 구분되는 **committed-unreconciled**
  상태를 도입해 `readCounter`의 lease-prune 대상에서 제외. "모른다"(pending, 만료 가능)와
  "떴는데 정산 못 했다"(debt, 영구)를 타입으로 분리. 보수적 over-count로 영구 고정되므로
  cap은 절대 over-permissive해지지 않는다. `reconcileReservation`이 나중에 debt를 정산.
- **(b) fail-closed halt**: 정산될 때까지 진행 거부. 하지만 fan-out은 **plan을 절대 막으면
  안 되는** GROUND enhancement라는 기존 계약(주석에 명시)과 충돌하므로 부적합.

(a)가 계약을 지키면서 구멍을 닫는다. F1 수정의 "모르면 pending" 원칙과도 정합한다 —
**아는 것(떴다)은 pending으로 두지 않는다**가 그 원칙의 대칭 절반이다.

- **work.md 대칭 확인 필요**: work.md의 reconcile 실패 경로도 같은 구멍이 있는지
  점검할 것. work.md는 route가 launch **전** 경계라 pending 만료가 안전하지만,
  route **후** 실패 경로가 있다면 동일 처리 필요.

---

## 흡수 완료 (구현됨)

**F1** — `clampForRunaway`를 headroom-aware로 전환(`remaining===0`→`n:0`+`cap-exhausted`, `0<remaining<requestedN`→`n:remaining`) + `reserveWorkers`가 `n===0`에 write 없이 `granted:0`·`reservationId:null` 반환. 실측: cap=4에서 `launched`가 4에 고정(이전 5,6,7,8,9…).

**계획에서 벗어난 지점(의도적)**: 위 초안은 "0 반환은 `reserveWorkers` write-side에만, `clampForRunaway`는 건드리지 말 것"이었다. **틀렸다.** preview만 floor 1을 유지하면 실제로는 거부될 상황에서 "1개 뜬다"고 보고하는 **false green-light**가 된다 — M2 Codex F1이 `effective_fire`로 막으려던 바로 그 유형. read-only 불변식은 *mutate 금지*이지 *공식 고정*이 아니며, 순수성(무 I/O·무 bump)이 read-only를 보장한다. 그래서 오라클을 고쳐 preview와 발화 경로가 **같은 공식**을 공유하게 했고, 실측으로 preview(`run:false`/`cap-exhausted`) ↔ reserve(`granted:0`/`cap-exhausted`) 일치를 확인했다. preview의 정적·디스크 read-only test는 그대로 통과.

**F2** — reconcile CLI가 `actual>0`인데 commit 못 하면 **lock-free debt 마커**를 자동 기록(`orchestration-runaway.json.debt/<id>.json`). `readCounter`·`reconcileReservation`이 debt 항목을 lease 만료에서 제외. 마커는 기존 pending을 고정할 뿐 카운트 미가산(이중 계산 0). plan.md는 CLI 호출만 하면 되므로 별도 배선 불필요 — 잊을 여지를 없앰. 틀린 주석("conservative over-count until the lease resolves it") 정정. `work.md`는 route가 launch 전 경계라 HALT로 충분해 debt 불필요(의도된 비대칭 · stale 주석도 정정).

**부수 발견 — 테스트가 버그를 정답으로 고정** : `cannot amplify past the cap`(cap 8→누적 11) · `cannot exceed cap amplification`(cap 8→누적 11) · `F2: cost-state absence CANNOT bypass the cap`(cap 8→누적 12) 3개가 통과 중이었다. 전부 per-dispatch `granted`만 assert하고 **누적 총량**은 안 봤다 — 이름이 약속한 불변식을 아무도 검사하지 않았다. 총량 assert로 교체 + F1/F2 회귀 테스트 9개 추가.

## 남은 리스크 (정직 기록)

**F2 잔여 race**: fan-out이 lease(10분)를 초과하는 **동안** 다른 dispatch의 write-side prune이 pending을 이미 제거하면, 이후 reconcile은 raw에서도 항목을 못 찾아 no-op이고 debt 마커도 없는 항목을 고정할 수 없다. debt는 "떴다"를 아는 시점(Workflow 반환 후)에 찍히므로 그 이전 창은 못 덮는다. reserve 시점에 미리 찍으면 덮이지만 아무것도 안 뜬 경우 유령 예약이 되어 R1 F3가 고친 자기중독이 되살아난다. Codex가 지목한 경로(reconcile 실패)는 닫혔고 이 잔여는 더 좁다 — backlog 후보.

## Next

`/mccp:pr` 재실행 (6라운드)
