# Plan: leadtime-observability M2 — span-join

**Source PRD**: `.claude/prds/leadtime-observability.prd.md`
**Selected Milestone**: 2 — span-join
**Complexity**: Medium

## Summary

M1은 패널 **안쪽** 구간(`panel_span`)을 측정 가능 레코드 전건으로 냈다. M2는 패널
**바깥쪽** 구간 — 패널 종료에서 ship까지 — 을 두 끝 앵커(completion-ledger의 basename
축, `mccp-pr-codex` receipt의 plan-hash 축)로 **각각** 산출하고, 두 앵커의 불일치를
지표로 표면화한다. 값은 `leadtime.js`의 `post_panel_span` 계열로 붙으며 두 축은 절대
합쳐지지 않는다.

M2의 무게중심은 분포가 아니라 **미짝 사유 분해**다. 오늘 join 커버리지는 basename
11/39 · hash 12/39이고, 나머지 약 2/3가 왜 안 맞는지는 미분해 상태다. 그 2/3가
'아직 ship 안 됨'인지 '앵커가 없음'인지 갈리지 않으면 지표 2는 무엇의 리드타임인지
말하지 못한다. M2는 미짝 전건을 닫힌 사유 집합으로 분류하고, 합계 등식을 fail-closed로
강제한다.

이 축은 `e2e`가 아니다(PRD 결정 2). `/mccp:work` 진입 구간은 C2 소유이고 임계값은
C7 소유다. M2는 분포를 낼 뿐 숫자를 정하지 않는다.

## User Intent

<!-- 우산 PRD(2026-09-01 co-created)가 상속시킨 Users·Hypothesis·Out of scope에서
     운영자가 실제로 말한 것, 그리고 이 세션에서 운영자가 직접 고른 방향만 옮긴다.
     PRD가 스스로 "운영자 미확인"이라 표시한 Scope 결정 3건과 milestone 분해는
     여기 넣지 않는다 — 저자 판단은 ## Design Decisions 소관이다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 지표는 운영자 본인이 읽는 것이고 남에게 보고할 용도가 아니다 | exclusion |
