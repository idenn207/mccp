# M5 — findings-closure: open CRITICAL 8건 재검증

> 측정 HEAD: `f3ed385471dd18fe8371ddfaab8205eb66a12748` (브랜치 `c3-ci-full-suite-m5` ·
> `origin/main` `6425ff8` 병합 후) · 측정일 2026-09-14.
>
> **반올림하지 않는다.** 8건 중 닫힘이 입증된 것은 **2건**이고 **6건은 `open`으로 남는다** —
> 그 6건의 claim 원문이 존재하지 않아 무엇이 닫혔는지 대조할 수단이 없기 때문이다. 판정 원장
> 적용(`dispose`)은 ~~이번 사이클에서 수행하지 않았다~~ **2026-09-15에 `fixed` 2건을 적용했다**
> (Task 3 · §4.1 — 트리거 문구 편차 포함).

## 기계 판독 필드

- measured-head: `f3ed385471dd18fe8371ddfaab8205eb66a12748`
- seal-sealed-at: `2026-09-08T08:25:23.521Z`
- seal-items: `2841`
- seal-covers-targets: `8/8`
- v3-verdict: `ready`
- dispose-applied: `2`
- dispose-applied-at: `2026-09-15T04:59:56.643Z`
- task3-trigger: `overridden by operator 2026-09-15 — closure-accounting M2 row in-progress on main`
- batch-rows: `2`
- c2-residue-removed: `77`
- c2-residue-method: `line-exact removal (not git checkout)`

## 1. 봉인 전제가 바뀐 사실 (plan 대비 편차 1)

