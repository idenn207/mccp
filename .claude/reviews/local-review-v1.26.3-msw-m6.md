# Local Review — multi-session-work-loop M6 (v1.26.3)

**Reviewed**: 2026-08-17
**Branch**: `v1.24.0-multi-session-m6` (미커밋 변경)
**Scope**: 수정 14파일 · 신규 18파일 (소스 ~1,270줄 · 테스트 ~970줄 · 문서/증거 ~1,900줄)
**Decision**: **REQUEST CHANGES** (HIGH 2건)

## Summary

B1 지표를 `insufficient` 상수에서 실측 `computed`(drift 1 / 분모 39)로 뒤집는 구현은 견고하다 — 오라클의
타입 경계(문서 status 미수신 + 자체 I/O 0), 단일 증거 생산자, 4축 정적 lint, 21개 단언 매니페스트가 서로를
보강하며 각 층의 비보증 범위도 코드 주석에 정직하게 적혀 있다. 다만 **`archive-complete/scan.js`가 derive
source와 같은 입력 정규화를 하지 않아** milestone의 핵심 주장("두 표면이 같은 오라클로 같은 답을 낸다")이
실측 5행에서 성립하지 않으며, 별건으로 **기존 리뷰 산출물 1개가 덮어써져 M5 round-9 기록이 소실**됐다.

## Findings

### CRITICAL

None.

### HIGH

#### H1 — 리뷰 산출물 덮어쓰기로 M5 round-9 기록 소실 + 낡은 M6 판본이 tracked로 잔존

`.claude/reviews/plan-review-multi-session-work-loop.md`

HEAD 판본(169줄, `sha256:54e1b3fb…`)은 제목이 `# Plan Review Panel — multi-session-work-loop (M5)`였고
9라운드 추이표 · 운영자 종료 결정(2026-08-12) · 리뷰어 등급 기록 · round-8 findings 전문(`<details>` 보존)을
담고 있었다. 현재 53줄 M6 판본으로 **전면 대체**됐다(43 insertions / 159 deletions).

- **대체본이 아니다.** `plan-review-multi-session-work-loop-m5.md`(87줄, `sha256:0a78e1ff…`)는 plan hash
  `e28a0806…`의 *초기* M5 런이고, 소실된 쪽은 plan hash `63146d1b…`의 **round 9 최종본**이다. 소실된 내용은
  워킹트리 어디에도 없고 git history에만 남는다.
- **살아남은 판본도 정본이 아니다.** tracked 파일은 plan hash `c35c7526…`(3/3 roles, `2026-08-15T03:28`)인데,
  `docs/multi-session-work-loop/m6-audit-sample.json`의 `anchor.plan_file_hash`는 `e2338ca5…`이고 그 런은
  **untracked** `plan-review-multi-session-work-loop-m6.md`(4/4 roles, `18:10`)에 있다. 즉 tracked 리뷰
  산출물이 봉인된 감사 anchor와 어긋난다.

소실된 9라운드 분산 기록은 diverse-agent-review 계열이 "판정 위치만 바꿔도 결과가 흔들린다"의 실측 근거로
인용하는 자료다. CLAUDE.md §3.5.1(의도치 않은 산출물 삭제는 멈추고 조사)과 §3.12 증거 내구성 계약의 취지에
정면으로 걸린다.

```bash
git checkout HEAD -- .claude/reviews/plan-review-multi-session-work-loop.md
```

M6 정본은 이미 `-m6.md`에 있으므로 복원만으로 양쪽이 정합해진다.

#### H2 — `scan.js`가 plan 경로를 정규화하지 않아 두 표면의 판정이 실측 5행에서 갈린다

`plugins/mccp/scripts/lib/archive-complete/scan.js:214-232`

`collectDriftEvidence`는 `classifyMilestones` 원문 `planPath`/`planBasename`을 그대로 `buildEvidence`에
넘긴다. derive source는 같은 값을 `resolvePlanReference`
([milestone-evidence.js:101-123](../../plugins/mccp/scripts/derive/sources/milestone-evidence.js))로
(a) `.plan.md` 접미사 검사 (b) PRD-상대 → repo-root 정규화 (c) `.claude/` 앵커 검사를 거쳐 넘긴다.
**오라클과 builder는 공유하지만 입력 정규화는 공유하지 않는다.**

