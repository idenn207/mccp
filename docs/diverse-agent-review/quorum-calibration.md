# 패널 quorum 캘리브레이션 — 실측 동결과 판정

> diverse-agent-review milestone #8. 측정일 2026-08-26.
> 이 문서의 숫자는 전부 아래 `## 동결된 실측` 블록에서 나온다. 손으로 옮겨 적은
> 숫자는 없다. 재현은 명령 한 줄이다.

```bash
node plugins/mccp/scripts/lib/plan-review/corpus.js --json
```

도구([corpus.js](../../plugins/mccp/scripts/lib/plan-review/corpus.js))는 read-only ·
LLM-free · standalone이며 게이트 경로를 한 줄도 읽지 않는다. **임계값을 갖지 않는다** —
세는 것은 도구가 하고 판정은 이 문서가 한다.

## 무엇을 물었나

PRD #8은 `3of4` + K=3이 적정한가를 묻는다. 그 질문에는 선행 질문이 있다 —
**승인이 발급되는 경로가 실재하는가.** 존재하지 않는 경로의 임계를 조정하는 것은
측정했다는 착각 위의 튜닝이고, 그것이 이 PRD가 High로 지목한 실패 모드다.
그래서 순서대로 넷을 묻는다.

1. 승인 경로가 존재하는가
2. M(응답 수)과 K(고유 역할)가 실제로 승인 임계인가
3. 그렇다면 실제 승인 규칙은 무엇인가
4. F6(합성 FAIL)은 얼마나 기여하는가 — CLAUDE.md §3.14 해제 조건에 직접 걸린다

## 코퍼스의 경계

`.claude/reviews/`에는 여러 생산자의 문서가 섞여 있다. 이 도구의 코퍼스는 그중
`record.js`가 쓴 패널 레코드뿐이고, 판별자는 파일명이 아니라 첫 줄 서명
`# Plan Review Panel — <slug>`이다. 같은 파일명 접두사를 쓰는 손으로 쓴 문서가 실재하므로
파일명은 서명이 될 수 없다.

| 분류 | 건수 | 뜻 |
|---|---|---|
| `records` | 35 | 패널 레코드 + `## Measurement` 판독 성공. **판정의 모수.** |
| `pre_measurement` | 13 | 패널 레코드이지만 M4가 Measurement 블록을 도입하기 전. 오독할 값이 없으므로 계측 고장이 아니라 코퍼스의 **시간 경계**다. 전건 이름이 stderr에 나온다. |
| `out_of_corpus` | 28 | PR · santa-loop · local · security 리뷰. 다른 생산자이므로 결손이 아니다. |
| `parse_failures` | 0 | 패널 레코드 + Measurement 존재 + 판독 실패. **이것만 `degraded`를 만든다.** |

즉 커버리지는 **48건 중 35건**이고, 모든 카운트는 그만큼 **하한**이다.

`pre_measurement`를 `degraded`에 넣지 않은 것은 편의가 아니라 신호 보존이다. 그 13건은
영구히 존재하므로 degraded에 넣으면 이 도구는 어떤 코퍼스에서도 항상 degraded가 되고,
그러면 진짜 손상이 상시 신호에 묻혀 보이지 않는다. 항상 켜진 신호는 정보를 나르지 않는다.
대신 `coverage.counts_are_lower_bound`가 매 출력에 그 사실을 싣는다.

## 판정

### 1. 승인 경로는 존재한다

`pass_path.count = 5`. 그리고 그 5건은 승인으로 셀 자격을 갖춘다:

