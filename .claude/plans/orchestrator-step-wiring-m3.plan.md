# Plan: instrumentation-closeout (orchestrator-step-wiring M3)

**Source PRD**: `.claude/prds/orchestrator-step-wiring.prd.md`
**Selected Milestone**: M3 — instrumentation-closeout
**Complexity**: Medium

## Summary

M1은 A1의 집계 경계를 저장소 전체로 올렸고 M2는 halt 지점을 기록하게 만들었다. 둘 다
동작한다 — 그리고 둘 다 **자기가 고친 축 옆에 새 결함을 남겼다.** M3는 그 결함들만
닫는다: 계측이 스스로 만든 부채와 이 PRD 자신의 Open Questions다.

가장 무거운 하나는 시한폭탄이다. A1의 anti-gaming 가드가 `startupCount > 50`에서
발화하는데 그 판정에 쓰는 기준선 `_priorStartupCount`는 **저장소 전체에서 쓰는 곳이
0곳**이다(실측). M1이 집계 경계를 저장소 전체로 올리고 공유 위치에서 evict를 없앴으므로
분모는 단조 증가하고, 임계 통과는 확실하다. 오늘 23이다. **A1은 통계적으로 의미를 갖기
시작하는 바로 그 지점에서 `status:'invalid'`로 죽는다.**

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 PRD 관련 backlog · fix-task · open questions · 의도대로 동작하지 않는 기능의 최종 테스트와 수정을 진행한다 | direction |
| UI2 | PRD에 마일스톤을 추가한다 | direction |
| UI3 | 범위는 C2(M1·M2)가 도입한 결함과 이 PRD 자신의 Open Questions로 한정한다 | constraint |
| UI4 | 라운드 캡 pin · goal-detect 잔여 2축 · milestone-close 본문 결함 · pr.md 3.0/3.1 순서는 다루지 않는다 — 다른 축 소유다 | exclusion |
| UI5 | 이 계획의 plan 게이트가 라운드 소진으로 차단되면 우회하지 말고 받아들이되, 사유를 기록하고 감사된 우회로 진행한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 공유 위치 해소 | `plugins/mccp/scripts/derive/sources/session-activity.js:119-131` | reader는 `commonDirOf`를 직접 부르고 **토글을 읽지 않는다**. 해소 실패는 throw가 아니라 후보 미추가로 접는다 |
| 같은 규율의 두 번째 적용 | `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js:187-197` | 같은 판단을 이미 두 번째로 적용한 선례. 세 번째(`findings.js`)가 이 형태를 따른다 |
| 필드 좁히기 | `plugins/mccp/scripts/lib/work-orchestrator.js:400-405` | 배너로 나가는 **모든** 구성요소가 같은 `safeField`를 통과한다. 주석이 그 불변식을 명시한다 |
| 모르면 주장하지 않는다 | `plugins/mccp/scripts/lib/msw-metrics/index.js:140-152` | producer 부재는 `computed 0`이 아니라 `forward-only` + 사유 문자열. 기준선 부재도 같은 계열이다 |
| 명령 본문 정적 단언 | `plugins/mccp/scripts/lib/tests/work-command-body.test.js` | 배선을 산문이 아니라 정적 test로 고정. 표↔배선 양방향 + 분모 등식 |
| 토글 3상태 단언 | `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | 미설정/on/off를 각각 단언하고 fallback이 조용하지 않음을 고정 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | A1 spike 가드가 기준선 부재를 spike로 읽지 않게 한다 (Task 1) · A2 분자를 분모와 같은 모집단에서 뽑는다 (Task 4) |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | 공유 위치 이벤트가 `sessions` 맵과 `concurrent_pairs_count`를 만들지 않게 한다 (Task 5) |
| `plugins/mccp/scripts/derive/sources/findings.js` | UPDATE | `remediation_pr` 조인이 공유 corpus를 보게 한다 (Task 3) |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATE | `worktree=` 구성요소를 `safeField`에 통과시킨다 — 텍스트·JSON 양 경로 (Task 2) |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_MSW_EVENTS_SHARED`의 영속 사유를 note에 기록한다 (Task 6) |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | Task 1·4의 반증 test |
| `plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js` | UPDATE | Task 5의 B2 오염 반증 test |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | UPDATE | Task 2의 `worktree=` 좁히기 test (텍스트·JSON) |
| `plugins/mccp/scripts/lib/tests/msw-events-path.test.js` | UPDATE | Task 3의 findings 공유 조인 test |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | M3 행 추가 · Open Questions 1~5 확정 기록 (Task 7) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 해소된 stale 행 정리 · M3에서 닫은 행 표시 (Task 8) |

