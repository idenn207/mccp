# Plan: Cost Model — Harness-Cost Accuracy (M2)

**Source PRD**: `.claude/prds/cost-model-subscription.prd.md`
**Selected Milestone**: M2 — Harness-cost accuracy
**Complexity**: Medium

## Summary

두 축으로 "부풀려진 가상 비용" 문제의 **정확도 근원**을 닫는다. **Axis A** — harness 실비(`cost.total_cost_usd`, statusLine stdin에만 노출)를 `harness-cost-<sid>.json` 캐시로 흘려보내는 **writer를 배선**한다(cost-tracker는 이미 이 캐시를 우선 신뢰 — 소비 측은 완비, 생산 측이 공백이었다). 캐시 소비를 `ecc-context-monitor`까지 확장해 cost-state·agent-facing 경고가 Stop 지연 없이 실비에 수렴한다. **Axis B** — `ecc-context-monitor.js`의 로컬 하드코딩 `COST_NOTICE/WARNING/CRITICAL_USD`(50/80/100)를 `cost-thresholds.js`의 `getHandoffCostThresholds()`로 통일해 `MCCP_HANDOFF_THRESHOLDS_USD` env override가 **`hard_ceiling` 계산에도 유효**해진다(현재는 tier에만 반영, hard_ceiling은 100 고정 → 사용자의 500/800/1000 즉효완화를 우회당해 sticky critical 재발).

커스텀 statusline(ccstatusline) 사용자에게 writer 주입은 **강제하지 않는다**(PRD Out-of-scope) — 번들 statusline writer + 문서화된 캐시 계약(opt-in) + fallback(transcript-sum) 유지로 회귀 0. sticky monotonic-MAX 잔존값 자체를 지우는 것은 M3(time-based decay) 몫 — M2는 **신규 추정을 정확하게** 만든다.

