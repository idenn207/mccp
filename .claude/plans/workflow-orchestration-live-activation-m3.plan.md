# Plan: Workflow Orchestration Live Activation — M3 (발견 gap 보완: USD firing-block 은퇴)

**Source PRD**: `.claude/prds/workflow-orchestration-live-activation.prd.md`
**Selected Milestone**: M3 — 발견 gap 보완 (milestone 1·2 검증에서 드러난 발화 실패 지점 수정)
**Complexity**: Large (Codex R1 흡수로 catastrophic-USD 대체 backstop + 원자 reserve + auto-chain 일관화 추가)

## Summary

M2 firing-preview(read-only, LLM 0)를 실제 dogfood 환경에서 돌린 결과 **핵심 발화 실패 지점**이 표면화됐다: 정규 cost-state(`~/.claude/plugins/data/mccp/cost-current.json` = `hard_ceiling_reached:true, cost_usd:$186.92, tier:critical`, sticky)가 존재하는 한, M1이 default를 반전(fail-open)했어도 병렬·fan-out이 **전부 미발화**(`fleet.reason:hard-ceiling`, `effective_fire.parallel_fires:false`, 오직 `task_fires`). M1의 fail-open은 cost-state **부재**에서만 green을 가정하므로 **존재하는 critical**은 못 뚫고, v1.22.0 decay(6h)도 mtime이 fresh하면 미작동. 즉 PRD 근본 문제("shelf-ware가 발화조차 안 됨")가 M1·M2 이후에도 미해결이며, M2 live 관찰(row A/B)이 비어있는 것도 이 blocker 때문이다.

M3은 운영자 철학(비용<품질, cost gate는 환각 최소화 목적이지 절감 아님, catastrophic-runaway만 최후 안전판)과 PRD hypothesis를 **USD-blocking 표면 전반에 일관 관철**한다 — 단, Codex R1(No-ship, 2 HIGH + 2 MEDIUM)을 흡수해 "USD를 그냥 은퇴하고 agent-count cap에만 맡긴다"는 순진한 설계를 **다층 대체 backstop**으로 교체한다:

1. **operational USD tier(notice/warning/critical $100 + hard_ceiling)를 발화 blocker에서 은퇴** — `AUTODISABLE_TIERS_DEFAULT` `{critical}`→`{}`(empty), hard_ceiling도 default 미차단. → $186 firing이 열림(milestone 목표).
2. **대체 bomb detector = catastrophic-USD 상한 + 원자 agent-count cap 다층**(Codex F1): operational $100과 **분리된** 훨씬 높은 `MCCP_ORCHESTRATION_CATASTROPHIC_USD`(default 500, loud fail-open) — 진짜 폭주 비용은 여전히 차단하되 $186은 통과. agent-count cap은 **read-then-bump race를 원자 `reserveWorkers`(lock 하 check-and-bump)로 교체**(Codex F2 — cap이 유일 backstop이 되므로 TOCTOU 봉인) + 전 run 경로 적용(metered 포함). per-worker budget cap(`MCCP_WORK_PARALLEL_BUDGET`)이 per-agent 토큰을 3층째로 bound.
3. **auto-chain 일관화**(Codex F3): auto-chain `shouldAbort`의 hard_ceiling abort도 catastrophic-USD로 정렬 — firing은 auto-chain gate 이전에 발생하나, live 완주(commit→pr)까지 진짜 unblock하려면 같은 원칙이 필요. 그 외 abort trigger(missing/stale/unreadable/`chain_aborted`)는 불변.
4. **back-compat kill switch** `MCCP_ORCHESTRATION_USD_BOMB`(default off, 표준 `1|true|yes|on` — Codex F4): M1 USD bomb-detector(hard_ceiling skip + critical autoDisable + auto-chain hard_ceiling abort)를 전 표면에서 정확 복원.