| UI2 | 오늘 값이 없는 축에 숫자를 지어내지 않는다 | constraint |
| UI3 | 커버리지 없는 값은 출력하지 않는다 | constraint |
| UI4 | 임계값과 자동 분기는 C7이 소유하며 이 축은 분포만 내고 숫자를 정하지 않는다 | exclusion |
| UI5 | `/mccp:work` 진입 이벤트는 C2가 생산하고 이 축은 소비만 한다 | exclusion |
| UI6 | 없는 기록을 소급 생성하지 않고 과거 시각을 추정해 미짝을 메우지 않는다 | exclusion |
| UI7 | C4는 read-only 계측이라 사용자 체감 변화가 없어야 한다 | constraint |
| UI8 | 미관측은 측정 부재가 아니라 집계 부재이므로 새 계측을 심지 않는다 | direction |
| UI9 | M1은 이미 완주했으므로 재게이트하지 않고 다음 pending milestone인 span-join을 계획한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 확장 지점 | `plugins/mccp/scripts/lib/leadtime.js:14-21` | 헤더가 이미 `post_panel_span`을 M2 소유로 선언했다. 새 도구가 아니라 이 도구의 두 번째 축 |
| 3층 분리 | `plugins/mccp/scripts/lib/leadtime.js:161,262,330` | `aggregate(records,opts)` 순수 / `audit({repoRoot})` I/O / `main(argv)` CLI |
| ledger 조인 규약 | `plugins/mccp/scripts/lib/evidence-audit.js:11-16` | **RAW ledger 파일**을 쓴다(decision-dedup 뷰 아님). 같은 decision을 N번 재-PR하면 N개 파일이 각각 대조 대상 |
| 커버리지 0은 ok가 아니다 | `plugins/mccp/scripts/lib/evidence-audit.js:5-9` | `comparable===0`이면 절대 ok를 내지 않고 `blind` + 비영점 exit |
| state ladder | `plugins/mccp/scripts/lib/evidence-audit.js:28-48` | 가장 심각한 것부터 평가. `read_error`가 사다리에 있어야 커버리지가 100%로 접히지 않는다 |
| 부재는 0이 아니다 | `plugins/mccp/scripts/lib/leadtime.js` 헤더 "부재 규칙 3종" | 관측 0건이면 축 키 자체를 싣지 않는다. non-finite를 0으로 접지 않는다 |
| 닫힌 분류 + 합계 등식 | `plugins/mccp/scripts/lib/archive-complete/scan.js` (C3, CLAUDE.md §3.11) | `rawRowCount === complete + dropped` fail-closed 등식. 비정규 행이 분모에서 증발하는 오분류 차단 |
| 경로 정규화 | `plugins/mccp/scripts/lib/leadtime.js:108` | `normalizePlanPath` — repo 밖 경로는 값을 버리고 마커만 남긴다 |
| Tests | `plugins/mccp/scripts/lib/tests/leadtime.test.js` | `node:test` + `assert/strict`, 픽스처를 test 안에서 조립, 실코퍼스 주장은 문서 동결로 |
| 문서 동결 | `docs/leadtime-observability/panel-span.md` | `<!-- BEGIN … (verbatim) -->` 마커 + `--json` stdout 축자 인용 + 측정 일자 |
| version 4면 | `plugins/mccp/.claude-plugin/plugin.json:5` · `plugins/mccp/scripts/lib/renderer/html.js:1419` · `plugins/mccp/scripts/lib/renderer/markdown.js:163` · `CHANGELOG.md:5` | §3.7 동기 대상. `renderer/tests/i18n-surface.test.js`가 검증 수단 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime.js` | UPDATE | `post_panel_span` 2계열 + 미짝 사유 분해 + 앵커 불일치를 `aggregate`/`audit`/`renderHuman`에 추가 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATE | 조인·분류·부재·합계등식 회귀 고정 + `corpus.js` 출력 계약 동결 유지 |
| `docs/leadtime-observability/post-panel-span.md` | CREATE | M2 실측 축자 동결 + "이것은 e2e가 아니다" + 두 앵커 불일치의 해석 |
| `docs/leadtime-observability/panel-span.md` | UPDATE | DD11이 최상위 `axis` 스칼라를 제거하므로(두 축을 대표하지 못한다) M1 동결 블록이 거짓이 된다 — **같은 milestone에서 재생성**(L2 architect/HIGH) |
| `.claude/prds/leadtime-observability.prd.md` | UPDATE | milestone 2 행 status/Plan 갱신, Open Question 2·4에 결론 기록 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 patch bump (PRD 내 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 새 항목 + `currently` 노트 동기 |

## Measured Baseline (2026-09-01, 이 worktree)

M2 설계의 입력이다. 전부 이 브랜치에서 직접 실측했다. **리터럴 카운트를 검증 기준으로
쓰지 않는다** — 이 코퍼스는 게이트 실행마다 자란다(PRD Evidence 마지막 항의 같은 주의).
관계 단언만 유효하다.

| 관측 | 값 |
|---|---|
| 측정 가능 패널 레코드 | 39 (out_of_corpus 28 · pre_measurement 13 제외) |
| completion-ledger 엔트리 | 44 · 마지막 `completed_at` **2026-08-21** |
| `mccp-pr-codex` receipt | 71 · 마지막 `meta.created_at` **2026-08-27** |
| basename 축 join | 11/39 · p50 0.38d · p90 0.70d · max 1.74d |
| hash 축 join | 12/39 · p50 0.28d · p90 1.74d · max 5.92d |
| 음수 span (ship이 패널보다 먼저) | 0건 |
| 교차표 (L=ledger hit, S=ship hit) | `LS` 6 · `-S` 6 · `L-` 5 · `--` 22 |
| ledger 사망 이후 발행된 ship receipt | 7건 |
| basename은 맞는데 ledger `plan_file_hash` ≠ `reviewed_plan_hash` | 5건 |

세 가지가 이 표에서 곧바로 따라 나오고, 그것이 M2가 가능하다는 근거다.

1. **`-S` 6건은 `not_shipped`가 아니라 `anchor_absent`다.** ship receipt가 있는데
   ledger 엔트리가 없다 — 그 plan은 ship됐고 ledger 쪽 기록만 빠졌다. PRD의 Open
   Question("ledger 쓰기가 멈춘 것인지 그 plan들이 아직 ship되지 않은 것인지 미판정")은
   **전자**로 갈린다. ledger 마지막 엔트리(08-21) 이후 ship receipt가 7건 더 발행된
   사실이 같은 방향을 가리킨다.
2. **`key_mismatch`는 가설이 아니라 실재 5건이다.** basename은 맞는데 ledger가 봉인한
   `plan_file_hash`가 리뷰 시점 `reviewed_plan_hash`와 다르다. 리뷰와 ship 사이에 plan
   본문이 바뀌는 것은 이 저장소에서 구조적으로 정상이므로 이는 결함 보고가 아니라
   **별도 사유**다.
3. **`--` 22건만이 진짜 미분해**다. 두 앵커 모두 부재이므로 제3의 증인이 필요하다.

> **DD14 필터로 재측정함 (2026-09-01).** 위 교차표는 ship receipt를 **존재**로 셌다.
> ship verdict(`codex_verdict ∈ {converged, skipped}`)로 필터하면 자격 있는 receipt는
> 71건 중 **40건**이다(비자격 31 = divergent 9 + verdict 부재 22). 그런데 교차표는
> 필터 전후가 **완전히 동일**하다(`LS` 6 · `-S` 6 · `L-` 5 · `--` 23) — `-S` 6건이
> 가리키는 receipt가 전부 자격을 갖췄기 때문이다. 즉 위 결론 1은 살아남지만, 그것은
> **이번 코퍼스의 우연**이고 필터가 없으면 다음 divergent ship이 조용히 뒤집는다.
> 그래서 DD14는 결론을 바꾸는 수정이 아니라 결론을 **방어 가능하게** 만드는 수정이다.
> (`--`가 22에서 23으로 읽히는 것은 재측정 사이에 게이트 실행이 레코드를 하나 더
> 만들었기 때문이다 — 코퍼스가 자란다는 사실 자체의 실례이고, 그래서 리터럴 카운트를
> 검증 기준으로 쓰지 않는다.)

## Design Decisions

<!-- 저자 판단. 리뷰어 focus에는 ## User Intent만 주입되므로 여기 있는 정당화는
     리뷰어에게 도달하지 않는다. -->

- **DD1 — 새 도구가 아니라 `leadtime.js`의 두 번째 축이다.** M1 헤더가 이미
  `post_panel_span`을 M2 소유로 선언했고 PRD도 "같은 도구가 세 번째 계열로 집되"라고
  적었다. 도구를 나누면 분모가 둘로 갈라지고, 그것이 M1의 DD2가 `corpus.js` 리더를
  재사용해 막은 바로 그 drift다.

- **DD2 — 두 앵커 계열은 끝까지 분리된다.** 합쳐 하나의 "리드타임"을 내지 않는다.
  오늘 커버리지가 11 대 12로 사실상 동률이라 어느 쪽이 옳은지 근거가 없고(PRD 결정 1),
  합치는 순간 그 선택이 영원히 검증되지 않는다. 불일치 자체가 지표 4다. C2가 착지해
  세 번째 앵커가 생겨도 같은 규칙이 적용된다(PRD Risk 마지막 행).

- **DD3 — git은 분류의 증인이지 span의 앵커가 아니다.** `--` 22건을 가르려면 제3의
  증인이 필요하고 후보는 (a) plan이 `archived/`에 있는가 (b) `mccp-implement-codex`
  receipt가 있는가 (c) git 이력에 그 plan 경로를 건드린 커밋이 있는가다. 이 증인들은
  **"ship됐는가"라는 불리언에만** 쓰고 그 커밋 시각을 span의 끝으로 삼지 **않는다**.
  삼는 순간 선언되지 않은 세 번째 계열이 생겨 DD2와 PRD 결정 1·2가 동시에 깨지고,
  git 근사는 이 PRD가 "4~18일"이라 부르며 불신한 바로 그 값이다.

- **DD4 — 미짝 사유는 닫힌 집합이고, `not_shipped`는 else-branch가 아니라 **증거를
  요구하는 주장**이다.** 사유 5종: `not_shipped` · `anchor_absent` · `key_mismatch` ·
  `no_plan_path` · `unclassified`. `unmatched === Σ(사유별 건수)`가 성립하지 않으면
  `state='degraded'`.

  (round-1 L2 invariant/HIGH 흡수) 초안은 `not_shipped`를 "제3 증인 전부 부정"으로 두고
  `unclassified`를 "그 외"로 두었다. 그러면 **증인이 없을 때도 '전부 부정'이 참**이 되어
  `unclassified`가 구조적으로 도달 불가가 되고, DD4가 존재 이유로 든 바로 그 버킷이
  비어 있는 채 사유 커버리지가 100%로 보인다 — §3.11 C3 오류의 정확한 재현이다.
  더 나쁜 것은 증인 (b) `mccp-implement-codex` receipt가 §3.12상 **working-tree only**라
  다른 클론·worktree에서는 항상 부재라는 점이다. 부재를 부정으로 읽으면 그 환경에서
  **전건이 `not_shipped`로 단언**된다.

  그래서 각 증인은 불리언이 아니라 **3-state**를 낸다: `yes`(ship 증언) · `no`(ship
  아님을 실제로 관측) · `unavailable`(그 증인을 이 환경에서 읽을 수 없음).
  - `not_shipped`는 **모든 증인이 `no`일 때만** 성립한다.
  - 증인이 하나라도 `unavailable`이면 → `unclassified`. "증인이 부정했다"와 "증인이
    없다"는 다른 사실이고, 후자를 전자로 접는 것이 이 finding이 막는 행위다.
  - `unclassified`는 실패가 아니라 **정직한 산출**이다. 다수여도 숨기지 않는다.

- **DD5 — 선택 규칙은 '패널 이후 가장 이른 것', 그것이 없으면 '패널 이전 가장 늦은 것'
  이다.** 같은 basename에 ledger 엔트리가 N개일 수 있다(재-PR — `evidence-audit.js`의
  RAW ledger 규약). 임의로 하나를 고르면 span이 조용히 달라지므로 규칙을 출력에
  명시하고 `candidates` 수를 레코드별로 남겨 재계산으로 반증 가능하게 한다.

  (round-2 L2 architect/HIGH · invariant/HIGH 흡수) 라운드 1은 '패널 이후'만 골랐고,
  그러면 **음수 span이 정의상 생성될 수 없어** DD6의 경보가 구조적으로 도달 불가가
  된다 — DD4가 자기 초안에서 고쳐 낸 '도달 불가 버킷'의 재현이다. 더 나쁜 것은 앵커가
  패널보다 앞선 실재 사고가 `negative_spans[]`가 아니라 **미짝으로 접혀**
  `not_shipped`/`anchor_absent`로 오분류된다는 점이다. fallback 절이 그 두 결함을
  함께 닫는다: 후보가 전부 패널 이전이면 가장 늦은 것을 골라 **음수 span으로 보고**한다.

- **DD6 — 음수 span은 clamp하지 않고 보고하며, 1건이라도 있으면 그 축이 `degraded`다.**
  오늘 0건이지만 0으로 접으면 앵커가 뒤집힌 실재 사고가 "즉시 ship"으로 보인다.
  M1의 부재 규칙 (b)와 같은 논리다.

  (round-2 L2 invariant/HIGH 흡수) 라운드 1은 "비-ok로 떨어뜨린다"라고만 적어 사다리의
  어느 값인지 정하지 않았고, 그러면 exit code와 Task 6의 선행조건(`degraded` 부재)에
  어떻게 반영되는지가 미결정으로 남는다. 값은 **`degraded`**다 — 앵커가 뒤집혔다는 것은
  관측의 부재(`blind`)가 아니라 계측의 손상이고, `degraded`여야 Task 6의 동결과 PRD
  결론 기록이 실제로 막힌다. 도달 가능성은 DD5의 fallback이 보장하며 Task 1의 Validate가
  픽스처로 그것을 직접 증명한다(`unclassified`에 적용한 것과 같은 잣대).

- **DD7 — 백분위는 M1과 같은 nearest-rank이고 방법을 출력에 싣는다.** n이 10 안팎이라
  보간은 없는 정밀도를 만든다. 두 계열이 서로 다른 방법을 쓰면 비교 자체가 무의미해진다.

- **DD8 — 새 env 토글을 만들지 않는다.** M1 DD6과 같다. read-only 도구에 켜고 끌 것이
  없다.

- **DD9 — `corpus.js` 출력은 이번에도 한 바이트도 바뀌지 않는다.** PRD 결정 3이고
  `docs/diverse-agent-review/quorum-calibration.md`의 축자 동결이 그것에 의존한다.
  M1이 세운 스냅샷 test를 유지하고, M2가 추가로 필요로 하는 것이 있으면 추가 export만
  한다.

- **DD10 — 게이트 배선 diff는 공집합이다.** `Files to Change`에 `commands/`·`hooks/`·
  `plan-review/` 본문이 하나도 없다(UI7).

- **DD14 — ship 판정은 재구현하지 않고 게이트 오라클을 그대로 부른다.**
  (round-2 security/HIGH ×2 · round-3 security/HIGH · invariant/HIGH ×2 흡수)
  라운드 2는 "receipt 존재 ≠ ship"까지는 옳게 갔지만 `SHIP_VERDICTS` **배열 멤버십만**
  복제했다. 그 오라클은 세 겹인데 한 겹만 베낀 것이고, 라운드 3이 나머지 두 겹을
  각각 지목했다:
  - `resolveEffectiveVerdict`가 **review 축을 우선**하고 `codex_verdict`는 legacy
    fallback이다(`review-verdict.js:14-16`, `pr-ship-gate.js:39,107`이 그것을 통해
    읽는다). 원시 필드를 읽으면 review 축으로 승인된 receipt가 "verdict 부재 →
    `unavailable`"로 잘못 떨어지고, 반대로 multi-agent 출처 `converged`가 터미널에서는
    no-ship인데 ship으로 계수된다.
  - `skipped`는 그 자체로 ship이 아니라 `SKIP_PROOF_META_KEYS` 중 하나를 요구한다
    (`pr-ship-gate.js:74-80` `hasSkipProof`). 증거 없는 skip은 `skipped-unproven`
    no-ship이다. **실측: `skipped` 33건 중 6건이 무증거**
    (`codex-intent-context` · `context-budget-cleanup` · `red-test-suite-restore` ·
    `multi-session-work-loop` · `multi-session-work-loop-m4` · `diverse-agent-review-m1`).

  세 겹을 산문으로 옮겨 적으면 다음 라운드에 또 한 겹이 빠진다 — 라운드 2가 실제로
  그렇게 실패했고, **라운드 3의 "부른다"도 여전히 한 겹을 빠뜨렸다**(round-4
  architect/HIGH · security/HIGH). 그래서 **부르는 방법까지 못박는다**:
  `pr-ship-gate.js`는 `deriveShipDecision`·`classifyVerdict`·`SHIP_VERDICTS`를
  export하고(`:184-189`) ship 판정은 **그 함수의 반환값**이며 M2는 그 위에 아무 규칙도
  얹지 않는다. 호출 형태는 정확히 이것이다:

  ```js
  deriveShipDecision(receipt, {
    forceOverrideActive: receipt.meta && receipt.meta.pr_codex_force_override === true,
  }).ship
  ```

  - **`opts.forceOverrideActive`를 반드시 묶는다.** `:142-144`가
    `const overrideActive = opts.forceOverrideActive === true`이고 `:158`이
    `ship = rawShip || overrideActive`이므로, opts를 안 주면 **audited override로 실제
    머지된 ship이 no-ship으로 접힌다**. 코퍼스에 `pr_codex_force_override:true`인
    receipt가 **5건**(전부 `divergent`) 실재한다 — `diverse-agent-review` ·
    `meta-research-command-m1` · `multi-session-work-loop-m5` ·
    `santa-adjudication-m3` · `setup-gitignore-m1`. 묶지 않으면 DD4가 "증거를 요구하는
    주장"으로 규정한 `not_shipped`가 **실제로 ship된 작업에 대해 거짓을 단언**한다.
  - **receipt 전체를 넘긴다(`meta` 포함).** `hasSkipProof`/`SKIP_PROOF_META_KEYS`는
    **export되지 않으므로**(모듈 export는 4개뿐) 그 층은 `deriveShipDecision` 안에서만
    발동하고, `receipt.resolution`만 넘기거나 `meta`를 떨어뜨리면 무증거 skip 6건의
    포함/배제가 조용히 뒤집힌다.
  - 판정 근거를 출력에 싣는다: `ship_receipts_total` · `ship_receipts_qualified` ·
    verdict별 분포 · **무증거 skip 건수** · **override로 자격을 얻은 건수**. 숫자를 안
    실으면 이 필터가 켜져 있는지 소비자가 알 수 없고, Validation이 그 부재를 throw로
    잡는다.
  - **오늘의 결론은 이 더 엄격한 기준으로도 바뀌지 않는다** — verdict-only 39 hash 대
    proof-aware 33 hash인데 교차표는 동일하고 필터로 잃은 `-S` 항목이 0건이다
    (Measured Baseline 각주). 그러나 그것은 이번 코퍼스의 우연이고, 오라클을 부르지
    않으면 다음 무증거 skip이 조용히 결론을 뒤집는다.

- **DD15 — `unavailable`은 `read_error`가 아니라 '소스를 쓸 수 없음'이다.**
  (round-3 architect/HIGH 흡수) DD4는 증인을 `yes`/`no`/`unavailable` 3-state로
  나눴고 DD13은 `unavailable`을 `read_error`에 결속시켰다. 그런데 이 도구가 소스
  읽기의 정본으로 삼는 `corpus.readReviewRecords`는 **디렉토리 부재를 `read_error`로
  치지 않는다** — `corpus.js:678-681`은 `{present:false}`만 기록하고 `read_error`는
  `readdirSync`가 throw할 때만 켠다. 그래서 DD4가 **최악 시나리오로 명시한 바로 그
  상황**(증인 (b) `mccp-implement-codex`가 §3.12상 working-tree only라 다른 클론에서는
  디렉토리 자체가 없음)에서 증인이 `unavailable`이 아니라 `no`로 떨어지고, DD4가
  막겠다던 '전건 `not_shipped` 단언'이 그대로 재현된다.

  술어를 **한 곳에서 정의하고 나머지가 그것을 참조한다**. 이 milestone은 같은 fail-open을
  세 번 서로 다른 문으로 맞았다 — 라운드 2는 `read_error`를, 라운드 3은 증인 축의
  `present:false`를, 라운드 4는 **축 상태의** `present:false`를 지적했다(round-4
  invariant/HIGH). 술어를 두 군데 이상에 풀어 쓰는 한 다음 문이 또 열리므로, 정의를
  하나로 만든다:

  > **`source_unavailable(src) := (src.present === false) || (src.read_error === true)`**

  - **이 술어는 증인 축 전용이다.** 증인의 소스가 `source_unavailable`이면 그 증인은
    `no`가 아니라 `unavailable`이다(DD4의 3-state). "그 증인이 이 환경에서 말할 수
    있는가"라는 질문에는 부재와 읽기 실패가 같은 답이므로 합치는 것이 옳다.
  - **축 상태(`damaged`)에는 적용하지 않는다.** (round-5 architect/HIGH — 라운드 4가
    여기서 과잉교정했다.) `damaged`는 `corpus.js:670`을 **그대로** 미러해
    `read_error || parse_failures > 0`이고 `present:false`를 포함하지 않는다.
    `REVIEW_SUBDIRS`(`corpus.js:103-106`)는 `.claude/reviews`와 **선택적**
    `.claude/reviews/archive` 둘을 열거하는데, 후자의 부재는 완전히 정상이다. 두
    용법을 합치면 archive가 없는 정상 저장소에서 `panel_span`이 degraded·exit 1이 되고
    이 plan 자신의 Validation(`state !== "ok"` throw)이 **정상 환경에서 발화**한다.
    `corpus.js`가 그 둘을 갈라 두는 것은 실수가 아니라 설계다.
  - **그러면 '앵커 디렉토리가 통째로 없는' 환경은 무엇이 막는가.** `damaged`가 아니라
    **관측 0건**이 답한다: 앵커 소스가 없으면 조인 관측이 0건이므로 부재 규칙 (a)대로
    `post_panel_span` 키가 실리지 않는다. 그것을 잡는 자리는 술어가 아니라 **Task 6의
    선행조건**이며, 그래서 그 조건은 "`degraded`가 없을 때"가 아니라 **"`post_panel_span`
    키가 실려 있고 그 축의 `state`가 `ok`일 때"** 로 적혀 있다. 계측 부재는 손상이
    아니라 부재이고, 부재 위에서 결론을 굳히지 않는 것이 요건이다.

  근거: `corpus.js:678-681`이 디렉토리 부재를 `{present:false}`로만 기록하고
  `read_error`는 `readdirSync`가 throw할 때만 켠다. 소스 모델은 그 `sources[]`
  (`{dir, present, files}`)를 미러하고, 출력에 소스별 `present`/`read_error`를 실어
  어느 쪽이었는지 남긴다.

- **DD11 — 축은 하나의 컨테이너에만 산다. 최상위 `state`는 합성값이고, 그 합성은
  M1의 damaged-first 우선순위를 그대로 물려받는다.**

  (round-2 L2 architect/HIGH · test/HIGH · invariant/HIGH 흡수) 라운드 1의 DD11은
  축 하나를 **두 컨테이너**(`axes.*`와 최상위 `post_panel_span`)에 쪼개 놓았다.
  그러자 (a) 이 plan 자신의 Validation이 최상위 키를 요구하는데 DD11은 `axes` 하위에
  두어 **서로를 배제**했고, (b) '어느 축이 present한가'에 소유자가 `axes`와
  `axes_present` 둘이 되었으며, (c) read_error가 관측 0건을 만들면 축 키가 사라져
  합성에서 빠지고 최상위가 `ok`로 남는 **fail-open**이 열렸다. 셋 다 컨테이너를
  둘로 나눈 데서 나왔으므로, 나누지 않는다.

  - **컨테이너는 하나다.** M1의 최상위 형태를 유지한다 — `panel_span`과
    `post_panel_span`이 **최상위 형제 키**이고 각자 자기 `state`를 갖는다.
    `axes` 맵도 `axes_present` 배열도 만들지 않는다(이중 진실원 제거).
    "어느 축이 present한가"의 유일한 답은 **실려 있는 축 키의 집합**이다.
  - **최상위 `state`는 실린 축들의 사다리 최악값**(degraded > blind > ok)이고
    `state_is_composite:true`를 동반한다. exit code는 이 값을 따른다.
  - **damaged-first가 부재보다 우선하며, 그 규칙은 두 축에 똑같이 걸린다.**
    (round-3 architect/HIGH 흡수) 라운드 2는 이 규칙을 `post_panel_span`에만 걸고
    `panel_span`은 "M1 그대로"라고 적었다. 그런데 M1 코드는 damaged여도 관측 0건이면
    **축 키를 만들지 않고 early return**한다(`leadtime.js:236-239`
    `if (observed.length === 0) { result.state = damaged ? 'degraded' : 'blind';
    return result; }`) — state 우선순위만 같고 **키 적재는 반대**다. 그대로 두면 코퍼스
    read_error + 관측 0건에서 실린 축이 0개가 되어 최상위가 `blind`로 접히고, 오늘
    M1이 `degraded`/exit 1로 보고하는 상황이 **관측 부재로 강등**된다 — DD11이 (c)로
    닫겠다던 fail-open이 `panel_span` 쪽에 그대로 남는 것이다.

    규칙: `damaged`인 축은 **관측 0건이어도 키를 싣고 `state:'degraded'`로 낸다**
    (분포·사유 분해는 없이 state만). `damaged`의 정의는 **DD15가 소유**하고 그것은
    `corpus.js:670`을 그대로 미러한 `read_error || parse_failures>0`이다 —
    `present:false`는 포함하지 **않는다**(선택적 소스의 부재는 정상이다). 여기서 다시
    열거하지 않는 이유는 두 정의가 갈라지는 것을 막기 위함이고, 그 갈라짐은 라운드 4·5가
    각각 반대 방향으로 한 번씩 실증했다. 이것은
    `panel_span`에도 적용되므로 그 축은 "M1 그대로"가 아니라 **`state` 필드가 추가되고
    damaged 경로에서 키가 생긴다** — 동결 블록을 재생성해야 하는 이유가 하나 더 늘어난다.
  - **한 축의 blind는 다른 축의 값을 절대 억제하지 않는다.**
  - 최상위 `axis` 스칼라는 두 축을 대표하지 못하므로 제거하고, 그 사실 때문에 M1
    동결 블록(`docs/leadtime-observability/panel-span.md:91-92`가 `"axis":"panel_span"`을
    축자 고정)이 거짓이
    되므로 **같은 milestone에서 재생성한다**(Files to Change).

- **DD12 — M1 픽스처는 붉어지지 않는다. 부재 규칙 (a)가 축 단위로 적용되기 때문이다.**
  기존 `leadtime.test.js:89`·`:129`는 ledger/ship 소스가 없는 픽스처에서
  `out.state==='ok'`를 단언한다(라운드 1은 여기에 `:215`도 적었으나 그 줄은 같은
  단언을 갖지 않는다 — round-2 L2 test/LOW 정정). 그 픽스처에는 앵커 소스가 아예
  주입되지 않으므로 `read_error`가 없고, 따라서 DD11의 damaged-first가 발동하지
  않아 `post_panel_span`은 **키 부재**다. 실린 축이 `panel_span` 하나뿐이므로
  합성 최악값 = `ok`. M1 단언이 그대로 성립한다.

  이것은 희망이 아니라 Task 4의 Validate가 pin하는 명제다. 반대로 앵커 소스가
  **있는데 못 읽은** 경우는 DD11의 damaged-first가 축 키를 살려 degraded로 만든다 —
  두 경우가 다른 결과를 내는 것이 이 설계의 요점이다.

  **세 번째 M1 픽스처가 있고 라운드 2는 그것을 빠뜨렸다**(round-3 test/HIGH 흡수):
  `leadtime.test.js:162-164`의 `aggregate([], { readError: true })`는
  `out.state==='degraded'`를 단언한다. 관측 0건 + damaged이므로 DD11의 damaged-first가
  `panel_span` 키를 살려 `degraded`로 내고, 실린 축이 그 하나뿐이라 합성 최악값도
  `degraded`다 — 그 test는 green으로 남는다. damaged-first를 `post_panel_span`에만
  걸었다면 실린 축이 0개가 되어 `blind`가 나오고 **이 test가 red가 됐을 것이다**.
  Task 4의 Validate가 이 경우를 직접 단언한다.

- **DD13 — 앵커 소스를 못 읽었으면 사유 분해를 내지 않는다.** (round-1 L2 invariant/HIGH
  흡수) `leadtime.js:44-47` 헤더가 못박은 불변식은 "`read_error`가 사다리에 있어야
  커버리지가 100%로 접히지 않는다"이다. ledger·ship receipt 디렉토리를 통째로 못 읽어도
  미짝 전건이 `anchor_absent`/`not_shipped`로 분류되고 합계 등식은 여전히 성립하므로,
  **계측 고장이 완전한 측정으로 보인다**. 규칙:
  - 어느 앵커 소스든 **읽기에 실패하면**(`read_error` — DD15의 `damaged` 정의) 그 축을
    **`state:'degraded'`로 싣되**(DD11의 damaged-first — 관측 0건이어도 키를 만든다.
    키를 지우면 합성에서 빠져 최상위가 `ok`로 남는 fail-open이 된다) **사유 분해 키는
    싣지 않는다**(빈 분해를 싣는 것은 "분류했더니 0건"과 구분되지 않는다).
    소스 디렉토리가 **아예 없는** 경우는 damaged가 아니라 관측 0건이며, 그 경로는
    Task 6의 선행조건이 막는다(DD15).
  - **반대 축 증인에도 같은 규칙이 걸린다.** `anchor_absent`는 "반대 축이 ship을
    증언"인데, 그 반대 축의 소스가 `read_error`면 증인은 `no`가 아니라
    `unavailable`이다(DD4의 3-state). 그러지 않으면 ship 소스만 못 읽었을 때
    ledger 축의 미짝이 조용히 `not_shipped`로 내려간다 — read_error 강등을 '그 축'에만
    걸면 생기는 누수다(round-2 L2 architect/MEDIUM).
  - 그 상태에서는 Task 6의 문서 동결도 PRD Open Question 4의 결론 기록도 **하지 않는다**.
    읽지 못한 소스 위에서 "ledger 쓰기가 멈췄다"는 결론을 git-tracked 문서에 굳히는 것이
    이 finding의 최악 시나리오다.
  - `read_error`는 `parse_failure`와 구분해 각각 카운트한다. 전자는 소스 전체의 실패,
    후자는 개별 엔트리의 실패다.

## Tasks

### Task 1: `post_panel_span` 2계열 조인

- **Action**: `leadtime.js`에 ledger·ship receipt 리더를 더한다(각각 `read_error` ·
  `parse_failures` 보고). `aggregate`에 `post_panel_span`을 추가하되 `by_anchor` 하위에
  `ledger_basename` · `ship_plan_hash` 두 계열을 **각각** 둔다. 각 계열은 `unit:'ms'` ·
  `method:'nearest-rank'` · `n/min/p50/p90/max` · `records[]`
  (`{record, panel_recorded_at, anchor_at, span_ms, candidates}`). 다중 매치는 패널 시각
  이후 가장 이른 것, 없으면 패널 이전 가장 늦은 것(DD5). 후자는 `negative_spans[]`에
  남기고 분포에도 포함하며 그 축을 `degraded`로 만든다(DD6). ship 앵커 자격은
  **`pr-ship-gate.js`의 export된 오라클을 호출해** 판정한다 — 멤버십을 재구현하지
  않는다(DD14). 소스 가용성은 `present`/`read_error` 둘 다로 판정한다(DD15).
- **Mirror**: `evidence-audit.js` RAW ledger 규약 · `leadtime.js`의 `summarize`/`percentile` ·
  `pr-ship-gate.js:184-189`가 export하는 `deriveShipDecision`/`classifyVerdict`
  (`:39,107`이 `resolveEffectiveVerdict`를 경유하고 `:74-80` `hasSkipProof`가
  무증거 skip을 fail-closed로 막는다 — 셋을 한 번의 호출로 상속한다) ·
  `corpus.js:678-681`의 `sources[]` 가용성 모델
- **Validate**: (1) `--json`이 두 계열을 **각각** 내고 합쳐진 단일 값 키가 존재하지
  않는다 — 두 계열이 독립적으로 계산된다는 **구조** 단언이며, 관측 수의 대소를 비교하지
  않는다(코퍼스가 자라면 동수가 될 수 있고, 그때 정상 동작이 실패로 읽힌다).
  (2) 앵커가 패널보다 **앞선** 픽스처가 `negative_spans`에 1건을 내고 그 축이
  `degraded`가 된다 — DD6 경보의 도달 가능성 직접 증명. (3) `codex_verdict='divergent'`
  이고 override 없는 receipt만 있는 픽스처에서 그 레코드는 ship 앵커에 매치되지
  **않는다**(DD14).

  (4)~(6)은 **위험한 방향**을 덮는다 — 라운드 4까지 Validate는 과대엄격(제외되어야 할
  것이 제외되는가)만 단언하고, 실제 위험(포함되면 안 되는 것이 조용히 포함되는가)은
  무테스트였다(round-4 test/HIGH):
  (4) `codex_verdict='skipped'`인데 `SKIP_PROOF_META_KEYS`가 하나도 `true`가 아닌
  픽스처는 ship 앵커로 **계수되지 않는다**. `hasSkipProof`가 export되지 않아 이 층은
  `deriveShipDecision`에 **`meta`를 포함한 receipt 전체**를 넘겼을 때만 발동하므로,
  이 test가 곧 "호출 형태가 옳은가"의 검사다.
  (5) `codex_verdict='divergent'` + `meta.pr_codex_force_override=true`인 픽스처는
  ship 앵커로 **계수된다** — override를 묶지 않으면 실패한다.
  (6) 출력의 `ship_receipts_qualified`·`override_qualified`·무증거 skip 건수가
  **전부 존재**한다(undefined면 실패). 필터가 켜져 있다는 근거가 출력에 없으면 그
  필터는 관측 불가다.

### Task 2: 미짝 사유 분해 + 합계 등식

- **Action**: 계열별로 미짝 레코드 전건을 DD4의 5종으로 분류한다. **선행 조건(DD13)**:
  그 축의 앵커 소스에 `read_error`가 있으면 분해를 수행하지 않고 키를 싣지 않는다.
  판정 순서는 `no_plan_path`(`plan_path`가 null **또는** M1의 `NON_REPO_PATH` 마커) →
  `key_mismatch`(양쪽 존재, 키만 불일치) → `anchor_absent`(반대 축이 ship을 증언) →
  `not_shipped`(**증인 3종이 전부 `no`**) → `unclassified`(증인 중 `unavailable`이
  하나라도 있거나 그 외). `unmatched === Σ(counts)` 등식이 깨지면 `degraded`.
  각 사유에 레코드 **이름 전건**을 싣고, `not_shipped`·`unclassified` 행에는 증인별
  3-state 값도 함께 실어 판정을 재계산으로 반증할 수 있게 한다.
- **Mirror**: `archive-complete/scan.js` C3 fail-closed 등식 · `leadtime.js`
  `panel_span_missing_records`의 전건 이름 규약
- **Validate**: 픽스처로 5종이 각각 정확히 한 번씩 발화한다. `unclassified` 픽스처는
  **증인 하나를 `unavailable`로** 만들어 구성하며(도달 가능성의 직접 증명), 같은 입력에서
  그 증인만 `no`로 바꾸면 `not_shipped`로 넘어가는 짝 test를 둔다 — 두 버킷이 실제로
  다른 사실을 센다는 것이 그 짝으로만 확인된다. 앵커 소스 `read_error` 픽스처는 분해
  키가 **부재**하고 축 state가 `degraded`임을 단언한다.

### Task 3: 앵커 불일치 (지표 4)

- **Action**: 두 계열 모두에 매치된 레코드(오늘 `LS` 6건)에 대해 `anchor_delta_ms`를
  내고 `disagreement` 블록(`n` · `p50` · `max` · `records[]`)으로 보고한다. 한쪽만
  매치된 레코드는 불일치가 아니라 **커버리지 차이**이므로 이 블록에 넣지 않고
  `coverage.only_ledger` / `coverage.only_ship`로 따로 센다.
- **Mirror**: `evidence-audit.js`가 `hash_bound`를 별도 보고하는 방식 — 결속이 끊기면
  침묵하지 않는다
- **Validate**: 교차표 4칸의 합이 측정 가능 레코드 수와 같고(항등식 — 회귀 가드일 뿐),
  **그 위에** 과대 방향을 반증하는 두 단언을 둔다: `disagreement.n === coverage.LS`이고,
  한쪽 축에만 매치된 픽스처를 넣었을 때 그 레코드가 `disagreement.records`에
  **나타나지 않는다**. 앞의 항등식은 두 불리언 분할이라 구성상 항상 참이므로 단독으로는
  Task 3이 막겠다고 한 결함(단일 앵커 레코드가 불일치로 잘못 계수됨)을 못 잡는다
  (round-2 L2 test/HIGH).

### Task 4: state ladder · 부재 규칙 · `renderHuman`

- **Action**: DD11대로 **컨테이너 하나**를 유지하고 최상위 `state`만 합성값으로 바꾼다.
  - `panel_span`(`state` 필드가 추가된다 — DD11의 damaged-first가 두 축에 걸리므로
    "M1 그대로"가 아니다) · `post_panel_span`(신규)이 **최상위 형제 키**이고 각자
    `state`를 갖는다. `axes` 맵도 `axes_present`도 만들지 않는다.
    `post_panel_span` 안에서는 `by_anchor`의 두 계열이 각자 관측 수를 갖는다.
  - 최상위 `state` = **실린 축들의 사다리 최악값** + `state_is_composite:true`.
    exit code는 이 값을 따른다.
  - 부재/손상 우선순위는 `leadtime.js:231`을 미러한다: `damaged`(read_error 또는
    parse_failures>0)면 **관측 0건이어도 축 키를 싣고 `degraded`**, damaged가 아니고
    관측 0건이면 축 키를 **싣지 않는다**. 계열 단위도 같다.
  - `axis` 스칼라를 제거하므로 `docs/leadtime-observability/panel-span.md`의 동결 블록을
    재생성한다.
  - `renderHuman`은 축마다 **커버리지 줄을 값보다 먼저** 내고, 합성 state를 낼 때는
    그것이 합성값임을 문구로 밝힌다(UI3).
- **Validate**: (다섯 줄 전부 필수)
  1. `post_panel_span`이 blind인데 `panel_span`에 관측이 있는 픽스처에서
     `panel_span`의 분포가 **그대로 실린다** — 억제되지 않음.
  2. ledger/ship 소스가 없는 **기존 M1 픽스처**(`leadtime.test.js:89`·`:129`)에서
     `post_panel_span` 키가 부재하고 최상위 `state==='ok'` — M1 단언 무변경(DD12).
  3. **앵커 소스 read_error 픽스처**에서 관측이 0건이어도 `post_panel_span` 키가
     실리고 `state==='degraded'`이며 최상위도 `degraded`(exit 1) — H7 fail-open의
     직접 반증이자 damaged-first의 증명.
  4. 두 축 모두 damaged 없이 관측 0건인 픽스처: 실린 축이 하나도 없으므로 합성이
     정의되지 않는다 → 최상위 `blind` · exit 2. (합성 규칙의 경계값을 명시적으로
     정한다 — 라운드 1은 이 경우를 규칙과 Validate가 서로 다르게 답했다.)
  5. 한 축이 `degraded`이면 다른 축이 `ok`여도 최상위가 `degraded`이고 exit 1.

### Task 5: 회귀 test

- **Action**: `leadtime.test.js`에 Task 1~4의 단언을 더한다. M1이 세운 `corpus.js` 출력
  스냅샷 동결 test는 **그대로 유지**한다(DD9). 실코퍼스 리터럴 카운트는 test에 쓰지
  않는다 — 코퍼스가 자라므로 반드시 붉어진다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/leadtime.test.js`

