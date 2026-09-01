# Plan Review Panel — leadtime-observability-m1

**Plan**: `.claude/plans/leadtime-observability-m1.plan.md` · **Plan version**: `sha256:674cbfd41331426050752d9eb0f0916d982dced927d70bfb0341e593f1ab40e5`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 4 blocking finding(s): test/HIGH, test/FAIL, invariant/HIGH, invariant/FAIL — MCCP_REVIEW_SINGLE_PASS=scope_too_small 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Task 1의 Validate가 라이브 코퍼스에 리터럴 37을 못박는데, 그 수치는 이미 거짓이다. PRD 실측(bacd96a) 이후 이 게이트 자신의 패널 레코드가 코퍼스에 추가됐고, 그 레코드는 `# Plan Review Panel` 서명 + Measurement + non-null wall_clock_ms를 갖는 정상 측정 가능 레코드다. 즉 도구를 검증하는 행위(패널 실행)가 검증 기준을 증가시키는 자기참조 구조라, `measurable === 37`은 구현 시점에 반드시 실패한다. | plan L122-123 `coverage.measurable === 37` · `panel_span.n === 37` vs `.claude/reviews/plan-review-leadtime-observability.md:1` (`# Plan Review Panel — leadtime-observability`) 및 `:61` (`"wall_clock_ms": 279845`) — corpus.js:213 `isPanelRecord` 서명과 일치하므로 이미 38번째 레코드다 |
| architect | MEDIUM | Validation #1의 실패 조건이 plan 자신의 부재 규칙 (b)가 정상으로 규정한 출력을 실패로 인코딩한다. `wall_clock_ms=null`은 도달 가능한 정상 경로인데, `panel_span_missing!==0`을 exit 1로 두면 '오늘 우연히 결측 0'이라는 코퍼스 사고가 계약이 된다. | plan L188 `if(j.coverage.panel_span_missing!==0)process.exit(1);` 대 plan L114-115 부재 규칙 (b) "`wall_clock_ms`가 non-finite면 분포에 넣지 않고 … 0으로 접지 않는다"; `plugins/mccp/scripts/lib/plan-review/record.js:308` 벽시계 write 경로 |
| architect | LOW | Summary가 PRD 결정 2를 오인용한다. PRD 결정 2가 못박은 이름은 `post_panel_span`(패널 종료→ship 구간)이며 `panel_span`이라는 이름은 PRD 어디에도 없다. M1의 이름 선택은 저자 판단인데 PRD 결정으로 귀속돼 있어, 결정문을 근거로 인용할 C7이 잘못된 출처를 따라간다. | plan L15-16 "PRD 결정 2대로 이 축의 이름은 `panel_span`이며" vs PRD L58 "`e2e_leadtime`이 아니라 `post_panel_span`이다" |
| architect | LOW | Validation 블록이 스스로 세운 이식성 논거와 어긋난다 — /tmp를 피하려 stdin 파이프를 쓴다고 적어 놓고 같은 블록에서 `grep`·`/dev/null`(POSIX 전용)에 의존한다. Windows 우선 환경(§3.8 worktree)에서 #2·#4는 그대로 돌지 않는다. | plan L182-183 "이 저장소는 Windows에서도 돌고 /tmp는 이식 가능한 경로가 아니다" vs L193 `\| grep -q 'coverage'` · L200 `> /dev/null` |
| security | MEDIUM | Task 1의 records[]가 `plan_path`를 그대로 싣고 Task 3이 그 stdout을 git-tracked 문서에 축자 동결하므로, §3.12가 sanctioned 재봉인(`v1.22.4-cwd-rebind.js`)까지 치르며 닫았던 절대경로 leak이 새 필드에서 다시 열린다. plan은 어디에서도 정규화·제외를 말하지 않는다. | plan L112 `records[] ({record, verdict, halt_stage, panel_span_ms, recorded_at, plan_path, reviewed_plan_hash})` + L154 `<!-- BEGIN leadtime.js --json (verbatim) -->` + Acceptance L248 "동결 블록이 그 stdout과 **바이트 일치**". 입력 경로: `plan-review/cli.js:960`이 `record` 서브커맨드에서 `args.plan`을 **containment/relativize 없이** 그대로 `buildReviewRecord`에 넘기고(같은 파일 :198-205가 "--plan은 sealed되지 않는다"는 전제로 검증을 생략한다고 명시하지만 이 경로에서는 실제로 sealed된다), `record.js:314`가 `plan_path: o.planPath` 로 봉인한다. 호출부 `commands/plan.md:1856` 등 12곳은 `--plan "<plan path>"` LLM 치환 자리라 절대경로가 들어갈 수 있다. corpus.js는 이 값을 converged 5건에만 노출했지만(`corpus.js:501`) M1은 37건 전부를 노출한다. |
| security | LOW | 동결 블록의 바이트 일치를 Acceptance로 못박은 결과, 위 경로로 절대경로가 한 건이라도 섞이면 문서가 머신 종속이 되어 다른 worktree/머신에서 영구히 불일치한다 — 유출 축과 재현성 축이 같은 결정으로 함께 깨진다. | plan L158-159 "동결 블록과 라이브 `--json` 출력의 바이트 일치를 실행으로 재확인" + L248. plan에 sanitize·relativize·필드 제외 조항 0건(Task 1 L104-119 전체). |
| security | LOW | CLI가 미러하는 `corpus.js`의 `--repo-root`는 `plan-review/cli.js`의 `resolveContained`(:213-232, NUL·containment·symlink 검사)와 달리 아무 검증 없이 `path.join`에 도달한다. plan은 "CLI: `--repo-root <path>`"만 적고 이 비대칭을 언급하지 않는다. | `plugins/mccp/scripts/lib/plan-review/corpus.js:800-832`(`repoRoot = argv[i+1]` → `audit({repoRoot})`) → `:676-679` `path.join(root, sub)`. plan L118 `CLI: --json · --repo-root <path> · -h`. 단일 신뢰 사용자 모델이라 권한 상승은 아니고 기존 결함의 승계이지만, 그 내용이 Task 3의 커밋 문서로 흘러가는 새 경로가 생긴다. |
| test | HIGH | Task 1의 Validate 리터럴(`coverage.measurable === 37` · `panel_span.n === 37`)은 이미 거짓이다 — 이 plan 자신의 게이트 실행이 38번째 측정 가능 레코드를 코퍼스에 추가했다. 검증 명령이 구현 시점에 구조적으로 실패한다. | plan.md:122-123 "`coverage.measurable === 37` · `panel_span.n === 37` 을 낸다". 그러나 `.claude/reviews/plan-review-leadtime-observability.md:39` `## Measurement` + `:61` `"wall_clock_ms": 279845` 가 이미 존재하며, `corpus.js:676-709 readReviewRecords`는 `.claude/reviews/`의 모든 `.md`를 비재귀 스캔하므로 그 레코드가 분모·분자에 함께 들어간다. 37은 PRD 실측 시점(bacd96a) 스냅샷이지 불변량이 아니다. 같은 리터럴 결속이 Acceptance(plan.md:245-250)와 Task 3의 동결 블록 바이트 일치(plan.md:158-159)에도 전파되어, 매 사이클 새 패널 레코드가 문서를 즉시 stale로 만든다. |
| test | MEDIUM | 라이브 Validation이 plan 자신이 정상이라 규정한 상태를 실패로 인코딩한다 — 결함 방향(null을 0으로 접기)은 손으로 만든 픽스처에서만 검사되고, 실제 producer가 null을 낼 때의 동작은 어떤 검증도 통과시키지 않는다. | plan.md:188 `if(j.coverage.panel_span_missing!==0)process.exit(1);` 대 plan.md:113-116 부재 규칙 (b) "`wall_clock_ms`가 non-finite면 분포에 넣지 않고 `panel_span_missing_records`에 이름으로 남긴다 — 0으로 접지 않는다". `record.js`는 started-at 부재/판독 불가 시 `wall_clock_ms`를 정당하게 null로 쓴다. 즉 '오늘 우연히 결측 0'이 계약으로 굳는다. (직전 라운드 리뷰가 동일 지적을 냈고 plan L188은 무변경 — `.claude/reviews/plan-review-leadtime-observability.md:15,19`) |
| test | MEDIUM | 결정 3(‘corpus.js 출력 한 바이트 무변경’)의 기계적 강제라고 주장하는 Task 2 test 8은 순수 오라클 `aggregate()`의 반환값만 동결한다 — 실제로 동결 문서가 인용하는 것은 CLI stdout이며 `renderHuman`·`main`·stderr 커버리지 경고·exit code는 스냅샷 사거리 밖이다. 그 층을 건드린 편집은 test green으로 통과한다. | plan.md:138-141 "`corpus.aggregate(...)`의 `JSON.stringify(..., null, 2)`가 test 안 리터럴과 바이트 일치"; 그러나 사람이 읽는 출력은 `corpus.js:745-783 renderHuman`이 별도로 조립하고, `corpus.js:851-865`가 `pre_measurement` stderr 경고와 `process.exit(exitCodeForState(...))`를 낸다 — 전부 `aggregate` 밖. Risks 표(plan.md:233)는 이 스냅샷을 "본문을 건드려 동결 블록이 거짓이 된다"의 완화로 제시한다. |
| test | LOW | Validation 10번은 검증이 아니라 눈으로 보는 절차다 — 실패 조건이 없어 통과/불통과를 판정할 수 없다. | plan.md:225-226 "# 10. corpus.js 본문 변경이 export 줄에만 국한되는지 확인 / git diff origin/main...HEAD -- ...corpus.js" — 9번(`git diff --stat`, 빈 출력이 통과)과 달리 기대 출력이 명시되지 않았고, Risks 표(plan.md:233)가 이를 완화 수단으로 인용한다. |
| invariant | HIGH | state ladder에서 read_error 축이 통째로 빠져, 읽기 실패가 커버리지 100%로 접힌다 (fail-open). 미러 대상인 corpus.js는 readReviewRecords가 readdir/stat/readFile 실패 시 read_error=true를 올리고(corpus.js:684-705) aggregate가 그것을 state 판정에 쓴다(corpus.js:473, 670 — `result.read_error \|\| parse_failures>0 → degraded`). 그런데 plan의 부재 규칙은 (a) 측정가능 0건→blind, (b) wall_clock non-finite, (c) 관측 0층 키 미생성 셋뿐이고(plan.md:113-116), Task 2 회귀 test도 parse_failure만 고정한다(plan.md:134). 읽지 못한 파일은 readReviewRecords가 records에 push조차 하지 않으므로 분모(coverage.panel_records)에서 사라지고, 남은 레코드만으로 measurable===panel_records → counts_are_lower_bound=false → state 'ok'가 된다. 즉 파일 절반을 못 읽은 실행이 PRD 지표 1의 성공 기준('37/37 커버리지')을 그대로 충족한 것처럼 보고한다. Task 1 I/O 문장도 'aggregate에 주입한다'만 적고 read_error/sources를 opts로 넘긴다는 말이 없다(plan.md:117). 게이트 기계 자체의 고장이 승인 방향으로 접히는 경로다. | plan.md:113-117,134 (부재 규칙 3종·test 4번에 read_error 부재) 대 plugins/mccp/scripts/lib/plan-review/corpus.js:435,473,670,684-705 |
| invariant | MEDIUM | 동결(freeze) 블록의 '바이트 일치'가 살아 있는 코퍼스에 앵커돼 있어 구조적으로 유지 불가능하고, 그래서 이 검증은 실패하거나 묵인될 수밖에 없다. Task 3 Validate는 '동결 블록과 라이브 --json 출력의 바이트 일치를 실행으로 재확인'을 요구하고 Acceptance (b)도 같은 것을 요구하는데, `.claude/reviews/`는 이 저장소에서 /mccp:plan이 돌 때마다 레코드가 늘어나는 디렉토리다(corpus.js:103-106, record.js가 매 패널 실행마다 write). 실제로 이 게이트 실행이 만든 `.claude/reviews/plan-review-leadtime-observability.md`가 이미 untracked로 존재한다. 문서 동결의 선례(quorum-calibration.md)는 '측정 일자 명시'로 스냅샷임을 밝히지 재실행 바이트 일치를 계약으로 걸지 않는다. | plan.md:158-159 ("동결 블록과 라이브 `--json` 출력의 바이트 일치를 실행으로 재확인") · plan.md:248 Acceptance (b) · corpus.js:103-106 REVIEW_SUBDIRS(라이브 디렉토리) |
| invariant | MEDIUM | Task 1 Validate가 라이브 코퍼스 값 37을 리터럴로 못박아, 통과 여부가 검증 대상이 아니라 무관한 후속 패널 실행에 좌우된다. `coverage.measurable === 37` · `panel_span.n === 37`은 다음 /mccp:plan 한 번으로 거짓이 되고, 그때 남는 선택지는 도구 수정이 아니라 숫자 갱신뿐이다 — 통과를 멈추지 못하는 게이트 형태다. 같은 성질로 Validation #1의 `panel_span_missing!==0 → exit 1`은 plan 자신이 정상 경로로 규정한 결측 처리(규칙 b, plan.md:114-115)를 실패로 취급한다. | plan.md:122-123 · plan.md:186-188 · record.js:243-256 (started-at 부재·clock skew 시 wall_clock_ms=null이 정상 산출물) |
| invariant | LOW | PRD 결정 3의 '게이트 배선 diff 공집합' 불변식을 plan이 스스로 재정의해 유일하게 수정하는 파일을 검사 대상에서 제외한다. Validation 9는 cli/quorum/decide/l1-check/record/workflow/plan.md만 열거하고 괄호에서 'corpus.js는 여기 없다'고 명시한다. 보상 검사(4·10번)가 있으나, 불변식의 범위를 변경 대상에 맞춰 좁힌 형태 자체는 기록해 둘 값이 있다. | PRD:59 ("게이트 배선 diff를 공집합으로 유지한다") 대 plan.md:214-223 (corpus.js 제외 명시) |
| invariant | LOW | plan이 PRD 결정 2의 이름을 잘못 인용한다. PRD 결정 2가 못박은 이름은 `post_panel_span`인데 plan은 '결정 2대로 이 축의 이름은 `panel_span`'이라고 적는다. M1이 재는 구간이 다르므로 새 이름 자체는 정당할 수 있으나, 그 정당화를 PRD 결정에 귀속시키는 것은 근거 오귀속이다. | PRD:58 ("`e2e_leadtime`이 아니라 `post_panel_span`이다") 대 plan.md:15-16 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 공격한 축: (1) DD2의 \\"코퍼스 경계 단일 진실 원천\\" 주장 — `corpus.js:103 REVIEW_SUBDIRS`·`:676 readReviewRecords`·`:225 parseRecord`를 실제로 읽어 재사용 가능성과 `module.exports`(:868-878, parseRecord 이미 export·readReviewRecords 미export)를 확인했고, 추가 export 2건이 출력 무변경이라는 주장은 사실이었다. (2) `by_halt_stage` 축이 실재 필드에 근거하는지 — `record.js:309 halt_stage`로 확인, 허구 아님. (3) `.claude/reviews/` 부재 시 blind 경로 — `corpus.js:681 existsSync` 가드가 plan의 Risk 진술대로 실재. (4) DD1 위치 논거 — `evidence-audit.js`가 `scripts/lib/` 루트에 실존, 선례 정확. (5) coverage 하한 규약(DD5) — `corpus.js:462-468`이 plan이 인용한 그대로. (6) 라이브 코퍼스 대 리터럴 커플링 — 여기서 실제 결함을 찾았다(위 finding 1). Patterns 표의 인용 줄번호는 전반적으로 정확했고, 게이트 배선 diff 공집합 주장(Validation 9)도 파일 목록이 실재하는 배선 파일과 일치했다. HIGH/CRITICAL 급 구조 결함은 찾지 못했다. |
| security | pass | 공격한 축: (1) 신규 도구가 부분 상태/약한 필드로 승인을 만드는가 — leadtime.js는 게이트에 배선되지 않고 어떤 승인 필드도 쓰지 않아 escalation 경로 없음. (2) `corpus.js` export 추가가 신뢰 경계를 넓히는가 — `readReviewRecords`/`REVIEW_SUBDIRS`는 read-only이고 mutating 표면 없음, 성립 안 함. (3) receipt/무결성 digest 우회 — M1은 receipt를 쓰지 않고 hash carve-out을 만들지 않음, 성립 안 함. (4) env 토글 우회 — DD6대로 신규 토글 0개, 성립 안 함. (5) traversal — `readReviewRecords`가 `REVIEW_SUBDIRS` 고정 + 비재귀(`corpus.js:696`)라 레코드 이름 축의 traversal은 못 만들었음. (6) `.claude/reviews/` 부재 시 사망 주장 — `corpus.js:681`의 `existsSync` 가드가 plan의 Risk 진술대로 실재함(반증 실패). 실제로 착지한 것은 유출 축 하나: 절대경로 `plan_path`가 검증 없는 CLI 인자에서 리뷰 레코드로 봉인되고, M1이 그것을 37건 전부 커밋 문서에 축자 동결한다는 end-to-end 경로. HIGH/CRITICAL은 없음. |
| test | fail | plan이 인용한 `corpus.js` 앵커(97-110 state ladder, 418-476 aggregate/coverage/DN3 부재 규칙, 676-709 readReviewRecords, 745-783 renderHuman, module.exports 868-877)를 직접 읽어 인용 정확성을 확인했다 — 인용 자체는 정확했다. 이어 (1) 각 Task의 Validate 줄이 그 Task가 바꾸는 것을 실제로 돌리는지, (2) 라이브 코퍼스 리터럴이 안정한 값인지(`.claude/reviews/` 글롭으로 신규 레코드 존재를 확인 → 37 리터럴 반증), (3) '출력 무변경' 주장이 실제 출력 표면 전체를 덮는지, (4) 결함 방향(null을 0으로 접기·과다 승인 방향)이 실제 producer 경로에서 검사되는지를 공격했다. DD2 추가-export의 무해성, `--repo-root`/`--json` CLI 계약, blind/degraded 사다리 test 항목(Task 2의 2·4번)은 공격했으나 결함을 찾지 못했다. |
| invariant | fail | corpus.js의 state ladder(97-100, 473, 670)·readReviewRecords 실패 경로(684-705)·coverage 산식(462-468)·parseRecord 분류(225-306)·record.js의 wall_clock_ms null 조건(243-256)을 열어 plan이 인용한 계약이 실제로 그렇게 말하는지 대조했다. 열어보려 시도한 게이트: (1) '.claude/reviews/ 부재→blind' Risk 주장 — existsSync 가드는 맞으나 존재하지만 읽히지 않는 경우(EACCES·부분 write)가 어느 방향으로 떨어지는지 추적했고 승인 방향으로 접힘을 확인, (2) blind/degraded/ok 판정에 read_error 입력이 plan 어디에도 없음을 grep으로 확인, (3) 동결 블록 바이트 일치와 리터럴 37이 살아 있는 디렉토리에 앵커된 점, (4) '배선 diff 공집합' 범위의 자기면제, (5) PRD 결정 2 이름 귀속. corpus.aggregate 스냅샷의 비결정성(Date.now/생성시각)은 grep으로 없음을 확인해 finding으로 올리지 않았다. receipt hash·rollback 경로는 이 plan이 receipt schema를 건드리지 않아 사거리 밖이었다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 299762,
  "halt_stage": null,
  "backlog_appended": 2,
  "backlog_skipped_nonblocking": 14,
  "granted": 4,
  "reviewed_plan_hash": "sha256:674cbfd41331426050752d9eb0f0916d982dced927d70bfb0341e593f1ab40e5",
  "plan_path": ".claude/plans/leadtime-observability-m1.plan.md",
  "recorded_at": "2026-09-01T07:16:41.892Z"
}
```
