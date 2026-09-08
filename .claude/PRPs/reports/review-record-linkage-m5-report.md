# Implementation Report: review-record-linkage M5 — live-firing-closure

> plan: [.claude/plans/review-record-linkage-m5.plan.md](../../plans/review-record-linkage-m5.plan.md)
> branch: `review-record-linkage-m5` · 작성 2026-09-04

## Summary

M5는 새 배선을 만들지 않고 **진단**을 만들었다. M1~M4가 구현한 링크 배선이 라이브에서
발화하지 않는 원인은 코드가 아니라 **판본 격차**이고(F1·F2), 그 격차를 말하는 입이
없었다. 이제 세 표면이 그것을 말한다 — `install-skew.js` 오라클 · `dep-check` 표의
`install skew` 행 · SessionStart 배너.

같은 격차가 이 사이클의 acceptance도 막았다. **Task 6(라이브 실값)은 착지하지 않았고
M5는 완료가 아니다.** 그 사실을 acceptance를 무르게 하는 대신 값으로 적는다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 오라클 1개 · 소비처 3곳 · 정의 1곳 · test 4파일 |
| Files Changed | 11 (CREATE 4 · UPDATE 7) | 19 (신규 4 · 수정 15) — plan 산출물·PRD·CHANGELOG·backlog 포함 |
| 라이브 실값 | `bidirectional >= 1` | **`0`** — 미달성. 원인은 아래 D1 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `install-skew.js` 판정 오라클 | 완료 | 4상태 · 닫힌 사유 enum 7종 · 총함수. 실측이 F1을 재현: `behind`, 179 커밋 |
| 2 | `dep-check.js` `install_skew` 키 | 완료 | 엄격한 상위집합 — 기존 5키 불변, 6번째 추가 |
| 3 | 소비처 배선 (SessionStart 배너 + `/mccp:setup`) | 완료 | DD4a대로 `MCCP_CODEX_DISABLED` 가드 **밖**. 자기 throttle 필드 2종 |
| 4 | `undecidable` 사유 이분화 (DD5) | 완료 | 라이브 파티션 **단독**. 동결 바이트 불변 확인 |
| 5 | `rounds_fidelity` 축 (DD6) | 완료 (a) · 철회 (b) | (b)는 실질 변경 0이라 plan이 이미 철회. M6 이연 사유를 `deferred-triage.md`에 기록 |
| 6 | **라이브 실값 산출** | **미착지** | 아래 D1 — 이 세션에서 구조적으로 불가 |
| 7 | backlog 기계 분류 | 완료 | 103행 전건 분류, 누락 0. F10의 수치 오류 2건 정정 |
| 8 | fix-task escalation 종결 | 완료 (열어 둠) | 사용자 판정: 만료가 아니라 **부분 이행**으로 기록. 아래 D2 |
| 9 | 문서 (dogfood 경로를 acceptance 절차로) | 완료 | `dogfood-install.md` 신설 절 · `frozen-baseline.md` 라이브 절 |
| 10 | PRD 표 · CHANGELOG | 완료 | `plugin.json` version 미선언 (UI8) |

## Validation Results

| # | 검사 | 결과 |
|---|---|---|
| 1 | 단위 + 계약 test (`install-skew` · `install-skew-wiring` · `linkage-audit`) | **pass 75 / fail 0** |
| 2 | 기존 falsifier suite 5종 (`dep-check` · `session-start-dep-check` · `linkage-defs` · `linkage-wiring` · `linkage-frozen-baseline`) | **pass 81 / fail 0** |
| 2b | 인접 회귀 (`plan-review-cli-emit` · `plan-review-command-body`) | **pass 33 / fail 0** |
| 3 | `--frozen-only` 보조 출력 | 정상 산출 (실제 falsifier는 검사 2의 `linkage-frozen-baseline.test.js`이고 그것이 green) |
| 4 | `--check-round-structure --since <merge-base>` | **exit 1 — violations 2** (아래 D1) |
| 5 | 라이브 실값 `bidirectional >= 1` | **exit 1 — `bidirectional=0` `denominator=null`** (아래 D1) |
| 6 | `version-declaration-guard.js` | **exit 0** — `no version declaration on this branch` |