**Axis A vs Axis B 역할 분리(Codex F1 흡수 — 과잉 주장 방지)**: 커스텀 statusline 사용자의 실제 고통은 *표시 비용*이 아니라(그들의 ccstatusline은 이미 실비 $45를 정확히 보여줌) *mccp 게이트가 부풀린 cost-state로 오발화*하는 것이다. 그 unblock은 **Axis B(statusline과 완전 독립)** 가 `MCCP_HANDOFF_THRESHOLDS_USD` env를 hard_ceiling·STATE.md abort 채널까지 도달시켜 해결한다 — writer 없이도 즉시 효력. 반면 Axis A(harness writer)의 *표시 추정 정확화*는 번들 statusline 사용자 + opt-in wired 설치에만 적용된다. 따라서 M2 Success Metric "추정치 ↔ 실비 괴리 <20%"는 **writer-active 설치로 scope를 정직하게 한정**하고, 커스텀 statusline 미wired 설치는 harness-accuracy를 "complete"로 주장하지 않는다(게이트 unblock은 Axis B로 완료).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Harness-cost read contract | `plugins/mccp/scripts/hooks/cost-tracker.js:54` (`readHarnessCost`) | ts+cost finite 검증 + age 경계(≤300s) + miss/stale/corrupt → null. lib로 추출해 단일 SoT화 |
| Atomic pid+nonce write | `plugins/mccp/scripts/hooks/ecc-context-monitor.js:94` (`writeWarnState`) | `${target}.${pid}.${randomBytes}.tmp` → rename, 실패 시 tmp unlink |
| Threshold SoT + env override | `plugins/mccp/scripts/lib/cost-thresholds.js:55` (`getHandoffCostThresholds`) | 단일 모듈 상수 + per-call env 재읽기(캐시 없음) — cost-state.js:36 `tierFor`가 이미 소비 |
| Best-effort telemetry in hot hook | `plugins/mccp/scripts/hooks/ecc-context-monitor.js:238` | 격리 try/catch — write 실패가 hook 진행/다른 write를 막지 않음 |
| Snapshot path helper | `plugins/mccp/scripts/lib/cost-state-path.js:15` (`getCostStateDir`) | os 기반 canonical dir, cwd-relative 금지 |
| Test (module singleton mutation) | `plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js:34` | destructured import은 require 전 mock, lazy-require는 call-time spy. FS 미오염 |
| Test (env SoT) | `plugins/mccp/scripts/lib/tests/cost-thresholds.test.js` | `node:test` + `assert/strict` + env override on/off |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/harness-cost.js` | CREATE | dep-free(fs/os/path) 공용 계약: `getHarnessCostPath`·`readHarnessCost(sid,maxAge)`·`writeHarnessCost(sid,cost)`. cost-tracker의 inline read를 추출 → 단일 SoT |
| `plugins/mccp/scripts/lib/tests/harness-cost.test.js` | CREATE | write/read round-trip·stale reject·corrupt→null·음수 cost reject·atomic tmp cleanup |
| `plugins/mccp/scripts/hooks/cost-tracker.js` | UPDATE | inline `readHarnessCost`를 lib import로 대체(동작 byte-identical 리팩터) — transcript-sum fallback·`HARNESS_COST_MAX_AGE_SECONDS` 불변 |
| `plugins/mccp/scripts/hooks/ecc-statusline.js` | UPDATE | 렌더마다 `data.cost?.total_cost_usd` 존재 시 `writeHarnessCost` (격리 try/catch — statusline 출력 절대 안 막음). 번들 statusline writer 배선 |
| `plugins/mccp/scripts/hooks/tests/ecc-statusline.test.js` | CREATE | cost 존재 시 writer 호출 / 부재·손상 시 무호출·출력 불변 |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | **Axis A**: cost-state write 시 fresh harness cost를 `bridge.total_cost_usd`보다 우선(캐시 miss → bridge fallback). **Axis B**: 로컬 50/80/100 상수를 `getHandoffCostThresholds()`로 대체 — cost 경고 + `hardCeiling` 계산(L240) 양쪽 |
| `plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js` | UPDATE | Axis A(harness 우선 cost-state·경고) + Axis B(env override가 hard_ceiling trip point 이동, default 50/80/100 회귀) + F1 freshness guard(harness ts vs bridge.cost_sample_ts) + F2 exact-boundary |
| `plugins/mccp/scripts/hooks/ecc-metrics-bridge.js` | UPDATE | **Implement-Codex F1 흡수**: `total_cost_usd`가 **값 변경 시에만** numeric `cost_sample_ts`(epoch초, harness ts와 동일 단위) stamp. context-monitor freshness guard의 비교 기준(마지막 cost 변경 시각) — `last_timestamp`(매 PostToolUse ISO 활동시각)와 분리해 Axis A가 무력화되지 않게 함 |
| `plugins/mccp/scripts/hooks/tests/ecc-metrics-bridge.test.js` | CREATE | cost 값 변경 시 `cost_sample_ts` bump / 미변경 시 불변 / seed / 기존 bridge 필드 회귀 (신규 파일) |
| `docs/harness-cost-contract.md` | CREATE | 커스텀 statusline용 `harness-cost-<sid>.json` JSON 계약 + chaining 스니펫(opt-in, 비강제) + fallback=transcript-sum 명시 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.21.1 → 1.21.2` (단일 milestone patch, §3.7) |
| `CLAUDE.md` | UPDATE | §5 또는 §3.x에 `docs/harness-cost-contract.md` 1줄 포인터 + M2 outcome 반영 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | §3.7 footer version sync `v1.21.1 → v1.21.2` (page-foot) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | §3.7 footer version sync `v1.21.1 → v1.21.2` (derived 줄) |
| `CHANGELOG.md` | UPDATE | M2 row |
| `.claude/prds/cost-model-subscription.prd.md` | UPDATE | M2 row `pending → in-progress` + Plan cell(플랜 커맨드가 수행) |

## Tasks