### Task 6: 문서 동결 + PRD 정정

- **Action**: `docs/leadtime-observability/post-panel-span.md`에 `--json` stdout을 축자
  동결(측정 일자 명시)하고 "이 값은 e2e가 아니다"와 두 앵커 불일치의 해석을 적는다.
  PRD의 milestone 2 행을 갱신하고, Open Question 4(ledger 사망)에 **`-S` 6건 + 08-21
  이후 ship 7건**을 근거로 "쓰기가 멈춘 것"이라는 결론을 기록한다. Open Question
  2(미짝이 배선 문제면 C1 사거리)에는 분해 결과를 적는다.
- **선행 조건 (둘 다 필수)**: (a) **DD13·DD15** — `post_panel_span` **키가 실려 있고**
  그 축의 `state`가 `ok`일 때만 수행한다. "`degraded`가 없을 때"로는 부족하다:
  앵커 디렉토리가 통째로 없으면 관측 0건이라 그 축 키가 아예 안 실리고 최상위는
  `panel_span`만 보고 `ok`가 되므로, degraded 검사만으로는 **계측이 아예 없는 위에서**
  동결과 결론 기록이 진행된다(round-5 invariant/HIGH가 지목한 경로). 못 읽은 실행이든
  아예 없는 실행이든 그 위에서 Open Question 4의 결론을 굳히면 계측 부재가 git-tracked
  결론이 된다. (b) **DD14** — Open Question 4의
  결론("ledger 쓰기가 멈췄다")은 `-S` 집합이 **ship verdict로 필터된 뒤에도** 유지될
  때만 기록한다. 라운드 1까지는 receipt 존재만 봤고, DD13은 '못 읽음'만 막았지
  '읽었는데 그 receipt가 ship을 뜻하지 않음'은 막지 않았다(round-2 L2 security/HIGH).
