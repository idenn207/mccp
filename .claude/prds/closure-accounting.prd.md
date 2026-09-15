# closure-accounting — 100% 종결을 보고하는 계기의 분모가 45%다

> 우산 PRD [harness-wiring-integrity](harness-wiring-integrity.prd.md)의 **자식 C11**.
> 그룹 1 — 선행조건 없음. 기준선 실측: [2026-09-08-closure-baseline.json](../_meta/data/2026-09-08-closure-baseline.json)

## Problem

**이 저장소에는 부채 종결을 재는 계기가 이미 있고, 그것은 오늘 `open: 0`을 보고한다.
그 분모는 라이브 부채의 45%다.**

`debt-inventory.js`는 세 원장(backlog · findings · fix-task)을 하나로 모아 봉인하고,
`debt-dispositions.jsonl`의 각 판정 줄을 그 봉인 해시에 결속한다. 설계는 건전하다 —
`verifyDispositions`는 `seal_intact: true`, `disposed 1115 / 1115`, **`open: 0`** 을 낸다.

문제는 그 1115가 **2026-09-01 `9093b08` 시점의 부채**라는 것이다. 7일 뒤인 오늘 같은
수집기를 다시 돌리면 **2487건**이 나온다(이 사이클 최초 측정). 늘어난 **1372건(55.2%)** 은
어떤 분모에도 없고,
따라서 판정될 수 없으며, 판정되지 않았다는 사실이 어디에도 표시되지 않는다.

봉인 자신이 그 한계를 정직하게 적어 뒀다 — *"Snapshot semantics: this denominator is the
debt at sealed_at_commit. Debt appended afterwards … belongs to the next cycle."* 그러나
**그 "next cycle"을 여는 장치가 없다.** 재봉인 스케줄도, staleness 경보도, 이 계기를 부르는
CI job도 없다(워크플로 6개 중 0개). 스냅샷 의미론이 결함인 것이 아니라,
**스냅샷이 갱신되지 않으면 100%가 영구히 참으로 남는다**는 것이 결함이다.

우산 PRD가 진단한 병리 — "성공 방향 기본값이 배선 단절을 무증상으로 만든다" — 의
가장 순수한 형태다. 여기서 성공 방향 기본값은 **`open: 0`** 이다.

## Evidence

전부 2026-09-08 이 저장소 `e842558`에서 실측했고 재현 command는
[기준선 JSON](../_meta/data/2026-09-08-closure-baseline.json)에 함께 봉인돼 있다.

> **이 절의 숫자는 한 시점의 값이고, 이 사이클 안에서 이미 움직였다.** 최초 측정 2487(격차
> 1372·55.2%) → 게이트 패널이 `finding_opened` 17건을 남긴 뒤 2504(격차 1389·55.47%) →
> 그 다음 측정 2514(격차 1399·55.65%). 기준선 JSON의 `debt_inventory` 섹션은 두 번째 시점의
> 값을 담으므로 최상위 `measured_at`보다 뒤에 잰 것이다. 이 흔들림은 결함이 아니라 **이 PRD의
> 논지 자체**다 — 그래서 아래 값들은 정본이 아니라 관측 로그로 읽어야 하고, 정본은 언제나
> `closure report`의 실행 시점 산출이다.

- **분모 격차 55.2%** — 봉인(`docs/multi-session-work-loop/debt-inventory.json`,
  `sealed_at: 2026-09-01T01:21:41Z`, `sealed_at_commit: 9093b08`) 1115건 대 라이브 재수집
  2487건. 소스별: backlog 936 → **1510**(+574) · findings 178 → **976**(+798) · fix-task 1 → 1.
- **검증기는 만점을 보고한다** — `verifyDispositions(cwd)` → `{ok:true, seal_intact:true,
  total_items:1115, disposed:1115, open:0, unmatched_dispositions:0, binding_mismatch:0}`.
