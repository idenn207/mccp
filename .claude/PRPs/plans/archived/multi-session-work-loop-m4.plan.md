# Plan: Multi-Session Work Loop — M4 (예산 감축)

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M4 — 예산 감축
**Complexity**: Large

> **범위 개정 (2026-08-09, 심층 분석 후 운영자 결정).** 초안은 A3 감축 + B3 토글 은퇴를 함께 담았다. GROUND 심화 결과 **B3 은퇴는 이번 주기에 실행 불가능**임이 확정돼 분모 정직화까지로 좁혔고, 측정 부채는 신설 **M8**이 소유한다. 근거는 아래 §B3 축. PRD Delivery Milestones·순서의 근거·B3 지표 행에 동일 개정이 기록됐다.

## Summary

M4는 작업이 시작되기 전에 이미 소진된 컨텍스트(A3)를 절반 이하로 줄이고, 토글 축(B3)의 **분모를 정직하게 만들어** 축 감축의 출발점을 확정한다. GROUND 결과 PRD가 적은 상황보다 나쁘다 — **두 축 모두 M1 측정 이후 역행했고, 두 축 모두 측정 기판이 작동하지 않는다.**

- **A3는 측정 기판이 죽어 있다.** `a3-instruction-cost.js`는 `python3` 스폰 + `pip show tiktoken`으로 토큰을 세는데, 운영자 머신에서 **실행하면 `baseline-unavailable`이 떨어진다**(실측: tiktoken 미설치, `python3`는 WindowsApps 스텁, 실제 인터프리터는 `python` = 3.13.3). 즉 "절반으로 줄인다"의 *전후 값을 만들 수단이 지금 없다*. 감축을 먼저 하면 그 성과는 영원히 검증 불가가 된다 → **Task 1이 blocker다.**
- **B3 producer는 아티팩트를 한 번도 남기지 못했다.** `session-start.js:733`이 `writeSnapshot(...)`을 `opts` 없이 호출해 `stateDir`이 **cwd 상대**로 해석되고 리더는 repoRoot 고정이다 — M3가 `msw-events`에 대해 닫은 **CL-5와 동일 결함**이며, 그 수정 주석이 같은 `try` 블록 **12줄 위**에 있고 바로 아래 호출만 누락됐다. 실측 `*.env-snapshot.json` **0건**(같은 블록의 msw-events는 1건). 따라서 M2가 "유일한 claimed-computable"이라 부른 B3는 빈 corpus 위에서 `{used:0, denominator:103, operation_branch_count:0, degraded:false}`를 반환한다.
- **두 축 모두 M1 측정 이후 역행했다.** CLAUDE.md 777줄/139,335B → **838줄/159,013B**(+14%), 런타임 토글 99 → **103**. baseline은 "M1이 적은 값"이 아니라 **M4 착수 시점에 다시 stamp한 값**이어야 한다.
- **PRD가 M4에 건 수용 조건이 현재 계산 불가능하다.** "감축 후 **B1·C1 회귀 검사** 통과"를 요구하는데, `computeB1`은 무조건 `insufficient`('independent evidence source unavailable'), C1은 `forward-only`(live findings source 미배선)다. **PRD 조항을 문자 그대로 충족할 수 없다** — 숨기고 "회귀 없음"을 선언하는 것이 M2가 이미 한 번 잡아낸 masquerade다.

따라서 M4는 (1) A3 측정 기판을 복구해 **재현 가능한 committed baseline 아티팩트**를 만들고, (2) 감축 전에 **최소 지시 계약**을 확정하고(PRD Open Question 직접 응답), (3) 감축이 *삭제가 아니라 이전*임을 **relocation ledger + reachability lint**로 기계 증명하고, (4) B3 **분모를 정직하게** 만든다(명명된 제외 분류표 + 동작 분기 수 계수 + producer clock-start). 실제 토글 은퇴는 하지 않는다.

**감축 표적은 이전만으로 목표를 넘긴다 (실측).** §1.4 milestone 이력 표 37,354B(23.5%) + §4 운영 토글 블록 44,458B(28.0%) = **51.4%**. 둘 다 지시가 아니라 **이력과 중복**이다(§4는 `docs/ENVIRONMENT.md`와 중복 — PRD Evidence가 지목한 그 중복). **§3의 행동 규칙은 한 줄도 건드리지 않는다.** 게다가 A3는 토큰 기준이고 한국어 밀집 §1.4는 코드 블록보다 바이트당 토큰이 높아 토큰 감축률은 51.4%보다 높게 나올 공산이 크다.

### 보증 범위 (이 표가 plan 전체의 단일 기준 — M3 G1~G3 선례)

M4가 보증하는 것은 정확히 셋이다. 이 목록 밖의 표현은 plan 어디에도 쓰지 않는다.

| # | 보증 | 메커니즘 |
|---|---|---|
| G1 | **A3 전후 값이 동일 방법으로 재현 가능하게 측정된다** | 인터프리터 probe 해결 + tokenizer 버전을 *tokenize하는 그 프로세스 안에서* 취득 + 3성분 sha256 pin → `a3-baseline.json` 커밋 아티팩트. tiktoken 부재 시 추정으로 대체하지 않고 loud `baseline-unavailable` 유지(M1 freeze: byte/4는 24% 오차라 금지) |
| G2 | **감축이 삭제가 아니라 이전임이 기계 검증된다** | relocation ledger(제거된 모든 절 → 목적지 파일 + anchor) + lint 4중 검사(목적지 존재 · anchor 존재 · CLAUDE.md 상주 포인터 존재 · 무목적지 소실 0) |
| G3 | **B3 분모가 정직해지고, 그 정직화가 감축으로 위장되지 않는다** | 제외는 **명명된 분류표에 이름을 적을 때만** 유효(measurement-design.md 규칙, 항목마다 file:line 근거) + **동작 분기 수 계수 구현**(현재 하드코딩 0) + 제외 전/후 분모를 **둘 다** 보고 + **은퇴 0건**임을 명시(감축 주장 금지) |

### 보증하지 **않는** 것 (명시 잔여 — 운영자 판단 필요)

> **G* 밖의 가장 큰 잔여: "LLM이 실제로 지시를 따르는가"를 M4는 측정하지 못한다.**
>
> PRD의 A3 방어 규칙은 B1·C1 회귀 검사를 요구하지만 둘 다 산출 불가다(위 실측). M4는 그 대신 **도달성·보존**만 기계 검증한다 — 즉 "옮긴 지시가 여전히 찾아갈 수 있고 아무 절도 조용히 사라지지 않았다"까지다. **"옮긴 뒤에도 준수율이 유지된다"는 미측정으로 남는다.**
>
> 이 간극은 문장 수정으로 닫히지 않는다. 선택지는 셋뿐이며 **운영자 결정 사항**이다:
> 1. **잔여 수용** — 도달성·보존만 검증하고 준수는 미측정으로 정직 기록(권고 · M2/M3 선례와 정합)
> 2. **M4 착수 보류** — B1/C1 producer가 생기는 M6/M7 이후로. 단 PRD 순서 근거("컨텍스트 예산은 M5~M7이 모두 소비하는 자원이라 먼저 회복하면 뒤가 쉬워진다")와 정면 충돌하고 교착을 만든다
> 3. **M4 안에서 최소 B1 producer 구축** — M6 범위 침범. 대형 코호트 완주 조건(아래)과 상충할 위험
>
> **본 plan은 1을 전제로 작성됐다.** 2·3을 택하면 Task 구성이 바뀐다.

