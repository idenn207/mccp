# Plan: Cost Model — Subscription Opt-in Gate (M1)

**Source PRD**: `.claude/prds/cost-model-subscription.prd.md`
**Selected Milestone**: M1 — Subscription opt-in gate
**Complexity**: Large

## Summary

`MCCP_SUBSCRIPTION=1` opt-in flag를 도입해 5개 자동화 소비처(resolveFanout·resolveFleet·shouldSkipBriefing·auto-chain·auto-handoff)가 USD 비용 게이트를 우회하도록 만든다. 폭주 방지는 이미 harness가 매 PostToolUse마다 bridge에 채우는 `context_remaining_pct`(잔여 context%) + `tool_count`(툴 호출 수) 축으로 대체한다. flag 미설정 시 5개 소비처의 **판정(decision)은 오늘과 byte-identical** — 종량제 회귀 0. (단 Task 3 writer는 subscription 무관하게 best-effort로 context-current.json을 stamp하므로 종량제에도 1회 telemetry write가 추가된다 — Codex F3 수용. hot-hook 격리 try/catch + unset-path 회귀 테스트로 표면 관리.)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Env opt-in parse | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:66` (`parseParallelMode`) | `1|on` case-insensitive, default off, loud fail-open |
| Threshold SoT + env override | `plugins/mccp/scripts/lib/cost-thresholds.js:29` (`parseEnvOverride`) | 단일 모듈에 상수 + `MCCP_*` env override + invariant check + stderr warn + default |
| Injected read oracle | `plugins/mccp/scripts/lib/plan-fanout/budget.js:93` (`resolveFanout`) | `costStateRead` 주입 → 순수 unit-test; first-match-wins decision order + frozen REASONS |
| Default-read facade | `plugins/mccp/scripts/lib/briefing/cost-guard.js:67` (`shouldSkipBriefing`) | `opts.costStateRead \|\| costState.readState` — 프로덕션은 default read, 테스트는 주입 |
| Snapshot state file | `plugins/mccp/scripts/lib/cost-state.js:49` + `cost-state-path.js:15` | `getCostStateDir()` 공용 dir + atomic rename write + `isStale(maxAgeMs)` |
| Best-effort telemetry write | `plugins/mccp/scripts/hooks/ecc-context-monitor.js:238` | try/catch 감싼 `writeStateMerged` — hook 절대 block 안 함 |
| Tier machinery | `plugins/mccp/scripts/state/breakpoint-detector.js:64` (`detect`) | tier → shouldHandoff 판정 + injectable override + frozen REASONS |
| Test | `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js:1` | `node:test` + `assert/strict` + 주입된 read fn stub |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/subscription.js` | CREATE | 공용 oracle: `isSubscriptionMode` + `parseOverflowThresholds` + `evaluateOverflow` + frozen REASONS |
| `plugins/mccp/scripts/lib/tests/subscription.test.js` | CREATE | oracle 순수 로직 검증 |
| `plugins/mccp/scripts/lib/context-state.js` | CREATE | `context-current.json` snapshot read/write/stale (getCostStateDir 재사용, monotonic 없음 — latest-wins) |
| `plugins/mccp/scripts/lib/tests/context-state.test.js` | CREATE | read/write/stale round-trip + 손상 파일 → null |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | cost-current.json 쓰는 best-effort 블록에서 context-current.json도 stamp(`context_remaining_pct` + `tool_count`) |
| `plugins/mccp/scripts/lib/plan-fanout/budget.js` | UPDATE | `resolveFanout` subscription 분기 — USD tier 게이트 우회, overflow 축 대체 |
| `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js` | UPDATE | subscription on/off 경로 + 회귀 불변 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATE | `resolveFleet` subscription 분기 (merge-strategy·partition·budget 게이트는 불변) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | UPDATE | subscription 경로 테스트 |
| `plugins/mccp/scripts/lib/briefing/cost-guard.js` | UPDATE | `shouldSkipBriefing` subscription 분기 (env-off/codex-disabled/pr-phase는 불변) |
| `plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js` | UPDATE | subscription 경로 테스트 |
| `plugins/mccp/scripts/lib/auto-chain.js` | UPDATE | `shouldAbort`에서 cost-telemetry trigger를 context-overflow trigger로 대체(fail-safe 보수성 보존) |
| `plugins/mccp/scripts/lib/tests/auto-chain.test.js` | UPDATE | subscription overflow → abort / 신호 부재 → allow |
| `plugins/mccp/scripts/state/breakpoint-detector.js` | UPDATE | `detect` subscription 시 tier를 USD가 아니라 context overflow에서 파생 (auto-handoff 소비) |
| `plugins/mccp/scripts/state/tests/breakpoint-detector.test.js` | UPDATE | subscription tier 파생 + 신호 부재 conservative no-handoff |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 2.5.1 fanout node -e 블록에 `subscriptionMode` + `contextStateRead` 주입 |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3 resolveFleet 블록에 동일 주입 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | subscription 활성 시 1줄 confirm 배너(관측용, light) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.20.15 → 1.20.16` (단일 milestone patch, §3.7) |
| `CLAUDE.md` | UPDATE | §4 운영 토글에 `MCCP_SUBSCRIPTION` + overflow threshold env 추가 |
| `CHANGELOG.md` | UPDATE | M1 row |

## Tasks

### Task 1: subscription oracle 모듈
- **Action**: `subscription.js` 작성 — (a) `isSubscriptionMode(env)`: `MCCP_SUBSCRIPTION` `1|on` 파싱, default off. (b) `parseOverflowThresholds(env)`: `{ contextWarnPct:35, contextCriticalPct:25, toolWarn:0, toolCritical:0 }` default + `MCCP_SUBSCRIPTION_OVERFLOW_*` env override (loud fail-open, invariant `critical<warn`). context% 기본값은 `ecc-context-monitor.js`의 calibrated 잔여% 재사용. tool 축은 default 0=disabled(근거 없는 임계 날조 회피 — opt-in). (c) `evaluateOverflow({ contextRemainingPct, toolCount, thresholds })` → `{ tier:'green'|'warning'|'critical', overflow, reason }` 순수 함수. 신호 null/undefined → `{ tier:'green', overflow:false, reason:'signal-unknown' }`(fail-open). (d) frozen `REASONS`.
- **Mirror**: `cost-thresholds.js#parseEnvOverride` (env SoT) + `implement-dispatch/budget.js#parseParallelMode` (모드 파싱)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/subscription.test.js`