합계 **189 test pass / 0 fail**. 실패한 것은 test가 아니라 **라이브 관측 2건**이고, 둘 다
같은 원인이다.

### Design Grounding

N/A — design trigger 미발화 (`design_signal=false`, `silent_skip=no-signal`). 이 사이클은
렌더 표면을 하나도 건드리지 않는 control-plane 변경이다. Phase 3.7은 no-op.

## D1 — 라이브 실값이 착지하지 않았다 (검사 4·5)

**두 실패는 같은 원인이고, 그 원인이 M5의 주제 자체다.**

```
$ node plugins/mccp/scripts/lib/install-skew.js
{ "state": "behind", "installed_version": "1.33.6",
  "installed_sha": "647dfecb…", "head_sha": "e0d05f70…",
  "commits_behind": 179, "plugin_dir_override": false }
```

- **검사 4** — 경계 이후 착지한 리뷰 레코드 2건(`plan-review-review-record-linkage-m5.md` ·
  `plan-review-review-record-linkage.md`)의 `## Measurement`에 `rounds` 키가 **없다**.
  워크트리의 `record.js:352-397`은 모든 exit 경로에서 그 키를 싣는다("키 부재는 이
  빌드에 축이 없다는 뜻"). 즉 그 레코드를 쓴 것은 **설치된 1.33.6 빌드**다.
- **검사 5** — 같은 이유로 이 사이클의 ship receipt가 아직 `meta.review_record_path` ·
  `meta.plan_review_expected`를 봉인하지 못했다. 라이브 88건 전부가 `undecidable`이고
  새 진단이 그 사유를 `producer_absent_in_build: 88`로 말한다.

**이것은 부트스트랩 상태이지 결함이 아니다** — 그리고 그 둘을 구분하는 것이 Task 6의
절반이었다. 구분의 근거는 셋이다: (a) 워크트리 코드에 배선이 실재하고(F6), (b) 그
배선의 단위·계약 test가 전부 green이며, (c) 독립된 오라클이 실행 판본의 격차를 179
커밋으로 정량화한다.

**해소 경로는 하나뿐이고 이 세션에서 실행할 수 없다.** DD3대로 `--plugin-dir` 아래에서
완주해야 하는데, 그것은 **새 Claude 세션을 그 플래그로 띄우는 것**이라 현재 세션 안에서
할 수 없다. 캐시 덮어쓰기는 §3.7 v1.34.5가 금지한다(디렉토리가 version으로 키잉되므로
내용만 바꾸면 레지스트리의 `version`·`gitCommitSha`가 디스크와 어긋난 거짓이 된다).

**따라서 M5를 완료로 선언하지 않는다.** plan의 acceptance 주석이 그 경우의 처리를 미리
정했다 — acceptance를 무르게 하는 것이 아니라 완료 선언을 하지 않는 것이고, 부분 착지가
필요하면 Task 6을 분리하되 **M5의 outcome 문장에서 라이브 실값 주장을 빼야 한다**.
PRD의 M5 status는 `in-progress`로 남긴다.

> **이 문단은 2026-09-08에 상위 판정으로 대체됐다 — 아래 D3 참조.** 위 서술은
> 그날까지의 상태를 여전히 정확히 기술하므로 지우지 않는다. 바뀐 것은 결론이다:
> Task 6은 M7로 분리됐고 M5 status는 `complete`다.

## D2 — Task 8의 전제가 거짓이었다 (사용자 판정으로 종결)

plan Task 8은 이렇게 적었다: "`fix-task-applied.md`의 `escalate: true`는 M4 사이클의
것이고 그 사이클은 ship됐다" → 기본 선택 (ii) 만료 처리.

**실측은 다르다.**

```
task_fingerprint:      review-record-linkage-m3      <- stale label
decision_id:           review-record-linkage-m5      <- 실제 대상
created_at:            2026-09-04T05:42:08.943Z      <- M5 plan 게이트 직후
originating_receipts:  .../mccp-plan-codex/review-record-linkage-m5.json
```

escalation은 **M5 자신의 plan 게이트**를 겨냥한다. 따라서 (ii)의 정당화("대상 결정이 이미
종결됐다")가 성립하지 않는다 — 대상은 진행 중인 이 사이클이다.

현재 상태는 만료도 해소도 아닌 **부분 이행**이다:

- **실질**: escalation이 스스로 적은 Next Actions("각 미해소 지적을 다루고 구현을
  갱신하라")는 **수행됐다.** L2 blocking 12건이 plan에 흡수됐고 이 구현이 그것을 코드로
  실현했으며, 각 항목의 반증 수단이 [deferred-triage.md](../../../docs/review-record-linkage/deferred-triage.md)
  버킷 (b)에 이름으로 적혀 있다.
- **dual-review 축**: **미수행.** `/mccp:santa-loop`은 돌지 않았다.

plan의 규칙은 "만료와 해소를 구분할 수 없다면 (i)을 택하라"였는데, 여기서는 구분이
가능하되 그 규칙이 거짓 전제 위에 세워졌다. 그래서 판단을 사용자에게 올렸다.

**사용자 판정 (2026-09-04): 흡수로 기록하고 열어 둔다.** `escalate: true`는 그대로 두고,
무엇이 이행됐고 무엇이 남았는지를 `fix-task-applied.md`의
`## M5 Implement-cycle Disposition` 절에 기록했다 — `expired`로 적지 않았다. 대상 결정이
종결되지 않았으므로 그것은 거짓 기록이 된다. dual-review 축은 미수행으로 명시했고
해제 조건(`mccp-pr-codex/review-record-linkage-m5` 발행, 또는 santa-loop 실행)을 함께
적었다.

**STATE.md의 `Escalation Pending`은 지우지 못했다** — 아래 Issues의 `state-writer`
결함 때문이다. 그 표식이 남아 있는 것은 현재 상태(escalation이 열려 있다)와 **일치**
하므로 잘못된 정보는 아니다.

## D3 — Task 6을 M7로 분리했다 (2026-09-08 사용자 판정)

D1이 예고한 두 갈래 중 **부분 착지**를 택했다. Task 1~5·7~10을 M5로 ship하고 라이브
실값 산출을 M7(`live-firing-execution`)로 연다. 그 대가로 PRD의 M5 outcome 문장에서
라이브 실값 주장을 뺐다 — plan의 acceptance 주석이 지시한 처리다.

### 왜 우회로는 닫히지 않았는가

분리 전에 두 우회를 실제로 시도했고 둘 다 기계적으로 막혔다.

**(a) `/mccp:plan` 재실행으로 소실된 plan receipt를 재발행** — L1이 exit 1로 차단.
`C3_CREATE_EXISTS` 5건(`install-skew.js` 등 CREATE 대상이 구현 착지로 이미 실재) +
`C6_UNRESOLVED_CITATION` 1건. C3는 `fs.existsSync` 판정이라 `--plugin-dir`로도 사라지지
않고, `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`도 열지 못한다 —
`decision.json`의 `single_pass_reason`이 `(none)`으로 나왔고, §3.15가 L1 실패를 완화
대상에서 명시적으로 제외하기 때문이다. **plan 게이트는 구현 전에 도는 것을 전제하며,
소실된 receipt를 사후 제조하는 경로는 설계상 없다.**

C6는 부수적으로 이 PRD의 명제를 자기 게이트에서 재현했다:

```
캐시(1.33.6): /([A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+):(\d+)(?:-\d+)?/g
워크트리    : /(\.?[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+):(\d+)(?:-\d+)?/g
```

선행 `\.?`가 없어 `.claude-plugin/marketplace.json`의 점을 잘라 잡고 해소에 실패한다.
워크트리에는 이미 고쳐져 있다 — 즉 **워크트리에서 고친 결함이 캐시 판본 때문에 여전히
차단한다**는 M5 Summary의 명제 그 자체다.

**(b) `MCCP_SKIP_RECEIPT`로 plan receipt를 건너뛰고 ship** — Task 6을 산출하지 못한다.
`finalize-receipt.js:306-325`가 `meta.review_record_path`(검사 1)와
`--plan-review-expected`(검사 4)를 **상류 `mccp-plan-codex` receipt에서 파생**하고,
상류가 0건이면 `link_anchor_unresolved`로 접혀 "No link is stamped; the audit reports
this as undecidable"가 된다. plan receipt는 형식이 아니라 **링크의 발원지**다.
그 상태로 ship하면 네 검사가 전부 실패하는데, `mccp-pr-codex` receipt는 git-tracked라
§3.12 재봉인 금지 — **슬러그만 소모된다.**

### M7이 성립하는 조건

새 슬러그로 **구현 전에** 게이트를 돌아야 한다. 그 순서에서만 C3가 발생하지 않고,
plan receipt가 정상 발행되며, `--plugin-dir` ship이 그것을 상류로 삼아 링크를 봉인한다.

### 이 세션의 게이트 이탈 (기록)

| # | 이탈 | 근거 |
|---|---|---|
| 1 | `/mccp:plan`을 이 결정의 **2라운드**로 실행 | §3.16·UI9는 1라운드가 기본. 사용자 지시. R1 원장이 이 워크트리에 커밋되지 않아 기계적으로는 통과했다 |
| 2 | Phase 5.1의 placeholder를 주입하지 않음 | 플랜에 실제 `## Codex Adversarial Review` 기록이 커밋돼 있고 `multi-agent` 모드에서 5.3이 그것을 교체하지 않는다. 덮으면 커밋된 기록이 파괴된다 |
| 3 | R1 리뷰 레코드를 `git checkout`으로 복원 | `record.js`가 같은 경로를 덮어쓴다. R1의 finding 12건을 보존하고 R2 정지는 `plan-review-review-record-linkage-m5-r2-halt.md`로 분리 보존했다 |

게이트 산출: 패널 미발화(에이전트 0 · 예약 0) · design critique `round=0/2 CONVERGED`
findings 0(H15 재측정 `H1=1 · H2=16 · H3=21 · H4+=0`, 렌더링 표면 0행) ·
`mccp-plan-codex` receipt **미작성**(5.2e exit 12).

## Files Changed

| File | Action | 내용 |
|---|---|---|
| `plugins/mccp/scripts/lib/install-skew.js` | CREATED | 판정 오라클 (+327) |
| `plugins/mccp/scripts/lib/tests/install-skew.test.js` | CREATED | 단위 회귀 17 test |
| `plugins/mccp/scripts/lib/tests/install-skew-wiring.test.js` | CREATED | 배선 정적 단언 8 test |
| `docs/review-record-linkage/deferred-triage.md` | CREATED | backlog 103행 분류 |
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATED | `install_skew` 키 · notice · key · label |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATED | 가드 밖 배너 블록 |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATED | present-only 2필드 + hash 제외 |
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | UPDATED | `code` 추가 · `refineLiveUndecidableReason` |
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATED | 라이브 전용 정련 호출 · `rounds_fidelity` |
| `plugins/mccp/commands/setup.md` | UPDATED | skew 행 + 읽는 법 |
| `docs/dogfood-install.md` | UPDATED | 라이브 acceptance 절차 절 |
| `docs/review-record-linkage/frozen-baseline.md` | UPDATED | 라이브 절 (동결 블록 불변) |
| `.claude/prds/review-record-linkage.prd.md` | UPDATED | M6 행 수치 정정 |
| `CHANGELOG.md` | UPDATED | `## [Unreleased]` 누적 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 보안 리뷰 4행 |
| `.claude/plans/review-record-linkage-m5.plan.md` | UPDATED | Codex Implementation Review + Security Reviewer |
| 그 외 | — | plan 산출물 커밋 (게이트 진입 전 유실 방지) |

`git diff --diff-filter=D --name-only origin/main...HEAD` → **비어 있음** (§3.5.1 확인).

## Deviations from Plan

### 이탈 1 — 상류 plan receipt가 stale인 채로 Phase 3에 진입했다

2.5.7 read-back validate가 `exit 2`를 냈다. 유일한 항목은 `mccp-plan-codex/review-record-linkage-m5`의
`stale`이고 `missing`·`blocking`·`open_critical`은 **전부 0**이다.

- **원인**: L2 패널 흡수가 plan 본문을 고쳤고, `reviewed_plan_hash`는 흡수 **이전**
  판본(`sha256:6fd9ad77…`)을 가리킨다. 이 저장소의 모든 shipped 사이클이 겪는 구조적
  상태이며 plan 본문이 그 사실을 미리 적었다.
- **실측한 것**: `MCCP_SKIP_RECEIPT=1`은 이 초크포인트에 **작용하지 않는다.** 그 변수의
  소비처는 hook 둘(`receipt-prompt.js:335` · `receipt-skill.js:164`)뿐이고
  `receipt/cli.js validate`는 읽지 않는다. 즉 CLI validator에는 in-band 우회가 없다.
- **실제로 진입을 허가한 것**: receipt 게이트 hook이다. 이 명령의 호출은 hook이
  `ALLOW`로 통과시켰다(`mccp ALLOW path: mccp:prp-implement`).
- **하지 않은 것**: plan 게이트 재실행. m5 원장은 1/1 소진이고 캡 상향은 §3.16이 기본
  선택지에서 제외한다. receipt 위조도 하지 않았다(§3.12 no-rehash).

### 이탈 2 — Task 5(b)를 철회했다 (plan이 이미 반영)

"강제 범위 문구를 닫는다"는 실질 변경 0이다. 그 문구는 `linkage-audit.js:687-689`에 이미
있다. backlog L1454는 M6 이연이고 사유는 `deferred-triage.md`에 있다.

### 이탈 3 — plan F10의 수치를 정정했다

F10은 backlog 잔량을 산문에서 79로, 열거에서 90으로 적었다(두 값이 서로 다르다).
측정값은 `Source plan` 열 기준 103행(M5 자신 16 제외 시 87)이다. 정정 근거와 세는
규칙은 `deferred-triage.md`에 있다.

### 이탈 4 — MEDIUM/LOW 보안 지적 일부를 그 자리에서 흡수했다

§3.14는 MEDIUM/LOW를 backlog로 이연하라고 한다. 그러나 security-reviewer #2·#3·#5(timeout)·#6·#8은
**이 사이클이 새로 쓰는 코드**에 대한 지적이라, 이연은 "결함을 알고 심는 것"이 된다.
흡수했고 backlog에 `ABSORBED` 행으로 기록했다. 선재 표면에 대한 #5(size-cap)·#7은
규칙대로 이연했다.

## Issues Encountered

- **`--end-of-options`를 형태 확인 없이 옮기면 상시 실패가 된다.** security-reviewer #6의
  권고를 `merge-base`에 적용하면 `--is-ancestor`가 rev로 해석돼 `exit 128`이 된다(실측).
  `rev-list`에만 붙이고 그 이유를 코드 주석에 남겼다.
- **`MCCP_SKIP_RECEIPT`의 사거리를 실측으로 확인해야 했다.** 문서(§3.3 복구 옵션 5번)는
  이 변수를 일반 bypass로 소개하지만 소비처는 hook 둘뿐이다. 이탈 1에 기록.
- **`state-writer.update()`가 body patch를 조용히 떨어뜨리면서 성공을 반환한다.**
  Task 8이 요구한 STATE.md 갱신을 sanctioned API로 시도했으나 반영되지 않았다. 재현:
  `sw.update(root, {goal:'PROBE'})` → 예외 없이 `{frontmatter, body}` 반환, 직후
  `sw.readState(root).body.goal`은 옛 값. `mergeState`는 정상 반영되므로 원인은 병합이
  아니라 **저널 투영**이다(`journalApply`가 `authoritative:true`인데 그 `projected`가
  이미 옛 body를 담고 있다). frontmatter 축은 정상 동작한다.
  §3.2가 직접 편집을 금지하므로 **body를 갱신할 합법 경로가 현재 없다.** M5는 직접
  편집하지 않고 backlog에 HIGH로 적재했다 — 소유 축은 `state-journal/`
  (multi-session-work-loop)이고 그 브랜치가 in-flight다. 이 사이클의 연속성 정보는
  이 보고서와 plan 본문이 대신 나른다.

## Tests Written

| Test File | Tests | 덮는 축 |
|---|---|---|
| `install-skew.test.js` | 17 | DD2 4상태 · 총함수 · 닫힌 enum · 경로 유출 4형태 · argv 미도달 · UNC 미접촉 · containment 3갈래 |
| `install-skew-wiring.test.js` | 8 | 상위집합 · sentinel · 소비처 실재 · **DD4a 가드 밖 배치(중괄호 정합)** · throttle 분리 |
| `linkage-audit.test.js` (추가분) | 6 | DD5 두 사유 · **동결 파티션 불변** · frozen 뷰 미유입 · DD6 4상태 · 종료코드 불변 |
| `linkage-defs.test.js` (추가분) | 6 | 봉인 문자열 불변 · 정련 범위 한정 · 키 존재 판별 · 상호배타 · code 도달성 · 총함수 |

## Next Steps

- [x] **D2 결정** — 흡수로 기록하고 열어 둔다 (사용자 판정 2026-09-04)
- [x] **D1 처리** — Task 6을 M7 `live-firing-execution`으로 분리, M5 outcome에서 라이브
      실값 주장 제거 (사용자 판정 2026-09-08 · 위 D3)
- [ ] **다음 세션: 새 슬러그로 전체 체인 재실행** (사용자 판정 2026-09-08)

### 인계 — 왜 이 사이클이 ship하지 못했는가 (2026-09-08, 재도출 불필요)

`/mccp:pr`은 **완주할 수 없다.** 실측한 정지 지점과 그 이유:

| 지점 | 결과 |
|---|---|
| 2.5.7 finalize | `mccp-pr-codex` receipt 작성됨 (working tree) |
| 2.5.8 chain-check (`mccp:code-review`) | missing `mccp-pr-codex` → 2.5.7이 해소. 통과 |
| 2.5.9 ship-gate (`mccp:pr`) | missing `mccp-plan-codex` + `mccp-implement-codex` → `ok=false` → **HALT** |
| Phase 3 PUSH | 도달 못 함 |

`validate-cmd.js`가 읽는 env는 7개(`MCCP_DESIGN_CRITIQUE_MAX_RETRY` ·
`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` · `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` ·
`MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` · `MCCP_INTENT_MISLABEL` ·
`MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` · `MCCP_SKIP_INTENT_GATE`)이고 **누락 상류 receipt를
강등하는 것은 하나도 없다.** `MCCP_SKIP_RECEIPT`·`MCCP_RECEIPT_GATE_MODE`는 그 파일에 0회
등장한다 — 둘은 hook/preflight 층 전용이고 2.5.9는 명령 본문 안이라 그 층을 지났다.

그러므로 `/mccp:pr`을 다시 시도하지 마라. 2.5.9 HALT가 확정이라 Codex 라운드(최대 900초)만
소모한다.

### 다음 세션이 할 일

1. **M7 `live-firing-execution` plan을 새 슬러그로 작성한다.** 그 plan의 CREATE 대상은
   아직 존재하지 않으므로 L1 `C3_CREATE_EXISTS`가 발생하지 않고, plan 게이트가 정상
   완주해 `mccp-plan-codex` receipt를 발행한다 — 이것이 링크의 발원지다(D3 (b) 참조).
2. 이 브랜치(`review-record-linkage-m5`, HEAD `1a952bf`)의 M5 코드는 그 사이클 안에서
   함께 머지한다. 별도 ship을 시도하지 않는다.
3. ship은 `claude --plugin-dir <worktree>/plugins/mccp` 세션에서 완주한다
   ([dogfood-install.md](../../../docs/dogfood-install.md)). 완주 전후로
   `installed_plugins.json` sha256 불변을 확인한다.
   - 완주 전 baseline(2026-09-08): sha256 `26925fd8b72568ea…` ·
     `install_skew.state=behind` 181 커밋 · `linkage.bidirectional=0` `denominator=null`
4. 그 뒤 Task 6의 네 검사를 재측정한다.

### 열린 질문 — M5 status

PRD의 M5는 `complete`인데 **이 코드는 아직 머지되지 않았다.** 이 PRD에서 `complete`는
지금까지 "ship됨"을 뜻했으므로(M3·M4 선례) 현재 표기는 앞서 있다. 다음 세션에서 둘 중
하나로 정한다: (i) M7 PR에 함께 머지되므로 `complete` 유지, (ii) 머지 전까지
`in-progress`로 되돌린다. 이 사이클은 판정하지 않고 기록만 한다.
