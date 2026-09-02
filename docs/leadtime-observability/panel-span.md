# panel_span — plan 리뷰 게이트 벽시계 실측 (M1)

> 생산: `node plugins/mccp/scripts/lib/leadtime.js --json` · 측정일 2026-09-02 (M2에서 재생성)
> 이 문서의 모든 수치는 아래 「동결된 실측」 블록에서 유도된다. 손으로 옮긴 숫자는 없다.

## 이 값이 재는 구간

`panel_span`은 `/mccp:plan` Phase 5.2a가 `.claude/state/plan-review/started-at`을 찍은
순간부터 `record.js`가 리뷰 레코드를 write한 순간까지다. **한 번의 plan 리뷰 게이트 실행이
벽시계로 얼마나 걸렸는가**이고, 그 값은 이미 레코드마다 `measurement.wall_clock_ms`로
기록돼 있었다. M1은 새 계측을 심지 않았다 — 있는 값을 읽어 분포로 만들었을 뿐이다.

## 이 값이 재지 **않는** 구간

**이름이 재는 구간을 말한다**는 원칙은 PRD 결정 2가 못박았다. 다만 결정 2가 명시적으로
이름을 지은 축은 M2의 `post_panel_span`(패널 종료 → ship)이고, `panel_span`이라는 이름은
같은 원칙을 M1 축에 적용한 **저자 선택**이다 — 두 이름은 서로 다른 구간을 가리키므로
혼동하지 말 것. 어느 쪽이든 `e2e`가 아니다. 아래 셋은 이 숫자에 **들어있지 않다**.

| 구간 | 소유 | 왜 여기 없나 |
|---|---|---|
| 패널 종료 → ship | **M2** (`post_panel_span`) | completion-ledger와 `mccp-pr-codex` receipt를 조인해야 한다. M1은 조인을 하지 않는다 |
| `/mccp:work` 진입 → 패널 시작 | **C2** | 그 이벤트를 생산하는 축이 따로 있고 이 축은 소비만 한다 |
| 임계값 · 자동 분기 | **C7** | 이 도구는 분포만 낸다. 숫자를 정하지 않는다 |

따라서 아래의 어떤 값도 "기능 하나가 완성되기까지 걸린 시간"이 아니다. 그렇게 인용하면
M2·C2가 아직 재지 않은 두 구간을 0으로 가정하는 것이 된다.

## 커버리지 — 값보다 먼저 온다

`.claude/reviews/` + `.claude/reviews/archive/`에서 **92개 파일**을 스캔했다. 그중:

- **30건** `out_of_corpus` — PR·santa·local·security 리뷰 등 다른 생산자의 문서. 코퍼스가
  아니므로 결손이 아니다.
- **13건** `pre_measurement` — 패널 레코드이지만 `## Measurement` 블록 자체가 없다.
  그 블록을 도입하기 전 레코드라 오독할 측정값이 애초에 없다. 계측 고장이 아니라
  **코퍼스의 시간 경계**다.
- **0건** `parse_failure`, `read_error=false`.

남는 것이 코퍼스다: 패널 레코드 **62건 중 측정 가능 49건**. 따라서 아래 카운트는 전부
**하한**이다(`counts_are_lower_bound: true`). 그리고 그 49건의 `wall_clock_ms` 결측은
**0건**이다 — 즉 측정 가능한 레코드는 전부 실제로 관측됐다(`panel_span_observed: 49`,
`panel_span_missing: 0`).

`panel_span.state: "ok"`. 최상위 `state`도 `ok`이지만 그것은 **합성값**이다 — M2 이후
최상위는 실린 축들의 사다리 최악값이므로, 이 축만 보려면 `panel_span.state`를 읽어야
한다.

## 판정 — `corpus.js`의 pass-path 보고는 분포를 과소보고한다

M1 이전에 이 벽시계를 보고하던 유일한 소비처는 `corpus.js`의 `pass_path`이고, 그것은
**converged 레코드만** 필터한다. 그 층과 전체를 나란히 놓으면 격차가 한 출력에 보인다.

| 층 | n | p50 | p90 | max |
|---|---|---|---|---|
| `converged` (pass_path가 보던 전부) | 5 | 6.4분 | 13.0분 | 13.0분 |
| **전체** | **49** | **7.6분** | **12.6분** | **427.4분 (7.12시간)** |
| `divergent` | 43 | 7.6분 | 11.9분 | 427.4분 |
| `unknown` (verdict 미기재 1건) | 1 | 1.3분 | 1.3분 | 1.3분 |

converged 층만 보면 이 게이트는 **최악이 13분**인 절차로 보인다. 실제 최악은
**7.12시간**이고 그 레코드는 `.claude/reviews/plan-review-review-loop-bypass-m2.md`다.
즉 집계 커버리지 5/49(10.2%)가 max를 약 33배(32.9×) 과소보고하고 있었다.