| 레코드 | wall clock | hash 결속 | 단일통과 흔적 | quorum |
|---|---|---|---|---|
| `plan-review-codex-intent-context-m2.md` | 499,741ms (8.3분) | 있음 | 없음 | 4/3 · 4 roles · passed |
| `plan-review-impeccable-detection-contract.md` | 779,328ms (13.0분) | 있음 | 없음 | 4/3 · 4 roles · passed |
| `plan-review-multi-session-work-loop-m6.md` | 357,124ms (6.0분) | 있음 | 없음 | 4/3 · 4 roles · passed |
| `plan-review-santa-adjudication-m1.md` | 363,402ms (6.1분) | 있음 | 없음 | 4/3 · 4 roles · passed |
| `plan-review-santa-adjudication.md` | 382,180ms (6.4분) | 있음 | 없음 | 3/3 · 3 roles · passed |

`pass_path.hash_bound = 5` — 전건이 `reviewed_plan_hash`로 봉인돼 있다. 즉 "무엇을
리뷰했는지"가 사후 대조 가능하다. 5건 전부 quorum이 실제로 만족돼 통과했다.

**UI9는 충족되지만 그 근거는 관측이 아니다.** `pass_path.single_pass_tainted = 0`을
"측정해 보니 섞이지 않았다"로 읽으면 안 된다 — `decide.js:338`이 완화를 언제나
`'divergent'`로 봉인하므로(§3.15 "converged 위장 없음") 그 카운터는 **어떤 코퍼스에서도
구조적으로 0**이다. 즉 UI9는 상류 불변식이 보장하는 것이고, 이 코퍼스는 그 불변식에
반례가 없음을 확인해 줄 뿐이다. 필드를 지우지 않고 남기는 이유는 그것이 관측이 아니라
**그 봉인의 회귀 가드**이기 때문이다 — 0이 아닌 날은 `decide.js`가 바뀐 날이다.

관측된 wall clock 5건의 중앙값은 **6.4분**, 최댓값은 13.0분이다. 5건 중 4건이 10분 이내다.

> **이 5건은 비율이 아니다.** O3(레코드 slug가 PRD 경로 파생이라 재실행이 이전 라운드를
> 덮어씀)이 살아 있으므로 35건은 실제 실행 수의 하한이고, 생존 편향의 방향도 불분명하다 —
> 차단된 결정은 재실행돼 마지막 레코드가 converged로 남을 수도, 포기돼 divergent로 남을
> 수도 있다. 따라서 5/35를 **승인 확률로 부르지 않는다**(DN8 · UI7 · UI8). 관측된 빈도다.

### 2. M과 K는 승인 임계가 아니었다

차단 레코드 30건 중, quorum이 실제로 평가된 것은 **27건**이다(`quorum_evaluated_blocked`).
나머지 3건은 quorum에 도달하기 전에 멎었으므로 M·K 질문의 모수가 아니다 — 분모에 넣으면
손잡이 무력성 주장이 공짜로 강해진다:

- `plan-review-diverse-agent-review-m4-postimpl-l1.md` — L1 divergent, L2 미실행
- `archive/plan-review-review-loop-bypass-m1.md` — L1 divergent, L2 미실행
- `plan-review-environment-uniformity.md` — 5.2b(budget)에서 halt, quorum 미평가

그 27건에 대해:

```
m_binding = 0        k_binding = 0        findings_binding = 27
```

**M과 K가 binding constraint였던 레코드는 0건이다.** `quorum.js:184-197`이 세 사유를
독립적으로 쌓고 `passed`가 `reasons.length === 0`이므로, 두 손잡이가 한 번도 binding이
아니었다면 그것을 어떻게 돌려도 승인 빈도는 움직이지 않는다.

#### 판정은 reason 문자열에서 읽었다 — 그리고 그것이 유일한 소스다

plan-review 패널(architect)이 정확히 지적한 것: 기록된 `measurement.quorum`에는
**`rolesMin`이 없다.** `quorum.js:189`의 판정은 `roles < rolesMin`이므로 측정 JSON만으로는
K가 binding이었는지 알 수 없다. 그래서 도구는 `quorum.js`가 **직접 쓴** reason 문자열을
1차 소스로 읽는다 — 재구성이 아니라 인용이다.