## Design Decisions

**DD1 — 기준선 부재는 spike의 증거가 아니다.** `startupCount > 50 && !_priorStartupCount`는
부호가 뒤집혀 있다. 기준선이 없다는 것은 "비교할 것이 없다 = 판정 불가"이지 "급증했다"가
아니다. 그런데 현재 코드는 정확히 기준선이 **없을 때** invalid를 낸다. 최소 수정은 임계를
올리거나 가드를 지우는 것이 아니라 **부호를 바로잡는 것**이다: 기준선이 있어야 spike를
주장하고, 없으면 주장하지 않는다. 가드를 삭제하지 않는 이유는 anti-gaming 축을 없애는 것이
정책 변경이기 때문이고, 임계를 올리지 않는 이유는 그것이 폭발 시점을 미룰 뿐 부호를 고치지
않기 때문이다.

**DD2 — 기준선 producer는 만들지 않는다.** 가드가 잠든 상태임을 정직하게 표기하되 기준선을
persist하는 경로는 이 milestone에서 만들지 않는다. 그것은 "직전 주기 대비"라는 새 시간축을
도입하는 일이고 A1 계약에 그 축이 없다. 잠든 가드는 `invalid`가 아니라 계측 결과 옆의
사유로 남는다 — `forward-only` 계열의 정직 표기(`index.js:140-152`)와 같은 형태다.

**DD3 — 공유 위치는 A1 축에만 기여한다. 그것을 reader에서 강제한다.** M1의 DD8은 격리를
*writer*와 *migration*에만 걸었고 reader에는 kind 가드가 없다. 그래서 오늘 공유 디렉토리의
어떤 kind든 `sessions[sessionId]` 엔트리를 만들고, 그 맵이 `concurrent_pairs_count`를 낳고,
그것이 **B2의 분모**다. 즉 DD8의 격리 주장은 소비처가 실재하는 상태로 거짓이다. M3는 그
주장을 참으로 만든다 — 공유 디렉토리에서 읽은 이벤트는 A1 축 집합(`startedWorkUnits` ·
`completedWorkUnits` · granularity 표식)에만 기여하고 세션 축에는 기여하지 않는다.

**DD4 — 좁히기는 열거가 아니라 경로다.** Task 2의 수정은 "`worktree`도 목록에 추가"가 아니라
**배너 줄을 조립하는 모든 값이 같은 함수를 지난다**는 형태여야 한다. 열거로 막으면 여섯 번째
구성요소가 생길 때 같은 결함이 되돌아온다(memory: assert-prohibitions-as-classes). test도
`worktree=`라는 이름이 아니라 *조립된 줄에 제어문자가 없다*를 단언한다.