### 대형 코호트 제약 (반증 조건 — 분할 금지)

M4는 [large-cohort-registry.md](../../docs/multi-session-work-loop/large-cohort-registry.md)가 지정한 **대형 작업 코호트**의 일원이다(M8 신설로 2 → 3, registry §4.2 PROVISIONAL). PRD 반증 조건상 이 milestone은 **사람의 수동 분할·재정의 없이** 착수부터 PR까지 완주해야 한다. 따라서:

- M4를 M4a/M4b로 쪼개는 것은 **가설 기각 사유**다. 범위가 크다는 이유로 분할하지 않는다.
- 범위를 줄여야 한다면 분할이 아니라 **목표 미달을 정직 보고**한다(예: "A3 42% 감축 — 목표 50% 미달").

**B3 은퇴 이연은 "분할"이 아닌가 (선제 답변).** 아니다. 분할은 *같은 작업 단위*를 여러 PR로 쪼개 완주율 분모를 늘리는 행위다. 여기서 일어난 것은 **작업 단위 하나가 실행 불가능한 전제 위에 서 있었음을 발견하고 그 전제를 소유할 별도 milestone(M8)을 신설한 것**이며, 그 결과 코호트는 줄지 않고 **늘었다**(registry §5가 금지하는 것은 축소·교체다). 은퇴분을 M4에 남겨두면 "이력 0 → 전량 은퇴 대상"이라는 무의미한 판정을 실행하게 되므로, 이연은 범위 회피가 아니라 **오작동 회피**다.

## GROUND — 조사 경로 (inline, fail-open)

Phase 2.5 Workflow fan-out 대신 **인라인 Pattern Grounding**으로 수행했다. 세션 지시가 workflow 사용을 명시 요청 시로 제한하며, command body는 fan-out을 GROUND *enhancement*(게이트 아님, fail-open)로 규정하므로 인라인 경로가 계약에 부합한다. M2·M3 plan이 같은 PRD에서 세운 선례를 따른다.

확정된 사실(전부 실행·실파일 대조):

**A3 축**

- `a3-instruction-cost.js:230`이 `spawn('python3', ...)`. 운영자 머신에서 `python3` → `/c/Users/.../WindowsApps/python3`(Store 스텁), 실 인터프리터는 `python` → `Python313/python` = 3.13.3. **인터프리터 하드코딩이 첫 결함.**
- `a3-instruction-cost.js:195`가 `execSync('pip show tiktoken')`으로 버전을 읽는다. 이는 **tokenize하는 인터프리터와 다른 pip을 볼 수 있어** "tokenizer pin으로 재현성 확보"라는 계약을 실제로는 보장하지 못한다. 두 번째 결함(현재는 tiktoken 자체가 없어 가려져 있다).
- 실행 결과: `{status:'baseline-unavailable', bytes:159013, tokens:null}`. **분자의 바이트는 나오지만 토큰이 안 나온다** — 그리고 measurement-design.md는 바이트 추정을 명시 금지했다.
- doc↔code 드리프트: `measurement-instrumentation.md:177`은 `MCCP_A3_INCLUDE_MEMORY=1`이라 적었으나 코드 상수는 `MCCP_A3_READ_USER_MEMORY`(`a3-instruction-cost.js:23`). 문서대로 하면 memory 성분이 영영 안 잡힌다.
- CLAUDE.md 절별 크기(코드펜스 미인식 근사): §1 46,427B(29.2%) · §3 54,848B(34.5%) · §4 51,376B(32.3%) = **96%가 세 절**. 감축 표적이 명확하다.
- `docs/ENVIRONMENT.md`가 이미 존재(326줄/22,575B, 토글 38개 문서화). CLAUDE.md §4는 그 위에 **중복**돼 있다 — PRD Evidence가 지목한 "별도 문서가 있는데도 지시문 안에 같은 내용이 중복"의 실체.

**B3 축**

- `toggle-snapshot.js#scanRuntimeSurface` 실행 결과 **103**(M1 스냅샷 99에서 +4). `TOGGLE_DEFAULTS`는 **56개**뿐 → **48개가 defaults 표 밖**이다. measurement-instrumentation.md가 backlog로 적어둔 "numerator는 defaults, denominator는 전수 스캔 → 과소계수"의 정확한 규모.
- 그 48개 중 상당수가 **토글이 아니다**(실측 확인):
  - **브라우저 전역** — `MCCP_RESOLVE_NONCE`·`MCCP_RESOLVE_PATH`·`MCCP_NONCE_HEADER`는 `window.__MCCP_*` JS 전역(`dashboard-server.js:184`, `renderer/client/resolve-action.js:5`). **환경변수가 아예 아니다.**
  - **동적 키 템플릿 접두** — `MCCP_MCP_RECONNECT_`는 `` `MCCP_MCP_RECONNECT_${serverName}` ``(`mcp-health-check.js:517`)의 접두사. 단일 토글 이름이 아니라 **패밀리**다. `MCCP_ORCHESTRATION_`도 같은 형태.
  - **테스트 전용** — `MCCP_LOCK_TEST_ARGV_TOKEN` · `MCCP_IMPECCABLE_CLI_MOCK` · `MCCP_STOP_LOOP_E2E` · `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`.