### Task 2: context-state snapshot 모듈
- **Action**: `context-state.js` 작성 — `getCostStateDir()`(cost-state-path.js) 재사용, filename `context-current.json`. `writeState({contextRemainingPct, toolCount})`: **`context_ts`(write epoch ms) stamp** + pid+nonce tmp → atomic rename. monotonic MAX 없음(context%는 감소·tool은 증가하는 latest snapshot)이되, **out-of-order clobber 방지**(Codex F2): 기존 파일의 `context_ts`보다 **older 샘플이면 write skip**(지연 도착한 stale-high 샘플이 최신 critical을 덮어써 소진 은폐하는 경로 차단). `readState()`: 파싱 실패/부재 → null(cost-state.readState mirror). `isStale(maxAgeMs)`: `context_ts` 우선, 부재 시 mtime fallback(cost-state.isStale mirror) — consumer가 freshness 판정 가능하도록 노출. 전면 fail-open 정책상 소비처는 absent/stale를 진행으로 취급하되(사용자 결정), out-of-order 방지는 writer 층에서 성립.
- **Mirror**: `cost-state.js` (read/isStale) + `ecc-context-monitor.js#writeWarnState` (pid+nonce atomic)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/context-state.test.js` (round-trip + 손상 파일 → null + **out-of-order older 샘플 reject** + isStale 케이스)

### Task 3: ecc-context-monitor writer 배선
- **Action**: cost-current.json 쓰는 `try/catch` 블록(L238) 안에서 `context-state.writeState({ contextRemainingPct: bridge.context_remaining_pct, toolCount: bridge.tool_count })` 추가. **별도 try/catch로 감싸** 실패가 cost write·hook 진행을 막지 않게 함(best-effort). subscription 여부와 무관하게 항상 stamp — 사용자가 세션 중 flag를 켤 때 신호가 이미 warm하도록. **Codex F3 수용**: 이는 종량제 사용자에게 판정 변화는 아니나 1회 telemetry write(disk I/O + 공용 cost-state dir의 신규 파일)를 추가하는 관측 가능한 side-effect다 — Acceptance의 "byte-identical"을 "판정 byte-identical + 1회 best-effort write"로 정직히 하향(아래 Acceptance). write 실패는 격리 try/catch로 hot-hook 진행 무영향.
- **Mirror**: `ecc-context-monitor.js:238` cost write 블록
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js` — (a) context-current.json 생성 확인, (b) **unset-path 회귀**(subscription 미설정 시 cost write·hook 반환이 불변 + context write 실패 주입해도 hook 진행), (c) `context_ts` monotonic-forward stamp 확인