### Task 1: harness-cost 공용 lib
- **Action**: `harness-cost.js` 작성 — dep-free(fs/os/path만). (a) `getHarnessCostPath(sessionId)`: `path.join(os.tmpdir(), 'harness-cost-'+sessionId+'.json')` (cost-tracker의 현 경로와 **동일 문자열**이어야 소비 호환). (b) `readHarnessCost(sessionId, maxAgeSeconds)`: cost-tracker.js:54 로직 그대로 이식 — `ts`/`cost_usd` finite 검증, `cost<0` reject, age 경계(`0 ≤ age ≤ maxAge`), miss/stale/parse-error → null(cost-tracker back-compat 위해 number 반환 유지). (c) `readHarnessCostMeta(sessionId, maxAgeSeconds)`: 동일 검증 후 `{cost_usd, ts}` 반환(부재/stale → null) — **F3 freshness guard**용 ts 노출(ecc-context-monitor가 `ts ≥ bridge.last_timestamp` 비교에 사용). (d) `writeHarnessCost(sessionId, costUsd)`: `{ts: floor(Date.now()/1000), cost_usd}` 를 pid+nonce tmp → atomic rename(writeWarnState mirror), 전 과정 격리 try/catch로 best-effort(throw 안 함, `{ok:bool}` 반환). sessionId falsy 또는 cost 비유한/음수 시 no-op.
- **Mirror**: `cost-tracker.js:54` (read) + `ecc-context-monitor.js:94` (atomic write)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/harness-cost.test.js`

### Task 2: harness-cost lib 테스트
- **Action**: round-trip(write→read 동일 cost) · 신선(age≤maxAge) pass / stale(age>maxAge) → null · corrupt JSON → null · 음수/비유한 cost → null(write는 no-op, read는 reject) · falsy sessionId → write no-op·read null · tmp 파일 leak 없음(성공 후 tmp 부재). FS는 `os.tmpdir()` 사용(테스트 격리 위해 유니크 sessionId).
- **Mirror**: `cost-thresholds.test.js` 구조
- **Validate**: 위 테스트 green

### Task 3: cost-tracker inline read 추출(동작 보존 리팩터)
- **Action**: `cost-tracker.js`의 inline `readHarnessCost`(L54-69) 제거하고 `require('../lib/harness-cost').readHarnessCost` 사용. `HARNESS_COST_MAX_AGE_SECONDS=300`·transcript-sum fallback·`estimatedCostUsd` 선택 로직(L179-182) **불변**. 순수 dedupe — 관측 동작 byte-identical.
- **Mirror**: 기존 cost-tracker 구조
- **Validate**: `node -e "require('./plugins/mccp/scripts/hooks/cost-tracker')"` (require 무결성) + harness-cost.test.js가 read 계약 커버

### Task 4: ecc-statusline harness-cost writer 배선
- **Action**: `runStatusline`의 `data` 파싱 직후, `sessionId` 확보 지점에서 `const hc = data.cost && data.cost.total_cost_usd;` 가 유한·≥0이면 `require('../lib/harness-cost').writeHarnessCost(sessionId, hc)` 호출. **별도 try/catch**로 감싸 write 실패가 statusline 출력(`process.stdout.write`)을 절대 안 막음. `data.cost` 부재(구 harness/일부 버전) 시 skip. context% bridge write와 독립.
- **Mirror**: `ecc-statusline.js:110` (best-effort bridge write 블록)
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/ecc-statusline.test.js`

### Task 5: ecc-statusline writer 테스트
- **Action**: `harness-cost.writeHarnessCost` spy(module singleton mutation, ecc-context-monitor.test 패턴). (a) `cost.total_cost_usd` 존재 → writeHarnessCost 1회 `(sessionId, cost)` 호출. (b) `data.cost` 부재 → 무호출. (c) writeHarnessCost throw 주입해도 statusline `process.stdout.write`(출력) 정상 — 격리 확증. (d) sessionId 부재 시 무호출. stdin async는 `runStatusline` 직접 호출 또는 export된 write-path 헬퍼로 검증(과한 refactor 회피 위해 필요 최소 export만 추가).
- **Mirror**: `ecc-context-monitor.test.js` (spy + 격리 회귀)
- **Validate**: 위 테스트 green