- **초안의 "하네스 내부 변수" 분류는 철회한다 (자체 정정).** 초안은 `MCCP_PLUGIN_ROOT`·`MCCP_SESSION_ID`·`MCCP_HOOK_ID`를 "운영자 축이 아닌 프로세스 간 전달값"으로 제외 후보에 넣었으나 **틀렸다**. 기계 분류 결과 셋 다 *set* **∧** *read* 양쪽이라(`bootstrap.js:68`이 set, `observe-runner.js:18`이 read) 운영자가 외부에서 override할 수 있다 — `MCCP_TMP`(셸 지역변수, read 없음)와 성격이 다르다. **정직한 제외는 9개뿐**(브라우저 전역 3 + 템플릿 접두 2 + 테스트 전용 4)이고, 실 토글은 **~94**다.
- **따라서 ≤40은 제외로 도달할 수 없다 — 은퇴 54개가 필요하다.** 그런데 은퇴 기준("non-default 사용 이력 0인 것만")의 입력이 없다(바로 아래).
- **B3 producer가 아티팩트를 한 번도 남기지 못했다 (이번 사이클 최대 발견).** `session-start.js:733` `toggleSnapshot.writeSnapshot(observerSessionId, snapshot)` — `opts` 미전달이라 `toggle-snapshot.js:189`의 `stateDir = opts.stateDir || path.join('.claude','state')`가 **cwd 상대**로 해석되고, 리더 `derive/sources/toggle-usage.js`는 repoRoot 고정 스캔이다. **M3가 `msw-events`에 대해 닫은 CL-5와 동일 결함**이며, 그 수정을 설명하는 주석이 같은 `try` 블록 **12줄 위**(`session-start.js:709-712`)에 있고 바로 아래 호출만 누락됐다. 실측: `*.env-snapshot.json`이 repo 전체·홈 어디에도 **0건**, 같은 블록의 msw-events는 **1건** 생성 → 블록은 실행되며 결함은 경로에 있다.
- **그 결과 은퇴 기준이 vacuous하다**: 사용 이력이 0건이면 **94개 전부가 "이력 0"**이라 기준이 아무것도 걸러내지 못한다. 사용 이력은 forward-only라 **작업이 아니라 경과 시간**을 요구한다 → **은퇴는 M8 이후 별도 주기로 이연**(운영자 결정 2026-08-09). "측정 없는 감축 금지"를 A3에 적용한 논리를 B3에 동일 적용한다.
- **반-조작 장치가 미구현이다**: `toggle-usage.js`의 `operation_branch_count`는 **하드코딩 0**이다. measurement-design.md가 "토글 수를 줄였다 ≠ 동작 분기를 줄였다"를 드러내라고 요구한 병기가 존재하지 않는다.
- B3 라이브 산출: `{ok:true, used_toggle_count:0, denominator:103, operation_branch_count:0, degraded:false}` — 빈 corpus 위에서 `degraded:false`. M2가 A1·A2·A4·B2를 강등시킨 confidently-wrong 패턴과 동형.
- **스캐너가 설계 규칙과 어긋난다**: measurement-design.md §B3은 "`*/tests/*` 경로와 **`*.test.js` 파일** 제외"라 규정하지만, `scanFilesRecursively`(L86-89)는 `tests`/`test` **디렉토리만** 거른다. 현재 `tests/` 밖 `.test.js`는 **0개**라 무해하나 **잠복 결함**이다.
- 문서화 커버리지: CLAUDE.md 57 · docs/ENVIRONMENT.md 38. 분모 103 대비 어느 쪽도 절반이 안 된다.

**수용 조건 축(가장 중요)**

- `msw-metrics/index.js:199-202` — `computeB1`은 무조건 `insufficientMetric(B1, 'independent evidence source unavailable')`를 반환한다. **B1은 오늘 계산되지 않는다.**
- `msw-metrics/index.js:326-345` — `computeC1`은 live source 부재 시 `forward-only`. instrumentation 문서도 "C1/C2/C3: No live findings/attribution source wired"로 확인.
- 즉 **PRD가 M4에 건 인정 조건의 입력이 존재하지 않는다.** 위 "보증하지 않는 것" 절이 이 사실에서 나왔다.

**패턴 선례**

