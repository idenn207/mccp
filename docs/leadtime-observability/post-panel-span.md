# post_panel_span — 패널 종료에서 ship까지 (M2)

> 생산: `node plugins/mccp/scripts/lib/leadtime.js --json` · 측정일 2026-09-02
> 이 문서의 모든 수치는 아래 「동결된 실측」 블록에서 유도된다. 손으로 옮긴 숫자는 없다.

## 이것은 e2e가 아니다

`post_panel_span`은 **패널 레코드가 write된 순간부터 그 plan이 ship된 순간까지**다.
앞뒤로 재지 않는 구간이 둘 더 있고, 그것을 0으로 가정하면 이 값이 리드타임 전체로
오독된다.

| 구간 | 소유 | 왜 여기 없나 |
|---|---|---|
| `/mccp:work` 진입 → 패널 시작 | **C2** | 그 이벤트를 생산하는 축이 따로 있고 이 축은 소비만 한다(UI5) |
| 5.2a → 레코드 write | **M1** (`panel_span`) | [panel-span.md](panel-span.md) |
| 임계값 · 자동 분기 | **C7** | 이 도구는 분포만 낸다. 숫자를 정하지 않는다(UI4) |

## 두 앵커는 끝까지 분리된다

끝점을 증언하는 소스가 둘이고, **어느 쪽이 옳은지 판정할 근거가 없다**. 그래서 합치지
않는다(DD2). 합치는 순간 그 선택이 영원히 검증되지 않는다.

| 계열 | 조인 키 | 앵커 시각 |
|---|---|---|
| `ledger_basename` | 패널 레코드의 `plan_path` basename ↔ completion-ledger 엔트리의 `plan_basename` | `completed_at` |
| `ship_plan_hash` | 패널 레코드의 `reviewed_plan_hash` ↔ `mccp-pr-codex` receipt의 `plan_hash` | `meta.created_at` |

ship 자격은 **재구현하지 않고** `pr-ship-gate.js`의 `deriveShipDecision`을 부른 반환값이다
(DD14). receipt 전체(`meta` 포함)를 넘기고 `forceOverrideActive`를 묶는다 — 그래야
무증거 skip이 배제되고, audited override로 실제 머지된 ship이 no-ship으로 접히지 않는다.
오늘 그 필터는 receipt 71건 중 **39건**을 자격 있는 것으로 인정했고,
그중 **5건**은 override가 자격을 만들었으며, **6건**은 증거 없는 `skipped`라
배제됐다.

## 커버리지 — 값보다 먼저 온다

측정 가능 패널 레코드 **40건**에 대해:

| 관측 | 값 |
|---|---|
| `ledger_basename` 조인 | 11/40 |
| `ship_plan_hash` 조인 | 12/40 |
| 두 축 모두 매치 | 6 |
| `ledger`만 | 5 |
| `ship`만 | 6 |
| 둘 다 없음 | 23 |

교차표 4칸의 합은 40이다(항등식 — 두 불리언 분할이므로 구성상 참이고, 회귀
가드일 뿐이다).

| 계열 | n | p50 | p90 | max |
|---|---|---|---|---|
| `ledger_basename` | 11 | 0.38일 | 0.70일 | 1.74일 |
| `ship_plan_hash` | 12 | 0.28일 | 1.74일 | 5.92일 |

백분위는 M1과 같은 nearest-rank이며 보간하지 않는다(DD7). n이 10 안팎이라 보간은 없는
정밀도를 만들고, 두 계열이 서로 다른 방법을 쓰면 비교 자체가 무의미해진다.

## 지표 4의 실측 결과 — 두 앵커는 시각에서 **전혀** 불일치하지 않는다

plan은 두 앵커의 불일치 자체를 지표로 삼았다. 실측하면 **양쪽 모두에 매치된 6건의
`anchor_delta_ms`가 전건 정확히 `0`이다** (p50 0.00일 · max 0.00일).

우연이 아니라 구조다. completion-ledger 엔트리의 `completed_at`은 그 ship receipt의
`meta.created_at`을 **그대로 복사**한다(같은 write 경로가 둘을 함께 발행한다). 즉 두
앵커는 독립된 두 증인이 아니라 **한 사건의 두 기록**이고, 둘이 함께 존재하는 한 시각은
정의상 같다.

따라서 **이 축에서 두 계열이 실제로 다른 것은 시각이 아니라 커버리지다**: `ledger`만
5건, `ship`만 6건. plan이 "불일치 자체가 지표 4"라고 적은 것은 시각 불일치를
염두에 둔 것이었고, 그 형태의 불일치는 오늘 코퍼스에서 **0이며 앞으로도 구조적으로 0에
가까울 것**이다. 살아있는 신호는 커버리지 차이 쪽이다.

이 결과는 DD2(두 계열을 합치지 않는다)를 **약화하지 않고 강화한다**. 시각이 같으므로
합쳐도 값은 안 변하지만, 합치면 **어느 소스가 그 레코드를 증언했는지**가 사라진다 —
그리고 그것이 오늘 유일하게 정보를 가진 축이다.

## 미짝 사유 분해 — `--` 버킷은 무엇이었나

plan의 Measured Baseline은 미짝 약 2/3가 "아직 ship 안 됨"인지 "앵커가 없음"인지
미분해라고 적었다. 분해 결과:

| 사유 | `ledger_basename` | `ship_plan_hash` |
|---|---|---|
| `no_plan_path` | 0 | 0 |
| `key_mismatch` | 0 | 16 |
| `anchor_absent` | 12 | 4 |
| `not_shipped` | 0 | 0 |
| `unclassified` | 17 | 8 |
| **합계** | **29** | **28** |