| 축 | reason 접두사 | 교차 검증 |
|---|---|---|
| M | `only N of M required responses` | 가능 (`responded < required`) — 실측 conflict **0건** |
| K | `only N distinct role(s), need M` | **불가능** (rolesMin 미기록) |
| findings | `N blocking finding(s)` | 부분 (Findings 표 존재 여부) |

읽을 수 없으면 0이 아니라 `unknown`이다. K 축은 교차 소스가 아예 없으므로 이 규칙이 그
축의 유일한 정직성 장치다. `cross_check_conflicts`가 빈 배열이라는 것은 M 축에서 reason과
측정 JSON이 27건 전부 일치했다는 뜻이고, 그만큼 reason 판독을 신뢰할 근거가 된다.

#### K는 이미 돌아갔고 지표는 움직이지 않았다 (자연 실험)

`MCCP_PLAN_REVIEW_ROLES_MIN=1`이 tracked `settings.json`에 들어간 커밋은 `794c4de`
(2026-08-20T16:36:03Z)다. 코퍼스는 그 시각으로 자연 분할된다:

| 구간 | 레코드 | converged |
|---|---|---|
| K=3 (이전) | 25 | 4 |
| K=1 (이후) | 10 | 1 |

K를 3에서 1로 **실제로 낮췄는데** 승인 빈도는 실질 변하지 않았다. 이것이 손잡이 무력성에
대한 유일한 관측 증거이며, `k_binding = 0`과 독립적으로 같은 방향을 가리킨다.

> 분할점 커밋 해시는 도구에 하드코딩돼 있다(유지보수 부채, 패널 invariant/LOW가 지적).
> 완화 둘: `--k-split-ref`로 덮어쓸 수 있고, ref가 해소되지 않으면 조용히 다른 지점에서
> 가르지 않고 `k_split.state='unresolved'`를 낸다.

### 3. 실제 승인 규칙은 severity 게이트다

27건 전부가 `findings_binding`이다. 즉 실무에서 패널을 통과시키거나 막는 것은 M도 K도
아니고 **CRITICAL/HIGH(및 미인식 severity) finding의 유무**다. 이는 `quorum.js:134-210`이
헤더에 이미 명시한 설계와 일치한다 — 코퍼스는 그 설계가 실제로 그렇게 작동함을 확인해 줄 뿐,
새로운 규칙을 드러내지 않는다.

관점별 통과율은 고르지 않다:

| 관점 | pass | fail | total |
|---|---|---|---|
| architect | 20 | 12 | 32 |
| security | 22 | 11 | 33 |
| test | 13 | 18 | 31 |
| invariant | 10 | 23 | 33 |

`invariant`가 가장 자주 막고 `security`가 가장 자주 통과시킨다. **이것을 임계 과잉으로
읽지 않는다.** severity 히스토그램은 `CRITICAL 25 · HIGH 85 · MEDIUM 128 · LOW 25`이고,
실패 리뷰어 인스턴스 64건 중 52건이 실물 차단 finding을 동반했다. 리뷰어는 실제로 결함을
찾은 것이다. 승인 빈도를 올리려고 severity 게이트를 손보는 것은 UI4가 금지하는 축의
변형이므로 **기본값을 바꾸지 않는다**(DN6).

#### 그러나 차단의 절반 가까이는 작업을 멈추지 않았다

`single_pass.records = 14` — 측정 가능한 35건 중 14건이 reason에
`MCCP_REVIEW_SINGLE_PASS`를 달고 있고, **14건 전부 divergent**다(`single_pass.converged = 0`).
차단 30건 기준으로 **14건(47%)** 은 게이트가 `divergent`를 봉인하고도 §3.15의 단일통과
토글로 작업이 진행된 레코드다.