- 정직 강등의 선례 = `msw-m2-measurement-honesty-downgrade.plan.md`(claimed-computable에서 제거하고 `forward-only`로 표기). M4의 "준수는 미측정" 처리는 이 선례를 따른다.
- 기계 lint의 선례 = `b2-coverage-gate.js`(정적 lint가 승인 helper 밖 write를 잡고, 실패하면 지표가 정직하게 강등된다). Task 3의 reachability lint는 이 구조를 mirror한다.
- 커밋 아티팩트로 baseline을 고정하는 선례 = `docs/multi-session-work-loop/evidence-snapshot.json`. Task 1의 `a3-baseline.json`이 같은 역할.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js` | `<지표>-<역할>.js` — 지표 ID를 파일명 선두에 |
| Errors | `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js:158-167` | 측정 불가는 조용한 0이 아니라 `status:'baseline-unavailable'` + loud stderr |
| Errors | `plugins/mccp/scripts/state/toggle-snapshot.js:94` | 스캔 실패는 fail-open(무시)하되 결과 수를 재검증으로 교차 확인 |
| Logging | `plugins/mccp/scripts/lib/msw-metrics/index.js:98` | 무결성 위반(`invalid`)을 producer 부재(`forward-only`)보다 **먼저** 판정 |
| Data access | `plugins/mccp/scripts/state/toggle-snapshot.js:187-214` | 원자적 tmp(pid+rand)+rename write, raw 값 절대 미영속 |
| Tests | `plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js` | `node --test`, producer별 1파일, 부재 경로를 명시 assert |

## Files to Change

> 경로는 **repo-root 상대 full 경로**다(CLAUDE.md §1.2 — plan 축약 경로는 cross-gate dedupe matcher를 불발시킨다).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js` | UPDATE | 인터프리터 probe 해결 · tokenizer 버전을 동일 프로세스에서 취득 · env flag 이름 정합 (G1) |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | CREATE | `a3 --emit` 서브커맨드 — baseline 아티팩트 생성 진입점 |
| `docs/multi-session-work-loop/a3-baseline.json` | CREATE | 재현 가능한 A3 전후 측정 아티팩트(counts + 성분 sha256 + tokenizer version) (G1) |
| `docs/multi-session-work-loop/instruction-contract.md` | CREATE | 최소 지시 계약 — RESIDENT/ON-DEMAND/RETIRE 분류와 그 기준. PRD Open Question 직접 응답 |
| `plugins/mccp/scripts/lib/instruction-contract/ledger.js` | CREATE | relocation ledger 스키마 + 순수 파서 (G2) |
| `plugins/mccp/scripts/lib/instruction-contract/lint.js` | CREATE | 4중 reachability 검사 — 목적지·anchor·상주 포인터·무목적지 소실 (G2) |
| `plugins/mccp/scripts/lib/tests/instruction-contract.test.js` | CREATE | ledger/lint 회귀 — 소실·깨진 anchor 부정 fixture 포함 |
| `CLAUDE.md` | UPDATE | 감축 실행 — §1.4 이력 · §3 런북 · §4 토글 프로즈 이전 |
| `docs/ENVIRONMENT.md` | UPDATE | CLAUDE.md §4 토글 상세 흡수(중복 해소, 이미 존재하는 목적지) |
| `docs/milestone-ledger.md` | CREATE | CLAUDE.md §1.4 per-milestone 이력 흡수(지시가 아니라 이력) |
| `plugins/mccp/scripts/state/toggle-snapshot.js` | UPDATE | 명명된 제외 분류표 · `*.test.js` 제외 · 상대 `stateDir` loud warn (G3) |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | `writeSnapshot`에 repoRoot 기반 `stateDir` 전달 — CL-5 동형 수정(Task 6 clock-start) |
| `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js` | UPDATE | 제외 분류 · 분모 재산출 · **호출부를 지나는** snapshot 생성 회귀 |
| `docs/multi-session-work-loop/measurement-design.md` | UPDATE | §B3 제외 목록은 **규범 문서**가 소유 — 코드가 아니라 여기에 이름을 적어야 유효 |
| `plugins/mccp/scripts/derive/sources/toggle-usage.js` | UPDATE | `operation_branch_count` 실제 구현(현재 하드코딩 0) + `raw_surface_count` 병기 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | `computeMetrics`가 `measureA3`를 실제 호출하도록 배선 — 현재 import·재export만 되고 미호출(critique F3) |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | `METRICS_ORDER`에 A3 추가 + **C2·C3 메타 오배정 정정**(현재 A3 정의가 C2·C3 슬롯 점유 — critique F1) + 병기 수치는 collapse 상세로 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.1` → `1.23.2` (§3.7 patch — 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer version 동기(L1419) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer version 동기(L163) |
| `CHANGELOG.md` | UPDATE | §3.7 릴리스 체크리스트 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M4 행 status + Open Question "최소 지시 계약" 체크 |

## Tasks

### Task 1: A3 측정 기판 복구 (BLOCKER — 감축 전 필수)

- **Action**:
  1. `a3-instruction-cost.js`의 `python3` 하드코딩을 **인터프리터 probe**로 교체 — `python3` → `python` → `py -3` 순으로 `-c "import sys;print(sys.version_info[0])"`를 실행해 **실제로 3.x를 출력하는 첫 인터프리터**를 채택(WindowsApps 스텁은 출력이 없거나 exit≠0이므로 자동 배제).
  2. `execSync('pip show tiktoken')` 제거. tokenizer 버전은 **tokenize를 수행하는 그 python 프로세스 안에서** `tiktoken.__version__`으로 취득해 결과 JSON에 함께 반환. (다른 pip을 보는 현재 구조는 "버전 pin으로 재현성 확보" 계약을 실제로는 못 지킨다.)
  3. env flag 이름을 코드 상수 `MCCP_A3_READ_USER_MEMORY`로 **canonical 고정**하고 `measurement-instrumentation.md:177`의 `MCCP_A3_INCLUDE_MEMORY` 오기를 정정.
  4. tiktoken 부재 시 동작 **불변** — loud `baseline-unavailable`. 바이트 추정 대체 금지(M1 freeze).
  5. `msw-metrics/cli.js`에 `a3 --emit <path>` 추가 → `a3-baseline.json` write(성분별 bytes·sha256·tokens, 총 tokens, denominator, tokenizer{tool,encoding,version}, 측정 시각, git HEAD).
- **Mirror**: `b2-coverage-gate.js`의 gate 산출 구조 · `evidence-snapshot.json`의 커밋 아티팩트 관례
- **Validate**:
  ```bash
  pip install tiktoken
  node plugins/mccp/scripts/lib/msw-metrics/cli.js a3 --emit docs/multi-session-work-loop/a3-baseline.json
  node -e "const b=require('./docs/multi-session-work-loop/a3-baseline.json');if(b.status!=='computed'||!b.numerator_tokens)throw new Error('baseline not computed');console.log('A3 baseline tokens:',b.numerator_tokens)"
  node --test plugins/mccp/scripts/lib/tests/a3-instruction-cost.test.js
  ```
- **완료 판정**: `status==='computed'` + `numerator_tokens` 정수 + tokenizer version이 **tokenize 프로세스 출처**. 이 값이 `before` 레코드로 pin된다.

> **Task 1이 실패하면(tiktoken 설치 불가 등) M4는 감축을 진행하지 않는다.** 측정 없는 감축은 검증 불가능한 주장이 되고, 그것이 PRD 신뢰 축이 지목한 문제 그 자체다.

### Task 2: 최소 지시 계약 확정 (감축 *전* — PRD 명시 순서)

- **Action**: `docs/multi-session-work-loop/instruction-contract.md` 작성. CLAUDE.md의 모든 절을 3분류하고 **분류 기준을 먼저 명문화**한다.
  - **RESIDENT**(상주 필수) 판정은 3중 AND: (a) 위반이 즉시·되돌리기 어려운 손해를 내고, (b) 이를 잡는 **코드 강제기가 없고**, (c) 요청 시 로드로는 이미 늦다(행동 직전에 알아야 함).
  - **ON-DEMAND**: 위 중 하나라도 불성립. 목적지 파일 + anchor를 지정한다.
  - **RETIRE**: 이력·중복 — 지시가 아닌 것.
  - 3분류 각각에 대해 **왜 그 분류인지 한 줄 근거**를 적는다(분류 자체가 사후 조정되는 것을 막는다).
- **선행 판정 예시**(GROUND 근거): §3.1 게이트 우회 금지 · §3.5.1 머지 삭제 검증(코드 강제기 없음 + 되돌리기 어려움) · §3.7 version bump = **RESIDENT** 후보. §1.4 milestone 이력 · §4 토글 상세(ENVIRONMENT.md와 중복) · §3.6 lock 내부 구조 = **ON-DEMAND/RETIRE** 후보.
- **Mirror**: `evidence-conflict-design.md`의 보증/잔여 분리 서술
- **Validate**: 계약 문서의 절 목록이 CLAUDE.md 실제 `##`/`###` 헤딩 집합을 **전수 커버**하는지 기계 대조(Task 3 lint의 검사 4가 이를 강제)

### Task 3: relocation ledger + reachability lint

- **Action**:
  1. `instruction-contract/ledger.js` — ledger 스키마(`{section_id, heading, disposition: resident|on-demand|retire, dest_file, dest_anchor, resident_pointer}`)와 순수 파서. `instruction-contract.md`의 표를 SoT로 읽는다(코드에 목록을 중복 정의하지 않는다).
  2. `instruction-contract/lint.js` — 4중 검사:
     - **C1 목적지 존재**: 모든 `on-demand` 항목의 `dest_file`이 실재
     - **C2 anchor 존재**: `dest_file` 안에 `dest_anchor` 헤딩이 실재
     - **C3 상주 포인터**: CLAUDE.md 안에 그 목적지로 가는 포인터가 실재(옮겼는데 찾아갈 길이 없으면 이전이 아니라 삭제다)
     - **C4 무목적지 소실 0**: 감축 전 헤딩 집합 − 감축 후 헤딩 집합 ⊆ ledger에 기재된 `on-demand`∪`retire`. **ledger에 없는 절이 사라지면 실패**
  3. 실패는 fail-closed(exit≠0). `b2-coverage-gate.js`처럼 lint 실패 시 감축 성과를 주장하지 않는다.
- **Mirror**: `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js`(정적 lint가 지표 승격의 사전 축)
- **Validate**:
  ```bash
  node --test plugins/mccp/scripts/lib/tests/instruction-contract.test.js
  node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
  ```
  부정 fixture 필수: (a) 목적지 파일 삭제 → C1 실패, (b) anchor 오타 → C2 실패, (c) 포인터 제거 → C3 실패, (d) ledger 미기재 절 삭제 → C4 실패