**미관측은 측정 부재가 아니라 집계 부재였다.** 이 49건은 M1이 새로 계측한 것이 아니라
줄곧 디스크에 non-null로 적혀 있었고, 그 값을 읽는 소비처가 converged 필터 뒤에 있었을
뿐이다. 우산 PRD의 정정("없는 값이 아니라 안 읽는 값")과 정합한다.

### 중단 단계별 층 — 왜 divergent가 더 긴가

| halt_stage | n | p50 | max |
|---|---|---|---|
| `(completed)` (중단 없이 완주) | 32 | 8.2분 | 427.4분 |
| `5.2e` (verdict 합성에서 차단) | 16 | 5.4분 | 11.9분 |
| `5.2b` (예약 실패) | 1 | 1.3분 | 1.3분 |

중단된 실행이 완주한 실행보다 **짧다**. 게이트가 늦게 막는 것이 아니라 일찍 막고 있고,
길이를 만드는 것은 차단이 아니라 완주 경로다. `5.2b`는 패널을 띄우기도 전에 멈춘 1건이라
1.3분이다.

> **주의 — `(completed)`는 "승인"이 아니다.** 중단 없이 5.2h까지 도달했다는 뜻이며,
> 그중 다수는 단일통과 토글로 진행된 `divergent`다. verdict 층과 halt 층은 서로 다른 축이다.

## 동결된 실측

아래는 위 판정의 근거가 된 `--json` 출력의 **`panel_span` 하위 전문**이다. 축자 인용이며
이 문서의 모든 수치는 여기서 유도된다. 재생성:

```bash
node plugins/mccp/scripts/lib/leadtime.js --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s).panel_span,null,2)))'
```