수정 후 firing-preview가 sticky $186 상태에서도 `fleet.run:true`를 보이는지 **mechanical(LLM 0)로 검증**하고, live 완주 경로(catastrophic-USD 미도달 시 auto-chain 통과)를 관찰 기록에 남겨 M2 live 완주를 진짜 unblock한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Cost fail-open opt (kill switch) | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:148` `costFailOpen` opt | `usdBomb` opt도 동형 — caller가 env 파싱해 boolean 주입, 오라클 default는 새 동작(off) |
| Frozen default Set | `plan-fanout/budget.js:58` · `implement-dispatch/budget.js:79` `AUTODISABLE_TIERS_DEFAULT` | `Object.freeze(new Set([...]))`. `{critical}`→`{}` (default empty) + `usdBomb` on일 때만 `{critical}` |
| Loud fail-open env parse | `orchestration-runaway.js:46` `parseMaxAgents` | `parseUsdBomb(env)` 동형 — 비정상/미설정 → default(off), boolean 반환 |
| Runaway clamp 주입 적용 | `implement-dispatch/budget.js:231` (fail-open 전용) · `plan-fanout/budget.js:141` | `if (failOpen && ...)` → `if (...)` (전 run 경로). clamp는 N을 낮추기만(never raise), 이미 검증된 계약 |
| Command-body oracle forward | `work.md:196-202` · `plan.md:172-184` `costFailOpen`+`runawayClamp` closure | `usdBomb` forward 추가(동일 위치), 양성 발화 로그에 blocker 은퇴 반영 |
| Oracle 결정 트리 unit test | `plan-fanout/tests/budget.test.js` · `implement-dispatch/tests/budget.test.js` (M1) | hard_ceiling/critical → run(default) · usdBomb→skip(복원) · metered near-cap→degraded case |
| firing-preview 정합 (M2) | `plugins/mccp/scripts/lib/orchestration-preview.js` `previewFiring` | usdBomb opt forward + `oracle_run`/`effective_fire` 분리 불변 유지 |
| §3.7 patch bump + footer sync | `renderer/html.js:1417` · `markdown.js:154` · `i18n-surface.test.js:88/125` | `1.22.2`→`1.22.3` 4곳 동기 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATE | `resolveFleet`: hard_ceiling skip(199-202)을 `usdBomb` gate로(default 미차단), `AUTODISABLE_TIERS_DEFAULT`(79) `{critical}`→`{}`(usdBomb 시 `{critical}`), **catastrophic-USD gate 신설**(`cost_usd ≥ catastrophicUsd` → skip, F1 대체 bomb), runaway clamp(231) fail-open 전용→전 run 경로. 헤더 주석/결정 순서 갱신 |
| `plugins/mccp/scripts/lib/plan-fanout/budget.js` | UPDATE | `resolveFanout` 동형 미러: hard_ceiling(195-197)·autoDisable default(58)·catastrophic-USD gate·`run()` clamp(141) |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | UPDATE | `parseUsdBomb(env)`(표준 `1|true|yes|on` boolean + unknown-non-empty warn, F4) + `parseCatastrophicUsd(env)`(loud fail-open, default 500, F1) + **원자 `reserveWorkers({sessionId, requestedN, env})`**(lock 하 check-and-bump, lock 고갈 시 fail-safe degrade=1, F2) 신규 + export. `MCCP_ORCHESTRATION_*` env 일원 소유 |
| `plugins/mccp/scripts/lib/auto-chain.js` | UPDATE | **(Codex F3)** `checkCostTelemetry` hard_ceiling abort(102-103)를 catastrophic-USD abort로 정렬(`cost_usd ≥ catastrophicUsd` → abort) + `usdBomb` 시 hard_ceiling abort 복원. missing/stale/unreadable/subscription/`chain_aborted` trigger는 **불변** |
| `plugins/mccp/scripts/lib/tests/auto-chain.test.js` | UPDATE | **(Codex F3)** hard_ceiling@$186 → default abort 안 함(catastrophic 미만) · `cost_usd ≥ catastrophic` → abort · `usdBomb=1` → hard_ceiling abort 복원 · 그 외 trigger 회귀 green |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3 `resolveFleet` 호출에 `usdBomb`+`catastrophicUsd` forward, read-then-bump → **원자 `reserveWorkers`** 위임(F2). 양성 발화 로그를 "USD 비차단(operational)·catastrophic-USD/runaway backstop"로 갱신 |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 2.5.1 `resolveFanout` 호출에 `usdBomb`+`catastrophicUsd` forward + `reserveWorkers` 위임 + 로그/주석 갱신 |
| `plugins/mccp/scripts/lib/orchestration-preview.js` | UPDATE | preview가 `usdBomb`+`catastrophicUsd`를 env 파싱해 오라클에 forward(honest). runaway는 **read-only** clampForRunaway(reserveWorkers 아님 — 관측이 bump 금지). `oracle_run`/`effective_fire` 분리 불변 유지 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | UPDATE | default fire@hard_ceiling·default fire@$186 critical·`cost_usd ≥ catastrophic` skip·`usdBomb=1` 복원·metered near-cap degraded·env override(`=critical`) 재차단 case |
| `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js` | UPDATE | 동형 미러 case (catastrophic-USD 포함) |
| `plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js` | UPDATE | `parseUsdBomb`(1/true/yes/on→true, 0/off/unset→false, garbage→false+warn) + `parseCatastrophicUsd`(default 500, fail-open) + **원자 `reserveWorkers` 동시성 회귀**(F2 — 순차 reserve가 cap 초과 안 함, lock 고갈 fail-safe degrade) case |
| `plugins/mccp/scripts/lib/tests/orchestration-preview.test.js` | UPDATE | preview가 usdBomb+catastrophicUsd forward + `usdBomb=1`에서 sticky-critical 재skip, default에서 run 표면 + read-only 불변식(reserveWorkers 미호출, bump 0) case |
| `docs/workflow-orchestration/live-activation-observations.md` | UPDATE | `preview-ref` row 갱신(hard_ceiling 더 이상 전축 skip 아님) + M3 note(sticky $186 firing-open 확인). §4 caveat + **live-완주 경로**(Codex F3 — catastrophic-USD 미도달 시 auto-chain도 통과, 도달 시 `MCCP_AUTO_CHAIN_DISABLE=1` 또는 catastrophic 초과 상태 정직 기록) 명시 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.22.2`→`1.22.3` (단일 milestone = patch, §3.7) |
| `CHANGELOG.md` | UPDATE | `## [1.22.3]` row(USD firing-block 은퇴 + runaway-cap 전 경로 + usdBomb kill switch) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer version `v1.22.2`→`v1.22.3` (L1417) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer derived 줄 `v1.22.2`→`v1.22.3` (L154) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer assert `v1.22.2`→`v1.22.3` (L88/L125) |
| `CLAUDE.md` | UPDATE | §1.4 v1.22.3-m3 row + §4 신규 `MCCP_ORCHESTRATION_USD_BOMB`·autoDisable default 변경·runaway-cap 전 경로 문서화 + PRD Open Question 1/2/6 결정 기록 |
| `.claude/prds/workflow-orchestration-live-activation.prd.md` | UPDATE | (본 `/mccp:plan`이 이미 적용) M3 pending→in-progress + Plan cell |