### Task 4: CLAUDE.md 감축 실행

- **Action**: Task 2 계약대로 이전한다. **순서는 이전 → 포인터 삽입 → 원문 제거**(역순이면 중간 상태에서 도달 불가 창이 생긴다).
  - §1.4 자동 게이트 레이어 per-milestone 표(37,354B · 23.5%) → `docs/milestone-ledger.md`. CLAUDE.md엔 모듈명·한 줄 역할 + 링크만 잔류.
  - §4 운영 토글 상세 산문(44,458B · 28.0%) → `docs/ENVIRONMENT.md`(이미 존재하는 목적지, 중복 해소). CLAUDE.md엔 "토글 SoT는 ENVIRONMENT.md" 포인터만.
  - **§3은 건드리지 않는다** (운영자 결정 2026-08-09). 위 둘만으로 51.4%라 목표를 넘기며, §3은 행동 규칙이 밀집한 유일한 절이다. 준수 회귀를 측정할 수단이 없는 상태(위 "보증하지 않는 것")에서 규칙 절을 옮기는 것은 검증 불가능한 위험을 지는 것이다. §3 런북 이전은 M8 이후 준수 측정이 가능해지면 재검토한다.
- **Mirror**: 기존 `docs/` 링크 관례(`[docs/gate-design.md](docs/gate-design.md)`)
- **Validate**:
  ```bash
  node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
  node plugins/mccp/scripts/lib/msw-metrics/cli.js a3 --emit /tmp/a3-after.json
  node -e "
  const b=require('./docs/multi-session-work-loop/a3-baseline.json'),a=require('/tmp/a3-after.json');
  const cut=1-a.numerator_tokens/b.numerator_tokens;
  console.log('A3 감축률',(cut*100).toFixed(1)+'%');
  if(a.status!=='computed')throw new Error('after 값 미산출 — 감축 주장 불가');
  "
  ```
- **완료 판정**: lint 통과 **AND** after 값이 `computed`. 감축률이 50% 미달이면 **목표 미달을 정직 보고**하고 분할하지 않는다(대형 코호트 제약).

### Task 5: B3 분모 정직화

- **Action**:
  1. `measurement-design.md` §B3의 "명시 제외 토큰" 목록을 **분류표로 확장**한다. 현재 `MCCP_TMP` 1건 → 4분류(브라우저 전역 · 동적 키 템플릿 접두 · 하네스 내부 컨텍스트 변수 · 테스트 전용). **각 항목에 이름과 실파일 근거(file:line)를 적는다** — 규칙상 "이름을 적을 때만 유효"하고 조용한 범위 축소는 금지다.
  2. `toggle-snapshot.js`를 설계 규칙에 정합화 — `*.test.js` 파일 제외 추가(현재 잠복 결함), 제외 분류표 적용.
  3. **동작 분기 수 계수 추가** — 토글별 분기 수(불리언 2, `MCCP_STOP_LOOP` 3 …)를 합산해 함께 출력. G3의 반-조작 장치.
  4. **제외 전/후 분모를 둘 다 출력**(`raw_surface_count` / `toggle_count`). 하나만 보고하면 제외가 곧 감축으로 오독된다.
  5. **`operation_branch_count`를 실제로 구현한다** — `toggle-usage.js`가 현재 **하드코딩 0**이라 measurement-design.md가 요구한 반-조작 병기가 존재하지 않는다. 토글별 분기 수(불리언 2 · `MCCP_STOP_LOOP` 3 …)를 합산한다.
  - `TOGGLE_DEFAULTS` ↔ 분모 정합(numerator 커버리지)은 **M8 소관**이다. numerator 작업이며 M4는 분모만 담당한다.
- **Mirror**: `toggle-snapshot.js`의 기존 `SECRET_NAME_RE` 명명 상수 패턴
- **Validate**:
  ```bash
  node plugins/mccp/scripts/state/toggle-snapshot.js --scan-denominator
  node -e "
  const s=require('./plugins/mccp/scripts/derive/sources/toggle-usage.js').scanToggleUsage(process.cwd());
  if(s.operation_branch_count===0)throw new Error('분기 수 미구현(하드코딩 0) — G3 반-조작 병기 부재');
  console.log('raw/toggle/branches:',s.raw_surface_count,s.denominator,s.operation_branch_count);
  "
  node --test plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js
  ```
- **완료 판정**: 제외 전/후 두 분모와 **0이 아닌** 분기 수가 출력된다. 제외 분류표의 모든 항목에 file:line 근거가 있다.

### Task 6: B3 producer clock-start hotfix (은퇴 아님)

> **은퇴는 하지 않는다.** 사용 이력 0건 상태에서 "이력 0인 것만 은퇴"를 적용하면 94개 전부가 대상이 되어 기준이 무의미하다(GROUND §B3). 은퇴는 M8이 producer를 고쳐 이력이 쌓인 뒤의 별도 주기 소관이다.

- **왜 이 한 줄만 M4가 가져가는가**: 사용 이력은 **경과 시간**을 요구하므로, 수정이 늦어질수록 M8이 쓸 corpus 축적 창이 그대로 사라진다. 수정은 1줄 + 회귀 test이고 M4가 이미 `toggle-snapshot.js`를 편집한다. **범위 확장이 아니라 M8을 위한 시계 시작**임을 명시한다.
- **Action**:
  1. `session-start.js:733`의 `writeSnapshot(observerSessionId, snapshot)` → `writeSnapshot(observerSessionId, snapshot, { stateDir: path.join(observerContext.projectRoot, '.claude', 'state') })`. 바로 위 msw-events의 CL-5 수정과 **동형**으로 맞춘다.
  2. `writeSnapshot`이 상대 `stateDir`을 받았을 때 loud warn하도록 보강 — 같은 결함이 조용히 재발하지 않게 한다.
  3. 회귀 test: 임시 repoRoot에서 hook을 돌려 `<repoRoot>/.claude/state/<sid>.env-snapshot.json`이 **실제로 생성되는지** assert. 기존 test는 `writeSnapshot`을 직접 호출해 통과했으므로 **호출부 결함을 잡지 못했다** — test가 버그를 정답으로 고정한 사례이며, 이번 test는 호출부를 지난다.
- **Mirror**: `session-start.js:709-712`의 CL-5 주석 + `{ repoRoot: observerContext.projectRoot }` 전달 형태
- **Validate**:
  ```bash
  node --test plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js
  # 다음 세션 시작 후:
  ls .claude/state/*.env-snapshot.json   # 최소 1건 — 현재 0건
  ```
- **완료 판정**: 새 세션 1회 후 repoRoot 아래 snapshot이 실제로 존재한다. **은퇴 0건**을 보고서에 명시한다.

### Task 7: 파생·대시보드 표면 (design-critique R0 흡수)