### Task 6: ecc-context-monitor — Axis A(harness 우선) + Axis B(threshold 통일, STATE.md 채널 포함)
- **Action**:
  - **Axis A + F3 freshness guard**: cost-current.json 쓰는 블록(L238-246)에서 harness cost를 우선하되 **stale-low 억제 방지 guard**를 건다. `const harness = require('../lib/harness-cost').readHarnessCost(sessionId, 300);` 계산 후, harness가 non-null **이고** harness 캐시의 `ts`가 `bridge.last_timestamp`(현재 활동 시각)보다 **older가 아닐 때만** 신뢰: harness 스냅샷이 bridge의 최신 활동보다 뒤처졌으면(비싼 작업 후 statusline 미렌더) 보수적으로 bridge cost fallback(fail-safe — 의심 시 게이트 보호 방향, auto-chain "의심 시 중단" 정합). 확정된 `cost`를 `writeStateMerged`·`hardCeiling` 계산·`evalBridge.total_cost_usd = cost`(경고도 실비 기준)·**STATE.md 채널**에 일관 사용. 캐시 miss → bridge fallback(회귀 0). 격리 try/catch 유지. (freshness 비교는 `readHarnessCost`가 age만 반환하므로, harness ts 노출용 얇은 `readHarnessCostMeta(sid,maxAge)→{cost,ts}|null` 추가하거나 read가 `{cost,ts}` 반환하도록 lib 시그니처 확장 — Task 1에 반영.)
  - **Axis B — 로컬 상수 제거 + 全 usage 라우팅(F2 흡수)**: 파일 상단 `COST_NOTICE_USD/COST_WARNING_USD/COST_CRITICAL_USD` 로컬 상수 3개 제거, `const { getHandoffCostThresholds } = require('../lib/cost-thresholds');` 도입. 상수 제거는 **모든 사용처**를 강제로 통일한다:
    1. `evaluateConditions` cost 블록: 진입 시 `const t = getHandoffCostThresholds();` per-call 읽어 `t.critical/t.warning/t.notice` 비교(cost-state.tierFor mirror — env override live).
    2. `run()`의 `hardCeiling = cost > getHandoffCostThresholds().critical`(L240).
    3. **STATE.md abort 채널(L264-283) — Codex F2**: `if (cost > COST_WARNING_USD)` → `if (cost > getHandoffCostThresholds().warning)`로 라우팅해 `session_end_imminent` flip이 env를 존중. `chain_aborted`는 이미 (2)의 `hardCeiling`을 재사용하므로 자동 통일. 이로써 `MCCP_HANDOFF_THRESHOLDS_USD` override가 cost-state tier·hard_ceiling·**auto-chain이 hard-abort로 소비하는 STATE.md `chain_aborted`/`session_end_imminent` 양 채널** 전부에 도달 → env 즉효완화(500/800/1000)가 절반만 먹던 leak 봉인.
  - **경계 명시(F2 잔여)**: *이미 set된* STATE.md `chain_aborted`/`session_end_imminent` 및 cost-state monotonic-MAX 잔존값의 **reset/decay는 M3(time-based decay)** 몫 — M2는 신규 flip이 올바른 임계를 쓰도록 만든다(신규 정확화). Risks·Acceptance에 경계 명시.