동일 저장소에서 같은 39행을 양쪽으로 돌린 실측 — 실질 divergence 5건(scan.js가 판정한 6행 중 5행):

| 행 | derive | scan.js |
|---|---|---|
| `review-loop-trust.prd.md` 4행 (plan 셀이 자식 PRD 링크) | `undetermined` | **`not-shipped`** |
| `multi-session-work-loop.prd.md / **진행 상태 기계 판정**` | `not-shipped` | `undetermined` (git-query-failed) |

- 앞 4행은 plan 셀이 `santa-adjudication.prd.md` 같은 **자식 PRD 링크**다. `m6-audit-sample.json`이
  "위양성 3건을 발견해 제거했다"고 기록한 바로 그 부류이며, scan.js에는 그 수정이 반영되지 않았다.
  판정 불가를 `not-shipped`라는 **적극적 주장**으로 접는 것은 b1-status-drift.js:136-141이 명시한
  E1("부재는 결함 부재가 아니다") 위반이다.
- 마지막 행은 상대 경로(`../plans/…`)가 그대로 `git ls-tree -- ../plans/…`에 들어가 git이 오류를 내
  `gitReachable=null`이 된 경우다. **상대 링크를 쓰는 모든 행에서 plan 도달성 축이 통째로 무력화**된다.

현재 `driftSuspect`는 `shipped`에서만 발화하므로 오탐으로 이어지지는 않는다. 다만 `evidence` 문자열은
`archive-complete.md:43`이 "1차 근거"로 사용자에게 제시하며, 위 4행에는 `git: santa-adjudication.prd.md`가
근거로 표시된다 — 판정할 수 없었던 행에 대한 근거다.

**Fix**: `resolvePlanReference`를 공용 모듈(예: `b1-evidence-builder.js`)로 올리고 두 호출자가 모두 경유.

### MEDIUM

#### M1 — `scan.js`가 `defaultRef`/`planIndex`를 hoist하지 않아 git spawn이 행마다 반복 (3.7배 회귀)

`plugins/mccp/scripts/lib/archive-complete/scan.js:214-222`

실측: `scan()` **862ms(HEAD) → 3,201ms(현재)**. git spawn 22회 — `rev-parse` 5회(행별
`resolveDefaultRef`) + `ls-tree` 9회(그중 4회가 행별 `buildPlanIndex` 전체 재구축).

builder는 `defaultRef`·`planIndex` 주입 seam을 이미 갖고 있고 derive source는 정확히 그렇게 쓴다
([milestone-evidence.js:176-181](../../plugins/mccp/scripts/derive/sources/milestone-evidence.js)).
scan.js만 쓰지 않는다. plan 링크가 많은 저장소에서 선형 악화한다(30행 → 120+ spawn).

#### M2 — `scan.js`가 `duplicateKey: false`를 하드코딩해 decision_id 충돌 축이 무력

`plugins/mccp/scripts/lib/archive-complete/scan.js:219`

derive source는 활성 PRD 전체를 가로질러 중복 `decision_id`를 검출하고 **충돌 행 전부**를 `undetermined`로
강등한다(milestone-evidence.js:232-238). scan.js는 항상 `false`를 넘기므로 같은 receipt를 가리키는 두 행에
모두 `shipped`를 내고 `driftSuspect:true` 오탐이 가능하다. b1-status-drift.js:108-114이 못 박은
"첫 행/마지막 행 채택 금지"가 이 경로에서 우회된다.

#### M3 — 단언 매니페스트의 존재 검사가 파일 전체 substring이라 주석으로 통과 가능

`plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js:127`

`body.indexOf(a.test_title) === -1`은 `test('B1-EQ-BASENAME: …')` **호출**이 아니라 파일 어디든 그 문자열이
등장하면 만족된다. 주석 한 줄로 21개 필수 단언을 전부 "존재"로 만들 수 있다.

이 모듈 서문이 스스로 *"`echo ok && exit 0` 짜리 대조기도 Validation을 통과시킨다는 것이 이 축의 급소"*라고
적고 있는데, 같은 급소가 한 층 아래에 그대로 남아 있다. 최소한 `test\(\s*['"\`]<title>` 앵커를 요구해야
"제목이 실재한다"가 "문자열이 등장한다"와 구분된다.