- **Validate**: 동결 블록과 라이브 출력의 바이트 일치를 재확인 + 동결 시점의 `state`가
  `ok`임을 블록 안에 함께 기록

### Task 7: §3.7 version 4면

- **Action**: patch bump. 현재 브랜치 `1.33.8`, origin/main `1.33.6`, 미머지 형제가
  `1.33.7`·`1.34.0` 선언 → 잠정 목표 **`1.33.9`**. 4면 동기.
- **주의**: §3.7 forward-only — 목표 번호는 (a) base 머지 시점과 (b) `/mccp:pr` 진입
  직전에 **두 번 재계산**한다. 미리 확정하지 않는다.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 도구 실동작 + DD2 검증. (round-1 L2 test/HIGH 흡수) 이전 가드는
#   if (s && s.p50 !== undefined) throw
# 였는데, `post_panel_span`이 **아예 없으면** 조건이 거짓이라 '(absent)'만 찍고 exit 0으로
# 통과했다 — 게이트가 위험한 방향(값이 없는데 통과)으로 조용히 열려 있었다. 또 병합이
# `p50`이 아닌 다른 이름으로 오면 잡히지 않았다. 이제 **부재도 실패**이고, 허용 키를
# whitelist로 고정해 이름과 무관하게 병합을 잡는다.
#
# 산출 경로는 프로젝트 안(.claude/cache/)에 둔다. `/tmp`는 git-bash와 Windows 네이티브
# node가 서로 다른 경로로 해소해(전자는 AppData\Local\Temp, 후자는 C:\tmp) 검증 스크립트가
# 실행 자체를 못 했다.
mkdir -p .claude/cache
node plugins/mccp/scripts/lib/leadtime.js --json > .claude/cache/lt.json
node -e '
  const j = JSON.parse(require("fs").readFileSync(".claude/cache/lt.json","utf8"));
  const s = j.post_panel_span;
  if (!s) throw new Error("post_panel_span ABSENT — 실코퍼스에 관측이 있는데 축이 없으면 결함이다(DD2 가드는 부재도 실패로 본다)");
  const anchors = Object.keys(s.by_anchor || {});
  if (anchors.length !== 2) throw new Error("by_anchor 계열이 2개가 아니다: " + JSON.stringify(anchors));
  // 병합 금지: post_panel_span 최상위에는 요약 통계가 살 수 없다. 키 whitelist로 고정해
  // p50 말고 다른 이름으로 병합이 들어와도 잡는다.
  const ALLOWED = new Set(["state","unit","method","by_anchor","disagreement",
                           "negative_spans","unmatched","coverage"]);
  const stray = Object.keys(s).filter(k => !ALLOWED.has(k));
  if (stray.length) throw new Error("merged series present — DD2 violation: " + JSON.stringify(stray));
  // DD11 — 컨테이너는 하나다. axes 맵이 다시 생기면 라운드 2가 지목한 이중 컨테이너
  // 결함이 돌아온 것이므로 여기서 막는다.
  if (j.axes || j.axes_present) throw new Error("axes container reintroduced — DD11 violation");
  // state 축도 실제로 차단한다. 출력만 하고 넘어가면 git diff --stat 이 exit 0이라
  // 아무것도 안 막던 것과 같은 형태가 state 축에 남는다(round-2 L2 invariant/MEDIUM).
  if (j.state !== "ok") throw new Error("state=" + j.state + " — 실코퍼스에서 ok가 아니면 조사 대상이다");
  if (j.state_is_composite !== true) throw new Error("state_is_composite 미표기 — 합성값임이 출력에 없다");
  console.log("state", j.state, "(composite) | anchors", anchors.join(","));
  // DD14 축도 게이트여야 한다. 라운드 4까지 이 줄은 console.log 뿐이라 두 값이
  // undefined여도(= 필터 근거가 출력에 아예 없어도) exit 0이었다 — 같은 plan이 state
  // 축에는 throw를 넣고 여기에는 안 넣은, 스스로 비판한 '찍고 넘어가기'다
  // (round-4 test/HIGH).
  const cov = s.coverage || {};
  for (const k of ["ship_receipts_total", "ship_receipts_qualified",
                   "ship_receipts_unproven_skip", "ship_receipts_override_qualified"]) {
    if (typeof cov[k] !== "number") {
      throw new Error("DD14 근거 필드 누락: coverage." + k + " — 필터가 켜져 있다는 증거가 출력에 없다");
    }
  }
  if (cov.ship_receipts_qualified > cov.ship_receipts_total) {
    throw new Error("qualified > total — ship 자격 집계가 모순이다");
  }
  console.log("ship receipts", cov.ship_receipts_qualified, "/", cov.ship_receipts_total,
              "| unproven-skip", cov.ship_receipts_unproven_skip,
              "| override-qualified", cov.ship_receipts_override_qualified);