## Tasks

### Task 1: `resolveFleet` — operational USD firing-block 은퇴 + catastrophic-USD gate + runaway clamp 전 경로 (implement-dispatch/budget.js)
- **Action**:
  - 새 opt `usdBomb`(default false — `opts.usdBomb === true`일 때만 M1 USD bomb-detector 유지), `catastrophicUsd`(number, caller 주입).
  - **hard_ceiling gate(199-202)**: `if (usdBomb && cs.hard_ceiling_reached === true) return skip(HARD_CEILING, ...)`. default(usdBomb=false)면 hard_ceiling은 발화를 안 막음.
  - **autoDisable default(79)**: `AUTODISABLE_TIERS_DEFAULT` `{critical}`→`{}`(빈 Set). 소비부(204)에서 `const dflt = usdBomb ? new Set(['critical']) : AUTODISABLE_TIERS_DEFAULT`. `MCCP_WORK_PARALLEL_AUTODISABLE_TIER` 명시 override는 항상 우선(`parseTierOverride(...) || dflt` 불변).
  - **catastrophic-USD gate 신설(Codex F1 대체 bomb detector)**: tier gate 뒤에 `if (Number.isFinite(cs.cost_usd) && catastrophicUsd > 0 && cs.cost_usd >= catastrophicUsd) return skip(CATASTROPHIC_USD, {tier})`. operational $100과 분리된 훨씬 높은 임계($500 default) — $186은 통과, 진짜 폭주 비용은 차단. `usdBomb` 무관 항상 유효(운영자가 catastrophic까지 끄려면 env로 큰 값 지정).
  - **runaway clamp(231)**: `if (failOpen && ...)` → `if (typeof opts.runawayClamp === 'function')` — 전 run 경로 적용(metered 포함). USD operational이 더 이상 안 막으므로 agent-count가 backstop. clamp는 N을 낮추기만(기존 계약 불변). caller가 주입하는 clamp는 Task 4의 **원자 `reserveWorkers`**(bump 포함).
  - REASONS에 `CATASTROPHIC_USD:'catastrophic-usd'` 추가(frozen). 헤더 주석(12-20, 42-45 결정 순서) 갱신. merge-strategy(163)·single-partition(166)·budget(221) gate **불변**.
