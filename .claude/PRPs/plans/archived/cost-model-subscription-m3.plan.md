# Plan: Cost Model — Time-Based Decay (M3)

**Source PRD**: `.claude/prds/cost-model-subscription.prd.md`
**Selected Milestone**: M3 — Time-based decay (PRD 최종 milestone → 완료 시 minor bump)
**Complexity**: Large (Codex R1 F1/F2/F3 흡수로 Medium→Large — 명시적 raw/decayed API 분리 + subscription-aware producer + STATE.md ownership 모델)

## Summary

"한 번 튄 가상 비용($314.50 sticky)이 5개 자동화를 영구·전역으로 잠그는" 문제의 **잔존 근원**을 시간 축으로 닫는다. sticky는 두 표면에 남는다: (1) **cost-state monotonic-MAX** — `mergeMonotonic`의 무조건 `Math.max`가 한 번 오른 `cost_usd`/`hard_ceiling_reached`를 write마다 계승, (2) **STATE.md `chain_aborted`** — 한 번 set되면 auto-chain trigger 8(unconditional)이 영구 abort. M2가 "신규 추정을 정확하게" 만들었으니, M3는 "오래된 추정이 스스로 사라지게" 만든다.

- **Axis 1 (cost-state decay — F1 흡수: 명시적 raw/decayed API)** — `cost-current.json`의 mtime이 `MCCP_COST_STATE_DECAY_HOURS`(default 6h)보다 오래되면 decayed reader가 green view(`cost_usd:0`, `threshold_tier:'green'`, `hard_ceiling_reached:false`)를 반환한다. Codex F1(같은 파일이 reader에 따라 allow/abort로 갈리는 불일치 + transitive write-reset의 취약성)을 흡수해 **raw와 decayed를 명시적으로 분리**한다: `readStateRaw()`(raw, 관측/내부용) · `readState()`(decayed — tier 게이트가 이미 호출하는 지점, 코드 변경 0으로 decay 획득) · `readStateOrThrow()`(raw, auto-chain 전용, 불변). `writeStateMerged`는 **transitive가 아니라 명시적** write-side decay(`getStateMtimeMs()` stale > decayMs면 prev floor를 null로 리셋)로 monotonic 계승을 끊는다. derive/dashboard는 cost-state를 읽지 않으므로(확인됨) decay가 관측 표면을 오염시키지 않는다.
  - **auto-chain divergence는 의도적·문서화·테스트됨**: auto-chain은 `readStateOrThrow`(raw) + `isStale(1h)` stale-abort를 유지한다 — 이는 sticky-hard_ceiling 버그와 **직교하는 fail-safe**(mid-chain에서 telemetry가 1h+ 낡으면 보수적 pause). sticky 버그(fresh 파일의 hard_ceiling)는 write-side decay가 첫 tool call에 floor를 리셋해 해소하고, >6h gap 후엔 첫 write가 파일을 fresh·low로 만들어 auto-chain 다음 check가 통과(자기치유)한다. decay 창(6h) ≫ auto-chain stale 창(1h)이라 활성 세션(매 PostToolUse write)엔 decay가 발화하지 않는다 — 오직 세션 경계 수준의 무활동에서만.