그래서 판정 3의 문장은 이렇게 좁혀 읽어야 한다: severity 게이트는 **레코드의 verdict를
결정하는 규칙**이지, 항상 **작업을 멈추는 규칙**은 아니다. 이 코퍼스에서 그 둘은 30건 중
16건에서만 일치했다. 두 수를 함께 읽지 않으면 "무엇이 실제로 막았는가"에 대해 관측보다
강한 주장을 하게 된다.

> 이 축은 M8 리뷰가 열었다. 초판은 완화 카운트를 `pass_path` 안에만 두었는데 그 필드는
> converged만 필터하므로 **구조적으로 0**이었고(위 UI9 문단), 코퍼스의 14건이 출력 어디에도
> 나타나지 않았다. **F6과 정확히 같은 형태의 오류다** — 잘못된 소스에서 얻은 0. 도구 헤더의
> "구조적 0을 관측으로 착각하지 않는다" 절과 회귀 test 3건이 이 축을 고정한다.

이 수가 임계 조정의 근거가 되지는 않는다. 완화는 quorum 손잡이가 아니라 **운영자 판정**이고
(§3.15는 값 자체를 사유 enum으로 봉인한다), 그 빈도가 높다는 것은 임계가 과하다는 증거일
수도 마감 압력이 높았다는 증거일 수도 있다. 어느 쪽인지는 이 코퍼스가 답하지 않는다 —
`review_single_pass_reason`별 분포와 그때 놓친 결함의 사후 대조가 필요하고, 그것은 #11의
사후 감사와 같은 종류의 작업이다.

### 4. F6 기여도 — 예비 실측과 다르다

plan의 DN7은 예비 실측을 근거로 "F6 단독으로 막힌 레코드 0건"을 시사했다. **도구의 판정은
1건이다.** UI10대로 증거가 바뀌었으므로 판정을 갱신한다.

```
fail_reviewer_instances     = 64
solo_fail_reviewer_instances = 12
records_flipped_if_f6_removed = 1
```

- **12건**의 실패 리뷰어 인스턴스는 차단 severity finding을 하나도 동반하지 않았다. 그
  리뷰어들에게는 `quorum.js:175-181`의 합성 FAIL이 유일한 차단 기여였다.
- 그중 레코드 전체가 F6 때문에만 막힌 것은 **1건**: `archive/plan-review-followup-R12.md`
  (`session-process-reclaim-followup`). 3/3 응답 · 3 distinct roles로 M도 K도 만족했고,
  `security`와 `invariant`가 `verdict=fail`을 냈으나 두 리뷰어의 finding은 전부 MEDIUM
  이었다. F6이 없었다면 blocking finding이 0건이 되어 quorum이 통과했을 것이다.

#### 왜 예비 실측이 0으로 봤는가 — 그리고 이 milestone의 초판도 그랬다

`record.js#findingRows`는 실패 리뷰어가 finding을 **하나도 안 냈을 때만**(`emitted === 0`)
합성 `| ... | FAIL | ...` 행을 쓴다. 그런데 `quorum.js`는 MEDIUM만 낸 실패 리뷰어에
대해서도 여전히 합성 blocking finding을 쌓는다. 따라서 `## Findings`의 FAIL 행만 세면
F6의 기여도가 **구조적으로 0으로 관측된다** — 실제로 이 코퍼스 전체의 합성 FAIL 행은
0건이다.

정본 소스는 `## Refutation attempted` 표(모든 리뷰어의 verdict가 실린다)이고, 도구는 그것을
읽는다. 이 milestone의 첫 구현은 합성 행을 셌고 0을 보고했으며, 회귀 test
`F6 is read from the Refutation table, not from synthetic FAIL rows in Findings`가 그
결함을 고정한다.

#### §3.14에 대해 이것이 말하는 것

CLAUDE.md §3.14의 해제 조건은 "`quorum.js`가 bare `verdict='fail'`을 `severity:'FAIL'`
blocking finding으로 합성하지 않게 되면"이다. 실측이 말하는 것:

- F6은 **무해하지 않다** — 35건 중 1건을 단독으로 막았고, 리뷰어 인스턴스 단위로는 12건에서
  유일한 차단 사유였다.
- 그러나 F6은 **지배적이지도 않다** — 27건의 차단 중 26건은 F6이 없어도 막혔다.

**M8은 §3.14를 해제하지 않는다.** 해제는 운영자 판정이고 이 PRD 소관이 아니다. M8이 제공하는
것은 그 판정의 근거이며, 근거는 "0이라 안전하다"가 아니라 "1이고 그 1건을 지목할 수 있다"이다.

## 동결된 실측

아래는 `node plugins/mccp/scripts/lib/plan-review/corpus.js --json`의 stdout 축자 인용이다
(2026-08-26 측정, `.claude/reviews/` 및 `.claude/reviews/archive/` 기준).

<!-- BEGIN corpus.js --json (verbatim) -->

```json
{
  "tool": "plan-review-corpus",
  "state": "ok",
  "files_scanned": 76,
  "records": 35,
  "pre_measurement": 13,
  "pre_measurement_records": [
    ".claude/reviews/plan-review-gate-guard-integrity-m2.md",
    ".claude/reviews/plan-review-gate-guard-integrity-m3.md",
    ".claude/reviews/plan-review-gate-guard-integrity.md",
    ".claude/reviews/plan-review-meta-research-command-m1.md",
    ".claude/reviews/plan-review-meta-research-command.md",
    ".claude/reviews/plan-review-multi-session-work-loop-m5.md",
    ".claude/reviews/plan-review-plan-review-followup.md",
    ".claude/reviews/plan-review-santa-loop-materialize-m1.md",
    ".claude/reviews/plan-review-santa-loop-materialize-m2.md",
    ".claude/reviews/plan-review-santa-loop-materialize.md",
    ".claude/reviews/plan-review-session-process-reclaim.md",
    ".claude/reviews/plan-review-setup-gitignore-m1.md",
    ".claude/reviews/plan-review-setup-gitignore.md"
  ],
  "out_of_corpus": 28,
  "parse_failures": 0,
  "read_error": false,
  "parse_errors": [],
  "sources": [
    {
      "dir": ".claude/reviews",
      "present": true,
      "files": 69
    },
    {
      "dir": ".claude/reviews/archive",
      "present": true,
      "files": 7
    }
  ],
  "coverage": {
    "panel_records": 48,
    "measurable": 35,
    "unmeasurable": 13,
    "counts_are_lower_bound": true
  },
  "verdicts": {
    "divergent": 29,
    "converged": 5,
    "unknown": 1
  },
  "sources_seen": {
    "multi-agent": 35
  },
  "pass_path": {
    "count": 5,
    "entries": [
      {
        "record": ".claude/reviews/plan-review-codex-intent-context-m2.md",
        "plan_path": ".claude/plans/codex-intent-context-m2.plan.md",
        "wall_clock_ms": 499741,
        "hash_bound": true,
        "single_pass_trace": false,
        "quorum": {
          "responded": 4,
          "required": 3,
          "roles": 4,
          "of": 4,
          "passed": true
        },
        "recorded_at": "2026-08-15T03:31:00.883Z",
        "reason": "L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired"
      },
      {
        "record": ".claude/reviews/plan-review-impeccable-detection-contract.md",
        "plan_path": ".claude/plans/impeccable-detection-contract-m6.plan.md",
        "wall_clock_ms": 779328,
        "hash_bound": true,
        "single_pass_trace": false,
        "quorum": {
          "responded": 4,
          "required": 3,
          "roles": 4,
          "of": 4,
          "passed": true
        },
        "recorded_at": "2026-08-23T12:40:46.234Z",
        "reason": "L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m6.md",
        "plan_path": ".claude/plans/multi-session-work-loop-m6.plan.md",
        "wall_clock_ms": 357124,
        "hash_bound": true,
        "single_pass_trace": false,
        "quorum": {
          "responded": 4,
          "required": 3,
          "roles": 4,
          "of": 4,
          "passed": true
        },
        "recorded_at": "2026-08-15T18:10:05.530Z",
        "reason": "L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired"
      },
      {
        "record": ".claude/reviews/plan-review-santa-adjudication-m1.md",
        "plan_path": ".claude/plans/santa-adjudication-m1.plan.md",
        "wall_clock_ms": 363402,
        "hash_bound": true,
        "single_pass_trace": false,
        "quorum": {
          "responded": 4,
          "required": 3,
          "roles": 4,
          "of": 4,
          "passed": true
        },
        "recorded_at": "2026-08-16T12:37:33.053Z",
        "reason": "L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired"
      },
      {
        "record": ".claude/reviews/plan-review-santa-adjudication.md",
        "plan_path": ".claude/plans/santa-adjudication-m2.plan.md",
        "wall_clock_ms": 382180,
        "hash_bound": true,
        "single_pass_trace": false,
        "quorum": {
          "responded": 3,
          "required": 3,
          "roles": 3,
          "of": 4,
          "passed": true
        },
        "recorded_at": "2026-08-17T05:52:56.874Z",
        "reason": "L1 + L2 quorum satisfied (3/3 responses, 3 distinct roles); L3 not fired"
      }
    ],
    "single_pass_tainted": 0,
    "hash_bound": 5,
    "wall_clock_ms_observed": [
      499741,
      779328,
      357124,
      363402,
      382180
    ]
  },
  "single_pass": {
    "records": 14,
    "converged": 0,
    "blocked": 14,
    "record_names": [
      ".claude/reviews/plan-review-codex-disabled-round-invariant.md",
      ".claude/reviews/plan-review-codex-intent-context-m3.md",
      ".claude/reviews/plan-review-diverse-agent-review-m7-budget.md",
      ".claude/reviews/plan-review-diverse-agent-review.md",
      ".claude/reviews/plan-review-environment-doc-uniformity.md",
      ".claude/reviews/plan-review-impeccable-detection-contract-m1.md",
      ".claude/reviews/plan-review-impeccable-detection-contract-m2.md",
      ".claude/reviews/plan-review-impeccable-detection-contract-m5.md",
      ".claude/reviews/plan-review-multi-session-work-loop-m7.md",
      ".claude/reviews/plan-review-multi-session-work-loop.md",
      ".claude/reviews/plan-review-review-loop-bypass-m2.md",
      ".claude/reviews/plan-review-review-loop-bypass.md",
      ".claude/reviews/plan-review-santa-evidence-diversity-m2.md",
      ".claude/reviews/plan-review-santa-evidence-diversity.md"
    ]
  },
  "perspectives": {
    "architect": {
      "pass": 20,
      "fail": 12,
      "other": 0,
      "total": 32
    },
    "security": {
      "pass": 22,
      "fail": 11,
      "other": 0,
      "total": 33
    },
    "test": {
      "pass": 13,
      "fail": 18,
      "other": 0,
      "total": 31
    },
    "invariant": {
      "pass": 10,
      "fail": 23,
      "other": 0,
      "total": 33
    }
  },
  "binding_axis": {
    "blocked_records": 30,
    "quorum_evaluated_blocked": 27,
    "m_binding": 0,
    "k_binding": 0,
    "findings_binding": 27,
    "unknown": 3,
    "unknown_records": [
      ".claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md",
      ".claude/reviews/plan-review-environment-uniformity.md",
      ".claude/reviews/archive/plan-review-review-loop-bypass-m1.md"
    ],
    "l2_not_evaluated": 2,
    "cross_check_conflicts": []
  },
  "f6": {
    "fail_reviewer_instances": 64,
    "solo_fail_reviewer_instances": 12,
    "solo_fail_records": [
      {
        "record": ".claude/reviews/plan-review-codex-intent-context-m3.md",
        "perspectives": [
          "architect"
        ]
      },
      {
        "record": ".claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md",
        "perspectives": [
          "security"
        ]
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r6-blocked.md",
        "perspectives": [
          "security"
        ]
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop.md",
        "perspectives": [
          "architect",
          "test"
        ]
      },
      {
        "record": ".claude/reviews/plan-review-santa-adjudication-m3.md",
        "perspectives": [
          "security"
        ]
      },
      {
        "record": ".claude/reviews/plan-review-session-process-reclaim-followup.md",
        "perspectives": [
          "architect"
        ]
      },
      {
        "record": ".claude/reviews/archive/plan-review-followup-R11.md",
        "perspectives": [
          "architect",
          "test"
        ]
      },
      {
        "record": ".claude/reviews/archive/plan-review-followup-R12.md",
        "perspectives": [
          "security",
          "invariant"
        ]
      },
      {
        "record": ".claude/reviews/archive/plan-review-followup-R13.md",
        "perspectives": [
          "architect"
        ]
      }
    ],
    "records_flipped_if_f6_removed": 1,
    "flipped_records": [
      ".claude/reviews/archive/plan-review-followup-R12.md"
    ],
    "severity_histogram": {
      "LOW": 25,
      "MEDIUM": 128,
      "HIGH": 85,
      "CRITICAL": 25
    }
  },
  "k_split": {
    "state": "ok",
    "ref": "794c4de",
    "split_at": "2026-08-20T16:36:03.000Z",
    "before": {
      "records": 25,
      "converged": 4
    },
    "after": {
      "records": 10,
      "converged": 1
    },
    "undated": 0
  }
}
```
<!-- END corpus.js --json (verbatim) -->