### Task 4: resolveFanout subscription 분기
- **Action**: `resolveFanout`에 subscription 경로. opts에 `subscriptionMode`(bool) + `contextStateRead`(주입, dep-free 유지 — 기본 `()=>null`) 추가. `isSubscriptionMode`가 true면 decision order 3-4(cost-state unknown fail-closed + tier autoDisable) **전체를 건너뛰고** `evaluateOverflow` 실행: overflow critical → `skip(REASONS.SUBSCRIPTION_OVERFLOW)`; 아니면 run(fleetSize 4, tier=overflow.tier). minRemaining(토큰 예산)은 불변. **핵심 반전**: 신호 부재 시 fail-**open**(run) — 구독권의 목적이 unblock이고 폭주 방지는 positive critical 신호에서만 발화. 신규 REASON `SUBSCRIPTION_OVERFLOW`.
- **Mirror**: `plan-fanout/budget.js#resolveFanout` 기존 skip/run 구조
- **Validate**: `node --test plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js`

### Task 5: resolveFleet subscription 분기
- **Action**: `resolveFleet`에 동일 subscription 경로. **불변 게이트 보존**: order 1(opt-in)·2(merge-strategy 구조 게이트)·3(single-partition)·6(budget cap)은 USD가 아니므로 그대로. subscription이면 order 4-5(cost-state unknown + tier autoDisable)만 overflow 축으로 대체. overflow critical → `skip(SUBSCRIPTION_OVERFLOW)`; 아니면 N cap 진행. 신호 부재 → fail-open(진행).
- **Mirror**: Task 4 + `implement-dispatch/budget.js` merge-strategy 게이트 순서
- **Validate**: `node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js`

### Task 6: shouldSkipBriefing subscription 분기
- **Action**: `shouldSkipBriefing`에서 order 1-3(env-off/codex-disabled/pr-phase-locked)은 USD 아님 → 불변. subscription이면 order 4(tier autoDisable)를 overflow 축으로 대체: overflow critical → `{ skip:true, reason:SUBSCRIPTION_OVERFLOW }`; 아니면 `{ skip:false, OK_RUN }`. `contextStateRead`는 `|| context-state.readState` default(cost-guard가 이미 non-pure — 직접 require 허용).
- **Mirror**: `briefing/cost-guard.js#shouldSkipBriefing` decision order
- **Validate**: `node --test plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js`