- **Mirror**: `costFailOpen` opt 구조(148), frozen REASONS/default Set, clamp 주입 계약.
- **Validate**: `node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js`

### Task 2: `resolveFanout` — 동형 미러 (plan-fanout/budget.js)
- **Action**: Task 1과 동형 — `usdBomb`·`catastrophicUsd` opt, hard_ceiling(195-197) usdBomb-gate 화, `AUTODISABLE_TIERS_DEFAULT`(58) `{critical}`→`{}`(usdBomb 시 `{critical}`), catastrophic-USD gate 신설, `run()` helper의 clamp(141) `failOpen &&` 제거(전 run 경로), REASONS `CATASTROPHIC_USD`. subscription branch(167-178)·ENV_OFF·NOT_PRD_MODE gate **불변**.
- **Mirror**: `plan-fanout/budget.js` 자체 구조 + Task 1 변경.
- **Validate**: `node --test plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js`

### Task 3: orchestration-runaway.js — kill switch + catastrophic parse + 원자 reserve (Codex F1/F2/F4)
- **Action**:
  - `parseUsdBomb(env)` → boolean(Codex F4): `String(env[ENV_USD_BOMB]||'').trim().toLowerCase()` ∈ `{'1','true','yes','on'}`→true, `{'','0','off','false','no'}`→false, **그 외 non-empty→false + loud warn**(오타로 bomb 조용히 비활성 방지 — 이건 rollback path라 정직 warn 필수). `ENV_USD_BOMB='MCCP_ORCHESTRATION_USD_BOMB'`.
  - `parseCatastrophicUsd(env)` → positive number(Codex F1): `MCCP_ORCHESTRATION_CATASTROPHIC_USD`, default 500, `parseMaxAgents`(46) 동형 loud fail-open(비정상→default+warn).
  - **원자 `reserveWorkers({sessionId, requestedN, env, statePath?})`**(Codex F2) → `{granted, degraded, reason}`: lock 획득 후 **한 임계구역에서** `readCounter` → `launched+requestedN > maxAgents`면 `granted=1`(degraded), 아니면 `granted=requestedN` → **같은 lock 하에서 delta=granted bump** → release. read-then-bump TOCTOU 제거. lock 고갈 시 **fail-safe degrade**(`granted=1, degraded, reason='lock-exhausted'` — fail-open 아님: cap이 유일 backstop이므로 보수적 1). 기존 `clampForRunaway`(pure, no-bump)는 preview 전용으로 **보존**.
  - export 추가. `MCCP_ORCHESTRATION_*` env 일원 소유.