- **Axis 2 (STATE.md `chain_aborted` decay — F2+F3 흡수: subscription-aware producer + 명시적 ownership)** — 세 결함을 닫는다:
  - **F3 ownership**: `chain_aborted`는 cost 채널·dispatch-controller가 **양쪽 set**하고 `last_event`는 덮어써지므로 provenance 증명이 불안정하다. 안정적 `abort_owner` frontmatter(enum `'cost'|'dispatch'`)를 도입 — cost SET 시 `abort_owner:'cost'`+`cost_abort_at`, dispatch SET(`dispatch_chain_aborted` event) 시 `abort_owner:'dispatch'`+**stale cost marker clear**. decay-clear는 `abort_owner==='cost'` **∧** marker age>decayMs **∧** fresh cost 정상 **∧** no active dispatch(`!active_dispatch_count && !dispatch_id`)일 때만 `chain_aborted`+`abort_owner`+`cost_abort_at` clear. `last_event` guard 폐기(불안정).
  - **F3 legacy**: marker 없는 기존 `chain_aborted=true`(현재 repo가 정확히 이 상태 — `last_event:stop_loop_pass`, dispatch 없음)는 provenance 증명 불가라 영영 안 지워지는 결함. **conservative legacy sweep**로 흡수 — `chain_aborted` set ∧ no `abort_owner`/`cost_abort_at` ∧ cost decayed-green ∧ no active dispatch ∧ `last_event∉{dispatch_chain_aborted}`이면 legacy-cost-origin으로 귀속해 1회 clear + loud log. 이로써 repo의 현 stuck flag가 실제로 해소된다.
  - **F2 subscription producer**: 구독권 모드에서도 producer(SET 분기)가 USD로 `chain_aborted`를 set하면 auto-chain trigger 8(unconditional, subscription bypass 이전에 평가)이 사용자를 차단하고 USD 재stamp 시 영구 잠긴다. M3는 producer를 subscription-aware로 만든다 — 구독권 모드에서 `chain_aborted`는 USD가 아니라 `subscription.evaluateOverflow`(context overflow)에서만 파생(overflow-critical → set, else 미set). "high USD alone이 trigger 8을 못 켠다"를 auto-chain 회귀로 증명.
  - **scope**: decay-clear는 `chain_aborted`(auto-chain lock)만 대상. `session_end_imminent`은 기존 clearHandoff/resume 라이프사이클 소유 — precompact handoff 신호를 오삭제하지 않도록 **decay가 건드리지 않는다**.

