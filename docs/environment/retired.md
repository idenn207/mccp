# 은퇴 · 부재 · 스캔 오탐

> `docs/ENVIRONMENT.md`의 **retired** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

더 이상 존재하지 않거나, 의도적으로 만들지 않았거나, 스캐너의 오탐인 이름이다. 설정해도 아무 일도 일어나지 않는다 — 그것을 확인하러 오는 곳이다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

여기 있는 이름에는 **사용 예시가 없다**. 쓰지 말라는 항목에 사용법을 다는 것은 모순이고, 정합 lint도 이 파일을 예시 검사에서 제외한다.

## 토글

### MCCP_SKIP_OBSERVE

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — MCCP_DISABLED_HOOKS로.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_SKIP_OBSERVE` | `1` | unset | continuous-learning observer hook을 단발 skip. observer가 자기 자신을 재귀 호출할 때 사용. |
```

### MCCP_QUALITY_GATE_FIX

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — Stop-loop enforce로.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_QUALITY_GATE_FIX` | `true` | `false` | `quality-gate.js` hook이 자동 fix(`--fix` 플래그 등) 모드로 동작. |
```

### MCCP_QUALITY_GATE_STRICT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — Stop-loop enforce로.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_QUALITY_GATE_STRICT` | `true` | `false` | quality-gate가 strict 모드로 동작 (경고도 실패로). |
```

### MCCP_STOP_LOOP_QUALITY_CWD

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — worktree 규약으로.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_STOP_LOOP_QUALITY_CWD` | `cwd` | unset | monorepo 하위 패키지의 `package.json` 기준으로 quality 게이트를 돌리도록 토글. 미설정 시 toplevel 기준(현재 v0.2 동작). v0.3에서 도입 예정. |
```

### MCCP_SANTA_MAX_ROUNDS

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — ROUND_CAP으로 개명.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

### MCCP_COST_HARD_CEILING_HIT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — chain_aborted로.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_COST_HARD_CEILING_HIT` | `1` | unset | 🚧 signal | `ecc-context-monitor`가 $100 critical에 도달했을 때 emit하는 신호(spawn된 hook 환경에는 직접 주입 불가하므로 STATE.md `chain_aborted=true`와 함께 기록 — `auto-chain.js`가 양쪽 검사). 사용자가 직접 set할 변수 아님. |
```

### MCCP_ORCHESTRATION_DEBT_DECAY_HOURS

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 은퇴 — COST_STATE_DECAY로.

**소비처** `docs/environment/retired.md:1`

**상태** `retired` — 은퇴했다. 설정해도 아무 일도 일어나지 않는다.

### MCCP_PLAN_REVIEW_L1

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 의도적 부재 — 끌 수 없다.

**소비처** `docs/environment/retired.md:1`

**상태** `absent-by-design` — 의도적으로 만들지 않았다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  # **`MCCP_PLAN_REVIEW_L1`은 존재하지 않는다 (의도적)** — L1은 DD3의 gatekeeper이고 LLM-free·저비용이다. 끌 수 있게 만들면 "mechanical 실패를 LLM의 '괜찮아 보임'이 덮을 수 없다"는 불변식이 env 하나로 무력화된다. L1을 우회하려면 `MCCP_PLAN_REVIEW=codex`(승인자 자체를 교체)를 쓴다.
```

### MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** test 전용 — critique 강제 실패.

**소비처** `plugins/mccp/commands/plan.md:687`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**상태** `test-only` — test 전용이다. 운영 환경에서 설정하지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1  # v1.3.0-m2 test env (M2 acceptance gate dogfood용). =1이면 critique invoke 결과를 [{severity:'HIGH'}] 강제 주입 → oracle ESCALATE → cap 도달 시 DIVERGENT. production code path는 env 무관 — critique invoke 결과만 mock. e2e test에서 retry loop 회귀 보장. MCCP_RECEIPT_DEBUG=1 + 본 env 활성 시 stderr loud warn 강제.
  # (바로 위 MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL이 같은 성격으로 이미 등재돼 있다).