- **Mirror**: `acquireLock`/`releaseLock`(108-136) 임계구역, `bumpCounter`(144-172) atomic tmp+rename, `parseMaxAgents`(46) loud fail-open.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js`

### Task 4: command body forward + 원자 reserve 위임 (work.md, plan.md) — Codex F2
- **Action**:
  - `work.md` Step 3 oracle 블록(196-202): `usdBomb`+`catastrophicUsd` forward. **read-then-bump 폐기** — `runawayClamp` 주입을 `(n)=>runaway.reserveWorkers({sessionId, requestedN:n, env:process.env})`로 교체(오라클이 run 결정 시 원자 reserve+bump). 별도 post-dispatch `bumpCounter` 제거(reserve가 이미 bump). 양성/skip 로그를 "USD operational 비차단 · catastrophic-USD($..)/runaway-cap(N=granted) backstop"로 갱신.
  - `plan.md` Phase 2.5.1(172-184): 동형 — `usdBomb`+`catastrophicUsd` forward + `reserveWorkers` 위임.
  - 두 body의 tuning env 안내(§167/§225)에 `MCCP_ORCHESTRATION_USD_BOMB`·`MCCP_ORCHESTRATION_CATASTROPHIC_USD` 추가.
- **Mirror**: `costFailOpen`/`runawayClamp` forward 위치(196-202/172-184), 기존 발화 로그 톤.
- **Validate**: 오라클 결정은 Task 1/2 test, 원자 reserve는 Task 3 동시성 test가 커버(md bash는 forward만). 로그 문구는 Task 7 firing-preview + M2 live dogfood 관측.

### Task 5: auto-chain hard_ceiling → catastrophic-USD 정렬 (auto-chain.js) — Codex F3
- **Action**: `checkCostTelemetry`(89-104)의 `if (state.hard_ceiling_reached === true) return {ok:false, reason:'cost-hard-ceiling'}`(102-103)를 정렬: default(usdBomb off)면 hard_ceiling만으로 abort 안 하고 `if (Number.isFinite(state.cost_usd) && state.cost_usd >= catastrophicUsd) return {ok:false, reason:'cost-catastrophic'}`; `usdBomb=1`이면 기존 hard_ceiling abort 복원. missing(89-91)/stale(99-100)/unreadable(95-97)/subscription branch(171)/`chain_aborted`(121) trigger는 **불변**(telemetry-integrity·명시 abort는 USD와 무관). firing은 auto-chain gate 이전(plan-GROUND/implement Step 3)이지만 live 완주(commit→pr)까지 진짜 unblock하려면 같은 catastrophic-USD 원칙 필요.
- **Mirror**: `checkCostTelemetry` 구조, Task 3 `parseCatastrophicUsd`/`parseUsdBomb` 재사용, subscription branch가 이미 USD 우회하는 선례.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js`

### Task 6: firing-preview forward (orchestration-preview.js + test)
- **Action**: `previewFiring`가 `parseUsdBomb`+`parseCatastrophicUsd`를 `resolveFleet`/`resolveFanout` 양쪽에 forward(honest — work.md/plan.md 실발화와 정합). `env_summary`에 `usd_bomb`·`catastrophic_usd` 필드. **runaway는 read-only `clampForRunaway`(reserveWorkers 아님 — 관측이 bump 금지)** 유지. `oracle_run`/`effective_fire` 분리 불변(M2 Codex F1) 유지. test: (a) default+sticky-$186 → `fleet.run:true` reason `ok-run` + `parallel_fires`는 route 합성, (b) `cost_usd ≥ catastrophic` → `fleet.run:false` reason `catastrophic-usd`, (c) `usdBomb=1`+sticky-critical → `hard-ceiling` skip 복원, (d) 서브객체 == 직접 `resolveFleet`(usdBomb+catastrophicUsd) byte-정합, (e) read-only 불변식(runaway/cost-state/STATE.md 미변경 + `reserveWorkers`/`bumpCounter` 정적 부재).
- **Mirror**: M2 `orchestration-preview.js` oracle 조합 + `orchestration-preview.test.js` 정합/read-only 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js`

### Task 7: firing-open mechanical 검증 + 관찰 기록 갱신 (live-activation-observations.md) — Codex F3
- **Action**: 실 dogfood 환경(sticky $186 그대로)에서 `node plugins/mccp/scripts/lib/orchestration-preview.js --plan <plan> --prd --json` → M3 후 `fleet.run:true`(reason `ok-run`) 확인(수정 전 `hard-ceiling` 대비). `preview-ref` row 갱신 + M3 note(firing-open 획득). §4 caveat에 **live-완주 경로**(Codex F3 정직화): "M3 후 operational sticky cost-state는 firing·auto-chain을 안 막음(catastrophic-USD 미도달 시). $500+ catastrophic 상태거나 usdBomb=1이면 firing/chain 차단 — 그땐 catastrophic 초과 상태를 정직 기록하거나 `MCCP_AUTO_CHAIN_DISABLE=1`로 완주". claim은 **firing-open + catastrophic 미만 시 live-완주 가능**으로 정확화(over-claim 회피).
- **경계**: preview 실행 + doc 갱신까지. 실제 `/mccp:work` live 완주(M2 Task 5, prp-implement 밖·재귀 회피)는 operator 수동 — M3은 blocker 제거 + firing-open + live-완주 경로를 mechanical/문서로 입증.
- **Mirror**: M2 `live-activation-observations.md` §2 표/§4 caveat 톤.
- **Validate**: preview `--json` `.fleet.run===true` grep + doc `preview-ref`/M3 note/live-완주 경로 존재 grep.

### Task 8: version bump + footer sync + CHANGELOG
- **Action**: `plugin.json` `1.22.2`→`1.22.3`. footer `html.js:1417`·`markdown.js:154` + `i18n-surface.test.js:88/125` 4곳 동기(§3.7). `CHANGELOG.md` top `## [1.22.3]` row(operational USD firing-block 은퇴 + catastrophic-USD 대체 bomb + 원자 reserve + auto-chain 정렬 + usdBomb kill switch).
- **Mirror**: §3.7 patch bump + footer 동기, 기존 CHANGELOG row 포맷.
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"`→`1.22.3` + `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` green.