### LOW

- **L1** — `b1-independence-lint.js:64-97` `stripComments`가 정규식 리터럴을 추적하지 않는다. 한계는 :60-63에
  명시돼 있으나 "대상 파일에 `//` 포함 정규식이 없다"는 **전제가 조용히 깨질 수 있는** 종류다. 오라클에
  `/https?:\/\//` 하나만 추가돼도 그 줄부터 나머지가 주석으로 접혀 축 (ii)·(iii)가 눈이 먼다.
- **L2** — `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:787` "R2 F1"이 전수 병렬 실행에서 red
  (`exit 0 !== 75`). 단독 재실행 3/3 통과. M6이 건드리지 않는 경로(evidence-conflict-guard / ledger lock)이며
  STATE.md의 "알려진 비결정 2건"과 정합 — M6 회귀 아님.
- **L3** — 렌더된 `status.html`에 raw `**` 마커 5건. 전부 risk 섹션·drawer JSON 경로에서 오는 **선재** 누출이며
  M6이 추가한 B1 줄은 `renderProseHtml`을 거쳐 깨끗하다(제약 3 관찰 사항).

## 잘 된 점

- **독립성의 1차 통제를 lint가 아니라 타입 경계로 둔 것** — 오라클이 status를 인자로 받지 않고 `fs`/
  `child_process`를 require하지 않으므로, "몰래 문서를 다시 읽는" 구현이 존재할 수 없다. lint를 2차로
  명시한 주석(b1-independence-lint.js:9-14)이 보증 범위를 부풀리지 않는다.
- **커버리지 구멍을 값 옆에 강제로 병기** — `1건 (대조 9/39)` + `증거 미확정 30건 · 비정규 status 2건(분모 제외)`.
  39행 중 실제 대조가 9행뿐인데 그 사실이 숨지 않는다. `undetermined`를 분모에서 빼지 않은 결정
  (milestone-evidence.js:240-242)이 "증거를 못 구할수록 성적이 좋아지는" 경로를 닫는다.
- **`shipped` 판정에서 `codex_verdict`를 뺀 것** — audited override로 divergent ship하는 정식 경로가 있으므로
  verdict를 전제로 걸면 정상 ship이 drift로 오계상된다. 병기 필드로 강등한 근거가 코드에 남아 있다.
- **builder의 *수단*까지 정적으로 고정** — 출력 단언은 "이 구현이 틀렸다"만 잡으므로 `cat-file` 사용 +
  `existsSync`/`ls-files` 미사용을 lint 축 (iv)가 함께 본다(:242-257).

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (JS, tsc 대상 아님) |
| Lint — `b1-independence-lint.js` | **Pass** (exit 0, 4 axes clean) |
| Lint — `assertion-manifest-check.js` | **Pass** (exit 0, 21/21 · floor 21) |
| Tests — M6 관련 7파일 | **Pass** (97/97) |
| Tests — 전수 sweep (lib·derive·archive-complete·renderer) | **1 fail** — `santa-loop-cap.test.js` 선재 flake (L2) |
| Live derive | **Pass** — B1 `computed`, drift 1 / 분모 39, `independence_ok:true` |
| Live render | **Pass** — STATUS.md·status.html 모두 B1 행 + 커버리지 병기 정상 |
| 버전 4면 동기 (§3.7) | **Pass** — plugin.json·html.js·markdown.js·CHANGELOG 모두 `1.26.3`, 헤딩 중복 0 |

## Files Reviewed

**Added** — `derive/sources/milestone-evidence.js` · `msw-metrics/{b1-status-drift,b1-evidence-builder,b1-independence-lint,assertion-manifest-check}.js` · 테스트 5종 · `docs/multi-session-work-loop/{status-adjudication-design.md,m6-*.json}` · plan/report/notes/review 4종

**Modified** — `derive/index.js` · `msw-metrics/index.js` · `archive-complete/scan.js` + 그 테스트 · `renderer/sections/msw-metrics.js` · `renderer/{html,markdown}.js` · `plugin.json` · `CHANGELOG.md` · PRD · `measurement-instrumentation.md` · `plan-review-multi-session-work-loop.md`(→ H1)
