# panel_span — plan 리뷰 게이트 벽시계 실측 (M1)

> 생산: `node plugins/mccp/scripts/lib/leadtime.js --json` · 측정일 2026-09-01
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

`.claude/reviews/` + `.claude/reviews/archive/`에서 **80개 파일**을 스캔했다. 그중:

- **28건** `out_of_corpus` — PR·santa·local·security 리뷰 등 다른 생산자의 문서. 코퍼스가
  아니므로 결손이 아니다.
- **13건** `pre_measurement` — 패널 레코드이지만 `## Measurement` 블록 자체가 없다.
  그 블록을 도입하기 전 레코드라 오독할 측정값이 애초에 없다. 계측 고장이 아니라
  **코퍼스의 시간 경계**다.
- **0건** `parse_failure`, `read_error=false`.

남는 것이 코퍼스다: 패널 레코드 **52건 중 측정 가능 39건**. 따라서 아래 카운트는 전부
**하한**이다(`counts_are_lower_bound: true`). 그리고 그 39건의 `wall_clock_ms` 결측은
**0건**이다 — 즉 측정 가능한 레코드는 전부 실제로 관측됐다(`panel_span_observed: 39`,
`panel_span_missing: 0`).

`state: "ok"`.

## 판정 — `corpus.js`의 pass-path 보고는 분포를 과소보고한다

M1 이전에 이 벽시계를 보고하던 유일한 소비처는 `corpus.js`의 `pass_path`이고, 그것은
**converged 레코드만** 필터한다. 그 층과 전체를 나란히 놓으면 격차가 한 출력에 보인다.

| 층 | n | p50 | p90 | max |
|---|---|---|---|---|
| `converged` (pass_path가 보던 전부) | 5 | 6.4분 | 13.0분 | 13.0분 |
| **전체** | **39** | **7.6분** | **13.0분** | **427.4분 (7.12시간)** |
| `divergent` | 33 | 8.0분 | 12.6분 | 427.4분 |

converged 층만 보면 이 게이트는 **최악이 13분**인 절차로 보인다. 실제 최악은
**7.12시간**이고 그 레코드는 `.claude/reviews/plan-review-review-loop-bypass-m2.md`다.
즉 집계 커버리지 5/39(12.8%)가 max를 33배 과소보고하고 있었다.

**미관측은 측정 부재가 아니라 집계 부재였다.** 이 37→39건은 M1이 새로 계측한 것이 아니라
줄곧 디스크에 non-null로 적혀 있었고, 그 값을 읽는 소비처가 converged 필터 뒤에 있었을
뿐이다. 우산 PRD의 정정("없는 값이 아니라 안 읽는 값")과 정합한다.

### 중단 단계별 층 — 왜 divergent가 더 긴가

| halt_stage | n | p50 | max |
|---|---|---|---|
| `(completed)` (중단 없이 완주) | 23 | 10.3분 | 427.4분 |
| `5.2e` (verdict 합성에서 차단) | 15 | 5.8분 | 11.9분 |
| `5.2b` (예약 실패) | 1 | 1.3분 | 1.3분 |

중단된 실행이 완주한 실행보다 **짧다**. 게이트가 늦게 막는 것이 아니라 일찍 막고 있고,
길이를 만드는 것은 차단이 아니라 완주 경로다. `5.2b`는 패널을 띄우기도 전에 멈춘 1건이라
1.3분이다.

> **주의 — `(completed)`는 "승인"이 아니다.** 중단 없이 5.2h까지 도달했다는 뜻이며,
> 그중 다수는 단일통과 토글로 진행된 `divergent`다. verdict 층과 halt 층은 서로 다른 축이다.

## 동결된 실측

아래는 위 판정의 근거가 된 `--json` 출력 **전문**이다. 축자 인용이며 이 문서의 모든 수치는
여기서 유도된다.

<!-- BEGIN leadtime.js --json (verbatim) -->

```json
{
  "tool": "leadtime",
  "axis": "panel_span",
  "state": "ok",
  "files_scanned": 80,
  "records": 39,
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
      "files": 73
    },
    {
      "dir": ".claude/reviews/archive",
      "present": true,
      "files": 7
    }
  ],
  "coverage": {
    "panel_records": 52,
    "measurable": 39,
    "unmeasurable": 13,
    "counts_are_lower_bound": true,
    "panel_span_observed": 39,
    "panel_span_missing": 0,
    "panel_span_missing_records": []
  },
  "panel_span": {
    "unit": "ms",
    "method": "nearest-rank",
    "n": 39,
    "min": 43984,
    "p50": 458072,
    "p90": 779328,
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
        "n": 33,
        "min": 43984,
        "p50": 482116,
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
        "n": 23,
        "min": 279845,
        "p50": 618218,
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
  }
}
```
<!-- END leadtime.js --json (verbatim) -->

## 한계 — 이 문서가 주장하지 않는 것

- **임계를 정하지 않는다.** "7.6분이면 괜찮다"도 "7.12시간은 문제다"도 여기서 말하지
  않는다. 그 판단과 자동 분기는 C7 소유다.
- **표본이 작고 한 저장소 것이다.** 39건은 이 저장소의 리뷰 이력 전부이지 대표 표본이
  아니다. `converged` 층은 n=5라 그 p90(13.0분)은 사실상 max와 같은 값이다 — 백분위가
  분포를 요약하지 못하는 크기다.
- **하한이다.** `pre_measurement` 13건은 영구히 존재하므로 커버리지가 100%가 되는 날은
  오지 않는다. 카운트는 항상 52건에 대한 하한으로 읽어야 한다.
- **코퍼스는 자기 자신을 늘린다.** 이 축을 측정하기 위해 게이트를 돌리면 그 실행이 새
  레코드가 되어 분모와 분자에 함께 들어간다. 그래서 이 문서의 수치는 **측정일 시점의
  스냅샷**이고, 리터럴로 고정된 검증은 다음 게이트 실행에서 반드시 거짓이 된다 —
  `## Validation`이 관계 단언을 쓰는 이유다.
- **`plan_path` 정규화는 가드이지 정정이 아니다.** 위 블록의 `plan_path` 25종은 전부
  이미 repo-relative였고 `(non-repo-relative)` 대체는 **0건**이다. `leadtime.js`의
  `normalizePlanPath`는 `record.js`가 호출자 문자열을 무정규화로 봉인하는 한 언제든
  절대경로가 섞일 수 있다는 사실에 대한 방어이며, 오늘의 코퍼스가 깨끗하다는 관측과
  별개다.