### Task 7: auto-chain cost-telemetry → context-overflow trigger
- **Action**: `shouldAbort`의 order 7(cost telemetry)을 subscription 시 대체. `isSubscriptionMode`면 `checkCostTelemetry`(USD missing/stale/unreadable/hard_ceiling — sticky $314.50 문제의 근원) 대신 context overflow 평가: overflow critical이면 `reasons.push({trigger:'context-overflow', ...})`(fail-safe 보수성 = overflow → abort 보존). **다른 trigger 전부 불변**(kill-switch·receipt 검증·previous-step-failed·STATE.md chain_aborted). 신호 부재 → trigger 없음(allow). `--skip-cost` 플래그 의미도 유지.
- **Mirror**: `auto-chain.js#shouldAbort` order 7 구조
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js`

### Task 8: breakpoint-detector subscription tier 파생 (auto-handoff)
- **Action**: `detect`에 subscription 분기. `isSubscriptionMode`면 tier를 `cs.threshold_tier`(USD)가 아니라 context overflow에서 파생: overflow critical → 기존 `critical` 경로(HARD_CEILING_FORCE, unsafeCheckpoint) 재사용; overflow warning → 기존 `warning` soft AND-gate 경로 재사용; green → no handoff. 신호 부재/stale → conservative no-handoff(기존 COST_STATE_MISSING/STALE 동작 그대로 — 폭주 미검출 시 강제 handoff 안 함). auto-handoff.js는 detect 결과만 소비 → 수정 불필요.
- **Mirror**: `breakpoint-detector.js#detect` tier 분기 machinery
- **Validate**: `node --test plugins/mccp/scripts/state/tests/breakpoint-detector.test.js`

### Task 9: command body 배선 + SessionStart 배너
- **Action**: (a) `plan.md` Phase 2.5.1 fanout `node -e` 블록에서 `subscription` + `context-state` require해 `subscriptionMode` + `contextStateRead`를 `resolveFanout`에 주입. (b) `work.md` Step 3 resolveFleet 블록 동일. (c) `session-start.js`에 subscription 활성 시 `[mccp] subscription mode — USD cost gates bypassed (overflow axis: context%/tool)` 1줄 배너(관측용, PRD Risk mitigation). auto-detect는 PRD out-of-scope.
- **Mirror**: `plan.md` 2.5.1 FANOUT_JSON node -e 주입 관례
- **Validate**: `node -e "require('./plugins/mccp/scripts/lib/subscription'); require('./plugins/mccp/scripts/lib/context-state')"` (require 무결성) + 수동 dogfood