plan은 "8건 전부 인벤토리 부재 · `dispose` 전량 거부 · V3 `blocked`"를 전제로 썼다
(`.claude/plans/ci-full-suite-m5.plan.md` Evidence "봉인 밖" 행). 그 전제는 **측정 시점에
이미 거짓**이었다 — closure-accounting M2(PR [#194](https://github.com/idenn207/mccp/pull/194))가
`origin/main`에 머지되며 라이브 재봉인 1회를 수행했고, 새 봉인은 대상 8건을 **전부** 포함한다.

| 축 | plan 전제 (2026-09-14 이전) | 실측 (병합 후) |
|---|---|---|
| `sealed_at` | `2026-09-01T01:21:41Z` | `2026-09-08T08:25:23.521Z` |
| 인벤토리 항목 수 | 1115 | 2841 |
| 대상 8건 수용 | 0/8 (전부 봉인 밖) | 8/8 |
| V3 기대값 | `blocked` | `ready` |

`dispose`는 그래도 실행하지 않았다. plan Task 3의 트리거는 **"closure-accounting PRD M2 행이
`complete`로 main에 머지되고 V3가 `ready`"** 인데, main의 그 행은 아직 `in-progress`다
(`.claude/prds/closure-accounting.prd.md` Delivery Milestones 2행). 즉 트리거는 **절반만**
충족됐다. 운영자가 2026-09-14 "main 병합 · 적용 보류"를 선택했고 이 문서가 그 상태다.

## 2. 판정표

판정은 셋 중 하나다. `fixed` = 닫힘이 코드로 입증됐다 · `residual` = 문서화된 잔여 축에
해당한다 · `open` = 원문 미발견이거나 입증 불가다.

`판정 근거` 열은 **그 판정을 떠받치는 코드**다 — `fixed`면 닫는 코드, `open`이면 원문을 대조할 수
없게 만든 코드(registry가 claim 원문을 보관하지 않는다 — §2.2). finding이 원래 지목한 대상은
`registry cited_path` 열이 registry 값을 그대로 옮긴다(줄 번호 없음 · `null`은 `null`).

| finding_id | 출처 | 판정 | 판정 근거(path:line) | registry cited_path | batch evidence |
|---|---|---|---|---|---|
| `639d7374f2f4d904` | plan-codex invariant · m3a · 원문 `.claude/reviews/plan-review-ci-full-suite-m3a.md:25` | fixed | `scripts/test-suite/coverage.js:100` | `scripts/test-suite/enumerate.js` | `#185` |
| `a1ce669aebc9a95a` | plan-codex invariant · m3b · 원문 `.claude/reviews/plan-review-ci-full-suite-m3b.md:24` | fixed | `scripts/test-suite/gate.js:189` | `scripts/test-suite/run.js` | `#185` |
| `99ba4ae4289a3d21` | santa-loop R0 · santa-A · 원문 부재 | open | `plugins/mccp/scripts/state/findings-registry.js:75` | `scripts/test-suite/redact.js` | — |
| `e797f7d884806e1f` | santa-loop R0 · santa-A · 원문 부재 | open | `plugins/mccp/scripts/state/findings-registry.js:75` | `scripts/test-suite/redact.js` | — |
| `69b08f8343fb33bc` | santa-loop R0 · santa-A · 원문 부재 | open | `plugins/mccp/scripts/state/findings-registry.js:75` | `scripts/test-suite/redact.js` | — |
| `31964e8ab2ae3e88` | santa-loop R0 · santa-B · 원문 부재 | open | `plugins/mccp/scripts/state/findings-registry.js:75` | `scripts/test-suite/redact.js` | — |
| `ccca5ddc9dbe2a50` | santa-loop R0 · santa-B · 원문 부재 | open | `plugins/mccp/scripts/state/findings-registry.js:75` | `null` | — |
| `43460bad38d361d9` | santa-loop R3 · santa-B · 원문 부재 | open | `plugins/mccp/scripts/state/findings-registry.js:75` | `null` | — |

### 2.1 `fixed` 2건의 근거

**`639d7374f2f4d904`** — claim: *"격리 래칫이 '항목 수'를 세므로 glob 한 줄이 스위트 전체를
게이트에서 지운다 — 머지 차단 게이트가 green을 유지한 채 완전히 열린다"*.
`claimDigestOf` 대조로 `plan-review-ci-full-suite-m3a.md:25`에서 원문을 찾았다
(`claim_digest 5f167193b8e225eb`). 닫는 코드는 세는 단위를 **glob 확장 결과의 파일 수**로
바꾼 것이다 — `coverage.js:96-100`의 주석이 그 실패 모드를 그대로 적고
(`{pattern:"**/*.test.js"}` 한 줄이 상한 1을 유지한 채 저장소 전체를 덮는다) 판정은
`excludedPaths.length > maxExcluded`다. 값은 `.github/test-suite-floor.json`의
`max_excluded_files: 6`이며 **등가**로 pin되고, 게이트 호출선에도 배선돼 있다
(`gate.js:207`). CI가 `(all - included) == cap`을 단언한다
(`.github/workflows/test-suite.yml:153-155`). 들여온 PR은 `#185`.

**`a1ce669aebc9a95a`** — claim: *"머지 차단 게이트의 핵심 술어인 '스위트가 green인가'가 어떤
기계에도 배선되지 않았다 … 계획대로 구현해도 전 test가 붉은 PR이 test-suite 체크 green으로
머지될 수 있다"*. 원문은 `plan-review-ci-full-suite-m3b.md:24`
(`claim_digest 958f1fd200ecd427`). 닫는 코드는 `gate.js:189-197` — `exit_code !== 0`이면
`stage 1 · reasons ∋ suite_red`로 차단한다. 라이브 발화도 있다: M3 §7a run `34174703512`,
M4 축 D 절단 A run `34556517175`(tracked 사본 `axis-d-a-gate.json`, `stage:1`·`suite_red`).
`scripts/tests/test-suite-coverage.test.js` 등 60건이 green이다(2026-09-14 실행). PR `#185`.

### 2.2 `open` 6건의 사유 — 원문이 존재하지 않는다

6건은 전부 `gate_id=mccp-santa-loop` · `work_unit=ci-full-suite-m1`이고, registry는 claim
**원문을 보관하지 않는다** — `ALLOWED_FIELDS`에 `claim`이 없고 `claim_digest`만 있다
(`plugins/mccp/scripts/state/findings-registry.js:71-104`). 원문은 santa 원장에 있었고
그 경로는 `.claude/state/santa-loop/<slug>.json`인데(`plugins/mccp/scripts/lib/santa/ledger.js:223`),
**`.gitignore:53`이 그 디렉토리를 무시한다.** 다음을 전부 뒤져 6건의 digest와 일치하는
문자열을 찾지 못했다(2026-09-14):

- 8개 worktree의 `.claude/state/santa-loop/` — `ci-full-suite-m1.json` 부재
- git 이력 119 리비전(`fix-task.md` · `fix-task-applied.md` · `STATE.md` · backlog, 2026-08-31~09-04)
- `.claude/reviews/` · `.claude/state/` · `.claude/receipts/` 전문 스캔 (줄 · 표 셀 · `"claim"` JSON 필드)
- 2026-09-01~03 창의 세션 transcript — 그 창에 파일 0개(재개로 mtime이 밀렸다)
- `.claude/reviews/santa-review-ci-full-suite-m1.md` — 라운드 요약 29줄뿐, 개별 claim 미수록

**정황은 있으나 근거로 쓰지 않았다.** backlog의 2026-09-01 santa 행은 전부 MEDIUM·LOW다.
CLAUDE.md §3.14대로 CRITICAL·HIGH는 그 자리에서 흡수되고 MEDIUM·LOW만 backlog로 가므로,
CRITICAL 6건이 backlog에 없다는 것은 당시 라운드 안에서 흡수됐다는 정황이다. 그러나 그것은
**어느 지적이 어느 코드로 닫혔는지를 말하지 않는다** — 일반 논증으로 개별 finding에 `fixed`를
붙이면 plan Risks 1행이 지목한 바로 그 오판이다. 그래서 6건은 `open`이다.

`residual` 판정도 쓰지 않았다. 4건의 `cited_path`가 `scripts/test-suite/redact.js`이고 그
파일에는 **문서화된 잔여 축이 6개 이상** 열거돼 있지만(`redact.js:144-158` — 얕은 root ·
공유 `lastIndex` · `Map`/`Set`/`Error`/`toJSON` 미순회 · POSIX 비앵커 오탐 · A-2 퍼센트 디코드 ·
UNC root 2.7초 블록 · 태그 재접힘), 원문이 없으면 그 finding이 **그 축들 중 하나인지** 판정할
수 없다. plan의 `residual`은 "잔여 축에 해당함이 확인된 건"을 위한 것이고 추정용이 아니다.

## 3. c2 잔재 처리

`.worktrees/c2-orchestrator-step-wiring`에 남아 있던 근거 없는 registry close 잔재를 제거했다.
제거 전 실측은 plan 기록과 일치했다: 16 shard · **추가 77줄 · 삭제 0줄** · 전부
`kind=finding_closed` · `cited_path` 전부 `null` · `closure_type` 분포는 `deferred` 69 ·
`fixed` 8(그 8건이 정확히 이 문서 §2의 대상 8건) · marker
`.claude/state/findings/.m4-legacy-close.json`(`completed_at 2026-09-11T06:27:49.768Z`).
이 잔재를 만든 도구는 c2 트리에도 `main`에도 없다.

**방법은 `git checkout`이 아니다** (Implement-Codex R1 F1 흡수). c2에 살아 있는 세션이 있고
registry는 잠금 없이 `O_APPEND`하므로(`plugins/mccp/scripts/state/findings-registry.js:380-386`),
파일 전체를 되돌리면 재측정과 실행 사이에 들어온 정당한 이벤트까지 지워지고 그 손실은 이후
검증에서 깨끗한 상태로 보인다. 대신 **식별된 77줄만 정확히 제거**하고, 쓰기 직전 재판독으로
경쟁 창을 좁히고, 비대상 이벤트 보존을 사후 단언했다. **재판독은 창을 닫지 못한다**(PR-Codex
R1 F1 정정, 2026-09-15) — 재판독과 재작성 사이에 들어온 append는 재작성이 지우고 사후 단언의
기대값에도 없어 검증을 통과한다. 이 절차로는 그 창의 손실을 막지도 탐지하지도 못한다. 실행 전 diff patch와 marker는 백업했다.
`orchestrator-step-wiring-m4.jsonl`(c2 자신의 게이트 산출물)은 건드리지 않았다.

검증 명령도 교체했다(R1 F2 흡수). plan의 V4는 `test -z "$(git … status --porcelain …)"`라
git이 실패해도 stdout이 비어 통과한다 — 즉 검사 없이 Acceptance를 통과시킬 수 있다. 대체
명령은 worktree 절대경로를 검증하고 `git status`의 **종료코드를 먼저** 보며, 조회 실패를
검증 실패로 처리한다. 실행 결과는 아래와 같다.

- c2-residue-lines-removed: `77`
- c2-marker-removed: `yes`
- c2-nontarget-events-preserved: `unproven — 재판독 시점까지 신규 이벤트 0건. 재판독~재작성 창의 append는 이 절차로 탐지 불가 (PR-Codex R1 F1 · backlog 2026-09-15 HIGH)`
- v4-verdict: `ok`

## 4. Task 3 트리거 — ~~아직 열리지 않았다~~ 적용됨 (2026-09-15 · §4.1)

`docs/ci-full-suite/m5-dispositions.jsonl`(2줄)은 준비만 됐고 적용되지 않았다. 여는 조건:

1. `.claude/prds/closure-accounting.prd.md`의 M2 행이 `complete`로 main에 머지된다. (현재 `in-progress`)
2. V3가 `ready`를 출력한다. (**이미 충족** — 위 §1)

둘이 모두 참일 때 `node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js dispose --batch
docs/ci-full-suite/m5-dispositions.jsonl` → `verify`로 결속 확인 → SessionStart 승입 표면
(`plugins/mccp/scripts/state/handoff-items.js:139-164`)에서 2건 부재 확인. 그 뒤 PRD M5 행을
`complete`로 올린다. **그때까지 M5 행은 `in-progress`다.**

적용 직전에 V2·V3를 다시 돌린다 — `dispose`는 all-or-nothing이라 부분 적용이 없고, 봉인이 또
전진했다면 결속 대상이 달라진다.

### 4.1 적용 기록 (2026-09-15)

운영자가 `/mccp:milestone-close` 진행 중 보류 해제를 승인했다. **조건 1은 문자 그대로 미충족인 채
적용했다** — closure-accounting M2 행은 main(`gh api` 판독)과 c11 커밋
(`git show c11-closure-accounting:`) 모두 `in-progress`이고, `complete`는 c11 작업 트리의
미커밋 편집에만 있었다. 트리거가 지키려던 실질 전제는 적용 직전에 각각 확인했다.

| 전제 | 확인 |
|---|---|
| 봉인이 대상을 포함한다 | V3 `ready` (2/2) |
| M2 재봉인이 기존 결속을 끊지 않았다 | `.claude/_meta/data/2026-09-08-closure-reseal-live.json` — `after.denominator_gap.count: 0` · `binding_mismatch: 0` · `invalid_dispositions: 0` |
| M2 이후 c11 변경이 batch 계약을 바꾸지 않는다 | `git diff 6425ff8 c11-closure-accounting -- plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` — 봉인 분모 필터(`state === 'open'` → `state !== 'closed'`) 한 곳뿐이고 `validateDisposition`·batch 형식은 무변경. 다음 재봉인은 M2 승계 경로가 이 줄들을 운반한다 |
| batch가 유효하다 | V2 `ok 2` (실제 `classifyEvidence` · 실제 registry open 대조) · V1·V4(종료코드 우선 강화판)·V5 통과 |

적용 결과 (`node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js dispose --batch docs/ci-full-suite/m5-dispositions.jsonl`):

- dispose: `ok: true` · `appended: 2` · `rejected: []` · `disposed_at 2026-09-15T04:59:56.643Z` ·
  `inventory_sha256 sha256:78aead8cb1e04f4862d929bbe6ca742edac86d7c84693c259dbce187580ec608`
- verify 전 → 후: by_disposition의 fixed 1 → 3 · `open` 1740 → 1738 · `invalid_dispositions` 0 → 0 ·
  `binding_mismatch` 0 → 0 · `unmatched_dispositions` 0 → 0 · `malformed_lines` 0 · `seal_intact: true`
- 승입 억제: 두 id의 `suppressedFindingIds` 소속이 false → true. `handoff-items.js`
  `enumerateOpenFindings` 결과에서 두 id 부재 (items 10 · truncated 507)
- **`verify`의 `ok`는 적용 전후 모두 `false`다.** 원인은 `open === 0` 한 항뿐이고
  (`debt-inventory.js:922-924`) 나머지 항은 전부 참이다. `open > 0`은 closure-accounting M2가
  재봉인으로 만들려던 상태이며(그 plan DD7) 이 적용이 바꿀 수 있는 값이 아니다.

닫히지 않은 것은 그대로다: `open` 6건(§2.2)은 원장에 싣지 않았고 여전히 승입된다.