'
node plugins/mccp/scripts/lib/leadtime.js; echo "exit=$?"

# 회귀
node --test plugins/mccp/scripts/lib/tests/leadtime.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# corpus.js 출력 무변경 (PRD 결정 3). before 사본은 원래 위치 옆에 두어야 상대 require가
# 깨지지 않는다 — /tmp로 뽑으면 corpus.js가 트리 내 모듈을 못 찾는다.
git show HEAD:plugins/mccp/scripts/lib/plan-review/corpus.js > plugins/mccp/scripts/lib/plan-review/.corpus-before.js
node plugins/mccp/scripts/lib/plan-review/.corpus-before.js --json > .claude/cache/corpus-before.json
node plugins/mccp/scripts/lib/plan-review/corpus.js --json > .claude/cache/corpus-after.json
rm -f plugins/mccp/scripts/lib/plan-review/.corpus-before.js
diff .claude/cache/corpus-before.json .claude/cache/corpus-after.json && echo "corpus output unchanged"

# 게이트 배선 diff 공집합 (UI7 / DD10) — --exit-code로 실제 실패하게 한다.
# `git diff --stat`은 diff가 있어도 exit 0이라 게이트처럼 보이되 멈추는 것이 없었다.
git diff --exit-code --stat HEAD -- plugins/mccp/commands plugins/mccp/hooks \
  plugins/mccp/scripts/hooks plugins/mccp/scripts/lib/plan-review \
  && echo "gate wiring diff empty (UI7 satisfied)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `--` 22건의 제3 증인이 애매해 `unclassified`가 다수가 된다 | 중 | `unclassified`를 숨기지 않고 그대로 보고한다. 다수면 그 사실이 산출물이고 C1의 배선 축을 여는 근거다 |