```

### MCCP_PERF_INJECT_QUADRATIC

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** test 전용, 표면 밖.

**소비처** `docs/environment/retired.md:1`

**상태** `test-only` — test 전용이다. 운영 환경에서 설정하지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PERF_INJECT_QUADRATIC=0|1            # gate-guard-integrity M2 test env. =1이면 derive/tests/perf-budget.test.js의 `runDerive` 헬퍼가 측정 창 **안에서** n² 비례 busy-wait를 주입한다 → perf 단언이 실제로 FAIL해야 한다. 그 FAIL이 "이 단언은 완화된 것이 아니라 대체된 것"의 증명이다(주입해도 green이면 단언이 아무것도 재지 않는다는 뜻). 소비 지점은 그 test 파일의 헬퍼 진입부 **단 한 곳**이며, production `derive/` 코드에 test 전용 분기가 없음을 §Validation의 역방향 grep이 기계적으로 검사한다. 미설정이 기본이고 그때 동작은 무주입과 동일.
```

### MCCP_TEST_SESSION_START_PATH

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** test 전용, 표면 밖.

**소비처** `docs/environment/retired.md:1`

**상태** `test-only` — test 전용이다. 운영 환경에서 설정하지 않는다.

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_TEST_SESSION_START_PATH="<path>"     # gate-guard-integrity M2 test env (Task 2c). hooks/tests/session-start-bootstrap.test.js가 spawn할 `session-start.js` 경로를 주입받는다. 미설정 시 `hooks/session-start.js`로 해석되어 기존 동작과 완전히 동일하다. 이 통로의 목적은 `git show HEAD:…/session-start.js`로 **수정 전** 코드를 꺼내 같은 test를 그것에 대고 돌리는 것이고, 그때 반드시 FAIL해야 한다 — 이름만 맞춘 빈 stub을 거르는 유일한 기계적 수단이다.
```

### MCCP_EXPLORE_CONTROL_PLACEMENT

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 제거됨 — 주석만 잔존.

**소비처** `plugins/mccp/scripts/lib/renderer/html.js:1109`

**상태** `comment-only` — 이미 제거된 토글이다. 제거 사실을 적은 주석만 남아 스캐너에 잡힌다.

### MCCP_PLAN_REVIEW_

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 환경변수 아님 — 접두사 오탐.

**소비처** `plugins/mccp/scripts/lib/plan-review/budget.js:26`

**상태** `scan-artifact` — 환경변수가 아니다. 스캐너의 정규식이 같은 이름의 코드 식별자를 잡은 것이다.

### MCCP_DISABLE_VALUES

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 환경변수 아님 — JS 상수.

**소비처** `plugins/mccp/scripts/hooks/gateguard-fact-force.js:48`

**상태** `scan-artifact` — 환경변수가 아니다. 스캐너의 정규식이 같은 이름의 코드 식별자를 잡은 것이다.

### MCCP_IGNORE_BLOCK

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 환경변수 아님 — JS 상수.

**소비처** `plugins/mccp/scripts/lib/gitignore-provision.js:60`

**상태** `scan-artifact` — 환경변수가 아니다. 스캐너의 정규식이 같은 이름의 코드 식별자를 잡은 것이다.

### MCCP_IGNORE_ENTRIES

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 환경변수 아님 — JS 상수.

**소비처** `plugins/mccp/scripts/lib/gitignore-provision.js:192`

**상태** `scan-artifact` — 환경변수가 아니다. 스캐너의 정규식이 같은 이름의 코드 식별자를 잡은 것이다.

### MCCP_JOURNAL_DEGRADED_UNRECORDED

**종류** `string` — **값** 자유 문자열 — **기본값** 없음 (미설정이 기본)

**한 줄** 환경변수 아님 — 에러 코드.

**소비처** `plugins/mccp/scripts/state/state-writer.js:675`

**상태** `scan-artifact` — 환경변수가 아니다. 스캐너의 정규식이 같은 이름의 코드 식별자를 잡은 것이다.