- **Action**:
  1. **A3를 지표 모델에 배선한다** (critique F1·F3). 현재 `measureA3`는 `msw-metrics/index.js:413,429`에서 **import·재export만 되고 `computeMetrics`가 호출하지 않는다** — 호출처는 `derive/cli.js:330-333`뿐이라 렌더러가 소비하는 모델에 A3가 없다. `METRICS_ORDER`(현재 `['A1','A2','A4','B1','B2','B3','C1']`)에 `A3`를 추가하고 `METRICS_META.A3`를 신설한다. 렌더러만 고치면 빈 행이 된다.
  2. **C2·C3 메타 라벨 오배정을 정정한다** (critique F1, HIGH). 현재 `METRICS_META.C2`는 `{name:'주입 명령어 비용', desc:'모델 컨텍스트 사용률'}`이고 `METRICS_META.C3`는 `{name:'A3 토큰 예약'}`이다 — **둘 다 A3의 정의**가 C2·C3 슬롯에 들어가 있다. measurement-design.md는 C2=게이트 헛발화율 · C3=누출 결함율로 규정하고, 둘은 **관측 전용이며 라벨 프로토콜 확립 전 의사결정 사용 금지**다. M4가 A3를 `computed`로 만들면 이 오배정 탓에 대시보드가 "게이트 헛발화율 = 산출됨"으로 표시하게 되어, PRD가 금지한 바로 그 판단 근거를 만들어낸다. C2·C3 메타를 PRD 정의로 교정하고 `type:'forward-only'`는 유지한다.
  3. `toggle-usage.js`의 numerator/denominator 정렬(Task 5 결과 소비).
  4. **값 셀은 단일 수치를 유지한다** (critique F2 — M3 F3 선례 재적용). A3 전후 2값 · B3 제외 전/후 2값 · 분기 수를 한 행에 늘어놓으면 compact 4-컬럼 톤이 깨지고 Output Constraint 4(한 화면 항목 수 상한)에 저촉된다. 값 셀 = 단일 요약치(A3는 감축률, B3는 `n/N`), **나머지 병기 수치는 `<details>` collapse 상세로** 내린다. 무결성 규칙이 요구하는 병기는 collapse 안에서 충족된다(숨김이 아니라 계층화).
  5. 신규 렌더 문자열은 em-dash 대신 `·`/괄호를 쓴다(M3 F4가 세운 카피 규칙 — detector가 현 표면에 이미 warning 7건).
- **Expanded 슬라이스 확인**: `decisionPriority`(L110-119)가 `computed`+numerator>0을 우선순위 1로 올리므로, A3·B3가 `computed`가 되면 `TOP_EXPANDED=3` 안에 자동 진입한다. **상한 3은 건드리지 않는다**(제약 4 — 순서만, 개수 불변).
- **Mirror**: `renderer/sections/msw-metrics.js`의 기존 status 뱃지 처리 + `decisionPriority` 우선순위 정렬(M3 critique F1이 세운 구조)
- **Validate**:
  ```bash
  node plugins/mccp/scripts/derive/cli.js render
  grep -n "게이트 헛발화율\|누출 결함율" .claude/cache/STATUS.md   # C2·C3가 PRD 정의로 표시되는지
  grep -n "A3" .claude/cache/STATUS.md                              # A3 전용 행 존재
  node -e "
  const m=require('./plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js');
  " && node --test plugins/mccp/scripts/lib/tests/
  ```
- **완료 판정**: A3가 자기 행으로 렌더되고, C2·C3 라벨이 PRD 정의와 일치하며, 값 셀이 단일 수치를 유지한다.

### Task 8: 릴리스 의무 + PRD 동기 (§3.7)

- **Action**: `plugin.json` `1.23.1`→`1.23.2`, footer 2곳(`html.js:1419`, `markdown.js:163`) 동기, `CHANGELOG.md` 행 추가, PRD M4 행 status + Open Question "최소 지시 계약" 체크(Task 2가 응답).
- **Validate**:
  ```bash
  grep -c "1\.23\.2" plugins/mccp/.claude-plugin/plugin.json plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
  ```

## Validation

```bash
# 1. A3 전후 (Task 1이 선행돼야 성립)
node plugins/mccp/scripts/lib/msw-metrics/cli.js a3 --emit /tmp/a3-after.json

# 2. 이전 무결성 — 삭제가 아니라 이전임을 증명
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 3. B3 정직한 분모 + 분기 수
node plugins/mccp/scripts/state/toggle-snapshot.js --scan-denominator

# 4. 회귀 전수 (은퇴가 동작을 바꾸지 않았는지)
node --test plugins/mccp/scripts/lib/tests/ plugins/mccp/scripts/state/tests/

# 5. 지표 표면
node plugins/mccp/scripts/derive/cli.js render

# 6. 머지 삭제 검증 (CLAUDE.md §3.5.1 — 본 사이클이 다수 파일을 이동하므로 필수)
git diff --diff-filter=D --name-only origin/main...HEAD
```

**베이스라인 대조 의무**: M3 회고대로 이 머신의 전체 회귀에는 기존 실패 6건(M4 범위 밖)이 있다. Task 착수 전 `node --test` 결과를 stash해 두고 **증분 실패만** M4 책임으로 계상한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **tiktoken 설치 실패로 A3가 끝까지 측정 불가** | 중 | Task 1이 blocker. 실패 시 감축 미진행 + `baseline-unavailable` 정직 유지. 바이트 추정 대체는 M1 freeze 위반이라 금지 |
| **제외 분류표가 감축으로 오독됨** — 103→94가 성과처럼 보고됨 | **높음** | G3: 제외 전/후 분모 **둘 다** 보고 + 분류마다 file:line 근거 + **은퇴 0건 명시**. M4는 감축이 아니라 분모 정직화를 주장한다 |
| **은퇴 이연이 무기한 표류** — M8이 밀리면 B3는 영영 측정도 감축도 안 됨 | 중 | Task 6 clock-start가 corpus 축적을 **지금** 시작시킨다. M8 착수 시 이력이 이미 쌓여 있어야 재이연 명분이 없다 |
| **지시 준수가 실제로 떨어지는데 감지 못함** | **높음** | 닫히지 않는 잔여(위 "보증하지 않는 것"). 도달성·보존만 검증하고 준수는 **미측정으로 명시**. PRD 인정 조건 미충족을 PR 본문에 기재 |
| CLAUDE.md 대량 편집이 다른 PR의 신규 파일을 드롭 | 중 | §3.5.1 삭제 검증을 Validation 6로 고정. 본 사이클은 파일 이동이 많아 특히 위험 |
| 안전판 토글을 미사용이라는 이유로 은퇴 | 중 | Task 6의 선정 조건에 "안전판 제외"를 AND로 명시. 사용 이력 0만으로는 은퇴 불가 |
| 감축률이 50% 미달 | 중 | 분할 금지(대형 코호트). 미달을 정직 보고하고 잔여 표적을 M5 이후로 기록 |
| sibling worktree와 `1.23.2` 충돌 | 중 | M3 CL-3 선례 — PR 직전 `origin/main` 재확인 후 상향 |