합계 등식 `unmatched === Σ(counts)`는 두 계열 모두 성립한다(깨지면 축이 `degraded`가
된다 — §3.11 C3의 fail-closed 등식과 같은 형태).

### 결론 1 — ledger 쓰기가 멈춘 것이 맞다 (PRD Open Question 4)

`ledger_basename`의 `anchor_absent` 12건 중 **6건은 반대축(ship receipt)이
직접 ship을 증언**한다. 그 plan들은 ship됐고 ledger 쪽 기록만 빠졌다. ledger의 마지막
엔트리는 **2026-08-21**인데 그 이후 발행된 자격 있는 ship receipt가 존재한다는 사실이
같은 방향을 가리킨다.

이 결론은 **ship verdict 필터를 통과한 뒤에도 유지된다**(Task 6 선행조건 b). receipt
존재만 세던 라운드 1의 판정이 아니라, `deriveShipDecision`이 자격을 인정한 receipt만
센 결과다.

### 결론 2 — `not_shipped`는 도달 가능하지만 오늘 0건이다

두 계열 모두 `not_shipped` **0건**이다. 이것을 "미짝이 전부 설명됐다"로 읽으면 안
된다. `not_shipped`는 증인 4종이 **전부 `no`**일 때만 성립하는데, 이 저장소의 plan은
거의 전부 커밋돼 있어 git 증인이 `yes`를 낸다. 즉 오늘 코퍼스에는 "작성됐고 리뷰됐지만
커밋조차 되지 않은 plan"이 없다.

버킷이 죽은 것이 아니라 **비어 있는 것**이며, 그 차이는 회귀 test가 직접 증명한다
(`leadtime.test.js` — 증인 하나를 `unavailable`에서 `no`로 바꾸면 같은 입력이
`unclassified`에서 `not_shipped`로 넘어간다).

### 결론 3 — 남은 미짝의 대부분은 `unclassified`이고, 그것이 정직한 산출이다

`ledger_basename`의 `unclassified` 17건은 대부분 "plan은 커밋됐지만 ship을 증언하는
것이 아무것도 없다"는 상태다. 증인 W2(implement receipt)·W3(git 이력)는 **ship 자격이
없다** — 구현이 돌았다는 것도, plan 파일이 커밋됐다는 것도 ship이 아니기 때문이다. 이
둘을 ship 증인으로 승격시키면 **커밋된 모든 plan이 ship된 것으로 보인다**.

그래서 이 17건은 "모른다"로 남는다. 미지를 미지로 두는 것이 이 분해의 산출물이고,
그 규모가 C1(배선 축)을 여는 근거다. 각 행에는 증인 4종의 3-state 값이 함께 실려 있어
판정을 재계산으로 반증할 수 있다.

### `key_mismatch` — 리뷰와 ship 사이에 plan이 바뀌는 것은 정상이다

`ship_plan_hash`의 `key_mismatch` 16건은 같은 `decision_id`의 ship receipt가
존재하는데 `plan_hash`가 리뷰 시점 `reviewed_plan_hash`와 다른 경우다. 이 저장소에서
리뷰 후 plan 본문이 바뀌는 것은 구조적으로 정상이므로(게이트 자신이 `## Codex ... Review`
섹션을 주입한다) 이것은 **결함 보고가 아니라 별도 사유**다. 그 16건이 hash 축의
커버리지를 basename 축보다 낮추지 않는 이유는, 같은 레코드가 basename 축에서는 매치되기
때문이다 — 두 축을 분리해 두었기에 보이는 사실이다.

## 부재와 손상은 다르다

- 앵커 소스를 **못 읽으면**(`read_error` 또는 개별 엔트리 `parse_failure`) 그 축은
  `degraded`로 실리되 **사유 분해를 내지 않는다**(DD13). 빈 분해를 싣는 것은 "분류했더니
  0건"과 구분되지 않고, 그러면 계측 고장이 완전한 측정으로 보인다.
- 소스가 **아예 없으면** 그것은 손상이 아니라 부재다. 관측 0건이므로 축 키가 실리지
  않는다(부재 규칙 a). 그래서 이 문서의 동결과 위 결론들은 **`post_panel_span` 키가 실려
  있고 그 축의 `state`가 `ok`일 때만** 기록된다 — 동결 시점의 값은 `state: "ok"`다.
- 증인의 소스가 `present:false` **또는** `read_error`면 그 증인은 `no`가 아니라
  `unavailable`이다. "증인이 부정했다"와 "증인이 없다"는 다른 사실이고, 후자를 전자로
  접으면 계측 부재가 단언으로 승격한다. `mccp-implement-codex`는 §3.12상 working-tree
  only라 다른 클론에서는 디렉토리 자체가 없다 — 그 환경에서 이 분해는 `unclassified`가
  늘어날 뿐 `not_shipped`를 단언하지 않는다.
- 음수 span(앵커가 패널보다 앞섬)은 clamp하지 않고 `negative_spans[]`에 보고하며 그 축을
  `degraded`로 만든다(DD6). 오늘 **0건**이다. 0으로 접으면 앵커가 뒤집힌 실재 사고가
  "즉시 ship"으로 보인다.

## 동결된 실측

아래는 `--json` 출력 **전문**이다(두 축 모두 포함). 축자 인용이며 이 문서의 모든 수치는
여기서 유도된다. 동결 시점의 최상위 `state`는 `ok`(합성값)이고
`post_panel_span.state`는 `ok`다.