### Task 9: 문서화 (CLAUDE.md) + PRD status
- **Action**:
  - `CLAUDE.md` §1.4 표에 v1.22.3-m3 row(operational USD firing-block 은퇴 + catastrophic-USD 대체 bomb + 원자 reserve + auto-chain 정렬 + usdBomb kill switch). §4 운영 토글에 `MCCP_ORCHESTRATION_USD_BOMB`(default off, 표준 `1|true|yes|on`, M1 복원) + `MCCP_ORCHESTRATION_CATASTROPHIC_USD`(default 500) + `MCCP_PLAN_FANOUT_AUTODISABLE_TIER`/`MCCP_WORK_PARALLEL_AUTODISABLE_TIER` default `critical`→empty + runaway clamp가 metered 경로에도 원자 적용됨 명시.
  - PRD Open Question 결정 기록: **OQ1**(catastrophic-runaway 임계 = 원자 agent-count 절대 상한 + catastrophic-USD 다층; operational USD는 firing gate 아님), **OQ2**(default 반전 ↔ cost 축: firing/auto-chain은 catastrophic-USD/runaway/subscription-overflow만, briefing/handoff USD 축은 불변·독립), **OQ6**(opt-out: `PARALLEL=off/0` 단일 축, USD 복원은 별도 `USD_BOMB=1`).
  - PRD Delivery Milestones M3 pending→in-progress + Plan cell(본 plan 경로 — 이미 적용).
- **Mirror**: 기존 §4 토글 블록 톤, §1.4 표 행 포맷.
- **Validate**: grep으로 `MCCP_ORCHESTRATION_USD_BOMB`·`CATASTROPHIC_USD`·autoDisable default 변경·OQ 결정 문구 존재 확인.

## Validation