- **Mirror**: `cost-state.js:36` (`tierFor` per-call threshold 읽기) + `ecc-context-monitor.js:238` (격리 write 블록)
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js`

### Task 7: ecc-context-monitor 테스트 확장
- **Action**: 기존 파일에 추가 — **Axis A**: (a) fresh harness cache(ts ≥ bridge.last_timestamp) 존재 시 cost-state write·cost 경고가 harness 값 사용(bridge와 다른 값 주입해 확증), (b) 캐시 miss 시 bridge cost fallback(기존 동작 회귀), (c) **F3 stale-harness-vs-bridge**: harness fresh(age<300s)이나 ts < bridge.last_timestamp이고 값이 더 낮을 때 → bridge cost로 fallback(낮은 harness가 hard_ceiling/경고를 억제하지 않음). **Axis B**: (d) `MCCP_HANDOFF_THRESHOLDS_USD="500,800,1000"` 설정 시 cost=$150에서 `hardCeiling=false`·tier≠critical(현재 버그 재현→수정 확인), (e) **F2 STATE.md 채널**: 동일 env override 시 cost=$150에서 `stateWriter.update`가 `session_end_imminent`·`chain_aborted` **미flip**(stateWriter spy로 patch 검사) — env가 abort 채널까지 억제함을 증명; default 50/80/100에선 $150에서 양 flip 발생(회귀), (f) env 미설정 default에서 기존 경고 severity 불변(회귀). harness read + stateWriter.update spy로 FS 미오염.
- **Mirror**: `ecc-context-monitor.test.js`(module singleton spy) + `cost-thresholds.test.js`
- **Validate**: 위 테스트 green + 전체 스위트 회귀

### Task 8: 문서 + version bump
- **Action**: (a) `docs/harness-cost-contract.md` 작성 — `harness-cost-<sid>.json` 스키마(`{ts:epoch_s, cost_usd:number}`) + os.tmpdir() 경로 + 번들 statusline은 자동 writer, 커스텀 statusline(ccstatusline)은 opt-in chaining 스니펫(`node harness-cost-writer... | ccstatusline` 또는 statusline 내 3줄 write) + **비강제**·fallback=transcript-sum(회귀 0) 명시. OQ3 답변 anchor. (b) `plugin.json` `1.21.1 → 1.21.2`. (c) `CLAUDE.md` §5 참조 목록에 1줄 포인터 + (선택) §1.4 표 M2 row. (d) `CHANGELOG.md` M2 row.
- **Mirror**: 기존 docs 톤 + §3.7 version bump 체크리스트
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json')).version"` = `1.21.2`

## Validation