```bash
node plugins/mccp/scripts/lib/leadtime.js --json
```

> [panel-span.md](panel-span.md)의 `panel_span` 블록은 **같은 실행**에서 나온 하위
> 투영이다. 둘은 함께 재생성해야 한다.

<!-- BEGIN leadtime.js --json (verbatim) -->

```json
{
  "tool": "leadtime",
  "state": "ok",
  "files_scanned": 81,
  "records": 40,
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
      "files": 74
    },
    {
      "dir": ".claude/reviews/archive",
      "present": true,
      "files": 7
    }
  ],
  "coverage": {
    "panel_records": 53,
    "measurable": 40,
    "unmeasurable": 13,
    "counts_are_lower_bound": true,
    "panel_span_observed": 40,
    "panel_span_missing": 0,
    "panel_span_missing_records": []
  },
  "panel_span": {
    "state": "ok",
    "unit": "ms",
    "method": "nearest-rank",
    "n": 40,
    "min": 43984,
    "p50": 455662,
    "p90": 756525,
    "max": 25642300,
    "by_verdict": {
      "converged": {
        "n": 5,
        "min": 357124,
        "p50": 382180,
        "p90": 779328,
        "max": 779328
      },
      "divergent": {
        "n": 34,
        "min": 43984,
        "p50": 458072,
        "p90": 756525,
        "max": 25642300
      },
      "unknown": {
        "n": 1,
        "min": 79246,
        "p50": 79246,
        "p90": 79246,
        "max": 79246
      }
    },
    "by_halt_stage": {
      "(completed)": {
        "n": 24,
        "min": 191178,
        "p50": 499883,
        "p90": 873036,
        "max": 25642300
      },
      "5.2b": {
        "n": 1,
        "min": 79246,
        "p50": 79246,
        "p90": 79246,
        "max": 79246
      },
      "5.2e": {
        "n": 15,
        "min": 43984,
        "p50": 347898,
        "p90": 665570,
        "max": 716586
      }
    },
    "records": [
      {
        "record": ".claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 43984,
        "recorded_at": "2026-08-09T12:36:02.852Z",
        "plan_path": ".claude/plans/diverse-agent-review-m4.plan.md",
        "reviewed_plan_hash": null
      },
      {
        "record": ".claude/reviews/plan-review-environment-uniformity.md",
        "verdict": "unknown",
        "halt_stage": "5.2b",
        "panel_span_ms": 79246,
        "recorded_at": "2026-08-19T03:35:23.125Z",
        "plan_path": ".claude/plans/environment-doc-uniformity.plan.md",
        "reviewed_plan_hash": "sha256:3188f08aa7efc1eb4914c7c8bfdbed2e60307ff37addb999cd223a6b0b9d1272"
      },
      {
        "record": ".claude/reviews/archive/plan-review-review-loop-bypass-m1.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 128087,
        "recorded_at": "2026-08-18T06:42:59.137Z",
        "plan_path": ".claude/plans/review-loop-bypass-m1.plan.md",
        "reviewed_plan_hash": null
      },
      {
        "record": ".claude/reviews/plan-review-leadtime-observability-m2.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 191178,
        "recorded_at": "2026-09-02T01:23:24.419Z",
        "plan_path": ".claude/plans/leadtime-observability-m2.plan.md",
        "reviewed_plan_hash": "sha256:d3fd826ad2addfd0f8b67dfa54c7a9993a9194d7b5a76c29e2ad7c4e8fe4a7b5"
      },
      {
        "record": ".claude/reviews/plan-review-leadtime-observability.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 279845,
        "recorded_at": "2026-09-01T06:46:44.977Z",
        "plan_path": ".claude/plans/leadtime-observability-m1.plan.md",
        "reviewed_plan_hash": "sha256:674cbfd41331426050752d9eb0f0916d982dced927d70bfb0341e593f1ab40e5"
      },
      {
        "record": ".claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 280209,
        "recorded_at": "2026-08-13T22:24:38.624Z",
        "plan_path": ".claude/plans/diverse-agent-review-m6.plan.md",
        "reviewed_plan_hash": "sha256:fa7633106d3e3b87238ac761d06966b51741f494b28aafe227fcad52ae2b7123"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r9-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 296510,
        "recorded_at": "2026-08-17T15:41:45.606Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:16a1e40a02ca3bc029fddd2df4fd67fb539e0901184df68cedc006bead247a72"
      },
      {
        "record": ".claude/reviews/plan-review-leadtime-observability-m1.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 299762,
        "recorded_at": "2026-09-01T07:16:41.892Z",
        "plan_path": ".claude/plans/leadtime-observability-m1.plan.md",
        "reviewed_plan_hash": "sha256:674cbfd41331426050752d9eb0f0916d982dced927d70bfb0341e593f1ab40e5"
      },
      {
        "record": ".claude/reviews/plan-review-santa-adjudication-m3.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 300022,
        "recorded_at": "2026-08-17T13:32:18.535Z",
        "plan_path": ".claude/plans/santa-adjudication-m3.plan.md",
        "reviewed_plan_hash": "sha256:568876d1137a21cf9f2e7483db879656a6e20eea1767b012f104a36867a3c8a7"
      },
      {
        "record": ".claude/reviews/archive/plan-review-followup-R11.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 317044,
        "recorded_at": "2026-08-16T20:00:49.391Z",
        "plan_path": ".claude/plans/session-process-reclaim-followup.plan.md",
        "reviewed_plan_hash": "sha256:26fe6d392de6f9f3f3f5cf0bbfa9a9bbe330079e5bd55857e2681e6da41c3d7a"
      },
      {
        "record": ".claude/reviews/plan-review-session-process-reclaim-followup.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 318949,
        "recorded_at": "2026-08-16T21:17:39.795Z",
        "plan_path": ".claude/plans/session-process-reclaim-followup.plan.md",
        "reviewed_plan_hash": "sha256:2e33d2e1e0f9730f34ec1a0f4ba4f38d4c7f01ccc205d07447267d6522e4ac4c"
      },
      {
        "record": ".claude/reviews/plan-review-codex-intent-context.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 347898,
        "recorded_at": "2026-08-13T23:25:03.792Z",
        "plan_path": ".claude/plans/codex-intent-context-m2.plan.md",
        "reviewed_plan_hash": "sha256:febac86e22eb089e70561debd72894e7c617ce78235f29a8509291de8c57ab32"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r10-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 354525,
        "recorded_at": "2026-08-17T15:50:37.122Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:a38fe80c0f96c4672f44f7e6d5a1c2d169d13328bce3a007a972725388ea525d"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m6.md",
        "verdict": "converged",
        "halt_stage": null,
        "panel_span_ms": 357124,
        "recorded_at": "2026-08-15T18:10:05.530Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m6.plan.md",
        "reviewed_plan_hash": "sha256:e2338ca5430b930739ecd3fd7e9d808c5bc29bf72bc1c9419903f6233061765a"
      },
      {
        "record": ".claude/reviews/plan-review-santa-adjudication-m1.md",
        "verdict": "converged",
        "halt_stage": null,
        "panel_span_ms": 363402,
        "recorded_at": "2026-08-16T12:37:33.053Z",
        "plan_path": ".claude/plans/santa-adjudication-m1.plan.md",
        "reviewed_plan_hash": "sha256:1f77424e0164f92c172a638ac7e821149ddb3cc6b0f7e4c17033e8964f0fe475"
      },
      {
        "record": ".claude/reviews/plan-review-santa-adjudication.md",
        "verdict": "converged",
        "halt_stage": null,
        "panel_span_ms": 382180,
        "recorded_at": "2026-08-17T05:52:56.874Z",
        "plan_path": ".claude/plans/santa-adjudication-m2.plan.md",
        "reviewed_plan_hash": "sha256:407a98258c7d6942f9c6b6943bdb86b953cb2643e761cca2cb4a3a85f89ad91b"
      },
      {
        "record": ".claude/reviews/plan-review-santa-delta-review-r0.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 447105,
        "recorded_at": "2026-08-21T07:27:55.572Z",
        "plan_path": ".claude/plans/santa-delta-review-m3.plan.md",
        "reviewed_plan_hash": "sha256:18f925384c0d698eeaf9e921b3b3ffbeee1f4a6b1d87d539ffb270722f61314b"
      },
      {
        "record": ".claude/reviews/plan-review-santa-delta-review.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 447105,
        "recorded_at": "2026-08-21T07:27:55.572Z",
        "plan_path": ".claude/plans/santa-delta-review-m3.plan.md",
        "reviewed_plan_hash": "sha256:18f925384c0d698eeaf9e921b3b3ffbeee1f4a6b1d87d539ffb270722f61314b"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r8-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 449737,
        "recorded_at": "2026-08-17T15:34:49.238Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:a4b83762c2f385511e105fd34369ec7d20a3842480737aa8c3d5a12ca26e225f"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r11-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 455662,
        "recorded_at": "2026-08-17T15:59:33.730Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:38b192d9f1f8632080ee7f670c3cbad656971de5c97e225c3243b17ee4bd044b"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 458072,
        "recorded_at": "2026-08-21T01:42:15.498Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:f6bfde5a006196cbfc6034459a4e9c40f714e7f85c94679a9a65687f167441a8"
      },
      {
        "record": ".claude/reviews/plan-review-diverse-agent-review-m7-budget.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 482116,
        "recorded_at": "2026-08-21T03:42:10.877Z",
        "plan_path": ".claude/plans/diverse-agent-review-m7.plan.md",
        "reviewed_plan_hash": "sha256:bce85ab6ad9faf5719edd759f67b79773e8e1a6f9c457ea3ec79be5c9492fcae"
      },
      {
        "record": ".claude/reviews/plan-review-codex-intent-context-m2.md",
        "verdict": "converged",
        "halt_stage": null,
        "panel_span_ms": 499741,
        "recorded_at": "2026-08-15T03:31:00.883Z",
        "plan_path": ".claude/plans/codex-intent-context-m2.plan.md",
        "reviewed_plan_hash": "sha256:9e22d72b2e21327be828029d78bc3bd43d5f90d16c7a91a42678e403629591bd"
      },
      {
        "record": ".claude/reviews/plan-review-impeccable-detection-contract-m1.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 499883,
        "recorded_at": "2026-08-22T08:32:50.875Z",
        "plan_path": ".claude/plans/impeccable-detection-contract-m1.plan.md",
        "reviewed_plan_hash": "sha256:17f9208e368a424250543b1dd803acc702058c7e8e17d54dcad994592b69ed8e"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r6-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 537115,
        "recorded_at": "2026-08-17T14:21:31.883Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:eb71d6cf71b5781fc83813ad9285bd9347cd89747ad7286f48d5c11e9ce384f2"
      },
      {
        "record": ".claude/reviews/archive/plan-review-followup-R12.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 578733,
        "recorded_at": "2026-08-16T20:34:33.815Z",
        "plan_path": ".claude/plans/session-process-reclaim-followup.plan.md",
        "reviewed_plan_hash": "sha256:838db85fa633355b1069df69ad1febc7c8773782b8ffe5bbf9e7256d3953e874"
      },
      {
        "record": ".claude/reviews/plan-review-codex-disabled-round-invariant.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 618218,
        "recorded_at": "2026-08-25T09:18:57.141Z",
        "plan_path": ".claude/plans/codex-disabled-round-invariant-m1.plan.md",
        "reviewed_plan_hash": "sha256:17c335d4446ace724472480de240f5ce48391fb4fa1d0b71dc195850ba84e9fb"
      },
      {
        "record": ".claude/reviews/plan-review-santa-evidence-diversity.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 634657,
        "recorded_at": "2026-08-19T05:50:57.193Z",
        "plan_path": ".claude/plans/santa-evidence-diversity-m3.plan.md",
        "reviewed_plan_hash": "sha256:9af3f69e98015176b778fc4b63892a44c438df881fa41882f26fef92e8346682"
      },
      {
        "record": ".claude/reviews/plan-review-environment-doc-uniformity.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 650958,
        "recorded_at": "2026-08-19T05:44:37.152Z",
        "plan_path": ".claude/plans/environment-doc-uniformity.plan.md",
        "reviewed_plan_hash": "sha256:a3c83fa31213edd201115ba9d192dbfd105d467fa18bcc25da099b84ece562a5"
      },
      {
        "record": ".claude/reviews/archive/plan-review-followup-R13.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 665570,
        "recorded_at": "2026-08-16T21:08:08.275Z",
        "plan_path": ".claude/plans/session-process-reclaim-followup.plan.md",
        "reviewed_plan_hash": "sha256:685fc9e9da4a2ddde67b1d98eb6abd1f5960eee71979a225057a83606790914c"
      },
      {
        "record": ".claude/reviews/plan-review-santa-evidence-diversity-m2.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 673432,
        "recorded_at": "2026-08-19T01:56:27.468Z",
        "plan_path": ".claude/plans/santa-evidence-diversity-m2.plan.md",
        "reviewed_plan_hash": "sha256:f1bc85930291667225838816b22b57d1a3cdaf5a5162dc5968f50248beeebb4f"
      },
      {
        "record": ".claude/reviews/plan-review-review-loop-bypass.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 675158,
        "recorded_at": "2026-08-18T08:57:02.107Z",
        "plan_path": ".claude/plans/review-loop-bypass-m2.plan.md",
        "reviewed_plan_hash": "sha256:6848f0fd9b1b02fb1179b0500509091310f0ac61218ad89e07b0f9bf179644f7"
      },
      {
        "record": ".claude/reviews/plan-review-codex-intent-context-m3.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 706711,
        "recorded_at": "2026-08-21T04:27:27.060Z",
        "plan_path": ".claude/plans/codex-intent-context-m3.plan.md",
        "reviewed_plan_hash": "sha256:3e2e85a4043b306ab82b28e4a667f67e0b47ae31104e7311edf2aebc65375283"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r7-blocked.md",
        "verdict": "divergent",
        "halt_stage": "5.2e",
        "panel_span_ms": 716586,
        "recorded_at": "2026-08-17T15:22:29.785Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m7.plan.md",
        "reviewed_plan_hash": "sha256:1d2e9caeb4fd2e8e95d2d8f17e09747d030e068d2dce71662372b27336b02232"
      },
      {
        "record": ".claude/reviews/plan-review-diverse-agent-review.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 739649,
        "recorded_at": "2026-08-26T02:30:12.370Z",
        "plan_path": ".claude/plans/diverse-agent-review-m8.plan.md",
        "reviewed_plan_hash": "sha256:766d368f6673bfc3685e40e9477715a082f782ae015e2f4654f62949e69d9de6"
      },
      {
        "record": ".claude/reviews/plan-review-impeccable-detection-contract-m2.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 756525,
        "recorded_at": "2026-08-22T12:25:17.027Z",
        "plan_path": ".claude/plans/impeccable-detection-contract-m2.plan.md",
        "reviewed_plan_hash": "sha256:e9775b74edd3c51fc16fd7ba0e6cfef441af872241f0c247ed7a9bb1fc1142a5"
      },
      {
        "record": ".claude/reviews/plan-review-impeccable-detection-contract.md",
        "verdict": "converged",
        "halt_stage": null,
        "panel_span_ms": 779328,
        "recorded_at": "2026-08-23T12:40:46.234Z",
        "plan_path": ".claude/plans/impeccable-detection-contract-m6.plan.md",
        "reviewed_plan_hash": "sha256:887fc89d67c5c742aecbe60c435bca1ab06ad3d2c261e552b66b6477b1a32272"
      },
      {
        "record": ".claude/reviews/plan-review-impeccable-detection-contract-m5.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 873036,
        "recorded_at": "2026-08-23T09:34:13.144Z",
        "plan_path": ".claude/plans/impeccable-detection-contract-m5.plan.md",
        "reviewed_plan_hash": "sha256:2e7c31745d1efc5e737f0a8de521a918872fd75524644e98b7cfe29d924cd870"
      },
      {
        "record": ".claude/reviews/plan-review-multi-session-work-loop.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 1162476,
        "recorded_at": "2026-08-25T01:25:49.542Z",
        "plan_path": ".claude/plans/multi-session-work-loop-m8.plan.md",
        "reviewed_plan_hash": "sha256:3b5b0470a301aa84564076557e40c4a20b397cbeb4322670344088ff81bc1ad6"
      },
      {
        "record": ".claude/reviews/plan-review-review-loop-bypass-m2.md",
        "verdict": "divergent",
        "halt_stage": null,
        "panel_span_ms": 25642300,
        "recorded_at": "2026-08-19T00:34:10.249Z",
        "plan_path": ".claude/plans/review-loop-bypass-m2.plan.md",
        "reviewed_plan_hash": "sha256:de85a8cbe5e8843280fb5b71e925ecd291ab7bdb59abbd1bd7f0b0a017b62718"
      }
    ]
  },
  "post_panel_span": {
    "state": "ok",
    "unit": "ms",
    "method": "nearest-rank",
    "by_anchor": {
      "ledger_basename": {
        "source_unavailable": false,
        "n": 11,
        "min": 4602689,
        "p50": 33035593,
        "p90": 60830831,
        "max": 150743189,
        "records": [
          {
            "record": ".claude/reviews/plan-review-review-loop-bypass-m2.md",
            "panel_recorded_at": "2026-08-19T00:34:10.249Z",
            "anchor_at": "2026-08-19T01:50:52.938Z",
            "span_ms": 4602689,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-diverse-agent-review-m7-budget.md",
            "panel_recorded_at": "2026-08-21T03:42:10.877Z",
            "anchor_at": "2026-08-21T05:27:59.774Z",
            "span_ms": 6348897,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-codex-intent-context-m3.md",
            "panel_recorded_at": "2026-08-21T04:27:27.060Z",
            "anchor_at": "2026-08-21T07:19:13.895Z",
            "span_ms": 10306835,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-santa-adjudication.md",
            "panel_recorded_at": "2026-08-17T05:52:56.874Z",
            "anchor_at": "2026-08-17T09:13:24.300Z",
            "span_ms": 12027426,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-session-process-reclaim-followup.md",
            "panel_recorded_at": "2026-08-16T21:17:39.795Z",
            "anchor_at": "2026-08-17T06:18:43.868Z",
            "span_ms": 32464073,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/archive/plan-review-followup-R13.md",
            "panel_recorded_at": "2026-08-16T21:08:08.275Z",
            "anchor_at": "2026-08-17T06:18:43.868Z",
            "span_ms": 33035593,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-santa-adjudication-m1.md",
            "panel_recorded_at": "2026-08-16T12:37:33.053Z",
            "anchor_at": "2026-08-16T22:09:38.606Z",
            "span_ms": 34325553,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/archive/plan-review-followup-R12.md",
            "panel_recorded_at": "2026-08-16T20:34:33.815Z",
            "anchor_at": "2026-08-17T06:18:43.868Z",
            "span_ms": 35050053,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/archive/plan-review-followup-R11.md",
            "panel_recorded_at": "2026-08-16T20:00:49.391Z",
            "anchor_at": "2026-08-17T06:18:43.868Z",
            "span_ms": 37074477,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-review-loop-bypass.md",
            "panel_recorded_at": "2026-08-18T08:57:02.107Z",
            "anchor_at": "2026-08-19T01:50:52.938Z",
            "span_ms": 60830831,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-multi-session-work-loop-m6.md",
            "panel_recorded_at": "2026-08-15T18:10:05.530Z",
            "anchor_at": "2026-08-17T12:02:28.719Z",
            "span_ms": 150743189,
            "candidates": 1
          }
        ]
      },
      "ship_plan_hash": {
        "source_unavailable": false,
        "n": 12,
        "min": 1963023,
        "p50": 24176707,
        "p90": 150743189,
        "max": 511876477,
        "records": [
          {
            "record": ".claude/reviews/plan-review-codex-disabled-round-invariant.md",
            "panel_recorded_at": "2026-08-25T09:18:57.141Z",
            "anchor_at": "2026-08-25T09:51:40.164Z",
            "span_ms": 1963023,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-review-loop-bypass-m2.md",
            "panel_recorded_at": "2026-08-19T00:34:10.249Z",
            "anchor_at": "2026-08-19T01:50:52.938Z",
            "span_ms": 4602689,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-diverse-agent-review-m7-budget.md",
            "panel_recorded_at": "2026-08-21T03:42:10.877Z",
            "anchor_at": "2026-08-21T05:27:59.774Z",
            "span_ms": 6348897,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-codex-intent-context-m3.md",
            "panel_recorded_at": "2026-08-21T04:27:27.060Z",
            "anchor_at": "2026-08-21T07:19:13.895Z",
            "span_ms": 10306835,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-santa-adjudication.md",
            "panel_recorded_at": "2026-08-17T05:52:56.874Z",
            "anchor_at": "2026-08-17T09:13:24.300Z",
            "span_ms": 12027426,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-multi-session-work-loop-m7.md",
            "panel_recorded_at": "2026-08-21T01:42:15.498Z",
            "anchor_at": "2026-08-21T08:25:12.205Z",
            "span_ms": 24176707,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-santa-adjudication-m1.md",
            "panel_recorded_at": "2026-08-16T12:37:33.053Z",
            "anchor_at": "2026-08-16T22:09:38.606Z",
            "span_ms": 34325553,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-santa-evidence-diversity.md",
            "panel_recorded_at": "2026-08-19T05:50:57.193Z",
            "anchor_at": "2026-08-20T02:40:14.712Z",
            "span_ms": 74957519,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-environment-doc-uniformity.md",
            "panel_recorded_at": "2026-08-19T05:44:37.152Z",
            "anchor_at": "2026-08-20T02:36:06.580Z",
            "span_ms": 75089428,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-diverse-agent-review.md",
            "panel_recorded_at": "2026-08-26T02:30:12.370Z",
            "anchor_at": "2026-08-27T05:56:17.644Z",
            "span_ms": 98765274,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-multi-session-work-loop-m6.md",
            "panel_recorded_at": "2026-08-15T18:10:05.530Z",
            "anchor_at": "2026-08-17T12:02:28.719Z",
            "span_ms": 150743189,
            "candidates": 1
          },
          {
            "record": ".claude/reviews/plan-review-codex-intent-context-m2.md",
            "panel_recorded_at": "2026-08-15T03:31:00.883Z",
            "anchor_at": "2026-08-21T01:42:17.360Z",
            "span_ms": 511876477,
            "candidates": 1
          }
        ]
      }
    },
    "disagreement": {
      "unit": "ms",
      "method": "nearest-rank",
      "measured_over": "abs(anchor_delta_ms)",
      "n": 6,
      "p50": 0,
      "max": 0,
      "records": [
        {
          "record": ".claude/reviews/plan-review-codex-intent-context-m3.md",
          "ledger_anchor_at": "2026-08-21T07:19:13.895Z",
          "ship_anchor_at": "2026-08-21T07:19:13.895Z",
          "anchor_delta_ms": 0
        },
        {
          "record": ".claude/reviews/plan-review-diverse-agent-review-m7-budget.md",
          "ledger_anchor_at": "2026-08-21T05:27:59.774Z",
          "ship_anchor_at": "2026-08-21T05:27:59.774Z",
          "anchor_delta_ms": 0
        },
        {
          "record": ".claude/reviews/plan-review-multi-session-work-loop-m6.md",
          "ledger_anchor_at": "2026-08-17T12:02:28.719Z",
          "ship_anchor_at": "2026-08-17T12:02:28.719Z",
          "anchor_delta_ms": 0
        },
        {
          "record": ".claude/reviews/plan-review-review-loop-bypass-m2.md",
          "ledger_anchor_at": "2026-08-19T01:50:52.938Z",
          "ship_anchor_at": "2026-08-19T01:50:52.938Z",
          "anchor_delta_ms": 0
        },
        {
          "record": ".claude/reviews/plan-review-santa-adjudication-m1.md",
          "ledger_anchor_at": "2026-08-16T22:09:38.606Z",
          "ship_anchor_at": "2026-08-16T22:09:38.606Z",
          "anchor_delta_ms": 0
        },
        {
          "record": ".claude/reviews/plan-review-santa-adjudication.md",
          "ledger_anchor_at": "2026-08-17T09:13:24.300Z",
          "ship_anchor_at": "2026-08-17T09:13:24.300Z",
          "anchor_delta_ms": 0
        }
      ]
    },
    "negative_spans": [],
    "coverage": {
      "eligible": 40,
      "no_panel_timestamp": 0,
      "no_panel_timestamp_records": [],
      "matched_ledger_basename": 11,
      "matched_ship_plan_hash": 12,
      "both": 6,
      "only_ledger": 5,
      "only_ship": 6,
      "neither": 23,
      "ledger_entries_total": 44,
      "ship_receipts_total": 71,
      "ship_receipts_qualified": 39,
      "ship_receipts_unproven_skip": 6,
      "ship_receipts_override_qualified": 5,
      "sources": [
        {
          "dir": ".claude/state/completion-ledger",
          "present": true,
          "read_error": false,
          "parse_failures": 0,
          "files": 44
        },
        {
          "dir": ".claude/receipts/mccp-pr-codex",
          "present": true,
          "read_error": false,
          "parse_failures": 0,
          "files": 71
        },
        {
          "dir": ".claude/PRPs/plans/archived",
          "present": true,
          "read_error": false,
          "parse_failures": 0,
          "files": 136
        },
        {
          "dir": ".claude/receipts/mccp-implement-codex",
          "present": true,
          "read_error": false,
          "parse_failures": 0,
          "files": 2
        }
      ],
      "git_witness": {
        "available": true,
        "reason": "ok"
      }
    },
    "unmatched": {
      "ledger_basename": {
        "total": 29,
        "counts": {
          "no_plan_path": 0,
          "key_mismatch": 0,
          "anchor_absent": 12,
          "not_shipped": 0,
          "unclassified": 17
        },
        "sum_equation_holds": true,
        "by_reason": {
          "no_plan_path": [],
          "key_mismatch": [],
          "anchor_absent": [
            {
              "record": ".claude/reviews/plan-review-codex-disabled-round-invariant.md",
              "witness": "opposite_anchor",
              "witnesses": {
                "opposite_anchor": "yes",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-codex-intent-context-m2.md",
              "witness": "opposite_anchor",
              "witnesses": {
                "opposite_anchor": "yes",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-codex-intent-context.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-diverse-agent-review.md",
              "witness": "opposite_anchor",
              "witnesses": {
                "opposite_anchor": "yes",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-environment-doc-uniformity.md",
              "witness": "opposite_anchor",
              "witnesses": {
                "opposite_anchor": "yes",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7.md",
              "witness": "opposite_anchor",
              "witnesses": {
                "opposite_anchor": "yes",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-adjudication-m3.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-delta-review-r0.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-delta-review.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-evidence-diversity-m2.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-evidence-diversity.md",
              "witness": "opposite_anchor",
              "witnesses": {
                "opposite_anchor": "yes",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/archive/plan-review-review-loop-bypass-m1.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            }
          ],
          "not_shipped": [],
          "unclassified": [
            {
              "record": ".claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-environment-uniformity.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract-m1.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract-m2.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract-m5.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-leadtime-observability-m1.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "yes",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-leadtime-observability-m2.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "yes",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-leadtime-observability.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "yes",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r10-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r11-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r6-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r7-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r8-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r9-blocked.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            }
          ]
        }
      },
      "ship_plan_hash": {
        "total": 28,
        "counts": {
          "no_plan_path": 0,
          "key_mismatch": 16,
          "anchor_absent": 4,
          "not_shipped": 0,
          "unclassified": 8
        },
        "sum_equation_holds": true,
        "by_reason": {
          "no_plan_path": [],
          "key_mismatch": [
            {
              "record": ".claude/reviews/plan-review-codex-intent-context.md"
            },
            {
              "record": ".claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-environment-uniformity.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r10-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r11-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r6-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r7-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r8-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop-m7-r9-blocked.md"
            },
            {
              "record": ".claude/reviews/plan-review-multi-session-work-loop.md"
            },
            {
              "record": ".claude/reviews/plan-review-review-loop-bypass.md"
            },
            {
              "record": ".claude/reviews/plan-review-santa-adjudication-m3.md"
            },
            {
              "record": ".claude/reviews/plan-review-session-process-reclaim-followup.md"
            },
            {
              "record": ".claude/reviews/archive/plan-review-followup-R11.md"
            },
            {
              "record": ".claude/reviews/archive/plan-review-followup-R12.md"
            },
            {
              "record": ".claude/reviews/archive/plan-review-followup-R13.md"
            }
          ],
          "anchor_absent": [
            {
              "record": ".claude/reviews/plan-review-santa-delta-review-r0.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-delta-review.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-santa-evidence-diversity-m2.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/archive/plan-review-review-loop-bypass-m1.md",
              "witness": "archived_plan",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "yes",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            }
          ],
          "not_shipped": [],
          "unclassified": [
            {
              "record": ".claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract-m1.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract-m2.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract-m5.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-impeccable-detection-contract.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "no",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-leadtime-observability-m1.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "yes",
                "git_history": "yes"
              }
            },
            {
              "record": ".claude/reviews/plan-review-leadtime-observability-m2.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "yes",
                "git_history": "no"
              }
            },
            {
              "record": ".claude/reviews/plan-review-leadtime-observability.md",
              "witnesses": {
                "opposite_anchor": "no",
                "archived_plan": "no",
                "implement_receipt": "yes",
                "git_history": "yes"
              }
            }
          ]
        }
      }
    }
  },
  "state_is_composite": true
}
```