### Task 10: 문서 + version bump
- **Action**: (a) `plugin.json` `1.20.15 → 1.20.16`(단일 milestone patch; main이 #99로 1.21.0 이동 시 forward-reconcile per §3.7). (b) `CLAUDE.md` §4에 `MCCP_SUBSCRIPTION` + `MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT`/`_CRITICAL_PCT`/`_TOOL_WARN`/`_TOOL_CRITICAL` 토글 문서화. (c) `CHANGELOG.md` M1 row.
- **Mirror**: 기존 §4 토글 블록 서술 톤
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json'))"` (버전 확인)

## Validation

```bash
# 신규 + 수정 모듈 전체 테스트
node --test plugins/mccp/scripts/lib/tests/subscription.test.js
node --test plugins/mccp/scripts/lib/tests/context-state.test.js
node --test plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js
node --test plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js
node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js
node --test plugins/mccp/scripts/state/tests/breakpoint-detector.test.js
node --test plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js

# 회귀: 전체 스위트 green (종량제 경로 불변 확증)
node --test plugins/mccp/scripts/**/tests/*.test.js

# require 무결성
node -e "['subscription','context-state','plan-fanout/budget','implement-dispatch/budget','briefing/cost-guard','auto-chain'].forEach(m=>require('./plugins/mccp/scripts/lib/'+m))"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `context_remaining_pct`를 harness가 안 채워 null 상시 → overflow 축 무발화, 비싼 소비처(fanout/fleet)가 guard 없이 실행 (**Codex F1 HIGH**) | 중간 | **문서화된 수용 위험**(사용자 결정, 전면 fail-open): 신호 부재 = fail-open(unblock 최우선). 실질 노출은 bounded — fanout은 `MCCP_PLAN_FANOUT=on` 별도 opt-in, fleet은 `worktree-merge` gate로 현재 N=1 강제, 두 축 모두 추가 opt-in 없이는 병렬 실발화 안 함. auto-chain은 receipt/step/STATE.md chain_aborted 축으로 여전히 보수적. **신호 신뢰도 + calibrated 2차 임계는 M2 harness-cost 축**(backlog anchor). |
| stale/out-of-order context write가 최신 critical을 덮어써 소진 은폐 (**Codex F2 HIGH**) | 낮음 | writer가 `context_ts` older 샘플 reject(Task 2) → out-of-order clobber 차단. `isStale` consumer 노출. session sticky-critical flag는 M1 과함 → backlog defer |
| subscription 분기가 종량제 경로를 오염 | 낮음 | 모든 분기가 `isSubscriptionMode(env)` 게이트 뒤 — 미설정 시 byte-identical. consumer별 "unset → baseline 동일" 테스트 명시 |
| dep-free oracle(fanout/fleet)에 context read 주입으로 순수성 훼손 | 낮음 | command body의 `node -e`에서 require해 주입(기존 costStateRead 관례 mirror). 모듈 top-level require 추가 안 함 |
| overflow 임계(context 25/35%)가 폭주를 USD만큼 못 잡음 | 중간 | 보수적 잔여% 재사용(ecc-context-monitor calibrated) + env 튜너블 + auto-chain fail-safe(의심 시 중단)는 다른 축에서 보존 |
| tool_count 임계 미정 → 대체 축 약함 | 낮음 | MVP는 context%가 enforced primary, tool 축은 default-off env opt-in(날조 회피). 임계 calibration은 Open Question으로 이연 |

## Acceptance

- [ ] `MCCP_SUBSCRIPTION=1` 시 5개 소비처가 USD tier/cost-state 사유로 skip/abort하지 않음(dogfood — `$314.50` critical 잔존 상태에서 fanout/fleet/briefing run, auto-chain/handoff cost-trigger 무발화)
- [ ] context overflow critical(≤25% 잔여) positive 신호 주입 시 5개 소비처가 대체 축으로 폭주 방지 발화
- [ ] `MCCP_SUBSCRIPTION` 미설정 시 5개 소비처 **판정 byte-identical** + 기존 test 전량 green(종량제 회귀 0). context-current.json writer는 항상 1회 best-effort write(Codex F3 — 판정 무변, side-effect만) — unset-path 회귀 테스트로 hook 진행 불변 확증
- [ ] `context-current.json`이 매 PostToolUse에 stamp됨(best-effort, 실패가 cost write·hook 진행 안 막음)
- [ ] All tasks complete · Validation passes · Patterns mirrored, not reinvented

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.15/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- 합치 결론: Codex verdict=`needs-attention`(HIGH 2 + MED 1). 사용자 결정으로 F1(전면 fail-open) 수용, F2/F3는 plan 흡수 → 게이트 converge.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 subscription fail-open 시 비싼 소비처 runaway guard 0 | HIGH | ACCEPT_RISK (documented) | 사용자 결정 — 전면 fail-open 유지(unblock 최우선). 노출 bounded: fanout `MCCP_PLAN_FANOUT=on` 별도 opt-in + fleet `worktree-merge` gate로 N=1. 신호 검증 M2 harness-cost 축(backlog). |
  | F2 latest-wins 스냅샷이 최신 critical 은폐 | HIGH | ACCEPT_NOW (absorbed) | Task 2에 `context_ts` stamp + out-of-order older-샘플 reject 추가. session sticky-critical은 M1 과함 → backlog defer. |
  | F3 무조건 write가 byte-identical 위반 | MEDIUM | ACCEPT_NOW (absorbed) | Summary/Acceptance를 "판정 byte-identical + 1회 best-effort write"로 정직화 + Task 3 validate에 unset-path 회귀 테스트 추가. write는 격리 try/catch 유지. |
- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md` (F1 M2 신호검증·2차 임계 / F2 session sticky-critical)
- Open Questions: F1 잔여 위험 — MEDIUM (M2 harness-cost 축에서 fresh-context 요구 + calibrated 2차 임계 재기획). auto-CRITICAL 없음.
- Codex session 참조: threadId `019f46fc-754a-70c3-9b31-112f4c2c8775`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (동일 결정군: subscription oracle · context-state snapshot · 5 consumer 분기 · 전면 fail-open + F2 context_ts/F3 정직성 흡수). No new implement-time decisions detected — 아직 source 미구현이라 implement-time 파일 확장 없음. Cross-gate dedupe applied.