> **M2에서 이 블록을 재생성했다 — 이전 블록은 거짓이 됐기 때문이다.** M1은 `--json`
> **전문**을 동결했는데, M2가 출력 형태를 세 군데 바꿨다: 최상위 `axis` 스칼라를
> **제거**했고(두 축을 대표하지 못한다 — DD11), `panel_span`에 자기 `state`가 생겼으며,
> 형제 축 `post_panel_span`이 생겨 최상위 `state`가 **합성값**(`state_is_composite:true`)이
> 됐다. 그래서 이 문서는 이제 자기 축의 하위만 동결하고, `--json` **전문**의 축자 동결은
> [post-panel-span.md](post-panel-span.md)가 단독으로 소유한다. 두 블록은 같은 실행에서
> 나왔으므로 **함께** 재생성해야 한다.
>
> 코퍼스가 자라 수치도 함께 갱신됐다(측정 가능 39 → 40 → 48 → **49건**). 마지막 두 갱신은
> 이 PR이 base(origin/main)를 **두 번** 병합한 것이다 — 두 번째는 게이트가 도는 도중
> main이 전진해(PR #172) 일어났고, 그때 `not_shipped` 버킷이 0건에서 1건이 됐다.
> **이 축의 결론은 세 번 모두 바뀌지 않았다** — 과소보고 배수(약 33배)도 최악 레코드도
> 그대로다. 다만 형제 축은 그렇지 않았다: 같은 병합이
> [post-panel-span.md](post-panel-span.md)의 결론 3에서 다수·소수를 뒤집었고, 그 문서가
> 뒤집힘과 원인을 명시한다. 스냅샷은 갱신하면 되지만 **결론은 갱신될 때 다시 읽어야 한다.**

<!-- BEGIN leadtime.js panel_span (verbatim) -->

```json
{
  "state": "ok",
  "unit": "ms",
  "method": "nearest-rank",
  "n": 49,
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
      "n": 43,
      "min": 43984,
      "p50": 457806,
      "p90": 716586,
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
      "n": 32,
      "min": 179485,
      "p50": 490482,
      "p90": 779328,
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
      "n": 16,
      "min": 43984,
      "p50": 321649,
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
      "record": ".claude/reviews/plan-review-review-record-linkage.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 179485,
      "recorded_at": "2026-09-01T07:03:32.527Z",
      "plan_path": ".claude/plans/review-record-linkage-m1.plan.md",
      "reviewed_plan_hash": "sha256:e85bad7d90d1cff70f321767ca36f4261edcd59292cc891d8586e4775b3f21ee"
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
      "record": ".claude/reviews/plan-review-release-channel-separation-m1.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 257556,
      "recorded_at": "2026-09-01T07:04:53.843Z",
      "plan_path": ".claude/plans/release-channel-separation-m1.plan.md",
      "reviewed_plan_hash": "sha256:de602af7fa4ff017ff0d34b761ee766f62a7d8444ff6a72a7c2a2e8059c26818"
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
      "record": ".claude/reviews/plan-review-release-channel-separation.md",
      "verdict": "divergent",
      "halt_stage": "5.2e",
      "panel_span_ms": 321649,
      "recorded_at": "2026-09-01T05:55:06.267Z",
      "plan_path": ".claude/plans/release-channel-separation-m1.plan.md",
      "reviewed_plan_hash": "sha256:ff0b4df4e35b1e98194c79c2d55c174b68f4fc803e59acdc2df96bd579f167b9"
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
      "record": ".claude/reviews/plan-review-env-contract-integrity-m1.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 364106,
      "recorded_at": "2026-08-21T01:41:06.502Z",
      "plan_path": ".claude/plans/env-contract-integrity-m1.plan.md",
      "reviewed_plan_hash": "sha256:1e4806b94f046698958fe1ed071285ba88ad6e08be11303bc9fbbf1f635373da"
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
      "record": ".claude/reviews/plan-review-review-loop-trust.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 428716,
      "recorded_at": "2026-08-27T06:52:26.744Z",
      "plan_path": ".claude/plans/review-loop-trust-closeout.plan.md",
      "reviewed_plan_hash": "sha256:d897e00664248a674b0e0198c11bdd2411722275859454c49c2f160659641892"
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
      "record": ".claude/reviews/plan-review-multi-session-work-loop-m9.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 457806,
      "recorded_at": "2026-08-27T07:47:19.193Z",
      "plan_path": ".claude/plans/multi-session-work-loop-m9.plan.md",
      "reviewed_plan_hash": "sha256:bc41d0011125a86633a9548b3c5adf5f4324ef18750bccbd08e4eff079e2aaf4"
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
      "record": ".claude/reviews/plan-review-review-loop-trust-closeout.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 490482,
      "recorded_at": "2026-08-27T07:39:23.804Z",
      "plan_path": ".claude/plans/review-loop-trust-closeout.plan.md",
      "reviewed_plan_hash": "sha256:d897e00664248a674b0e0198c11bdd2411722275859454c49c2f160659641892"
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
      "record": ".claude/reviews/plan-review-env-contract-integrity.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 559150,
      "recorded_at": "2026-08-27T04:36:31.577Z",
      "plan_path": ".claude/plans/env-contract-integrity-m3.plan.md",
      "reviewed_plan_hash": "sha256:840953a92bb66c0d7b507c1a00ac7956f59358df3eb4d435046678c393d2f0fb"
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
      "record": ".claude/reviews/plan-review-diverse-agent-review-m11.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 633022,
      "recorded_at": "2026-08-31T01:00:01.984Z",
      "plan_path": ".claude/plans/diverse-agent-review-m11.plan.md",
      "reviewed_plan_hash": "sha256:43e5914331d56a123c99294df2775c3e16448c34f8617db61878a3b591220563"
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
      "record": ".claude/reviews/plan-review-diverse-agent-review.md",
      "verdict": "divergent",
      "halt_stage": null,
      "panel_span_ms": 668403,
      "recorded_at": "2026-08-31T07:56:12.943Z",
      "plan_path": ".claude/plans/diverse-agent-review-m5.plan.md",
      "reviewed_plan_hash": "sha256:98d30390534bab8bc2bf9d15a286588cd983b342f743e41fc6e63a9d2b0f4f4e"
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
      "panel_span_ms": 1155572,
      "recorded_at": "2026-08-31T09:08:07.784Z",
      "plan_path": ".claude/plans/multi-session-work-loop-m10.plan.md",
      "reviewed_plan_hash": "sha256:ce3d993d70ae9250d4ff1f13b40162091d4c1fc07d83238078e97824134b98d5"
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
}
```

<!-- END leadtime.js panel_span (verbatim) -->

## 한계 — 이 문서가 주장하지 않는 것

- **임계를 정하지 않는다.** "7.6분이면 괜찮다"도 "7.12시간은 문제다"도 여기서 말하지
  않는다. 그 판단과 자동 분기는 C7 소유다.
- **표본이 작고 한 저장소 것이다.** 40건은 이 저장소의 리뷰 이력 전부이지 대표 표본이
  아니다. `converged` 층은 n=5라 그 p90(13.0분)은 사실상 max와 같은 값이다 — 백분위가
  분포를 요약하지 못하는 크기다.
- **하한이다.** `pre_measurement` 13건은 영구히 존재하므로 커버리지가 100%가 되는 날은
  오지 않는다. 카운트는 항상 53건에 대한 하한으로 읽어야 한다.
- **코퍼스는 자기 자신을 늘린다.** 이 축을 측정하기 위해 게이트를 돌리면 그 실행이 새
  레코드가 되어 분모와 분자에 함께 들어간다. 그래서 이 문서의 수치는 **측정일 시점의
  스냅샷**이고, 리터럴로 고정된 검증은 다음 게이트 실행에서 반드시 거짓이 된다 —
  `## Validation`이 관계 단언을 쓰는 이유다.
- **`plan_path` 정규화는 가드이지 정정이 아니다.** 위 블록의 `plan_path` 25종은 전부
  이미 repo-relative였고 `(non-repo-relative)` 대체는 **0건**이다. `leadtime.js`의
  `normalizePlanPath`는 `record.js`가 호출자 문자열을 무정규화로 봉인하는 한 언제든
  절대경로가 섞일 수 있다는 사실에 대한 방어이며, 오늘의 코퍼스가 깨끗하다는 관측과
  별개다.