| git을 증인으로 쓰다가 span 앵커로 미끄러진다 | 중 | DD3. Validation 첫 명령과 test가 span 계열이 정확히 2개임을 고정 |
| 두 계열을 합친 단일 값을 소비처가 요구한다 | 낮음 | DD2. Validation이 **부재·병합·계열 수**를 모두 throw로 잡는다(키 whitelist라 이름 변경도 통과 못 함) |
| ledger가 죽어 있어 basename 축이 앞으로 더 나빠진다 | **높음** | 그것이 지표 4의 관측 대상이다. M2는 고치지 않고 표면화한다 — ledger 쓰기 복구는 C1 사거리 |
| 코퍼스가 자라 문서 동결 블록이 곧 stale해진다 | 높음 | 측정 일자를 블록에 명시하고, test는 리터럴이 아니라 관계만 단언 |
| §3.7 version 충돌 (형제 worktree 3개 활성) | 중 | Task 7의 두 번 재계산 규칙 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

마지막 항의 구체 조건: `node plugins/mccp/scripts/lib/leadtime.js --json`이 실코퍼스에서
`post_panel_span.by_anchor`에 **두 계열**을 내고, 각 계열이 커버리지와 값을 함께 실으며,
미짝 사유 합계 등식이 성립하고, 그 stdout이 `docs/leadtime-observability/post-panel-span.md`의
동결 블록과 **바이트 일치**할 것. 단위 test만 녹색인 상태는 완료가 아니다.