```bash
# 신규 + 수정 모듈 테스트
node --test plugins/mccp/scripts/lib/tests/harness-cost.test.js
node --test plugins/mccp/scripts/hooks/tests/ecc-statusline.test.js
node --test plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js
node --test plugins/mccp/scripts/lib/tests/cost-thresholds.test.js

# 회귀: cost/hook 관련 전체 스위트 green (종량제 경로 불변 확증)
node --test plugins/mccp/scripts/lib/tests/*.test.js
node --test plugins/mccp/scripts/hooks/tests/*.test.js

# require 무결성
node -e "['lib/harness-cost','hooks/cost-tracker','hooks/ecc-statusline','hooks/ecc-context-monitor','hooks/ecc-metrics-bridge'].forEach(m=>require('./plugins/mccp/scripts/'+m))"

# version 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Codex F1** — 커스텀 statusline 사용자는 번들 writer 미경유 → harness 캐시 공백 → *표시 추정*은 여전히 transcript-sum($314 급). "harness-accuracy 완료" 과잉 주장 위험 | 높음 | **역할 분리로 흡수**: Axis A(표시 추정 정확화)는 writer-active(번들/opt-in) 설치로 **acceptance scope 한정** — 커스텀 미wired는 complete로 주장 안 함. 그러나 그들의 실제 고통(게이트 오발화)은 **Axis B(statusline 독립)** 가 env 임계를 hard_ceiling·STATE.md abort 양 채널에 도달시켜 **writer 없이 즉시 unblock**. PRD Out-of-scope(writer 주입 강제 out) 준수. fallback=transcript-sum → 회귀 0 |
| harness cost 우선이 monotonic-MAX에 막혀 sticky $314 안 지워짐 | 확실 | M2는 **신규 추정 정확화**가 scope. sticky legacy 값 제거는 M3(time-based decay). 문서/Acceptance에 경계 명시. fresh cost-state(사용자 green 리셋 후)에선 harness 우선이 정확 유지 |
| `data.cost.total_cost_usd` 필드가 harness 버전마다 상이/부재 | 낮음 | `data.cost?.total_cost_usd` optional + finite 검증 후에만 write. 부재 시 skip(기존 statusline 동작 불변) |
| cost-tracker inline→lib 추출이 관측 동작 변경 | 낮음 | 순수 dedupe — 경로 문자열·age 경계·fallback 로직 불변. require 무결성 + harness-cost.test가 read 계약 커버 |
| `.claude/scripts/hooks/ecc-context-monitor.js`(레거시 ECC scatter, hooks.json 미등록)에 하드코딩 잔존 | 낮음 | 해당 파일은 **비활성**(plugin hooks.json이 `${CLAUDE_PLUGIN_ROOT}` 경로만 등록). M2 out-of-scope, cleanup 후보로 노트만 |
| ecc-context-monitor가 Axis A+B 동시 편집 → 두 관심사 교차 | 낮음 | 논리적 독립(cost 소스 선택 vs 임계 상수) — 같은 파일 두 블록, 순차 편집. 테스트 Task 7이 각 축 분리 검증 |
| **Codex F2** — Axis B가 STATE.md abort 채널(`session_end_imminent`/`chain_aborted`)을 놓쳐 env override가 절반만 먹음(auto-chain hard-abort 잔존) | 중간 | Task 6 Axis B가 로컬 상수 제거로 **모든 usage 강제 통일** — STATE.md L264 `cost > .warning` 라우팅 + `hardCeiling` 재사용. Task 7 (e)가 env override 시 양 flip 미발생 증명. *이미 set된* flag reset은 M3 decay 경계 |
| **Codex F3** — fresh-but-lower harness가 최신 spike의 hard_ceiling/경고를 억제(under-protection) | 낮음 | Task 6 freshness guard(`harness ts ≥ bridge.last_timestamp` 아니면 보수적 bridge fallback = fail-safe over-protect). Task 7 (c) 회귀 test. 흔한 경우(statusline 정상 렌더)엔 무영향 |

## Acceptance

- [ ] `harness-cost-<sid>.json`이 번들 statusline 렌더마다 stamp됨(best-effort, 실패가 출력 안 막음) + cost-tracker·ecc-context-monitor가 fresh(ts ≥ bridge.last_timestamp) 시 실비 우선
- [ ] **(Axis B, statusline 독립)** `MCCP_HANDOFF_THRESHOLDS_USD="500,800,1000"` 설정 시 cost=$150에서 `hard_ceiling_reached=false`·tier≠critical·**STATE.md `chain_aborted`/`session_end_imminent` 미flip**(Codex F2 — 3채널 전부 env 존중, 100 하드코딩 버그 수정 확인)
- [ ] **(Codex F3)** harness fresh-but-older(ts < bridge.last_timestamp)·lower일 때 bridge fallback → 낮은 harness가 hard_ceiling 억제 안 함
- [ ] env 미설정 시 50/80/100 default·기존 경고 severity·STATE.md flip 불변(종량제 회귀 0) + harness 캐시 부재 시 transcript-sum fallback으로 기존 cost-state 동작 보존
- [ ] **(Codex F1)** Success Metric "괴리 <20%"는 writer-active 설치로 scope 한정 — 커스텀 미wired 설치는 harness-accuracy complete로 주장 안 함(게이트 unblock은 Axis B로 완료). 커스텀 statusline 계약 문서화(opt-in·비강제·fallback 명시) — OQ3 답변
- [ ] All tasks complete · Validation passes · Patterns mirrored, not reinvented
- [ ] sticky legacy 값(cost-state monotonic-MAX + 이미 set된 STATE.md abort flag) 제거는 scope 밖(M3 time-based decay) — 문서에 경계 명시

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.15/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- 합치 결론: Codex verdict=`needs-attention`(HIGH 2 + MED 1). 3건 전부 R1 흡수(scope 정직화 + STATE.md 채널 라우팅 + freshness guard) → 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → 게이트 converge. auto-CRITICAL 없음.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 커스텀 statusline 사용자 표시 추정 미개선 → harness-accuracy 과잉 주장 | HIGH | ACCEPT_NOW (absorbed) | Summary에 Axis A/B 역할 분리 + Acceptance scope를 writer-active 설치로 정직 한정. 커스텀 사용자의 게이트 unblock은 Axis B(statusline 독립)가 완결 — PRD Out-of-scope(writer 강제 out) 준수하며 정직성 확보 |
  | F2 Axis B가 STATE.md abort 채널(`session_end_imminent`/`chain_aborted`) 미커버 → env override 절반만 먹음 | HIGH | ACCEPT_NOW (absorbed) | Task 6 Axis B가 로컬 상수 제거로 **모든 usage 통일** — STATE.md L264 `cost > .warning` 라우팅 + `hardCeiling` 재사용. Task 7 (e) env override 시 양 flip 미발생 test. 이미 set된 flag reset은 M3 decay 경계 |
  | F3 fresh-but-lower harness가 최신 spike hard_ceiling 억제 | MEDIUM | ACCEPT_NOW (absorbed) | Task 6 freshness guard(`harness ts ≥ bridge.last_timestamp` 아니면 보수적 bridge fallback=fail-safe) + `readHarnessCostMeta` ts 노출(Task 1). Task 7 (c) 회귀 test |
- Deferred to backlog: 0 (전건 흡수). 관련 기존 backlog anchor: cost-state monotonic-MAX sticky·이미 set된 STATE.md abort flag reset → M3 time-based decay
- Open Questions: 없음 (OQ3 harness 실비 접근 경로는 본 M2가 답 — statusLine이 유일 노출점, 번들 writer + opt-in 계약). auto-CRITICAL 없음.
- Codex session 참조: threadId `019f47d2-2808-7532-b2a2-5a8c93dae394`

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.15/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- 합치 결론: Codex verdict=`needs-attention`(HIGH 1 + MED 3). 4건 전부 R1 구현-시점 흡수(freshness guard 재설계 + comparator 통일 + statusline 렌더 소스 + 단일 validator) → 미해소 ACCEPT_NOW HIGH/CRITICAL 0 → 게이트 converge. auto-CRITICAL 없음.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 freshness guard가 활동시각(`bridge.last_timestamp`, ISO)에 keying → 타입 불일치 + harness 항상 older 판정 → Axis A 무력화 | HIGH | ACCEPT_NOW (absorbed) | plan의 `harness.ts >= bridge.last_timestamp` 폐기. `ecc-metrics-bridge.js`가 **cost 값 변경 시에만** numeric `cost_sample_ts`(epoch초) stamp, context-monitor는 `harnessMeta.ts >= bridge.cost_sample_ts`(동일 단위·정확한 비교)로 판정. Codex 권고 그대로 — cost-sample 시각 기준, 활동시각 아님. `ecc-metrics-bridge.js` Files to Change 추가(scope 확장 명시) |
  | F2 comparator 분기 — `tierFor`는 `>=`, plan은 warning/hardCeiling/STATE.md에 `cost > threshold` → 정확히 임계값에서 tier=critical인데 hard_ceiling/chain_aborted=false | MEDIUM | ACCEPT_NOW (absorbed) | 단일 comparator 계약 `>=`로 통일 — `evaluateConditions` cost 블록·`hardCeiling`·STATE.md 채널 전부 `getHandoffCostThresholds()` `>=` 비교(tierFor mirror). Task 7이 exact-boundary($50/$80/$100, $500/$800/$1000) test 추가 |
  | F3 번들 statusline이 harness 캐시에 write하지만 표시는 여전히 `bridge.total_cost_usd` 렌더 → 표시 정확도 미달 | MEDIUM | ACCEPT_NOW (absorbed) | `ecc-statusline.js` 렌더가 `data.cost.total_cost_usd`(harness 권위값, 이미 writer용으로 scope 내) 유한·≥0 시 표시 소스로 우선, 부재 시 bridge fallback(회귀 0). `extractHarnessCost`/`renderStatusline` export로 Task 5 test |
  | F4 dual read API에 강제된 단일 validator 없음 + meta shape `{cost_usd,ts}`↔`{cost,ts}` 혼용 | MEDIUM | ACCEPT_NOW (absorbed) | private `readHarnessCostRecord(sid,maxAge)→{cost_usd,ts}\|null`가 모든 검증(finite·음수·age 경계·future)의 단일 SoT. `readHarnessCost`(number)·`readHarnessCostMeta`({cost_usd,ts})는 얇은 adapter. shape는 `{cost_usd,ts}`로 **고정**. Task 2가 stale/future/corrupt/missing/negative parity test |
- Deferred to backlog: 0 (전건 흡수)
- Open Questions: 없음. auto-CRITICAL 없음(F1-F4는 correctness/consistency — security-boundary/atomic-state/schema-breakage 카탈로그 미해당).
- Codex session 참조: threadId `019f47df-b3fd-7cb2-97bc-869738a69569`