## Acceptance

- [ ] Task 1 완료 — `a3-baseline.json`이 `status:'computed'`로 커밋되고 tokenizer version이 tokenize 프로세스 출처
- [ ] `instruction-contract.md`가 CLAUDE.md 전 절을 3분류로 커버(무분류 절 0) — PRD Open Question "최소 지시 계약" 응답
- [ ] reachability lint 4중 검사 통과 + 부정 fixture 4종이 각각 실패를 재현
- [ ] A3 after 값이 `computed`이고 감축률이 보고됨(50% 달성 또는 **미달의 정직 기록**)
- [ ] CLAUDE.md §3의 행동 규칙 변경 0줄(이전 대상은 §1.4·§4뿐)
- [ ] B3 제외 전/후 분모가 함께 보고되고, `operation_branch_count`가 **0이 아님**(하드코딩 해소)
- [ ] 제외 분류표의 모든 항목에 file:line 근거가 있음. **은퇴 0건**이 보고서에 명시됨(제외를 감축으로 계상 금지)
- [ ] Task 6 후 새 세션 1회에서 `<repoRoot>/.claude/state/*.env-snapshot.json`이 실제 생성됨(현재 0건)
- [ ] A3가 `computeMetrics` 경유로 산출되어 **자기 전용 행**으로 렌더됨(빈 행 아님)
- [ ] `METRICS_META.C2`·`C3` 라벨이 measurement-design.md 정의(게이트 헛발화율 · 누출 결함율)와 일치하고 `forward-only` 유지 — A3 정의가 그 슬롯을 점유하지 않음
- [ ] 지표 행의 값 셀이 단일 수치를 유지하고 병기 수치는 collapse 상세에 위치(Output Constraint 4)
- [ ] 전체 회귀에서 M4 기인 신규 실패 0(baseline 6건 대조)
- [ ] `git diff --diff-filter=D`에 의도치 않은 삭제 0
- [ ] §3.7 릴리스 4종(plugin.json · footer 2 · CHANGELOG) 동기
- [ ] **PR 본문에 "PRD의 B1·C1 회귀 검사 조항을 충족하지 못했다"를 명시** — 미충족을 숨기지 않는 것이 수용 조건의 일부

## Design Critique

- **SKILL first-step**: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료. 4 anchor(정보위계 3단계 · 강조색 ≤1 · raw marker 금지 · list-of-N top3+collapse) + H15 produced-diff lint 계약 확인.
- **Design surface**: `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` → `.claude/cache/STATUS.md` + `status.html`. detector `design_signal=true`(signal_files 6건 — renderer 3면 + derive/toggle-usage + render CLI + STATUS.md).
- **Plan 본문 제약 대조**: heading depth 최대 3(`####` 0건 — 제약 1 통과). 제약 2·3·4는 렌더 표면 대상이라 plan 산문에는 미적용이며, Task 7이 그 표면을 소유한다.

| Round | Verdict | 처리 |
|---|---|---|
| R0 | ESCALATE_NEXT_ROUND | HIGH 1 + MEDIUM 2 지목 → Task 7 · Files to Change · Acceptance **명시 섹션만** 편집 |
| R1 | **CONVERGED** | HIGH/CRITICAL 잔존 0 |

R0 findings 흡수:

| # | Sev | Finding | 흡수 |
|---|---|---|---|
| F1 | **HIGH** | `METRICS_META.C2`(`주입 명령어 비용` / `모델 컨텍스트 사용률`)와 `C3`(`A3 토큰 예약`)에 **A3의 정의가 들어가 있다**. measurement-design.md는 C2=게이트 헛발화율 · C3=누출 결함율로 규정하고 둘은 **관측 전용 · 라벨 프로토콜 전 의사결정 사용 금지**다. M4가 A3를 `computed`로 만들면 대시보드가 "게이트 헛발화율 = 산출됨"을 표시해 PRD가 금지한 판단 근거를 만들어낸다(M3 F2와 동일 계열 — stale 라벨 아래 computed 값 노출) | Task 7.2에 C2·C3 메타 정정 + `forward-only` 유지. Acceptance 항목 추가 |
| F2 | MEDIUM | Task 7 초안이 A3 전후 2값 · B3 제외 전/후 2값 · 분기 수를 **한 행에 병기**하도록 지시 → compact 4-컬럼 톤 붕괴(제약 4). M3 F3이 이미 "값 셀 = 단일, 나머지는 collapse"로 확정한 지점 | Task 7.4로 값 셀 단일화 + 병기 수치를 `<details>` collapse로. 계층화이지 은폐가 아님을 명시 |
| F3 | MEDIUM | `measureA3`가 `msw-metrics/index.js`에서 **import·재export만 되고 `computeMetrics`가 호출하지 않는다**(유일 호출처 `derive/cli.js:330`). `METRICS_ORDER`에도 A3 부재 → 렌더러만 고치면 **빈 행**이 된다. Task 7 초안의 "병기"는 배선 부재를 가린 표현 | Task 7.1로 `computeMetrics` 배선 + `METRICS_ORDER`/`METRICS_META.A3` 신설. Files to Change에 `msw-metrics/index.js` 추가 |

- **Expanded 슬라이스 재검**: `decisionPriority`가 `computed`+numerator>0을 우선순위 1로 올리므로 A3·B3는 `TOP_EXPANDED=3` 안에 자동 진입한다. 상한 3은 **변경하지 않는다**(제약 4 — 순서만, 개수 불변). M3 F1이 세운 구조가 그대로 유효.
- **잔존 LOW(미유발·문서화)**: 현 표면의 `em-dash-overuse` warning 7건 + `numbered-section-markers` advisory는 **pre-existing**이며 M4가 유발하지 않는다. Task 7.5가 신규 문자열에 대해 em-dash를 금지해 증가를 차단한다.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.23.1/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: **classification=`disabled`** (`blocking=false` · `advisory=false` · `durationMs=0`)

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class skip).

- 근거: `MCCP_CODEX_DISABLED=1`이 **user-level `~/.claude/settings.json:6`** 에 설정돼 있다. v0.3.5부터 wrapper가 이를 first-class로 honor해 spawn 직전 short-circuit하며, 이는 실패가 아니라 **의도된 운영자 정책**이다(advisory env 불필요, `MCCP_ALLOW_CODEX_UNAVAILABLE`과 정반대 축).
- 라운드 수: 0 (미발화)
- YAGNI Triage: 해당 없음 — findings 0건
- Deferred to backlog: 0
- **Open Questions**: 없음(auto-CRITICAL 0건). 단 아래 미검증 잔여를 명시한다.
- Codex session 참조: 없음