- **판정 1115건 중 실제 해소는 132건이다** — `deferred` **983(88.2%)** · `superseded` 111 ·
  `duplicate` 19 · `obsolete` 1 · **`fixed` 1**. `SUPPRESSING_DISPOSITIONS`(fixed·obsolete·
  superseded·duplicate) 기준 해소 132건이고, **고쳐서 닫은 것은 1건**이다.
- **아무도 이 계기를 부르지 않는다** — `.github/workflows/` 6개 중 `debt-inventory.js`나
  `m10-coverage-gate.js`를 호출하는 것은 **0개**다. 비-test 호출자는 3곳
  (`derive/sources/backlog.js:157` · `state/handoff-items.js:155` ·
  `msw-metrics/m10-coverage-gate.js:66`)이며 전부 **읽기 소비자**이고 재봉인자는 없다.
- **두 번째 종결 원장은 별개로 굶고 있다** — `findings-registry`의 자체 이벤트 로그는
  `finding_opened` 1196 대 `finding_closed` **19(1.59%)**, `finding_adjudicated` **0**.
  0인 이유는 유일 producer가 `plan-codex-runner.js:896`이고 그 러너는 `mode=codex` 전용인데
  `.claude/settings.json`이 `MCCP_PLAN_REVIEW=multi-agent`로 고정돼 있기 때문이다.
  `finding_closed` 19건은 전부 `multi-session-work-loop-m7`(12)·`m9`(7)에서 나왔다 —
  원장 파일 **27개 중 25개는 한 건도 닫지 않았다**.
- **두 계기가 서로 55배 다른 답을 낸다** — 같은 질문("부채가 닫혔는가")에 disposition
  ledger는 100%, findings-registry 이벤트 로그는 1.59%로 답한다. 어느 쪽도 단독으로 인용
  가능하지 않은데 인용을 막는 장치가 없다.
- **비교 대상은 건강하다** — `instruction-contract lint` C1~C4 pass ·
  `version-declaration-guard` pass · `release-manifest-guard` pass ·
  `meta-research lint` 12/12 pass. 이 저장소는 닫는 기계를 만들 줄 안다.
  못 하는 것은 **그 기계를 주기적으로 다시 부르는 것**이다.
- **동반 관측(범위 밖, 기록만)** — `env-contract lint` **L10 FAIL**
  (`MCCP_EXPLORE_CONTROL_PLACEMENT`) · `evidence-audit` `incomplete`(coverage 0.596,
  unverifiable 19) · `fix-task-applied.md`의 `task_fingerprint`(m3)가 `decision_id`(m4)와
  어긋남 · ship receipt 92건 중 divergent ship 17 · proof 없는 skip 6 ·
  리뷰 기록 101건 중 `halt_stage` 기록 22 · PRD 7개에 미체크 Open Question 35.

## Users

- **Primary: 운영자 본인 — 다음 사이클의 범위를 정하는 사람.** 오늘 "부채가 줄고 있나"를
  물으면 계기가 `open: 0`이라 답한다. 그 답으로는 범위를 정할 수 없고, 실제로 범위는
  기억과 STATE.md 서사로 정해진다.
- **Secondary: 게이트 자신.** `stop-review-loop` escalation과 `santa` 라운드 판정이
  "미흡수 HIGH/CRITICAL 부재"를 기준으로 삼는데(§3.14), 그 입력인 종결 기록이 두 갈래로
  갈라져 있고 한쪽은 만점, 한쪽은 1.59%다.
- **Not for**: 부채를 **줄이려는** 사람. 이 PRD는 부채를 갚지 않는다. 갚았는지 아닌지를
  볼 수 있게만 한다.

## Hypothesis

We believe **봉인 분모와 라이브 부채의 격차를 상시 산출해 표면화하고, 두 종결 계기의
불일치를 한 출력에 나란히 세우는 것**이
**"계기가 100%를 보고하는데 그 분모가 45%이고 아무도 그 사실을 모른다"** 는 문제를
**운영자 본인과 게이트 자신** 에게 해소할 것이다.

