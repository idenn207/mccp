# Plan Review Panel — orchestrator-step-wiring

**Plan**: `.claude/plans/orchestrator-step-wiring-m1.plan.md` · **Plan version**: `sha256:9082a26c74e86e26085cd88c33e0abf8dbe381f1e4be420be1a6091b01a6d8ba`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 9 blocking finding(s): architect/HIGH, architect/FAIL, security/HIGH, security/FAIL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD8's KIND boundary does NOT confine the blast radius to A1: the reader builds its `sessions` map from EVERY parsed event regardless of kind, so shared-location A1 events from other worktrees will create foreign session entries and inflate A2's denominator. The plan asserts the opposite — '`sessions`가 합쳐지지 않고', '이 한 조건이 B2·taxonomy·findings 축을 v1.33.6 동작에 고정한다' — and the PRD lists A2 as explicitly out of scope. | plugins/mccp/scripts/derive/sources/session-activity.js:154-164 creates `sessions[sessionId]` unconditionally for any event (including task_started/task_completed/task_ship_sealed), pushing it into `result.sessions` (:314). plugins/mccp/scripts/lib/msw-metrics/index.js:223 `denominator: sessions.length \|\| samples.length` and :237 `denominator: sessions.length \|\| null` — A2's denominator is exactly that array's length. Plan DD8 (line 278-280) claims B2 preservation via session_start/session_end locality, which is true for `concurrent_pairs_count` (span requires session_start, :250) but false for `sessions.length`. No task in the plan filters foreign sessions, and Task 8 asserts nothing about A2/`sessions`. |
| architect | MEDIUM | The consumer census in DD8 is incomplete: `m8-coverage-gate.js` reads the worktree-local events dir with a hardcoded path and requires `task_started` to be present there. Moving that kind to the shared location makes that gate's PRE verdict depend on migration leftovers, and structurally false on any fresh worktree. The file is absent from Files to Change and from every census in the plan. | plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js:164 `const eventsDir = path.join(repoRoot, '.claude','state','msw-events')` and :178 `const PRE = ['session_start','session_end','task_started']`, :192 `ok: preMissing.length === 0 && ...`. Plan DD8 enumerates only B2, taxonomy, and `derive/sources/findings.js:37` as other consumers (plan lines 281-283). |
| architect | LOW | Two of the plan's 'Patterns to Mirror' anchors cite line numbers that do not point at the cited code, and Task 2's anchor for `candidates` is likewise off — the mirror contract is stated against stale coordinates. | Plan line 129 cites `msw-events.js:246` for `discoverRepoRoot` (actual definition is :223; :246 is `appendEvent`). Plan line 130 cites `msw-events.js:265` for `resolveEventsDir` (actual :236). Plan line 131/368 cites `session-activity.js:87` for `candidates` (actual `candidates` is :103; :87 is the `canonical` helper). Plan line 132 cites `msw-events.js:56` for the allowlist (actual `ALLOWED_FIELDS` starts :55). |
| security | HIGH | DD8의 격리 주장이 거짓이다 — A1 축만 공유해도 `sessions` 맵은 여전히 전 worktree 것이 합쳐지고, 그 결과 A2의 분모가 다른 worktree 세션으로 오염된다. 계획은 이 소비처를 열거하지 않았고 범위 밖이라고 선언했다. | 계획 278행: "B2가 보존된다 — session_start/session_end가 worktree-local에 남으므로 `sessions`가 합쳐지지 않고". 그러나 `derive/sources/session-activity.js:154`는 kind와 무관하게 파싱된 **모든** 이벤트에 대해 `if (!sessions[sessionId]) sessions[sessionId] = {...}`를 실행하므로, 공유 디렉토리에 모인 타 worktree의 `task_started` 파일(파일명 = 그 세션 id)이 로컬 derive에서 새 세션 엔트리를 만든다. B2는 `spanOf`가 `session_start`를 요구해(`:250`) 실제로 무해하지만, A2는 `denominator: sessions.length`를 그대로 쓴다(`lib/msw-metrics/index.js:202,223,237`) — 분자(`context_remaining_pct` 표본)는 그대로인 채 분모만 부풀어 A2가 조용히 값이 바뀐다. PRD Out of scope는 "A2·A4·B2 등 다른 forward-only 지표"를 명시적으로 범위 밖으로 두었는데, 이 계획은 그 지표를 실제로 변경시킨다. 게다가 Task 8의 어떤 단언도 A2를 보지 않고 `msw-metrics-b2.test.js`류 fixture는 `.git`이 없어 공유 분기를 타지 않으므로(계획 270행 자인) 회귀는 green으로 통과한다. |
| security | LOW | 공유 위치에서 `evictLRU`를 호출하지 않기로 한 결정이 GLOBAL_MAX_BYTES 상한을 그 위치에 대해 완전히 무력화한다 — 전 worktree의 A1 이벤트가 한 디렉토리에 무제한 누적되며 강제 수단은 stderr 경고뿐이다. | 계획 Task 1: "**`appendEvent`가 공유 위치에 쓸 때는 `evictLRU`를 호출하지 않는다.** cap 초과는 loud stderr로만 알리고 삭제는 사람의 판단에 맡긴다". `msw-events.js:299`의 `evictLRU(eventsDir)`가 유일한 용량 강제 지점이고 계획은 대체 상한을 두지 않는다. 사람이 개입하지 않으면 git common dir 아래 `mccp/msw-events`가 무한 성장하며, 계획 어디에도 상한·알림 임계·정리 런북이 없다. |
| test | HIGH | DD8의 핵심 주장 "공유되는 것은 A1 축 이벤트뿐이고 B2·기타 소비처는 무변경"은 reader 쪽에서 거짓이며, 그 거짓을 잡을 test가 계획 어디에도 없다. reader는 kind 필터 없이 공유 디렉토리 전체를 스캔하고, `sessions[sessionId]` 엔트리는 **어떤 kind의 이벤트로도** 생성된다 — 공유 위치에 모인 타 worktree의 `task_started` 파일이 그대로 세션 엔트리가 된다. | plugins/mccp/scripts/derive/sources/session-activity.js:154-164 (`if (!sessions[sessionId]) { sessions[sessionId] = {...} }` — kind 무관 생성) · :314 `result.sessions = Object.values(sessions)`. 소비처: plugins/mccp/scripts/lib/msw-metrics/index.js:202,223,237 — A2의 `denominator: sessions.length`. 계획은 line 278에서 "`sessions`가 합쳐지지 않고"라 단언하지만, 합쳐지지 않는 것은 `concurrent_pairs_count`뿐이고(spanOf가 `session_start` 부재 시 null) 세션 배열 자체는 합쳐진다. Task 8(1)-(8) 어디에도 sessions/A2 축 단언이 없다. |
| test | HIGH | L2 R1이 낸 HIGH("부수 소비처 오염을 test가 못 잡는다")에 대한 처리가 test가 아니라 설계 주장으로만 닫혀 있다. 계획 스스로 기존 B2 suite가 구조적으로 green을 유지한다고 적었는데, 새 fixture(실제 `.git`을 갖는 Task 8 fixture)에서 B2/세션 축을 검증하는 항목을 추가하지 않았다 — 즉 DD8이 틀려도 붉어지는 test가 0건이다. | plan line 270: "`msw-metrics-b2.test.js`의 fixture는 `.git` 없는 tmpdir이라 DD7상 공유 분기를 타지 않는다. 프로덕션 동작이 바뀌어도 suite는 green을 유지한다" · Task 8 항목 (1)~(8)에 B2/`concurrent_pairs_count`/`sessions` 단언 부재 · Files to Change에 `msw-metrics-b2.test.js` 없음(plan:296-319), 그럼에도 Validation 1은 그 파일을 돌린다(plan:515). |
| test | MEDIUM | Task 4(producer allowlist)의 Validate가 어느 test 파일에도 착지하지 않는다. `work_unit_kind`가 allowlist에서 빠지면 `eventToJsonLine`이 조용히 버린다고 계획이 스스로 경고했는데, 그 단언을 담을 파일이 Files to Change에 없다(Task 8의 8개 항목에도 producer allowlist 항목 없음). | plan Task 4 "Validate: `eventToJsonLine`이 `work_unit_kind`를 보존하는지 단언" (plan:410-411) vs Files to Change(plan:296-319)에 `msw-events.test.js` 부재 · Task 8 항목 (1)~(8)에 해당 단언 없음. |
| test | LOW | Acceptance 3(`work_unit_kind_unknown_count`가 마이그레이션된 레거시 착수 수와 일치)이 Validation 블록의 어떤 명령으로도 관측되지 않는다 — `a1` CLI가 그 카운터를 출력한다는 규정이 Task 7에 없다. | plan:591-592 Acceptance 3 vs Validation 5(plan:542-548)는 `cli.js a1` 출력만 비교하고, Task 7 Action(plan:448-452)은 그 출력에 진단 카운터를 포함한다고 적지 않는다. |
| invariant | HIGH | DD2가 내세운 유일한 되돌림 수단(MCCP_MSW_EVENTS_SHARED)의 실효 단언이 구조적으로 vacuous하다 — Validation 7은 kind 없이 resolveEventsDir를 부르는데, Task 1의 KIND 경계상 kind가 A1 축 셋이 아니면(undefined 포함) 토글·공유 활성 여부와 무관하게 항상 worktree-local을 반환한다. 즉 토글이 아예 읽히지 않아도, 이름이 오타여도, 공유 분기가 통째로 깨져도 이 검사는 통과한다. 롤백이 test가 아니라 주장으로만 고정된다. | plan.md:558 `const p = m.resolveEventsDir({ repoRoot: process.cwd() });` + :560 worktree-local 정규식 단언 / plan.md:333-336 "그 값이 task_started/task_completed/task_ship_sealed 중 하나일 때**만** 공유 위치를 고려하고, 그 외에는 공유 활성 여부와 무관하게 <root>/.claude/state/msw-events를 낸다". 같은 함정이 기존 test에도 있다 — msw-events-path.test.js:51은 kind 없이 부르므로 plan이 Risk 표(:569)에서 '경로 불변 회귀 가드'로 인용한 그 단언 역시 공유 분기 붕괴를 탐지하지 못한다. |
| invariant | MEDIUM | 토글의 허용 값 집합이 계획 어디에도 고정돼 있지 않은데 열거 밖 값은 off로 접히므로, Task 8(8)의 롤백 단언은 '토글이 존중됐다'와 '값이 인식되지 않아 fallback했다'를 구분할 수 없다. 두 검증 지점이 서로 다른 문자열(`off` 대 `0`)을 쓰는 것 자체가 그 미정의를 드러낸다. | plan.md:346-348 "열거 밖 값이면 off로 접고 loud warn" · Task 8(8) plan.md:478 `MCCP_MSW_EVENTS_SHARED=off` · Validation 7 plan.md:555 `MCCP_MSW_EVENTS_SHARED=0` · Task 9 plan.md:490은 'bool · default on · off 값'이라고만 적고 값 열거가 없다. |
| invariant | MEDIUM | 토글 off 롤백은 '이전 동작 복원'이 아니라 M1이 없애려는 위치 의존성의 조용한 재도입이다 — producer만 토글을 읽고 reader는 읽지 않으므로(DD2), off 상태에서 발생한 A1 이벤트는 그 worktree의 di=0 후보에서만 보이고 다른 위치에서는 보이지 않는다. 읽는 쪽에는 어떤 경고 채널도 없어 지표 1이 다시 갈리는 것을 아무도 알 수 없다. DD2는 '이벤트 유실'만 논증하고 이 발산은 다루지 않는다. | plan.md:173-175 "읽는 쪽은 이 토글을 읽지 않는다 ... 무해하고" · session-activity.js:103-105의 candidates가 di=0에서 worktree-local을 전건 수용 · plan.md:568 Risk mitigation "토글로 즉시 복귀" |
| invariant | MEDIUM | DD6('computeA1 변경 0')이 집계 경계 상향과 상호작용하는 기존 anti-gaming 게이트를 검토하지 않았다. `startupCount > 50 && !model._priorStartupCount`이면 A1이 status:'invalid'로 접히는데, 저장소 전체 corpus 병합은 정확히 분모를 키우는 변경이다. Acceptance 2는 status가 `computed`일 것을 요구하면서 이 분기를 언급하지 않는다 — 방향은 안전(차단)하지만 완주 조건이 미검토 입력에 걸려 있다. | plugins/mccp/scripts/lib/msw-metrics/index.js:114-133 `const unitSpikeFlag = startupCount > 50 && !model._priorStartupCount ? 'unit_count_spike_suspected' : null;` → status 'invalid' / plan.md:589 "그 값의 status가 `computed`다" / plan.md:215-218 DD6 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified every load-bearing citation by opening the files: msw-events.js (`resolveEventsDir` :236, `discoverRepoRoot` :223, `evictLRU` call at :299, ALLOWED_FIELDS :55) and session-activity.js (`candidates` :103, `sessions` :117, `legacyKeyOf` :126, `isCrossLocation = di > 0` :130). Confirmed by grep that the appendEvent caller census (7 sites) and the two A1 producers passing explicit `repoRoot` (receipt-prompt.js:194, state/cli.js:445) are accurate, so DD7's CRITICAL-closure argument holds. Attacked DD7's derivation structure for a reachability or ancestor-walk hole — found none. Attacked the di>0 dedupe polarity and the migration's 2-stage legacy key against `legacyKeyOf` — consistent. Attacked DD6 (computeA1 untouched) against Task 5's numerator filter — the `num <= den` structural guarantee holds at index.js:172. Where the plan actually breaks is the isolation claim of DD8: I traced whether a KIND boundary at the writer really preserves non-A1 consumers at the reader, and it does not — the session map is kind-agnostic (A2 denominator), and the m8 coverage gate reads the local dir directly. Both are unfalsifiable by the planned test set because its fixtures deliberately avoid the shared branch. |
| security | fail | DD7의 walk-up 제거(`root/.git`만 검사)를 조상 저장소 해소 관점에서 공격했으나 실제로 조상 도달 경로가 닫히고 `.git` 없는 fixture는 경로 바이트 동일이라 결함을 찾지 못했다. Task 3 마이그레이션의 경로 컨테인먼트(`git worktree list` 보고 경로 + `commonDirOf` 동일성 + 디렉토리 실재 확인)도 traversal 입력을 만들어 보려 했으나 readdir 파일명이 경로를 벗어날 수 없고 session id는 `SESSION_ID_RE`로 이미 제약돼 구체적 결과에 도달하지 못했다. `work_unit_kind`는 값이 `prd\|milestone` 열거라 주입 표면이 아니고, 공유 위치는 `.git` 내부라 git-tracked 산출물로의 절대경로/cwd 누출(§3.12 선례) 재개도 성립하지 않는다. 토글 fail-closed(열거 밖 = off)와 마이그레이션 2단 dedupe도 반증 실패. 실제로 착지한 것은 KIND 경계가 지키지 못하는 소비처 하나(A2 분모, session-activity.js:154 ↔ msw-metrics/index.js:223)와 공유 위치의 용량 상한 부재다. |
| test | fail | plan/PRD 전문을 읽고 인용된 코드를 직접 대조했다. (a) `session-activity.js:87-152`의 candidates/dedupe 골격과 `isCrossLocation = di > 0`(:130), `legacyKeyOf`(:126) 인용은 정확했다 — Task 2의 di>0 배치 논거는 반증하지 못했다. (b) DD8의 B2 보존 주장을 `spanOf`(:249-262)로 검증했더니 pair-count는 실제로 보호되지만 `sessions` 배열과 A2 분모는 보호되지 않음을 확인했다(위 finding 1). (c) 기존 render test가 옛 A1 라벨을 pin하는지 grep했으나 fixture가 id만 넘기고 라벨은 `METRICS_META`에서 조회되므로(msw-metrics.js:444/469/530) Task 6은 건전 — bug-pinning 없음. (d) Validation의 절대 경로 `C:/_project/mccp/.worktrees/c3-ci-full-suite` 실재를 확인해 path realism 지적을 철회했다. (e) Task 8(4) 경로 불변 단언과 DD7의 fixture 무손상 논거는 코드상 성립해 반증 실패. |
| invariant | fail | DD7 파생 구조와 실제 resolveEventsDir(msw-events.js:236-243)·discoverRepoRoot(:223, `.claude` 앵커)를 대조해 조상 저장소 해소 경로가 실제로 닫히는지 확인(닫힘). appendEvent:299 무조건 evictLRU 호출과 Task 1의 no-evict locus 주장 검증(정확함). session-activity.js:128-153의 di>0 dedupe 극성과 Task 2의 후보 순서 주장 검증(정확함). Task 5의 분자 필터가 스캔 루프 순서에 의존해 위치 의존성을 재도입하는지 추적했으나 :231-242가 post-loop Set 연산이라 sealed_without_completion 선례대로 순서 무관 — 기각. resolveEventsDir의 전체 호출자를 grep해 kind 미전달 reader가 A1 corpus를 놓치는 경로가 있는지 확인(appendEvent와 test뿐 — 프로덕션 누락 없음). 남은 결함은 롤백/토글 축의 반증 불가 단언과 computeA1 상호작용이다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 317334,
  "halt_stage": null,
  "backlog_appended": 9,
  "backlog_skipped_nonblocking": 8,
  "granted": 4,
  "reviewed_plan_hash": "sha256:9082a26c74e86e26085cd88c33e0abf8dbe381f1e4be420be1a6091b01a6d8ba",
  "plan_path": ".claude/plans/orchestrator-step-wiring-m1.plan.md",
  "recorded_at": "2026-09-01T07:45:20.501Z"
}
```