<!-- END leadtime.js --json (verbatim) -->

## 한계 — 이 문서가 주장하지 않는 것

- **임계를 정하지 않는다.** "0.38일이면 괜찮다"도 여기서 말하지 않는다. C7 소유다.
- **어느 앵커가 옳은지 정하지 않는다.** 오늘 커버리지가 11 대 12로 사실상 동률이고,
  시각은 구조적으로 같다. 판정할 근거가 없으므로 판정하지 않는다.
- **두 축의 ship 자격 기준은 대등하지 않다.** `ship_plan_hash`는
  `pr-ship-gate.js#deriveShipDecision`을 통과한 receipt만 앵커로 인정한다(무증거 skip
  배제 · audited override 포함). `ledger_basename`은 **엔트리 존재만으로** 인정하며 그
  엔트리에 실린 `verdict`·`receipt_hash`를 자격 축으로 쓰지 않는다. 실측하면 ledger 44건
  중 이 트리의 receipt에 결속된 25건이 있고 그중 **4건**이 `skipped-unproven`으로 자격
  박탈된 receipt에 결속돼 있다(`codex-intent-context-m1` · `context-budget-cleanup` ·
  `diverse-agent-review-m1` · `multi-session-work-loop-m4`). 오늘의 산출값은 그 4건이
  매치 11건에 **한 건도 들어가지 않아** 오염되지 않았지만, 같은 basename을 가진 패널
  레코드가 생기면 오염된다. 같은 비대칭이 반대축 증인(W0)에도 전파되므로 `ship` 축의
  `anchor_absent` 승격 역시 무자격 ledger 매치를 근거로 삼을 수 있다. **따라서 위 두
  줄의 "동률"은 건수의 동률이지 증거 강도의 동률이 아니다** — 이 문서를 인용하는 축은
  그 차이를 전제에 포함해야 한다. 대칭화(ledger를 `receipt_hash` 결속으로 자격 검사)는
  산출값의 의미를 바꾸므로 M2가 하지 않고 표면화만 한다.
- **`unclassified`를 결함으로 세지 않는다.** 그것은 증인이 답하지 못한 상태의 정직한
  이름이며, 줄이는 일은 새 증인을 만드는 축(C1)의 몫이다.
- **없는 기록을 소급 생성하지 않는다.** 죽은 ledger 구간을 메우려 과거 시각을 추정하지
  않았다(UI6). 그 구간은 `anchor_absent`로 **표면화**될 뿐 복원되지 않는다.
- **코퍼스는 자기 자신을 늘린다.** 이 축을 측정하기 위해 게이트를 돌리면 그 실행이 새
  레코드가 되어 분모에 들어간다. 이 문서의 수치는 **측정일 시점의 스냅샷**이고, 리터럴로
  고정된 검증은 다음 게이트 실행에서 반드시 거짓이 된다 — test가 관계 단언만 쓰는 이유다.