We'll know we're right when **`closure report`가 오늘 `open: 0` 대신
`sealed 1115 / live 2487 · outside-denominator 1372 (55.2%)`를 내고, 그 격차가 재봉인
이후 실제로 0으로 떨어지는 것이 한 번 실측될 때.**

## Success Metrics

| # | 지표 | 오늘 | 목표 | 어떻게 측정 | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|
| 1 | 분모 밖 부채 | **1372건 (55.2%)** | 상시 **산출됨** (값 자체의 목표는 M2가 정한다) | `closure report --json`의 `denominator_gap` | 운영자 → 재봉인 시점 판단 |
| 2 | 봉인 나이 | **7일** (측정 수단 없음) | 값이 출력에 항상 표기 | 같은 리포트의 `seal.age_days` | 운영자 → 스냅샷 신선도 판단 |
| 3 | 두 계기의 불일치 | **100% 대 1.59%** (나란히 본 적 없음) | 한 출력에 항상 병기 | 리포트의 `ledgers[]` 2행 | 운영자 → 단일 수치 인용 방지 |
| 4 | 판정 ↔ 해소 분리 | `deferred` 88.2%가 종결로 인용 가능 | `resolved`(132)와 `fixed`(1)가 항상 함께 표기 | 리포트의 `disposed`/`resolved`/`fixed` 3필드 | 운영자 → 자기개선 과장 방지 |
| 5 | 계기 호출 빈도 | **0회** (CI 0/6 · 스케줄 없음) | ≥ 1 (M1은 수동 CLI 1개로 충분) | 호출 경로의 실재 | 운영자 → 배선 회귀 감지 |

## 못박는 결정