**DD5 — 토글은 만기가 아니라 영속 사유를 갖는다.** 우산 규칙("만기 없는 신규 토글은
거부된다")의 목적은 임시 스위치가 영구 부채가 되는 것을 막는 것이다. `MCCP_MSW_EVENTS_SHARED`는
임시 스위치가 아니라 **되돌림 수단**이고, 되돌림 수단은 되돌릴 것이 존재하는 한 남아야 한다.
registry 행 포맷에 만기 열이 없으므로 새 열을 만들지 않고 note에 그 판정을 기록한다 — 열
추가는 registry 스키마 변경이라 env-contract 축 소유다.

**DD6 — 공유 corpus의 읽기 상한은 이 milestone에서 만들지 않는다.** backlog가 지적한
"동기 전량 스캔 소비처 중 상한을 갖는 것은 배너뿐"은 정확하지만, 상한을 도입하면 *어느
이벤트를 버릴지*를 정해야 하고 그것은 M1이 의도적으로 사람에게 남긴 판단이다(evict 제거).
오늘 corpus는 523 이벤트이고 100MB 경고선에서 세 자릿수 배 떨어져 있다. 관측 가능한 문제가
되기 전에 정책을 만드는 것은 §3.16과 반대다 — backlog에 근거와 함께 남긴다.

## Tasks

### Task 1: A1 spike 가드의 부호를 바로잡는다
- **Action**: `msw-metrics/index.js:113-115`의 `unitSpikeFlag` 조건에서 기준선 부재가
  invalid를 유발하지 못하게 한다. spike는 **기준선이 존재하고** 그에 비해 급증했을 때만
  주장한다. 기준선이 없으면 가드는 판정하지 않고, 그 사실이 관측 가능해야 한다 —
  A1 결과에 잠든 가드를 나타내는 사유 필드를 present-only로 싣는다.
- **Mirror**: `index.js:140-152` — producer 부재를 `computed 0`으로 위장하지 않고
  사유 문자열과 함께 표기하는 형태.
- **Validate**: `startupCount=51` · 기준선 부재 → `status='computed'`(오늘 `invalid`) ·
  `startupCount=51` · 기준선 10 → `status='invalid'` · `invalid_reason='unit_count_spike_suspected'`.
  두 단언이 짝으로 있어야 한다 — 앞만 있으면 가드를 지운 것과 구별되지 않는다.

### Task 2: 배너로 나가는 모든 값이 같은 좁히기를 지난다
- **Action**: `work-orchestrator.js`의 `formatHaltLine`(:415)과 JSON emit(:582) 양쪽에서
  `worktree` 구성요소를 `safeField`에 통과시킨다. `:400-405`의 주석이 선언한 불변식을
  코드가 실제로 만족하게 하고, 주석의 "네 필드"를 실제 구성요소 수로 정정한다.
- **Mirror**: 같은 파일 `:407-413`의 `parts` 조립 — 모든 값이 `safeField`를 지나는 형태.
- **Validate**: worktree 디렉토리 이름에 `\x1b]0;X\x07`를 심은 fixture로 텍스트 경로와
  JSON 경로 **양쪽**에서 raw ESC가 0건임을 단언. 단언 대상은 `worktree=`라는 이름이 아니라
  *조립된 출력 전체에 C0/C1 제어문자가 없다*(DD4).

### Task 3: `findings.js`가 다른 reader와 같은 방식으로 공유 corpus를 본다
- **Action**: `derive/sources/findings.js:37`의 직접 `path.join`을 `session-activity.js:119-131`과
  같은 형태로 바꾼다 — local + `commonDirOf(repoRoot)` 기반 공유 위치 둘 다 스캔, 토글 미읽기,
  해소 실패는 후보 미추가로 접기, `event_id` 기반 dedupe.
- **Mirror**: `m8-coverage-gate.js:187-197` — 이미 같은 판단을 내린 두 번째 선례.
- **Validate**: 공유 디렉토리에만 있는 `remediation_pr` 레코드가 finding 조인에 나타난다.
  토글 off에서도 나타난다(reader는 토글을 읽지 않는다).

### Task 4: A2의 분자와 분모가 같은 모집단을 읽는다
- **Action**: `msw-metrics/index.js` `computeA2`에서 `samples`를 `sessions`가 아니라
  Task 5a가 만든 `localSessions`에서 뽑는다. 오늘 무해한 이유(`context_remaining_pct`가
  로컬 `session_end`에서만 온다)는 **강제되지 않은 우연**이므로 코드로 고정한다.
- **Mirror**: 같은 함수 `:216-218`의 `localSessions` 해소 + `sessions_local` 부재 fallback.
- **Validate**: 공유 위치에서 온 외래 세션에 `context_remaining_pct`가 실린 fixture에서
  그 값이 분자에 들어가지 않는다. `sessions_local` 부재(구 소스) fallback은 오늘 동작 유지.

### Task 5: reader가 DD8의 격리 주장을 실제로 강제한다
- **Action**: `session-activity.js`의 per-line 루프에서 **공유 디렉토리 출처**
  (`dirIsShared`)인 이벤트가 `sessions[sessionId]` 엔트리를 만들지 않게 한다. 그 이벤트는
  A1 축 집합에만 기여한다. `observed_local` 표식은 이미 있으므로(`:211`) 그 옆에 엔트리
  **생성** 자체를 가르는 경계를 둔다.
- **Mirror**: 같은 파일 `:110-118`의 CL-5 back-compat 판단 — "남의 디렉토리를 스캔하는 것이
  정확히 방지 대상"이라는 같은 논리의 worktree 판.
- **Validate**: 공유 디렉토리에만 존재하는 외래 세션 2건이 있는 fixture에서
  `concurrent_pairs_count`가 그 둘로 인해 증가하지 않는다(= B2 분모 불변). 같은 fixture에서
  A1의 `task_startups_count`는 **그대로 증가한다** — 격리는 A1을 죽이지 않는다.

### Task 6: 토글의 영속 사유를 registry에 기록한다
- **Action**: `env-contract/registry.js:201`의 `MCCP_MSW_EVENTS_SHARED` 행 note에
  이것이 임시 스위치가 아니라 되돌림 수단이며 만기를 갖지 않는 근거를 적는다(DD5).
  registry 스키마(열)는 건드리지 않는다.
- **Mirror**: 같은 파일 `:205`의 `MCCP_HANDOFF_THRESHOLDS_USD` — 마지막 열에 판정 사유를
  적는 기존 형태.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` L1~L12 green 유지.

### Task 7: Open Questions 5건을 확정하고 PRD에 M3를 추가한다
- **Action**: PRD의 Open Questions 각 항목에 M1/M2가 실제로 내린 답을 근거와 함께 기록하고
  체크한다. `Delivery Milestones` 표에 M3 행을 추가한다(status `in-progress`, Plan 셀은
  이 파일 경로 — 2경로 백틱 표기는 M1·M2 행과 동일 형태).
  - OQ1 granularity → M1 DD3: `work_unit_kind` 표식 + PRD 단위 분모 제외. 레거시 착수는
    `unknown`으로 잔류하며 소급 부여하지 않는다(그 잔류가 backlog에 등재된 사실도 함께)
  - OQ2 집계 성립 방식 → M1 DD1: producer를 git common dir로 옮긴다(reader 순회 아님)
  - OQ3 삭제된 worktree 이벤트 → 공유 위치로 올라간 A1 축 이벤트는 worktree 삭제에
    영향받지 않는다. 나머지 축은 여전히 사라지며 그것을 받아들인다
  - OQ4 값이 읽히는 화면 → `/mccp:work` 진입 배너. `STATUS.md` 위치 결정은 하지 않는다
  - OQ5 라벨 정정 범위 → M1이 A1 라벨을 작업 단위로 정정. 다른 지표 전수 점검은 미실시
- **Validate**: `node plugins/mccp/scripts/lib/archive-complete/scan.js`가 이 PRD를
  파싱해 M3 행을 원시 행으로 인식하고 `archivable:false`(M3가 in-progress)를 낸다.
  `node plugins/mccp/scripts/lib/goal-detect.js`가 M3 행의 plan 경로를 해소한다.

### Task 8: 해소된 backlog 행을 정리한다
- **Action**: 실측으로 이미 닫힌 행에 해소 표시를 단다. 확인된 것 둘:
  (a) `meta-research.test.js:583` red — 실측 45/45 green,
  (b) m8-coverage-gate의 토글 의존 — `m8-coverage-gate.js:187-197`이 이미 토글을 읽지 않는다.
  M3가 닫는 행에도 같은 표시를 단다. **행을 삭제하지 않는다** — 이 원장은 append-only다.
- **Mirror**: backlog의 기존 해소 표기 관례를 따른다(신규 형식을 만들지 않는다).
- **Validate**: `node plugins/mccp/scripts/derive/sources/backlog.js`가 여전히 전 행을
  파싱한다(4열 고정 — 5번째 열은 기존 행 전부를 파서에서 사라지게 한다).

### Task 9: 라이브 `/mccp:work` 완주를 1회 관측한다
- **Action**: M2가 배선한 supersession(Step 3.verify · Phase 3의 `record-step`)이 실제
  체인 실행에서 발동하는 것을 관측한다. 오늘 `last-halt`는 2026-09-03 M1의 `3.preflight`
  halt를 재생 중이며, 그 배선은 test와 합성 실행으로만 검증됐다(STATE.md Open Question).
- **Mirror**: `work-command-body.test.js` 테스트 (i) — 배선의 존재는 이미 정적으로 고정돼
  있다. 이 Task가 더하는 것은 *발동*의 관측이다.
- **Validate**: 완주 전후로 `work-orchestrator.js last-halt --json`을 각각 실행해,
  전에는 M1 halt를 주장하고 후에는 주장하지 않는 것(또는 더 최신 halt를 주장하는 것)을
  기록한다. 관측 결과를 report에 원문으로 남긴다.

## Validation

```bash
# 1. 범위 내 test suite 전수 (baseline: 101 pass / 0 fail — 2026-09-04 실측)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/msw-metrics.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js \
  plugins/mccp/scripts/lib/tests/work-command-body.test.js \
  plugins/mccp/scripts/lib/tests/work-halt-record.test.js \
  plugins/mccp/scripts/lib/tests/work-orchestrator.test.js \
  plugins/mccp/scripts/lib/tests/msw-events-path.test.js

# 2. derive / state 회귀
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/derive/tests/*.test.js
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/state/tests/*.test.js

# 3. 지표 1 — 위치 독립성이 여전히 성립하는가 (M1의 핵심 acceptance 회귀)
#    세 위치에서 같은 A1이 나와야 한다.
for d in . ../../ /c/_project/mccp; do
  (cd "$d" 2>/dev/null && node plugins/mccp/scripts/derive/cli.js run --json 2>/dev/null \
     | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s).metrics.A1;console.log(process.argv[1],a.status,a.numerator+"/"+a.denominator)}catch(e){console.log(process.argv[1],"n/a")}})' "$d")
done

# 4. Task 1 — spike 가드가 시한폭탄이 아님을 확인
node -e '
  const m=require("./plugins/mccp/scripts/lib/msw-metrics");
  const mk=(n)=>({sources:{session_activity:{ok:true,task_startups_count:n,task_completions_count:1,
    startups_producer_present:true,completions_producer_present:true,sessions:[],sessions_local:[]}}});
  const r=m.computeMetrics(mk(51)).A1;
  console.log("startups=51 baseline-absent →", r.status, r.invalid_reason||"");
  if(r.status==="invalid") { console.error("FAIL: 기준선 부재가 여전히 invalid를 만든다"); process.exit(1); }
'

# 5. env-contract 계약 정합
node plugins/mccp/scripts/lib/env-contract/lint.js

# 6. PRD 파싱 — M3 행이 스캐너와 goal-detect 양쪽에 인식되는가
node plugins/mccp/scripts/lib/archive-complete/scan.js --json 2>/dev/null | head -20

# 7. 브랜치는 version을 선언하지 않는다 (우산 결정 1)
node scripts/version-declaration-guard.js

# 8. 삭제 검증 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 5의 reader 격리가 A1까지 죽인다 — 공유 위치가 A1의 유일한 corpus이므로 경계를 잘못 그으면 M1이 되돌아간다 | **중** | Validate가 **짝으로** 단언한다: B2 분모 불변 **그리고** A1 분모 증가. 앞만 단언하면 A1을 죽인 것과 구별되지 않는다 |
| Task 1이 가드를 사실상 삭제한 것이 된다 | 중 | 두 번째 단언(기준선 존재 시 spike 발화)이 없으면 Task 1은 미완이다. Validate 4는 첫 축만 보므로 test 쪽에 두 축을 모두 둔다 |
| M1·M2의 acceptance가 조용히 회귀한다 | 중 | Validation 3(위치 독립성)과 `work-command-body.test.js` 전건이 회귀 그물. 둘 다 M3가 건드리는 파일을 지난다 |
| 이 계획의 plan 게이트가 라운드 소진으로 차단된다 | **확실** | 실측 확인됨 — slug `orchestrator-step-wiring`에 panel 3라운드, 실효 cap 1. UI5대로 우회하지 않고 받아들이며 `## Gate Record`에 기록한다. 원인(캡 pin)은 UI4로 범위 밖 |
| backlog 정리가 행을 소실시킨다 | 낮음 | Task 8이 삭제를 금지하고 표시만 단다. Validate가 파서 전 행 인식을 확인 |
| Task 3의 findings 공유 스캔이 중복 계상한다 | 낮음 | `session-activity.js`의 `event_id` dedupe와 같은 형태를 쓴다. 순서 극성(첫 디렉토리 전건 수용)도 같이 따른다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] **A1 spike 가드**: `startupCount=51` · 기준선 부재에서 `status='computed'`이고,
      기준선 존재 시 급증에서는 `status='invalid'`다 — 두 단언이 모두 존재한다
- [ ] **reader 격리**: 공유 위치 외래 세션이 `concurrent_pairs_count`를 증가시키지 않으면서
      A1 `task_startups_count`는 증가시킨다 — 같은 fixture에서 두 단언
- [ ] **배너 좁히기**: 제어문자를 심은 worktree 이름이 텍스트·JSON 양 경로에서 raw로
      나오지 않는다
- [ ] **위치 독립성 회귀 없음**: 세 위치에서 같은 A1 값 (M1 acceptance 재확인)
- [ ] **PRD**: M3 행이 추가되고 Open Questions 5건이 근거와 함께 확정 기록됐다
- [ ] **라이브 관측**: `/mccp:work` 완주 1회 전후의 `last-halt` 출력이 report에 원문으로
      기록됐다 — 배선이 아니라 **발동**의 증거
- [ ] 브랜치가 `plugin.json` version을 선언하지 않는다 (우산 결정 1)