**미검증 잔여 (정직 기록).** 본 plan의 세 핵심 결정 — (1) tiktoken 부재 시 감축 자체를 중단하는 blocker 설계, (2) PRD의 B1·C1 인정 조건이 계산 불가함에도 도달성·보존 검증으로 대체하고 진행하는 선택, (3) B3 분모 제외 분류가 정직한 정정인지 분모 조작인지 — 는 **cross-model adversarial review를 받지 못했다**. 특히 (2)는 plan 스스로 "운영자 판단 필요"로 표시한 항목이라 단일 모델 자기검토만으로 수렴했다고 볼 수 없다. `resolution.codex_verdict='skipped'`로 봉인되며, cross-gate dedupe 규약상 `skipped`는 sanctioned ship 집합에 속하므로 후속 게이트를 조용히 우회하지 않는다.

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.23.1/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: **classification=`disabled`** (`blocking=false` · `advisory=false` · `durationMs=0`)

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class skip).

- 라운드 수: 0 (미발화) — `resolution.codex_verdict='skipped'`로 봉인
- YAGNI Triage: Codex findings 0건. 아래 Security Reviewer 표가 본 게이트의 유일한 adversarial 입력이다
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0건)

### Security Reviewer

`Task(security-reviewer)` 실발화(122s). 7 findings. 게이트 규칙상 CRITICAL/HIGH는 STOP 사유이나, **전부 R1에서 흡수 가능**하므로(§2.5.4 escalate 조건 (b) 미충족) 흡수 후 진행한다. 판정 기준은 *"이번 변경이 그 결함에 기대는가"*이지 결함의 선재 여부가 아니다.

| # | 리뷰어 Sev | 판정 | 근거 |
|---|---|---|---|
| S1 | CRITICAL | **부분 ACCEPT_NOW / 부분 REJECT** | PATH 기반 인터프리터 hijack. `spawn`은 이미 `shell:false` 기본이고, PATH를 선점할 수 있는 공격자는 이 스크립트를 실행하는 `node` 자체도 선점한다 — 새 벡터가 아니라 **모든 로컬 개발 도구에 공통인 퇴화 위협모델**이다. "절대경로 + 소유권/서명 검증" 요구는 비례하지 않으며 검증 기준이 될 절대경로 출처가 없다. **흡수분**: 명시적 `shell:false` · stdout 파싱이 아닌 **exit code** 판정(S7 병합) · 채택된 인터프리터 경로를 아티팩트에 기록(감사 가능). **기각분**: 소유권/서명 검증. 리뷰어가 지목한 `execSync('pip show')` shell 경유는 **plan Task 1.2가 이미 제거**한다 |
| S2 | CRITICAL | **NOT-A-FINDING** | `session-start.js:733` stateDir 누락 = **Task 6이 고치는 결함 그 자체**다. 리뷰어가 plan의 수정안을 그대로 권고로 재기술했다. 변경이 이 결함에 기대는 것이 아니라 이 결함을 닫는다 |
| S3 | HIGH | **ACCEPT_NOW** | 신규 `lint.js`가 markdown 표에서 읽은 `dest_file`을 그대로 open한다 → 절대경로·`../` 이탈·UNC 도달 가능. 내가 지금 쓸 코드이고 저장소에 이미 `lib/path-containment.js#assertContained`가 있다. 전 `dest_file`을 repoRoot 봉쇄 + traversal 부정 fixture 추가 |
| S4 | HIGH | **ACCEPT_NOW (축소 적용)** | `findMemoryFiles`의 symlink 추종. `readdirSync(withFileTypes)`는 lstat 의미라 symlink **디렉토리**는 이미 재귀 대상이 아니다 — 실 노출면은 symlink **파일** `MEMORY.md` 1개다. 공격자가 `~/.claude/.../memory/`에 쓸 수 있으면 파일을 직접 쓸 수도 있어 퇴화 시나리오지만, 수정이 1줄이고 Task 1이 이 경로의 산출물을 **커밋 아티팩트로 승격**시키므로 흡수한다 |
| S5 | MEDIUM | **ACCEPT_NOW** | user-level `MEMORY.md`의 sha256을 git에 영구 기록하는 것은 지문화다. 게다가 fresh clone에서 재현 불가라 G1("재현 가능한 baseline")과 정면 충돌한다. **결정**: 커밋 아티팩트는 user-memory 성분의 **content hash를 절대 담지 않는다**(존재 여부·bytes·tokens만). 기본값(`MCCP_A3_READ_USER_MEMORY` 미설정)에서는 성분 자체가 omitted이므로 실제 이번 baseline엔 미포함. 비재현성은 아티팩트에 명시 |
| S6 | MEDIUM | **ACCEPT_NOW** | `*.test.js` 제외 누락 — plan Task 5.2가 이미 소유. 비-`tests/` 디렉토리의 `.test.js`를 제외하는 회귀 test 동반 |
| S7 | LOW | **ACCEPT_NOW** | 인터프리터 판정을 stdout 파싱이 아닌 exit code로. S1 흡수분에 병합 |

- ACCEPT_NOW × {CRITICAL, HIGH} 잔존: **0** (S3·S4는 구현 시점에 흡수, S1은 비례 범위로 축소 흡수) → 라운드 escalate 미발동, R1 종료
- MCCP-GATE-STOP 미발동. 흡수 결과는 Task 1·3·5 구현에 반영되고 Phase 5 REPORT가 실제 반영 여부를 대조한다

### 구현 착수 시점 발견 (plan 전제 정정)

plan 본문의 사실 주장 2건이 코드와 다르다. 감축이 아니라 **정정**이므로 여기 기록하고 Task 목표는 유지한다.

| # | plan 주장 | 실제 | 처리 |
|---|---|---|---|
| D1 | `toggle-usage.js`의 `operation_branch_count`는 **하드코딩 0** | 하드코딩이 아니라 `estimateOperationBranches(usedToggles, …)`로 **계산된다**. 값이 0인 이유는 분자 집합(`usedToggles`)이 비어 있기 때문(producer가 아티팩트를 못 남긴 그 결함) | 목표 불변(0이 아닌 의미 있는 분기 수). 원인이 다르므로 수정도 다르다 — 반-조작 병기는 *분모 표면* 위에서 세야 "토글 수를 줄였다 ≠ 분기를 줄였다"를 드러낸다. 분자 기준 계수는 은퇴를 해도 값이 안 변해 병기 목적을 달성 못 한다 |
| D2 | (미기재) | `computeB3`의 무결성 규칙 `operation_branch_count > 100 → status:'invalid'`는 measurement-design.md §B3에 **없는 규칙**이다. 계약이 규정한 검사는 "토글 수는 줄었는데 분기 수는 그대로" = fold 탐지지, 절대 임계가 아니다. D1을 분모 기준으로 고치면 분기 합이 ~200이 되어 B3가 `computed`에서 `invalid`로 **퇴행**한다 | 코드를 frozen 계약에 정합화한다(계약 문서는 미변경). 절대 임계 제거 + fold 탐지는 직전 주기 쌍이 없으므로 **forward-only**로 정직 표기하고 현 주기 쌍을 기록해 다음 주기가 비교 가능하게 한다 |



- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-08T22:34:21.987Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

