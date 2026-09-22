# 한 줄 소비 — STATUS.md · status.html · distribution.json (M3)

> 생산: `node plugins/mccp/scripts/derive/cli.js render` · 측정일 2026-09-03
> 이 문서의 모든 수치는 아래 「동결된 실측」 블록에서 유도된다. 손으로 옮긴 숫자는 없다.

M1은 벽시계를, M2는 패널 종료→ship 구간을 산출했다. 둘 다 **standalone 도구 안에서만**
살았다 — `leadtime.js`를 손으로 치는 사람만 그 값을 봤다. M3은 소비 회로 하나를 만든다.

## 한계 — 이 문서가 주장하지 않는 것

동결 블록보다 **먼저** 온다. 기존 두 문서는 한계가 약 1500줄의 JSON 뒤에 있어 읽는 사람이
그 앞의 수치를 한계 없이 인용했다. 같은 결함을 새 표면에 반복하지 않는다.

- **이 한 줄은 e2e 리드타임이 아니다.** `/mccp:work` 진입부터의 구간은 C2가 소유하고,
  이 축은 소비만 한다. 임계값과 자동 분기는 C7이 소유한다 — 이 회로는 분포를 낼 뿐
  숫자를 정하지 않는다.
- **커버리지 1/3 표본이다.** 패널→ship 축의 매치는 54건 중 11·17건이다. 값은 그
  매치된 부분집합의 p50이지 전수가 아니고, 미짝 43·37건이 다른 분포를 가질 수 있다.
  그래서 모든 값 토큰에 커버리지가 괄호로 인접한다 — 병기 없는 값은 존재할 수 없다.
- **두 앵커의 불일치(지표 4)는 한 줄에 없다.** 오늘 그 값은 구조적으로 0이다
  (ledger의 `completed_at`이 ship receipt의 `meta.created_at` 복사본). `불일치 0`을
  화면에 적으면 "두 기록이 잘 맞는다"로 읽히는데 그것은 측정되지 않은 주장이다.
  파일에는 `disagreement_note`와 함께 실려 인용자가 맥락 없이 집어가지 못한다.
- **파일은 명시 렌더에서만 갱신된다.** `derive/cli.js render`를 부르는 human-gate 넷
  (`/mccp:dashboard` · `dashboard-refresh` · `dashboard-audit` · `archive-complete`)이
  발행 주체다. auto-refresh(`trigger.js`)는 한 줄만 갱신하고 파일은 만지지 않으므로
  파일이 stale할 수 있다 — 판별은 payload가 싣고 있는 자기 커버리지로 한다.
- **커버리지가 낮다는 사실 자체가 산출물이다.** 없는 기록을 소급 생성하지 않는다.

## 한 줄 문법

```
리드타임 (<측정>/<코퍼스> 측정) · p50: 패널 <값> (<n>) · 패널→ship (조인 <eligible>): ledger <값> (<n>) · hash <값> (<n>)
```

규칙은 넷이다.

1. **코퍼스 커버리지가 맨 앞에 온다.** CLI는 "커버리지 줄이 값보다 먼저 나온다"를 줄
   순서로 지켰다. 한 줄 표면에는 "앞 줄"이 없으므로 같은 명제를 인접성으로 다시 적는다.
2. **모든 값 토큰이 자기 분자를 괄호로 바로 뒤에 단다.** 예외는 없다 — `미산출`도 값
   토큰이고 자기 분자를 단다. 통계 이름(`p50`)은 헤드에서 한 번 선언하므로 토큰마다
   반복하지 않는다.
3. **분모는 토큰이 아니라 그룹 라벨이 한 번 선언한다** (M4). 헤드의
   `(<측정>/<코퍼스> 측정)`이 `패널` 토큰을 지배하고, `패널→ship (조인 <eligible>):`이
   `ledger`와 `hash`를 지배한다. 두 분모는 오늘 우연히 같은 값이지만 **모집단이
   다르다** — 앞은 패널 span이 측정된 레코드, 뒤는 `recorded_at` 파싱에 성공해 조인
   후보가 된 레코드다. 2와 3은 `assertCoverageAdjacency`가 함께 강제하고, 분자를 뗀
   입력과 **그룹 라벨을 지운 입력이 각각** throw하는 것을 test가 고정한다.
4. **값 부재는 `0`이 아니라 `미산출`이다.** 없는 것을 0으로 적으면 "즉시 끝났다"는
   없는 사실이 생긴다.