## 한계 — 이 문서가 주장하지 않는 것

- **비율이 아니다.** 5/35는 관측 빈도이고 승인 확률이 아니다. O3 생존 편향의 방향이
  불분명하고 커버리지가 35/48이므로 모든 카운트는 하한이다(DN8 · UI7 · UI8).
- **승인 품질을 말하지 않는다.** converged 5건이 *옳게* 승인됐는지(false-approve 비율)는
  그 5건을 사후 감사해야 답할 수 있고, 그것은 별도의 관측 작업이다. #8이 확정하는 것은
  그 질문이 **이제 답 가능해졌다**는 것까지이며, 답 자체는 #11로 이관한다.
- **기본값을 바꾸지 않았다.** `3of4`도 K도 severity 게이트도 이 milestone에서 변경되지
  않았고, 게이트 배선 diff는 공집합이다(사전 파일 9종 전부 무변경, 기계 확인).
- **도구는 판정하지 않는다.** `corpus.js` 출력에는 임계값도 목표치도 pass/fail도 없다
  (회귀 test가 그 부재를 고정한다). 위 판정 4개는 이 문서가 내린 것이다.

## 부수 관측

- **`plan-review-santa-adjudication.md`가 승인 경계에 가장 가까웠다** — 3/3 응답 · 3
  distinct roles로 통과했다. 기록 시각(2026-08-17)이 K=1 도입(2026-08-20) 이전이므로 당시
  rolesMin은 3이었고, K가 하나만 더 낮았어도 M·K 중 하나가 binding이 됐을 유일한 사례다.
  그래도 실제로는 binding이 아니었다.
- **O3의 실물 사례**: `.claude/reviews/plan-review-santa-adjudication.md`의 `plan_path`가
  `.claude/plans/santa-adjudication-m2.plan.md`를 가리킨다 — 레코드 slug가 PRD 경로에서
  파생되므로 후속 milestone의 실행이 이전 레코드를 덮어쓴 것이다. 35건이 하한인 이유가
  이것이고, 해소는 #9 소관이다.