| # | 결정 | 근거 |
|---|---|---|
| 1 | **스냅샷 의미론을 바꾸지 않는다.** 봉인 결속(`inventory_sha256`)은 그대로 둔다 | 그 결속이 판정의 위조 방지 장치다. 문제는 의미론이 아니라 갱신 부재이므로, 고칠 것은 *격차를 보이게 하는 것*이지 결속을 푸는 것이 아니다 |
| 2 | **"판정(disposed)"과 "해소(resolved)"와 "수정(fixed)"을 한 수로 접지 않는다** | 오늘 값이 1115 · 132 · **1**이다. 접으면 자기개선을 1000배 과장한다 |
| 3 | **M1은 재봉인하지 않는다.** 읽기 전용이다 | 재봉인은 판정 1115건의 결속을 끊는다(모든 줄이 옛 sha에 묶여 있다). 그 마이그레이션은 그 자체로 설계가 필요하며 M2 소유다 |
| 4 | **리포트는 게이트가 아니다** | 격차가 크다고 진행을 막지 않는다. 방어할 근거 없는 임계를 만들지 않는다(§3.13.1 선례) |
| 5 | **backlog에 상태 열을 추가하지 않는다** | 파서가 헤더를 4열로 리터럴 고정하므로 5번째 열은 1510행 전부를 파서에서 사라지게 한다. disposition ledger가 이미 그 일을 out-of-band로 한다 — 우산의 해당 Open Question은 **이미 코드가 답했다** |

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | closure-report | 봉인 분모와 라이브 부채의 격차 · 봉인 나이 · 두 종결 계기의 불일치 · 판정/해소/수정 3분할이 하나의 read-only CLI(`closure report [--json]`)로 산출된다. 재봉인 없음 · 상태 변경 없음 · 게이트 없음 · 신규 코드 파일 3건 + 문서 2건 편집 | complete | [.claude/plans/closure-accounting-m1.plan.md](../plans/closure-accounting-m1.plan.md) |
| 2 | reseal-path | 재봉인이 기존 판정 1115건의 결속을 끊지 않고 수행되는 경로가 생긴다(승계 또는 재키잉). 격차가 실제로 0으로 떨어지는 것이 1회 실측된다 — **1101 carried · 14 dropped · `after.denominator_gap.count === 0` 실측**(PR #194, 2026-09-14 머지) | complete | [.claude/plans/closure-accounting-m2.plan.md](../plans/closure-accounting-m2.plan.md) |
| 3 | registry-reachability | **이관 + 정직화로 착지했다.** 양자택일 둘 다 기각 — 은퇴의 전제("0건")는 이미 거짓이고(`finding_adjudicated` 3건, `mode=codex` 경로), 패널 판정 producer는 `diverse-agent-review` #1.5 소관이다. 대신 셋을 했다: `accepted`가 부채 분모에서 조용히 빠지던 누수를 닫고(`state !== 'closed'`), `closure report`의 registry 행이 채널별 **producer 도달성**을 함께 싣게 하고(`ledgers[].producers[]` — 1.4%가 "부채 종결률"로 인용되지 못하게), `CLOSURE_FROM_ADJUDICATION` 경유를 소스 대조 test로 강제되는 계약으로 남겼다 | complete | [.claude/plans/closure-accounting-m3.plan.md](../plans/closure-accounting-m3.plan.md) |
| 4 | instrument-repair | M1·M2 산출물이 스스로 틀린 값을 내는 경로를 닫는다. 재봉인은 전임 봉인의 commit·digest를 복사하지 않고, 검증에 실패한 판정은 종결로 세지 않으며, 재봉인 뒤 m10 게이트는 조상 결속을 불일치로 보고하지 않는다. `closure report`는 CI에서 주기적으로 호출된다. 부채 상환 없음 · 새 임계 없음 · 게이트 없음 | complete | [.claude/plans/closure-accounting-m4.plan.md](../plans/closure-accounting-m4.plan.md) |

**M2 신설**: `plugins/mccp/scripts/lib/msw-metrics/reseal.js` ·
`plugins/mccp/scripts/lib/tests/msw-reseal.test.js` ·
`docs/multi-session-work-loop/seals/` (봉인 아카이브) · `.claude/state/reseal-manifest.json` ·
`.claude/_meta/data/2026-09-08-closure-reseal-live.json`. **M2 편집분**:
`plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` · `plugins/mccp/scripts/lib/closure/report.js` ·
`docs/multi-session-work-loop/debt-deferred-{critical,high,minor}.md`(수락 마커) ·
`docs/multi-session-work-loop/debt-inventory.md` · `CHANGELOG.md`.

**M4 편집분**: `plugins/mccp/scripts/lib/msw-metrics/{reseal,debt-inventory,m10-coverage-gate}.js` ·
`plugins/mccp/scripts/lib/closure/{report,cli}.js` · `plugins/mccp/scripts/state/findings-registry.js` ·
test 4건 · `docs/multi-session-work-loop/debt-inventory.{json,md}`(json은 `meta` 두 필드만 — items·digest 불변) ·
`CHANGELOG.md`. **M4 신설**: `.github/workflows/closure-report.yml` · `scripts/tests/closure-report-workflow.test.js`.
M4는 M3와 `report.js`·`cli.js`·`debt-inventory.js`·`findings-registry.js`·`msw-m10-producers.test.js`를
공유하므로 **같은 브랜치에서 M3 다음에** 착수한다. fix-task와 M3 plan 게이트 이연분은 M3 소관이다.

소유 파일: **M1 신설** `plugins/mccp/scripts/lib/closure/report.js` ·
`plugins/mccp/scripts/lib/closure/cli.js` · `plugins/mccp/scripts/lib/closure/tests/report.test.js` ·
`.claude/_meta/data/2026-09-08-closure-baseline.json`(작성 완료). **M1 편집분**: `docs/multi-session-work-loop/debt-inventory.md` · `CHANGELOG.md`.

병렬 안전성: M1의 **코드 3건은 신규 파일**이라 충돌면이 없다. 문서 2건은 다르다 —
특히 `CHANGELOG.md`는 §3.7 이후 **모든 착지 브랜치가 `## [Unreleased]` 아래에 항목을 쌓는
공유 파일**이라 shared-ownership이 완화가 아니라 **충돌 지점 그 자체**다(실측: 최근 이 파일을
건드린 8커밋 중 5건이 `Merge origin/main into <feature-branch>`다). 따라서 M1은 코드 축에
대해서만 병렬 무충돌을 주장하고, `CHANGELOG.md`에 대해서는 주장하지 않는다 — 그 항목은
한 줄이므로 충돌 시 해소가 싸다. M2는 `debt-inventory.js`를, M3는 `plan-review/cli.js`·`findings-registry.js`를
건드리므로 각각 `review-record-linkage`·`diverse-agent-review`와 겹칠 수 있고,
그 병렬 무충돌은 **주장하지 않는다**.

## Open Questions

- [x] **재봉인이 기존 판정을 어떻게 승계하는가.** — **승계이지 재키잉이 아니다 (M2,
  2026-09-14).** 재키잉 선례(§3.12 `v1.22.4-cwd-rebind.js`)는 전이되지 않는다: 거기서는
  결속이 **파일명**이라 끊으면 dangling이 되므로 양쪽을 원자적으로 다시 키잉하는 것이 유일한
  정직한 수였지만, 여기서 결속은 append-only 로그의 **줄 안 필드**이고 그 형태의 규칙은 이
  원장이 이미 정해 뒀다 — *"재판정은 덮어쓰지 않고 기록한다"*. 그래서 옛 줄은 **한 줄도 손대지
  않고**, 승계된 항목마다 새 digest에 묶인 **새 줄**이 판정 내용을 verbatim 복사해 붙는다
  (provenance 2필드만 추가). 실측: **1101 carried · 14 dropped · 0 carry_blocked**, 아카이브
  `docs/multi-session-work-loop/seals/debt-inventory-f171a42e2c34.json`, 격차 0 관측.
  `deferred` 983건이 옛 sha만 이름 부르는 문제는 successor 문서에 새 sha를 자동으로 찍는 대신
  **검증된 조상 집합을 허용**해 풀었다 — 전자는 `checkSuccessor`가 존재하는 이유를 공허하게
  만든다.
- [ ] **분모 밖 부채의 목표값이 무엇인가.** 0이 목표인지(모든 부채가 항상 판정 대상),
  아니면 사이클 경계마다 리셋되는 상수인지. 우산의 같은 질문(`evidence-audit`의 상시 exit 4
  baseline)이 아직 열려 있고 **같은 종류의 결정**이다. 근거 없는 임계를 날조하지 않는다.
  **관측 갱신(2026-09-14, M4)**: 재봉인 직후 0 → 5일 뒤 426 → 6일 뒤 **454(13.81%)**. 즉
  격차는 닫아도 다시 벌어지며, 그 속도가 이 질문의 실질이다. M4는 CI로 이 수치를 주기적으로
  **보이게** 할 뿐 목표를 정하지 않는다(UI12 · 결정 4 — 리포트는 게이트가 아니다).
- [ ] **`deferred` 983건을 어떻게 볼 것인가.** 판정됐으나 해소되지 않았고, 88.2%가 이 상태다.
  이연이 정당한 판정인지 판정 회피의 완곡어인지는 이 PRD가 답할 수 없다 —
  표본을 읽어야 하고 그것은 조사(`/mccp:meta-research`) 범위다.
- [x] **두 계기를 통합할 것인가.** — **통합하지 않는다 (M3, 2026-09-14).** 두 계기는 같은
  findings를 서로 다른 단위로 세지만(M3 실측: registry 1505 대 sealed 2841), 그 차이는 버그가
  아니라 **무엇을 세는가의 차이**다. 통합하면 봉인 결속(`inventory_sha256`)이 registry 이벤트
  축으로 끌려와 UI1을 깬다. 대신 registry 행이 **자기 도달성을 싣는다** —
  `ledgers[].producers[]`가 채널별로 `reachable{adjudicated, closure_types}`와
  `observed{total, open, accepted, closed, by_closure_type}`을 병기하므로, 낮은 종결률이
  "부채가 안 갚혔다"가 아니라 "이 채널은 애초에 종결을 낼 수 없다"로 읽힌다. enum 은퇴는
  기각했다(아래 M3 행).
- [x] **리포트를 어디에 표시하는가.** — **CLI + CI job summary. 대시보드는 배선하지 않는다
  (M4, 2026-09-14).** `STATUS.md`는 `.claude/cache/`라 gitignored이고 산출한 worktree에만
  있으므로 표시면이 될 수 없다. `.github/workflows/closure-report.yml`이 `push: main` · 주 1회
  cron · `workflow_dispatch` · 계기 자신의 파일을 건드리는 PR에서 돌고, 텍스트 리포트를
  job summary에 붙인다. **비-게이트다** — required check가 아니고(`ci-required-checks.js`는
  `test-suite.yml`만 본다), `continue-on-error`도 두지 않는다. 그래서 red는 "부채가 나빠졌다"가
  아니라 **"계기가 실행되지 못했다"** 는 뜻이고, 그것이 지표 5가 원하는 배선 회귀 신호다.
  CI 러너의 수치는 미커밋 파일이 없어 로컬과 다를 수 있으며, 정본은 언제나 실행 시점 산출이다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 리포트가 또 하나의 "아무도 안 부르는 계기"가 된다 — 이 PRD가 진단한 병리 그 자체 | **HIGH** | M1의 Acceptance가 **CLI 1회 실제 실행 + 출력 첨부**를 요구한다. 그리고 M1은 계기를 *하나 더* 만드는 것이 아니라 기존 계기 3개를 **한 출력으로 합치는** 것이다 |
| 격차 수치를 보고 반사적으로 재봉인해 판정 1115건이 끊긴다 | **HIGH** | 결정 3 — M1은 재봉인 코드를 갖지 않는다. 리포트 출력에 "재봉인은 M2 소유이며 지금 하면 판정 1115건이 unmatched가 된다"를 명시 출력한다 |
| 기준선 JSON이 굳어 재측정이 안 된다 | MEDIUM | test가 리포트 출력과 기준선 JSON의 **구조** 정합을 단언한다. 값은 단언하지 않는다 — 값은 append마다 움직인다(선례: `backlog-source.test.js`의 "invariants, not counts") |
| 리포트가 느려 아무도 안 돌린다 | LOW | `buildInventory`는 이미 이 세션에서 수 초 내 완주했다. M1은 그 위에 산술만 얹는다 |

## References

- 기준선 실측 (2026-09-08, `e842558`): [`.claude/_meta/data/2026-09-08-closure-baseline.json`](../_meta/data/2026-09-08-closure-baseline.json)
- 봉인 원본: [`docs/multi-session-work-loop/debt-inventory.json`](../../docs/multi-session-work-loop/debt-inventory.json) (`sealed_at 2026-09-01`, `9093b08`, 1115건) · [`debt-dispositions.jsonl`](../../docs/multi-session-work-loop/debt-dispositions.jsonl) (1115줄)
- 구현: `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` · `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` · `plugins/mccp/scripts/state/findings-registry.js` · `plugins/mccp/scripts/derive/sources/backlog.js`
- 우산 PRD: [harness-wiring-integrity](harness-wiring-integrity.prd.md) — `## Problem`의 "성공 방향 기본값이 배선 단절을 무증상으로 만든다"