opt-in/subscription과 무관한 **보편 수정** — 종량제 사용자도 3일 전(다른 프로젝트)의 $314가 오늘 작업을 막지 않게 되고, 구독권 사용자는 auto-chain의 STATE.md 채널 잔존·재발 잠금까지 풀린다. decay 비활성(`=0`) 시 M2 동작과 판정 byte-identical. **M3 완료 = PRD 3개 milestone 전부 적용 → §3.7에 따라 minor bump `1.21.2 → 1.22.0`.**

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Env parse SoT + loud fail-open | `plugins/mccp/scripts/lib/cost-thresholds.js:29` (`parseEnvOverride`) | 단일 모듈 상수 + `MCCP_*` env override + finite check + stderr warn + default |
| Per-call env 재읽기(캐시 없음) | `plugins/mccp/scripts/lib/cost-state.js:36` (`tierFor`) | 매 호출 threshold 읽기 — env override가 reload 없이 유효 |
| mtime staleness 판정 | `plugins/mccp/scripts/lib/cost-state.js:79/162` (`getStateMtimeMs`/`isStale`) | `Date.now() - mtimeMs > maxAgeMs` — 이미 존재, decay 창에 재사용 |
| Injectable now/read for pure test | `plugins/mccp/scripts/state/breakpoint-detector.js:66` (`detect` `o.now`) | `Number.isFinite(o.now) ? o.now : Date.now()` — 시간 의존 로직 test seam |
| Subscription 분기 게이트 | `plugins/mccp/scripts/state/breakpoint-detector.js:76` (`detectSubscription`) | `isSubscriptionMode(env)` 뒤 overflow 축 파생 — producer도 동형으로 |
| STATE.md 조건부 frontmatter emit | `plugins/mccp/scripts/state/state-writer.js:304` (`if (fm.dep_check_at) out.push(...)`) | present-only 필드 — set 시에만 직렬화 |
| STATE.md patch 병합 + event 부수효과 | `plugins/mccp/scripts/state/state-writer.js:389`/`53-57` (`session_end_imminent` patch / `dispatch_chain_aborted` pairing) | patch merge + VALID_EVENTS 이벤트별 부수 필드 |
| Best-effort telemetry in hot hook | `plugins/mccp/scripts/hooks/ecc-context-monitor.js:279` | 격리 try/catch — write/clear 실패가 hook 진행을 막지 않음 |
| Test (env SoT / injected read) | `cost-thresholds.test.js` · `plan-fanout/tests/budget.test.js` | `node:test` + `assert/strict` + 주입 read stub + default 회귀 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/cost-state.js` | UPDATE | **Axis 1** — `parseDecayMs(env)` + pure `decayIfStale(state, mtimeMs, nowMs, decayMs)`. `readStateRaw(opts?)`(현 raw 로직 이동) + `readState(opts?)`(decayed = `decayIfStale∘readStateRaw`, tier 게이트가 이미 호출) + `readStateOrThrow` **불변**(auto-chain raw). `writeStateMerged`가 prev를 `readStateRaw`로 읽고 **명시적** write-side decay(stale>decayMs → prev=null) 적용. helper export |
| `plugins/mccp/scripts/lib/tests/cost-state.test.js` | CREATE | **Axis 1 + F1 cross-consumer** — decay read(fresh→raw / stale→green / `=0` 비활성→raw / env hours / mtime 부재→raw) + 명시적 write-side floor 리셋 + monotonic within-window 회귀 + `readStateRaw`는 항상 raw |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | **Axis 2 F2+F3** — SET 분기 subscription-aware(구독권: overflow-critical에서만 `chain_aborted` set, USD 아님) + cost SET 시 `abort_owner:'cost'`+`cost_abort_at` stamp. 신규 decay-clear(4중 stable AND) + legacy sweep. repoRoot 해석 set/clear 공유 리팩터. 격리 try/catch |
| `plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js` | UPDATE | (a) cost SET `abort_owner`/`cost_abort_at` stamp, (b) 구독권 high-USD·overflow-green → `chain_aborted` 미set(F2), (c) decay-clear 4중 AND 성립 시 clear, (d) `abort_owner:'dispatch'` → 미clear(F3 provenance), (e) active dispatch → 미clear, (f) legacy sweep(marker 없는 cost flag + no dispatch → clear), (g) marker age≤decayMs·`=0` 비활성 → 미clear |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `abort_owner`+`cost_abort_at` frontmatter(update 병합 + present-only 직렬화, `dep_check_at` mirror). `dispatch_chain_aborted` event 처리 시 `abort_owner:'dispatch'` set + `cost_abort_at` clear(F3 stale-marker) |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | `abort_owner`/`cost_abort_at` round-trip + clear(present-only omit) + `dispatch_chain_aborted` event가 owner='dispatch'+marker clear + 기존 flag 회귀 |
| `plugins/mccp/scripts/lib/tests/auto-chain.test.js` | UPDATE | **F1 cross-consumer + F2 회귀** — 동일 stale-high 파일에서 auto-chain은 `cost-state-stale` abort(의도적 divergence 문서화) + gate reader는 green; 구독권 high-USD alone이 trigger 8(STATE.md `chain_aborted`) 미발화 증명. auto-chain.js 코드는 불변(raw readStateOrThrow 유지) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.21.2 → 1.22.0` (PRD 최종 milestone 완료 = minor, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | §3.7 footer version sync `v1.21.2 → v1.22.0` (page-foot) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | §3.7 footer version sync `v1.21.2 → v1.22.0` (derived 줄) |
| `CLAUDE.md` | UPDATE | §4 토글 `MCCP_COST_STATE_DECAY_HOURS` + §1.4 표 M3 row(PRD 완결) + §3.2/STATE.md `abort_owner`/`cost_abort_at` present-only 필드 |
| `CHANGELOG.md` | UPDATE | M3 row(`1.22.0`) |
| `.claude/prds/cost-model-subscription.prd.md` | UPDATE | M3 row `pending → in-progress` + Plan cell(플랜 커맨드 수행) |

> **변경 불필요(확인됨)**: (1) tier 소비처 `plan-fanout/budget.js`·`implement-dispatch/budget.js`·`briefing/cost-guard.js`·`breakpoint-detector.js`는 이미 `readState`(또는 주입된 `costStateRead=readState`)를 호출 → decay를 **코드 변경 0**으로 획득. (2) `derive/sources/*`는 cost-state를 읽지 않음(grep empty) → decay가 observability 무오염. (3) `state-writer` readState의 generic frontmatter 파서가 `abort_owner`/`cost_abort_at`를 자동 흡수(직렬화만 명시 추가).

## Tasks

### Task 1: cost-state raw/decayed 분리 + write-side decay (Axis 1 core, F1)
- **Action**: `cost-state.js`에 (a) `DEFAULT_DECAY_HOURS=6` + `DECAY_ENV='MCCP_COST_STATE_DECAY_HOURS'`. (b) `parseDecayMs(env)`: 미설정/빈 → default(6h ms); 유한·`>0` → `n*3600_000`; `0` → `null`(**kill switch**); 음수/비유한 → default + loud stderr warn(`cost-thresholds#parseEnvOverride` mirror). (c) pure `decayIfStale(state, mtimeMs, nowMs, decayMs)`: `state` null / `decayMs==null` / `mtimeMs` falsy(stat 실패 → spurious green 방지, fail-safe) / `nowMs-mtimeMs<=decayMs` → 그대로; 초과 → `{cost_usd:0, threshold_tier:'green', hard_ceiling_reached:false, last_write_ts: state.last_write_ts}`. (d) `readStateRaw(opts?)` = 현 `readState` 파싱 로직 이동(raw). (e) `readState(opts?)` = `decayIfStale(readStateRaw(opts), opts.mtimeMs??getStateMtimeMs(), opts.now??Date.now(), opts.decayMs??parseDecayMs(opts.env??process.env))`. (f) `readStateOrThrow` **불변**. (g) `writeStateMerged`: `const prevRaw = readStateRaw();` 후 `getStateMtimeMs()` stale>decayMs면 `prev=null`(명시적 floor 리셋), 아니면 `prev=prevRaw`, `mergeMonotonic(prev, update)`. export `parseDecayMs`/`decayIfStale`/`readStateRaw`/`DEFAULT_DECAY_HOURS`/`DECAY_ENV`.
- **Mirror**: `cost-thresholds.js#parseEnvOverride` + `breakpoint-detector.js#detect`(injectable now)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/cost-state.test.js`

### Task 2: cost-state 테스트 (Axis 1 + F1 cross-consumer)
- **Action**: 신규 `cost-state.test.js` — **read decay**: fresh(age≤decayMs)→raw / stale(age>decayMs)→green / `MCCP_COST_STATE_DECAY_HOURS=0`→raw(비활성) / env hours override로 임계 이동 / `mtimeMs=0`→raw. **명시적 write-side**: stale 파일 위 `writeStateMerged({cost_usd:low, hard_ceiling_reached:false})` → merged가 low·hard_ceiling false(floor 리셋); fresh 파일선 monotonic MAX 유효(회귀). **API 분리**: 동일 stale 파일에서 `readStateRaw`는 raw($314 유지), `readState`는 green — 명시적 raw/decayed 계약 검증(F1). read decay는 주입(`mtimeMs`/`now`/`decayMs`)로 순수, write-side는 tmp dir 격리.
- **Mirror**: `cost-thresholds.test.js`
- **Validate**: 위 green + lib 스위트 회귀

### Task 3: state-writer abort_owner + cost_abort_at (Axis 2 substrate, F3)
- **Action**: `state-writer.js` — (a) `update` 병합: `if (patch.abort_owner !== undefined) merged.frontmatter.abort_owner = patch.abort_owner || undefined;` 동형으로 `cost_abort_at`(null/빈 → clear). (b) 조건부 직렬화: `if (fm.abort_owner) out.push('abort_owner: ' + fm.abort_owner);` + `if (fm.cost_abort_at) out.push('cost_abort_at: ' + fm.cost_abort_at);`(`dep_check_at` L304 mirror). (c) **F3 stale-marker**: `patch.event==='dispatch_chain_aborted'` 처리 시 `abort_owner='dispatch'` set + `cost_abort_at` clear(dispatch가 chain_aborted 소유권을 취득하면 잔존 cost marker 무효화). readState 파싱은 generic 파서 흡수 — 확인.
- **Mirror**: `state-writer.js:304`(dep_check_at) + `:53-57`(dispatch_chain_aborted pairing)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js`

### Task 4: state-writer 테스트
- **Action**: `abort_owner`/`cost_abort_at` set→readback + null patch clear(present-only omit) + `update({event:'dispatch_chain_aborted', chain_aborted:true})`가 `abort_owner:'dispatch'` set·기존 `cost_abort_at` clear + `session_end_imminent`/`chain_aborted` round-trip 회귀.
- **Mirror**: `state-writer.test.js:135/524`
- **Validate**: 위 green

### Task 5: ecc-context-monitor — subscription-aware SET + provenance stamp + decay-clear + legacy sweep (F2+F3)
- **Action**: STATE.md write 블록(L305-329) 재구성. repoRoot 해석을 헬퍼로 추출.
  - **SET 분기 (F2 subscription-aware)**: metered — 기존 `cost >= t.warning` → `session_end_imminent:true`, `cost >= t.critical`(hardCeiling) → `chain_aborted:true`. subscription(`isSubscriptionMode(env)`) — USD 대신 `subscription.evaluateOverflow({contextRemainingPct, toolCount, thresholds})` 파생: overflow-critical → `chain_aborted:true`, overflow-warning → `session_end_imminent:true`, green → 미set. **`chain_aborted`를 set할 때만** `abort_owner:'cost'`+`cost_abort_at:new Date().toISOString()` 동봉(provenance).
    - **IF2 흡수 (Codex Impl-R1 MEDIUM) — stale-context guard**: STATE.md producer 진입 **전에** bridge freshness(`isStale` = `now - last_timestamp > STALE_SECONDS`, 기존 L333-335 로직을 write 블록 위로 hoist)를 계산하고, subscription SET/CLEAR가 소비하는 `contextRemainingPct`/`toolCount`를 stale 시 `null`로 주입 → `evaluateOverflow`가 signal-unknown→green 반환 → 오래된 telemetry가 `chain_aborted`를 못 켠다. metered 경로는 harness-preferred `cost`(resolveSessionCost)라 무영향.
  - **신규 CLEAR 분기 (F3, chain_aborted 전용)**: `stateWriter.readState(repoRoot)` fm 읽어 **4중 stable AND** — `fm.abort_owner==='cost'` ∧ `fm.cost_abort_at` 존재 ∧ `Date.now()-Date.parse(fm.cost_abort_at) > parseDecayMs(env)` ∧ (metered: `cost < t.critical` / subscription: overflow≠critical) ∧ no active dispatch(`!fm.active_dispatch_count && !fm.dispatch_id`) → `stateWriter.update(repoRoot,{chain_aborted:false, abort_owner:null, cost_abort_at:null})` + loud log. `session_end_imminent`은 불변(기존 라이프사이클).
  - **Legacy sweep (F3 legacy + IF1 흡수)**: `fm.chain_aborted===true` ∧ `!fm.abort_owner` ∧ `!fm.cost_abort_at` ∧ cost decayed-green(`readState()` tier green) ∧ no active dispatch ∧ **`!NON_COST_ABORT_EVENTS.has(fm.last_event)`** → legacy-cost-origin 귀속, `chain_aborted:false` 1회 clear + loud stderr(`[mccp:cost-decay] legacy stuck chain_aborted swept`). decay 비활성(`parseDecayMs`=null)이면 decay-clear·sweep 모두 skip.
    - **IF1 흡수 (Codex Impl-R1 HIGH) — non-cost abort denylist**: `NON_COST_ABORT_EVENTS = new Set(['plan_conflict_escalated','dispatch_chain_aborted'])`. 두 이벤트는 `chain_aborted=true`와 짝지어 **자기 `last_event`를 명시 기록**하는 유일한 non-cost abort producer다. cost path(ecc-context-monitor)는 `event`를 patch에 넣지 않아 `last_event`를 안 바꾸므로, 이 denylist 제외가 cost-origin을 안전히 식별한다. 이전 `!=='dispatch_chain_aborted'` 단일 비교는 `plan_conflict_escalated` hard-stop을 오clear → auto-chain이 plan/impl conflict를 통과하는 결함(Codex IF1). Task 6이 plan_conflict/precompact preserve 회귀로 고정.
  - 전 과정 격리 try/catch — 실패가 cost write·context write·hook 진행 무영향.
- **Mirror**: `ecc-context-monitor.js:310`(set) + `breakpoint-detector.js#detectSubscription`(overflow 파생) + `cost-state#parseDecayMs`
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js`

### Task 6: ecc-context-monitor 테스트 (F2+F3 + IF1+IF2)
- **Action**: stateWriter.update spy + readState stub — (a) metered cost≥critical SET 시 patch에 `chain_aborted`+`abort_owner:'cost'`+`cost_abort_at`, (b) **F2**: `MCCP_SUBSCRIPTION=1` + high USD + overflow-green → `chain_aborted` 미set(USD 무관), overflow-critical → set, (c) decay-clear 4중 AND 성립 → chain_aborted+owner+marker clear, (d) **F3 provenance**: `abort_owner:'dispatch'` → 미clear, (e) active dispatch(`active_dispatch_count>0` 또는 `dispatch_id`) → 미clear, (f) **F3 legacy**: marker 없는 `chain_aborted:true` + green + no dispatch + last_event≠(abort event) → sweep clear; last_event=dispatch_chain_aborted → 미clear, (g) marker age≤decayMs / `=0` 비활성 → 미clear, (h) `session_end_imminent` decay 무영향(회귀), **(i) IF1**: legacy sweep가 `last_event='plan_conflict_escalated'`(marker 없는 chain_aborted) → **미clear**(denylist preserve) + green precompact/handoff(session_end_imminent만) → chain_aborted 미영향, **(j) IF2**: `MCCP_SUBSCRIPTION=1` + stale bridge(`last_timestamp` 오래됨) + critical-looking `context_remaining_pct` → `chain_aborted` 미set(stale→green). FS 미오염(spy).
- **Mirror**: `ecc-context-monitor.test.js`(spy + patch 검사)
- **Validate**: 위 green + hooks 스위트 회귀

### Task 7: auto-chain 회귀 (F1 cross-consumer + F2)
- **Action**: `auto-chain.test.js` 추가(auto-chain.js 코드 불변) — **F1**: 동일 stale-high(>decayMs) cost 파일에서 `shouldAbort`(metered)는 `cost-telemetry`(cost-state-stale) abort 유지(readStateOrThrow raw + isStale 1h) — 의도적 fail-safe divergence를 test로 고정; 대비되게 `costState.readState()`(decayed)는 green 반환 확인(같은 파일, reader별 계약 명시). **F2**: `MCCP_SUBSCRIPTION=1`에서 STATE.md `chain_aborted`가 (Task 5 producer로) high-USD alone엔 set 안 됨을 통합 확인 — trigger 8은 실제 overflow-critical 또는 non-cost dispatch에서만.
- **Mirror**: `auto-chain.test.js`(subscription overflow 경로)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js`

### Task 8: 문서 + version bump + footer sync
- **Action**: (a) `plugin.json` `1.21.2 → 1.22.0`(PRD 최종 = minor). (b) `renderer/html.js`·`markdown.js` footer `v1.22.0`. (c) `CLAUDE.md` §4 `MCCP_COST_STATE_DECAY_HOURS`(default 6h·`=0` kill switch·raw/decayed 분리·write-side floor 리셋·Axis 2 chain_aborted decay-clear+legacy sweep+subscription-aware producer) + §1.4 표 M3 row(cost-model-subscription PRD 완결) + STATE.md `abort_owner`/`cost_abort_at` present-only 필드. (d) `CHANGELOG.md` `1.22.0` M3 row.
- **Mirror**: 기존 §4 톤 + §3.7 체크리스트
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` = `1.22.0`

## Validation

```bash
# 신규 + 수정 모듈
node --test plugins/mccp/scripts/lib/tests/cost-state.test.js
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
node --test plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js
node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js

# 회귀: cost/state/hook 전체 (종량제·subscription 판정 불변 확증)
node --test plugins/mccp/scripts/lib/tests/*.test.js
node --test plugins/mccp/scripts/state/tests/*.test.js
node --test plugins/mccp/scripts/hooks/tests/*.test.js

# require 무결성
node -e "['lib/cost-state','hooks/ecc-context-monitor','state/state-writer','lib/auto-chain'].forEach(m=>require('./plugins/mccp/scripts/'+m))"

# derive가 abort_owner/cost_abort_at additive 필드 통과(frontmatter passthrough)
node plugins/mccp/scripts/derive/cli.js run --json > /dev/null && echo "derive OK"

# version 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **F1** decay가 reader별 allow/abort 불일치 | 중간 | 명시적 `readStateRaw`(raw)/`readState`(decayed)/`readStateOrThrow`(raw) 3-API 분리 + 명시적 write-side decay(transitive 아님). auto-chain divergence는 의도적 fail-safe로 문서화+Task 7 test. decay 6h≫stale 1h라 활성 세션 무발화 |
| **F2** 구독권 producer가 USD로 chain_aborted 재stamp → 영구 잠금 | 중간 | SET 분기 subscription-aware — 구독권은 overflow-critical에서만 set. Task 6(b)+Task 7 F2 회귀가 high-USD alone 미발화 증명 |
| **F3** decay-clear가 dispatch/precompact abort 오삭제 | 중간 | 안정적 `abort_owner` ownership(last_event 폐기) + no-active-dispatch AND + dispatch SET 시 stale marker clear. `session_end_imminent`은 decay 무관(precompact 보호). Task 6(d)(e) preserve 증명 |
| **F3 legacy** marker 없는 기존 stuck flag 영영 미clear | 확실(현 repo) | conservative multi-signal sweep(no owner+no marker+green+no dispatch+non-dispatch last_event) → repo 현 flag(last_event=stop_loop_pass) 실제 해소. Task 6(f) |
| decay 창(6h)이 정당한 장기 세션 중간 gap 오리셋 | 낮음 | 6h는 세션 경계 근사(활성 세션 mtime fresh). 구독권 무해·종량제는 M2 실비 재축적 정확. env 튜너블 + `=0` 완전 비활성 |
| STATE.md 신규 필드 frozen schema 위반 | 낮음 | present-only additive(미set 시 미출력) — derive는 cost-state 미read + frontmatter passthrough. 선례(dep_check_at 등) |
| Large scope(15파일)가 한 milestone 과대 | 중간 | F1/F2/F3는 PRD headline("cost 게이트 차단 0건")의 필수 조건 — half-close 시 구독권 unblock 미완. Task 분할 명확·회귀 test 축별 격리. 필요 시 사용자가 Axis 2 descope 결정 가능 |

## Acceptance

- [ ] **(Axis 1)** mtime > `MCCP_COST_STATE_DECAY_HOURS`(6h)이면 `readState()`=green, `readStateRaw()`=raw(명시적 분리) → tier 소비처(fleet/fanout/briefing/breakpoint)가 sticky critical 미잠금. `writeStateMerged`가 stale 파일 위 명시적 floor 리셋(첫 write 후 sticky 소멸)
- [ ] **(F1 divergence)** 동일 stale-high 파일에서 auto-chain은 `cost-state-stale` fail-safe abort 유지(문서화·test) — 첫 tool write 후 자기치유
- [ ] **(F2)** `MCCP_SUBSCRIPTION=1` + high USD + overflow-green → producer가 `chain_aborted` 미set → auto-chain trigger 8 미발화. overflow-critical에서만 set
- [ ] **(F3)** cost가 set한 `chain_aborted`는 `abort_owner==='cost'` ∧ age>decayMs ∧ fresh 정상 ∧ no active dispatch일 때만 decay-clear. dispatch/precompact abort(`abort_owner≠'cost'` 또는 active dispatch)는 절대 미clear. `session_end_imminent`은 decay 무관
- [ ] **(F3 legacy)** repo 현 stuck flag(`chain_aborted:true`, marker 없음, `last_event:stop_loop_pass`, no dispatch)가 legacy sweep로 clear
- [ ] `MCCP_COST_STATE_DECAY_HOURS=0` 시 decay/sweep 완전 비활성 → M2와 판정 byte-identical. 종량제/subscription 회귀 0(기존 test green)
- [ ] All tasks complete · Validation passes · Patterns mirrored, not reinvented
- [ ] `plugin.json` `1.22.0` + footer sync + PRD M3 complete → **cost-model-subscription PRD 전체 종료**

## Open Questions

- [ ] **decay 창 default N** — 6h 채택(새 세션 경계 근사). PRD OQ4("세션 경계 vs 고정 시간")에 고정 시간(env-tunable)으로 답. 세션-id 변화 기반 리셋으로의 전환은 필요 시 후속 축.
- [ ] **legacy sweep 재발 억제** — 1회 clear 후 flag false면 조건 자연 미성립(no-op)이라 무해. `legacy_abort_swept` 명시 마커 도입 여부는 구현 시 판단.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 전건 흡수 → 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → converge)
- 합치 결론: Codex verdict=`needs-attention`(HIGH 3). 3건 전부 plan-time 흡수(명시적 raw/decayed API + write-side 명시화 + subscription-aware producer + 안정적 abort_owner ownership + legacy sweep) → 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → 게이트 converge. auto-CRITICAL 없음(secret/data-loss/auth/irreversible-migration/external-dest/crypto 카탈로그 미해당 — 전부 logic correctness).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 single-point decay가 reader별 allow/abort 불일치 + transitive write-reset 취약 | HIGH | ACCEPT_NOW (absorbed) | `readStateRaw`/`readState`/`readStateOrThrow` 3-API 명시 분리 + `writeStateMerged` 명시적 write-side decay(transitive 폐기) + auto-chain divergence 문서화·test(Task 7). derive는 cost-state 미read(관측 무오염 확인) |
  | F2 subscription 모드에서 producer가 USD로 chain_aborted set → trigger 8 영구 차단 | HIGH | ACCEPT_NOW (absorbed) | OQ2를 out-of-scope→in-scope 승격. SET 분기 subscription-aware(overflow-critical에서만 set). Task 6(b)+Task 7 회귀로 high-USD alone 미발화 증명 |
  | F3 cost_abort_at+last_event guard 불안정 ownership + legacy unmarked flag 영영 미clear(현 repo 실재) | HIGH | ACCEPT_NOW (absorbed) | 안정적 `abort_owner` frontmatter(last_event 폐기) + no-active-dispatch AND + dispatch SET 시 stale marker clear + conservative legacy multi-signal sweep(repo 현 stuck flag 실제 해소). decay-clear scope를 `chain_aborted`로 한정(session_end_imminent 라이프사이클 보호) |
- Deferred to backlog: 0 (전건 흡수)
- Open Questions: 없음 (OQ2 subscription SET-branch는 F2로 in-scope 승격 완료). auto-CRITICAL 없음.
- Codex session 참조: threadId `019f5255-c905-7cd2-8020-3a0fc10d35a6`

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 전건 흡수 → 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → converge)
- 합치 결론: Codex verdict=`needs-attention`(HIGH 1 + MEDIUM 1). 2건 모두 R1 구현 흡수 → 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → 게이트 converge. auto-CRITICAL 없음(둘 다 logic correctness — secret/data-loss/auth/irreversible-migration/external-dest/crypto 카탈로그 미해당).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | IF1 legacy sweep가 markerless `plan_conflict_escalated`(chain_aborted=true + no marker) hard-stop도 clear → auto-chain이 plan/impl conflict를 통과 | HIGH | ACCEPT_NOW (absorbed) | Task 5 legacy sweep에 **non-cost abort-event denylist** 추가 — `NON_COST_ABORT_EVENTS={plan_conflict_escalated,dispatch_chain_aborted}` 제외. cost path는 `last_event`를 안 바꾸는 게 cost-origin 서명(두 abort event만 자기 last_event를 씀). Task 6에 plan_conflict/precompact preserve 회귀 추가 |
  | IF2 subscription SET가 stale bridge context를 그대로 소비 → 오래된 telemetry가 `chain_aborted`+`abort_owner=cost` 영구 halt 생성 | MEDIUM | ACCEPT_NOW (absorbed) | Task 5에서 STATE.md producer **이전에** bridge freshness(`isStale`, last_timestamp 기반) 계산 → stale 시 context를 null(→signal-unknown→green)로 subscription SET/CLEAR에 주입. Task 6에 stale last_timestamp + critical-looking context → `chain_aborted` 미set 회귀 |
- Deferred to backlog: 0 (전건 흡수)
- Open Questions: 없음. auto-CRITICAL 없음.
- Codex session 참조: threadId `019f5279-c6b2-7ff1-8ae7-3a66a76b9f43`

## Design Critique

- detector: `skill_available=true` · `design_signal=true` (signal_files: `renderer/html.js`, `renderer/markdown.js`)
- 판정: **CONVERGED** (round 1). design_signal은 §3.7 의무인 footer 버전 문자열 sync(`v1.21.2 → v1.22.0`)가 rendered-surface 파일을 건드려 발생한 것으로, 실제 디자인 표면 변경은 0. 4 Output Constraints(정보 위계·강조색·raw marker·항목 수)는 버전 문자열 치환에 무적용. M2(control-plane, design N/A)와 동형.
- verdict: converged / rounds: 1