`state`가 `degraded`거나 `blind`면 **바로 아래 문단**에 사유가 따로 붙는다(같은 줄에
붙이면 `SHARED_LINE_BUDGET`과 충돌한다). md는 빈 줄을 낀 문단 분리이고 html은 `<p>`
둘이라 두 면의 구조가 같다 — 단일 개행으로 이으면 CommonMark가 한 문단으로 접어 구조가
갈린다(M4). **`state`가 `ok`여도 `degradations`가 비어 있지 않으면 같은 자리에 `관측
축소:` 문단이 붙는다** — 손상이 아니라 운영자가 줄인 관측이고, 그 구분이 없으면
`MCCP_LEADTIME_GIT=off`가 이 세 표면에서 아무 흔적도 남기지 않는다. 사유는 닫힌
열거형이다:
`read-error` · `parse-failures` · `git-disabled` · `anchor-source-damaged` ·
`negative-spans` · `sum-equation-broken` · `module-load-failed` · `oracle-threw` ·
`read-failed`.

폭 예산은 `leadtime-surface.js`의 `SHARED_LINE_BUDGET`(120 **표시 칼럼**)이 소유한다.
`String.length`가 아니라 `displayWidth`로 재는데, East Asian Wide를 2칼럼으로 세지 않으면
이 줄은 92로 읽히고 실제로는 108을 차지한다 — M3까지 폭 가드가 통과하던 이유가 그
차이였다. Ambiguous(`·` · `→`)는 보수적으로 2로 센다. **칼럼은 실제 렌더 폭의 대리
지표다** — 이 저장소에는 레이아웃 엔진이 없어 브라우저에서 접히는지는 여전히 열린 축이다.

`sum-equation-broken`은 미짝 사유 분해의 분할 불변식(`unmatched === Σ(counts)`)이
깨졌다는 뜻이다. CLI는 이것을 `*** SUM EQUATION BROKEN ***`로 크게 보여주는데, 이
열거값이 생기기 전까지 소비 표면 셋에서는 같은 사건이 `사유 미상`으로 접혀 사라졌다 —
축을 `degraded`로 만드는 조건과 사유를 이름 붙이는 조건이 어긋나 있었다.

## 렌더 vs 숨김 — 4갈래

| 조건 | 처리 | 왜 |
|---|---|---|
| `model.leadtime` 키 부재 **또는** `null` | 렌더하지 않는다 | 축이 계산되지 않았다. 없는 사실을 지어내지 않는다 |
| `state='ok'` | 값 + 커버리지 | 정상 |
| `state='degraded'` | 값 + 커버리지 + 손상 꼬리표 | 값은 유효하되 하한이다. 숨기면 손상이 성적으로 보인다 |
| `state='blind'` | `미산출` + 사유 + 커버리지 | 없으면 없다고 적는다 |
| 섹션이 throw | `safeSection`의 ⚠ placeholder | 렌더 결함과 관측 부재를 같은 글자로 쓰지 않는다 |

**hide 술어에 `null`이 포함되는 것이 요점이다.** `emptyModel`이 키를 항상 선언하고
`scanLeadtime`이 `leadtimeScan:false`에서 `null`을 돌려주므로 실제 판별자는 값이다.
`null`에 `미산출`을 찍으면 측정하지 않은 축에 없는 기록을 소급 주장하게 된다.

## 파일 스키마 — `.claude/state/leadtime/distribution.json`

git-tracked다. `.claude/cache/`가 아닌 이유는 `.gitignore`가 그 디렉토리를 통째로
무시해 worktree 정리와 함께 사라지기 때문이다 — C7이 다른 세션에서 인용할 수 없다.

payload는 `summarizeForSurface`의 반환값 그대로이고, **한 줄과 같은 투영**이다. 화면의
한 줄은 이 payload로부터 그대로 재구성되며 그 동치를 Validation이 강제한다.

| 키 | 내용 |
|---|---|
| `coverage` | `panel_records` · `measurable` · `counts_are_lower_bound` |
| `panel_span` | `n/min/p50/p90/max` 또는 **`null`**(관측 0건은 분포가 아니다) |
| `post_panel_span.by_anchor` | 두 앵커 키가 **언제나** 실린다. 부재는 `null` |
| `post_panel_span.coverage` | `eligible` · `matched_ledger` · `matched_ship` · 교차 4종 |
| `post_panel_span.unmatched` | 앵커별 5버킷 카운트(닫힌 열거형) |
| `post_panel_span.disagreement` | 지표 4 + `disagreement_note` |
| `degradations` | 닫힌 열거형 배열 |

투영에는 **경로도 레코드명도 해시도 없다**. 그래서 escaping이 규율이 아니라 구조적으로
불필요하고, 실패 sentinel도 예외가 아니다 — 예외 메시지는 stderr로만 나간다.

payload에는 **어떤 시각 필드도 없다**. 그래서 content-stability가 구성상 성립한다:
디스크 내용과 같으면 쓰지 않으므로 렌더마다 git diff가 생기지 않는다. "언제 갱신됐나"의
답은 git log다.

## 강등 계약 — `allowGit:false`

bare `derive()`는 spawn-free 예산 위에 있으므로 축 계산 자체를 렌더 경로로 한정한다
(`leadtimeScan`, 기본 off). 렌더 경로는 git 증인을 켜고 실측 371ms를 지불한다
(`derive(worktreeScan:true)` 2371ms 대비 약 16%).