```bash
# oracle 결정 트리 — default fire@hard_ceiling/$186 + catastrophic-USD skip + usdBomb 복원 + metered clamp
node --test plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js
# parseUsdBomb/parseCatastrophicUsd + 원자 reserveWorkers 동시성 회귀
node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js
# auto-chain hard_ceiling → catastrophic-USD 정렬 (F3)
node --test plugins/mccp/scripts/lib/tests/auto-chain.test.js

# firing-preview 정합 + read-only + usdBomb/catastrophic forward
node --test plugins/mccp/scripts/lib/tests/orchestration-preview.test.js

# firing-open mechanical 검증 (sticky $186 상태 그대로, LLM 0) → .fleet.run===true
node plugins/mccp/scripts/lib/orchestration-preview.js --plan .claude/plans/workflow-orchestration-live-activation-m3.plan.md --prd --json

# 회귀 — M1/M2가 깐 발화·route·harness 표면 무손상
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/
node --test plugins/mccp/scripts/lib/plan-fanout/tests/

# version/footer drift
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.22.3
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| operational USD 은퇴가 진짜 비용 폭주 방치 (Codex F1) | 중간 | **다층 대체 backstop**: (1) catastrophic-USD 상한($500 default, operational과 분리) — 진짜 폭주 비용 차단, (2) 원자 agent-count 절대 상한($MCCP_ORCHESTRATION_MAX_AGENTS 24, 전 run 경로), (3) per-worker budget cap(`MCCP_WORK_PARALLEL_BUDGET`) per-agent 토큰. `USD_BOMB=1`로 M1 정확 복원 |
| 원자 아닌 runaway cap이 재진입/동시 dispatch에서 초과 (Codex F2) | 중간 | read-then-bump → **원자 `reserveWorkers`**(단일 lock 임계구역 check-and-bump). Task 3 동시성 회귀 test(순차 reserve가 cap 초과 안 함). lock 고갈 시 fail-safe degrade=1(fail-open 아님) |
| runaway clamp metered 확장이 기존 발화 회귀 | 중간 | clamp는 N을 낮추기만(never raise) — near-cap 아니면 no-op. Task 1/2 test가 metered near-cap degraded + far-from-cap no-op 양방 assert |
| autoDisable default empty가 다른 소비처(briefing/breakpoint) 오염 | 낮음 | `AUTODISABLE_TIERS_DEFAULT`는 각 budget 모듈 로컬 — briefing/breakpoint는 자체 tier gate. firing 오라클 2종 + auto-chain만 변경(export 심볼 불변, 소비처 격리) |
| firing-preview가 usdBomb/catastrophic 미forward로 실발화와 drift | 중간 | Task 6가 preview에 forward + 정합 test(preview 서브객체 == 직접 오라클 byte-정합)로 drift 구조 차단(M2 F1 계승). preview는 read-only clampForRunaway(reserveWorkers 아님) |
| live 완주가 auto-chain에서 여전히 stall (Codex F3) | 중간 | **흡수**: auto-chain hard_ceiling abort를 catastrophic-USD로 정렬 → operational sticky($186)에선 chain 통과. claim을 "firing-open + catastrophic 미만 시 live-완주 가능"으로 정직화. catastrophic 초과/usdBomb 시 `MCCP_AUTO_CHAIN_DISABLE=1` 경로 문서화 |
| footer/version drift(§3.7 상습 누락) | 중간 | Task 8이 footer×2 + i18n test 4곳 동기 + i18n-surface.test.js mechanical 검증 |
| dual-review·receipt chain 손상 | 낮음 | firing 오라클·auto-chain은 gate 값 조정만 — read-only fan-out + workflow-외곽 게이트 invariant·commit/PR 격리·cross-gate dedupe·receipt anchor 무변경 |

## Acceptance

- [ ] `resolveFleet`/`resolveFanout` default(usdBomb off)에서 `hard_ceiling_reached:true` + `cost_usd:$186`(critical) → `run:true`(발화), skip 아님. notice/warning도 run
- [ ] **catastrophic-USD gate (Codex F1)**: `cost_usd ≥ MCCP_ORCHESTRATION_CATASTROPHIC_USD`(default 500) → `skip(CATASTROPHIC_USD)`. $186은 통과, $500+는 차단
- [ ] `usdBomb=1`(kill switch) → M1 정확 복원: hard_ceiling skip(`HARD_CEILING`) + critical autoDisable(`TIER_CRITICAL`) — back-compat test green
- [ ] `MCCP_WORK_PARALLEL_AUTODISABLE_TIER=critical` 명시 override → usdBomb 무관 critical 재차단(override 우선 불변)
- [ ] **원자 `reserveWorkers` (Codex F2)**: 단일 lock check-and-bump로 순차 reserve가 cap 초과 안 함(동시성 회귀 green). lock 고갈 → fail-safe degrade=1. runaway clamp가 metered 경로에도 적용
- [ ] `parseUsdBomb` (Codex F4) — `1|true|yes|on`→true, `0|off|false|no|unset`→false, **unknown non-empty→false+loud warn**. `parseCatastrophicUsd` default 500 fail-open
- [ ] **auto-chain 정렬 (Codex F3)**: default에서 hard_ceiling@$186 → abort 안 함, `cost_usd ≥ catastrophic` → `cost-catastrophic` abort, `usdBomb=1` → hard_ceiling abort 복원. missing/stale/unreadable/chain_aborted trigger 회귀 green
- [ ] firing-preview `usdBomb`+`catastrophic` forward: default+sticky-$186→`fleet.run:true`(`ok-run`), `cost_usd≥catastrophic`→`catastrophic-usd`, `usdBomb=1`→`hard-ceiling` 복원. `oracle_run`/`effective_fire` 분리 불변(M2 F1). 서브객체 byte-정합 + read-only(reserveWorkers/bumpCounter 정적 부재) 회귀 green
- [ ] **mechanical firing-open 검증**: 실 dogfood 환경(sticky $186)에서 preview `.fleet.run===true` — M2 Task 5 unblock 근거
- [ ] `live-activation-observations.md` `preview-ref` row + M3 note + §4 **live-완주 경로**(Codex F3 정직화) 갱신
- [ ] `plugin.json` 1.22.3 + footer×2 + i18n test + CHANGELOG + CLAUDE.md §1.4/§4(신규 env·autoDisable default·원자 runaway·auto-chain 정렬·OQ1/2/6 결정) 동기
- [ ] M1/M2가 깐 발화·route·harness·firing-preview 표면 회귀 green
- [ ] dual-review·receipt chain 무손상(firing 오라클·auto-chain gate 값 조정만, workflow-외곽 invariant 불변)
- [ ] Patterns mirrored, not reinvented

## Design Critique

- 검출: `impeccable-detect --mode plan` → `SKILL_AVAIL=1 SIGNAL=1` (signal_files = `renderer/html.js`·`markdown.js`·`i18n-surface.test.js`).
- 판정: **false-positive** — 이 파일들의 변경은 footer version 문자열(`v1.22.2`→`v1.22.3`) 동기 + assert 갱신뿐이며, 새 rendered design surface(정보 위계·강조색·raw marker·list-of-N)를 만들거나 바꾸지 않는다. SKILL `## Output Constraints` 4축(heading depth ≤ 3 · accent ≤ 1/viewport · raw marker 금지 · list-of-N collapse) 모두 N/A.
- 라운드 수: 1
- verdict: **converged** (design 위반 0건 — CLI 오라클 + test + markdown 문서 + 버전 문자열).

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; class=ok, blocking=0) · `--impeccable-available`
- 라운드 수: 1 (findings 4건 전부 R1에서 ACCEPT_NOW 흡수 — 미해소 divergence 없음, cap=1 escalate 불필요)
- 합치 결론: Codex `needs-attention`(No-ship, 2 HIGH + 2 MEDIUM)을 R1에서 전부 plan 재설계로 흡수 → converged. 핵심은 "USD를 그냥 은퇴하고 agent-count cap에만 맡긴다"는 순진한 설계를 **다층 대체 backstop**(catastrophic-USD 상한 + 원자 reserve + per-worker budget)으로 교체하고, auto-chain까지 일관 정렬해 live 완주를 진짜 unblock한 것.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 agent-count cap만으론 bomb detector 불충분(per-agent 토큰 폭증·wall-clock 미bound + session-key 불안정 `session_id:"unknown"` 실측 → cap 리셋) | HIGH | ACCEPT_NOW | operational USD 완전 은퇴 대신 **catastrophic-USD 상한**($500 default, $100 critical과 분리 — 대체 bomb detector) 신설 + 원자 agent-count cap + per-worker budget 다층. $186은 통과, 진짜 폭주는 차단(Task 1/2/3) |
  | F2 runaway clamp가 read-then-bump 비원자 precheck — 재진입/동시 dispatch가 동일 pre-bump 값 관측 → cap 초과. bumpCounter도 lock 고갈 시 fail-open | HIGH | ACCEPT_NOW | 원자 `reserveWorkers`(단일 lock 임계구역 check-and-bump)로 교체 + lock 고갈 시 fail-safe degrade=1(fail-open 아님). 동시성 회귀 test(Task 3/4) |
  | F3 preview-only 검증이 live 완주를 unblock 못 함 — auto-chain이 hard_ceiling에서 commit→pr abort → firing green이어도 end-to-end stall | MEDIUM | ACCEPT_NOW | auto-chain hard_ceiling abort를 catastrophic-USD로 정렬(같은 원칙 일관 적용) → operational sticky($186)에서 chain 통과. claim을 "firing-open + catastrophic 미만 시 live-완주 가능"으로 정직화(Task 5/7) |
  | F4 `parseUsdBomb`이 `1|on`만 인식 — `true|yes|typo` non-empty가 조용히 fail-open(rollback path인데 bomb 비활성) | MEDIUM | ACCEPT_NOW | 표준 `1|true|yes|on` + unknown non-empty→false+**loud warn**(정직). orchestration-runaway test(Task 3) |
- Deferred to backlog: 0 (4건 전부 R1 흡수)
- Open Questions: none (findings 4건 전부 R1 흡수, auto-CRITICAL 카탈로그 해당 없음 — secret/data-loss/auth/crypto/migration/external 무관. catastrophic-USD·원자 reserve·auto-chain은 cost 안전 강화이지 destructive change 아님)
- Codex session 참조: threadId `019f6148-b722-7f40-a2c4-a876922f300a`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