## External Research Provenance

- Source PRD: .claude/prds/leadtime-observability.prd.md
- References section sha256: a08dca7b653c9256d560254aa1e06182f7e80ad6476af5603d41ff133939288c
- Stamped at: 2026-09-01T08:47:19.862Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 탐지: `impeccable-detect.js detect --mode plan` → `skill_available=true` ·
  `design_signal=true` · `reason=ok`. 신호원은 `Files to Change`의
  `renderer/html.js`(page-foot)와 `renderer/markdown.js`(derived 줄) 두 줄이며,
  둘 다 §3.7 version 문자열 동기다.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md`
  `## Output Constraints` 4개 앵커를 critique 전에 Read함.
- 라운드: 1 (R0에서 수렴, cap=2)
- verdict: **CONVERGED**

| 앵커 | 판정 | 근거 |
|---|---|---|
| H1 정보 위계 3단계 (heading depth ≤ 3) | pass | plan 본문 최대 depth = 3 (`### Task N`) — 기계 확인 |
| H2 강조색 화면당 1개 | n/a | 이 변경은 accent token을 도입하지 않는다. 렌더 표면 색 변경 0건 |
| H3 raw markdown marker 금지 | n/a | 렌더 표면 콘텐츠 변경 0건. version 문자열만 바뀐다 |
| H4 한 화면 항목 수 상한 | n/a | `STATUS.md`/`status.html`의 list-of-N 렌더링을 건드리지 않는다 |

> critique은 EXECUTE **이전**에 돌므로 produced diff를 구조적으로 보지 못한다.
> 그 gap은 별도 locus인 `/mccp:prp-implement` Phase 3.7 produced-diff grounding
> lint(H15, heading depth ≤ 3)가 닫는다 — 본 판정이 그 축을 대신하지 않는다.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design
gate routes these stage-appropriate impeccable commands; here they are a checklist
only — the plan stage never invokes (recommend-only, v1.13.0 M1).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