`allowGit:false`로 끄면 W3(git이 plan 경로를 건드림)이 `no`가 아니라 **`unavailable`**이
된다. 그 결과 `not_shipped`(증인 만장일치 부정 필요)가 그 모드에서 도달 불가가 되어
해당 행이 `unclassified`로 떨어진다. **분포는 영향을 받지 않는다** — 증인은 미짝의
*분류*에만 쓰이므로 백분위와 커버리지는 두 모드에서 동일하다. 그 사실을
`degradations:['git-disabled']`로 산출물에 싣는다. 감추면 `unclassified` 증가가
코퍼스의 성질로 오독된다.

## 동결된 실측

<details>
<summary>한 줄 · 사람 출력 · 발행된 payload (축자, 2026-09-04)</summary>

생산 명령:

```bash
node plugins/mccp/scripts/derive/cli.js render --md --html --out .claude/cache
node plugins/mccp/scripts/lib/leadtime.js
```

STATUS.md·status.html 상단에 실리는 한 줄:

```text
리드타임 (61/74 측정) · p50: 패널 7.5min (60) · 패널→ship (조인 61): ledger 0.41d (16) · hash 0.28d (18)
```

`leadtime.js` 사람 출력 전문 (첫 줄이 위의 한 줄과 동일하다 — 세 면이 한 문장을 공유한다):

```text
리드타임 (61/74 측정) · p50: 패널 7.5min (60) · 패널→ship (조인 61): ledger 0.41d (16) · hash 0.28d (18)
  state=ok records=61 pre_measurement=13 parse_failures=0 out_of_corpus=31 read_error=false
  coverage: 61/74 panel records measurable (counts below are a LOWER BOUND)
  panel_span observed 60/61 measurable (missing 1)
  (state above is COMPOSITE — the worst of the loaded axes, not a single axis)
  panel_span — state=ok
  panel_span (nearest-rank, n=60): min=0.7min p50=7.5min p90=12.6min max=427.4min
  by_verdict:
    converged: n=5 p50=6.4min max=13.0min
    divergent: n=52 p50=7.5min max=427.4min
    unavailable: n=1 p50=17.3min max=17.3min
    unknown: n=2 p50=1.1min max=1.3min
  by_halt_stage:
    (completed): n=36 p50=8.2min max=427.4min
    5.2b: n=1 p50=1.3min max=1.3min
    5.2c-emit: n=2 p50=1.1min max=17.3min
    5.2e: n=21 p50=5.3min max=11.9min
  post_panel_span — state=ok
    coverage: eligible 61 · matched ledger_basename 16 · matched ship_plan_hash 18
      cross: both 7 · only_ledger 9 · only_ship 11 · neither 34
    ship receipts: 56/88 qualified (unproven-skip 6 · override-qualified 13)
    ledger_basename (nearest-rank, n=16): min=0.05d p50=0.41d p90=1.09d max=1.74d
    ship_plan_hash (nearest-rank, n=18): min=0.02d p50=0.28d p90=4.18d max=5.92d
    disagreement (both axes matched, n=7, over abs(anchor_delta_ms)): p50=0.00d max=0.00d
    unmatched[ledger_basename]: 45 = anchor_absent=30 unclassified=15
    unmatched[ship_plan_hash]: 43 = key_mismatch=25 anchor_absent=11 unclassified=7
```

발행된 `.claude/state/leadtime/distribution.json`:

```json
{
  "coverage": {
    "counts_are_lower_bound": true,
    "measurable": 61,
    "panel_records": 74
  },
  "degradations": [],
  "panel_span": {
    "max": 25642300,
    "min": 43984,
    "n": 60,
    "p50": 447105,
    "p90": 756525
  },
  "post_panel_span": {
    "by_anchor": {
      "ledger_basename": {
        "max": 150743189,
        "n": 16,
        "p50": 35050053,
        "p90": 94558358
      },
      "ship_plan_hash": {
        "max": 511876477,
        "n": 18,
        "p50": 24176707,
        "p90": 360895695
      }
    },
    "coverage": {
      "both": 7,
      "eligible": 61,
      "matched_ledger": 16,
      "matched_ship": 18,
      "neither": 34,
      "only_ledger": 9,
      "only_ship": 11
    },
    "disagreement": {
      "max": 0,
      "n": 7,
      "p50": 0
    },
    "disagreement_note": "structurally-zero: ledger.completed_at copies ship receipt meta.created_at (PRD open question)",
    "unmatched": {
      "ledger_basename": {
        "anchor_absent": 30,
        "key_mismatch": 0,
        "no_plan_path": 0,
        "not_shipped": 0,
        "unclassified": 15
      },
      "ship_plan_hash": {
        "anchor_absent": 11,
        "key_mismatch": 25,
        "no_plan_path": 0,
        "not_shipped": 0,
        "unclassified": 7
      }
    }
  },
  "state": "ok",
  "tool": "leadtime"
}
```

</details>
