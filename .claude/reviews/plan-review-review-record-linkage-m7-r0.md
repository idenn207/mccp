# Plan Review Panel — review-record-linkage-m7

**Plan**: `.claude/plans/review-record-linkage-m7.plan.md` · **Plan version**: `sha256:1bf8698abc99fc11bf71f27e2923712971f192e07f786325263a051ec5e3c219`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 2의 강제 뷰(`--check-live-linkage`)가 검사 1·2를 **어느 코퍼스에서 읽는지** 명시하지 않는다. 검사 3·4는 정의상 HEAD 트리(`post_baseline.linkage`)에서 오는데, 검사 1·2는 plan이 "receipt와 레코드를 각각 한 번 읽는 것"이라고만 적어 작업 트리 읽기가 자연스러운 구현이 된다. 그러면 한 종료코드 안에 두 코퍼스가 섞이고, 이 모듈 자신이 그것을 급소로 지목한 fail-open 형태가 된다 — evidence commit이 실패하거나 `MCCP_PR_SKIP_LINK_EVIDENCE`를 써도 back-patch된 레코드·receipt는 작업 트리에 남아 검사 1·2가 통과한다. 이 도구의 exit 0이 M7의 **유일한** acceptance라 그 틈이 곧 마일스톤 반증 불가로 이어진다. | plan L122-123 "1·2는 receipt와 레코드를 각각 한 번 읽는 것이다" vs `plugins/mccp/scripts/lib/linkage-audit.js:621-628` "읽기 원천은 작업 트리가 아니라 HEAD 의 트리다. 이것이 이 축의 급소다 … MCCP_PR_SKIP_LINK_EVIDENCE 를 쓰거나 evidence commit 이 실패해도 back-patch 된 레코드는 작업 트리에 남으므로 감사가 bidirectional 을 만점으로 세고, 히스토리에 증거가 0 인 채로 100% 를 보고한다"; plan Acceptance L378은 그 exit 0을 acceptance로 못박는다 |
| architect | MEDIUM | DD4의 "정의는 재정의하지 않고 **호출**한다"가 이 스코프에서는 성립 불가다. 검사 2가 요구하는 per-ship join(`measurement.receipt_hash === receipt.receipt_hash`)은 `computeLinkage` **안에 인라인**돼 있고 per-decision으로 노출된 함수가 없다. 따라서 `--decision`을 받는 강제 뷰는 그 비교를 두 번째로 구현할 수밖에 없으며, plan은 그 사실도 재사용 API를 만들겠다는 것도 적지 않는다 — 두 경로가 조용히 갈릴 자리가 정확히 여기다. | `plugins/mccp/scripts/lib/linkage-audit.js:389-401`(비교가 `computeLinkage` 루프 내부에 인라인, 인자는 `eligibleShips` 배열뿐) vs plan L146-151 DD4 "강제 뷰는 그 규칙을 재정의하지 않고 **호출**한다" |
| architect | MEDIUM | "`--decision`을 주면 그 ship 하나를 판정한다"는 서술이 검사 3·4에 대해 거짓이다. `post_baseline.linkage.bidirectional`·`denominator`는 HEAD 트리의 **eligible ship 전체** 집계라 decision 스코프가 없다. 즉 지목한 ship과 무관한 다른 ship이 검사 3을 충족시킬 수 있고, 반대로 코퍼스 전역 상태가 지목한 ship의 성패와 무관하게 종료코드를 흔든다. | `plugins/mccp/scripts/lib/linkage-audit.js:353-359`(`computeLinkage(eligibleShips…)`, `denominator: eligibleShips.length`)와 `:722`(`post.linkage = computeLinkage(liveEligible, …)`) vs plan L269 "`--decision`을 주면 그 ship 하나를, 안 주면 HEAD 트리 전체를 판정한다" |
| security | MEDIUM | Task 0/Task 5 instruct verbatim transcript of commands whose output expands `~` to the operator's home directory into a git-tracked report, reopening the absolute-path leak precedent on a new artifact. The plan contains no redaction step. | Plan Task 0 Validate: "네 출력을 보고서에 원문으로 싣는다" with commands `CACHE=~/.claude/plugins/cache/mccp/mccp/1.33.6` and `sha256sum ~/.claude/plugins/installed_plugins.json` (plan lines 211-215, 233); Task 5 creates `.claude/PRPs/reports/review-record-linkage-m7-report.md` (plan:83, 315) which is committed. Measured: no tracked prose artifact under docs/ or .claude/ currently carries `/home/<user>/.claude/plugins` (Grep over docs/ = 0 matches; under .claude/ only 2 machine-state files, no docs). Consequence is bounded — the report is not hash-sealed, so no re-seal is forced — hence MEDIUM, not HIGH. |
| test | HIGH | 강제 뷰의 검사 3·4는 decision-scoped가 아니라 코퍼스 전역 값이라, `--check-live-linkage --decision review-record-linkage-m7` exit 0이 **다른 ship의 링크**로 충족될 수 있다. 즉 이 마일스톤의 유일한 acceptance가 과다승인(over-permissive) 방향으로 열려 있고, 그 방향을 겨냥한 test가 Task 2의 Validate 목록에 없다. | plan Task 2: "3. `post_baseline.linkage.bidirectional >= 1` 4. `post_baseline.linkage.denominator != null`" — 그러나 `linkage-audit.js:358-359`의 `bidirectional`/`denominator`는 `eligibleShips`(HEAD 트리 전체) 위에서 계산된다. Task 2 Validate는 `ok/violations/degraded/unresolved` 4상태만 단언하고 "지목한 ship은 미링크인데 다른 ship이 링크됨 → ok가 아니어야 한다"는 사례가 없다. plan Acceptance의 핵심 항목이 이 exit 0 하나다(:378). |
| test | MEDIUM | Task 1의 세 상류 앵커 조건(meta.plan_path · meta.review_record_path · resolution.review_source)에는 기계 검사가 없다 — Validate가 값을 출력해 보고서에 싣는 1회성 전사다. 이는 DD2가 스스로 "나중에 누구도 재실행으로 반증할 수 없다"며 배격한 형태와 동일하고, 강제 뷰의 검사 1~4에도 상류 receipt 축은 포함되지 않는다. | plan Task 1 Validate: "세 값을 출력으로 싣는다" + node -e 출력 스크립트(단언·종료코드 없음). DD2: "그것은 **1회성 전사(transcript)**이고, 나중에 누구도 재실행으로 반증할 수 없다". Task 2의 검사 4종은 전부 ship receipt/레코드/post_baseline 축이며 `mccp-plan-codex` 필드를 대조하지 않는다. |
| test | MEDIUM | Risks 표가 완화 수단으로 지목한 test가 어느 Task의 Validate 줄에도 없다 — "강제 뷰가 네 검사를 재정의해 `--json`과 갈린다 → test가 두 경로의 값 일치를 단언"은 Task 2 Validate에 대응 항목이 없어, 그 완화가 존재하는지 반증할 방법이 없다. | plan Risks:370 "강제 뷰가 네 검사를 재정의해 linkage-audit --json과 갈린다 \| 낮음 \| DD4 … test가 두 경로의 값 일치를 단언" vs Task 2 Validate:277-279 (4상태 fixture · degraded · unresolved만 열거). |
| test | LOW | Task 3의 Validate가 명령을 지목하지 않는 수동 육안 검사라, 문서 정정이 실제로 착지했는지·인용 줄번호가 유효한지를 실행으로 falsify할 수 없다. | plan Task 3 Validate: "문서가 인용하는 file:line이 실재 (`plugins/mccp/commands/plan.md:2890` · `.../finalize-receipt.js:308`)" — 실행 명령 없음. 대조적으로 Patterns to Mirror는 `install-skew-wiring.test.js`(본문 스캔 정적 단언)를 이미 선례로 들고 있다. |
| invariant | HIGH | Task 0 축 1의 fail-closed preflight는 구조적으로 통과할 수밖에 없다 — 이 마일스톤의 유일한 비가역 실패(캐시 본문에서 라운드 예산 소진)를 탐지할 수 없는 게이트다. | plan:209 `CLAUDE_PLUGIN_ROOT="$PWD/plugins/mccp" node ... install-skew.js` + plan:217 "(a)가 `override:true` ∧ `state:current`여야 하고". 그러나 install-skew.js:281 `classifyPluginRoot(env.CLAUDE_PLUGIN_ROOT, ...)` → :292-299에서 override면 **그 디렉토리 자신의 HEAD**를 installed_sha로 삼는다. 즉 워크트리 경로를 강제 주입하면 세션이 실제로 캐시 1.33.6 본문을 돌고 있어도 항상 `override:true · current · 0 behind`가 나온다. plan 자신이 F16(:58)에서 그 변수가 실제 세션 상태를 반영하지 않음을 인정하면서도 같은 명령을 통과 조건으로 삼는다. (b)의 grep 3종도 디스크의 캐시 파일과 워크트리 파일을 읽을 뿐 "주입된 /mccp:plan 본문"(plan:217-218)을 읽는 명령이 아니어서 워크트리 쪽은 항상 >0이다. 결과적으로 두 갈래 모두 어떤 세션에서도 pass이고, 실제 판별은 사람의 눈으로 이연된다 — Risks 표 첫 행(plan:364)이 "복구 경로가 없다"고 적은 바로 그 실패를 막지 못한다. |
| invariant | HIGH | Acceptance가 자기 자신을 무효화한다 — exit 0을 요구하는 항목과, 검사 3·4가 실패해도 사유만 적으면 되는 항목이 같은 체크리스트에 공존하고 우선순위가 없다. | plan:378 "`--check-live-linkage --decision review-record-linkage-m7`가 **exit 0**" 대 plan:385 "1~2가 되고 3~4가 안 됐다면 그 이유가 보고서에 있다" + plan:302-303 "**1~2가 되고 3~4가 안 되면 그 이유를 보고서에 적는다.**". DD3 표(plan:135-140)상 검사 3·4 미충족은 `violations`(exit 1)이므로, 두 항목은 동시에 참일 수 없는데 둘 다 체크 가능한 형태로 나열돼 있다. 어느 쪽이 이기는지도, "부트스트랩 상태"와 "결함"을 가르는 기계 기준도 plan 어디에도 없다. 이것은 PRD가 자기 지배적 실패 모드로 명시한 형태다 — PRD:143-145 "주장을 남긴 채 acceptance만 무르게 하는 것이 M2가 dropped된 이유이자 이 PRD의 지배적 실패 모드다". |
| invariant | MEDIUM | Task 1은 "fail-closed — 미충족이면 즉시 정지"를 표방하지만 정지시키는 기계가 없다. 제시된 검증 명령은 어떤 조건에서도 exit 0이다. | plan:236 제목 "(fail-closed — 미충족이면 즉시 정지)" 대 plan:253-258의 Validate — `node -e`가 디렉토리를 훑어 `console.log`만 하고 비교·종료코드가 없다. 세 앵커(plan:240-242) 미충족 판정은 전적으로 사람의 판독에 달려 있으며, 같은 plan이 Task 2에서는 정확히 그 문제("1회성 전사이고 나중에 누구도 재실행으로 반증할 수 없다", plan:117-118)를 코드로 고치겠다고 선언한다. 상류 앵커 축만 산문으로 남는다. |
| invariant | LOW | `--check-live-linkage`의 네 검사는 서로 다른 읽기 원천을 섞는데 plan이 그 비대칭을 명시하지 않아, 종료코드의 의미(특히 `violations` 대 아직-미커밋)가 정의되지 않는다. | 검사 3·4의 원천인 `post_baseline`은 작업 트리가 아니라 HEAD 트리를 읽는다 — linkage-audit.js:650 `ref: 'HEAD'`, :891 `const liveRef = o.liveRef \|\| 'HEAD'`, :175-192 `gitRev(root, ['show'], ref + ':' + rel)`. 반면 검사 1·2(plan:270-272)는 지목한 receipt·레코드를 직접 읽는 형태로 기술된다. plan:304의 Validate는 `/mccp:pr` 완주 직후 실행을 지시할 뿐 커밋 시점을 고정하지 않아, 미커밋 상태의 exit 1이 DD3 표에서 "지목한 ship이 실재하는데 검사가 미충족"(=결함)으로 읽힌다. DD3가 `unresolved`를 따로 둔 이유(plan:142-144, 부트스트랩과 결함의 구분)가 바로 이 축에서 다시 열린다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | F5·F6(finalize-receipt.js:281-335 carry-forward와 review_source 파생), F15(정확히 1건 앵커), F11(record.js:395 + pr.md:1062-1066 back-patch), F10(pr.md:923), CHECK_EXIT_CODES 분리 주장(linkage-audit.js:109-133), D2 자격 3값(linkage-defs.js:192-250), 레코드 경로 파생 규칙(record.js:108)을 각각 열어 대조했고 전부 plan의 인용대로였다. ship receipt/레코드가 HEAD에 도달하는 경로(pr.md:1344-1389 evidence commit)도 확인해 acceptance 타이밍은 성립함을 확인했다. 깨진 것은 강제 뷰의 경계 정의다 — 검사 1·2의 코퍼스가 미지정이라 HEAD/작업 트리 혼합(fail-open)이 열려 있고, DD4가 주장한 정의 재사용은 per-decision API 부재로 구조적으로 불가하며, `--decision` 스코프 주장은 검사 3·4에 대해 거짓이다. |
| security | pass | Attacked: (1) F5/F6/F15 citations against finalize-receipt.js:258-337 — all three hold verbatim, including the "exactly 1 match" fail-closed anchor (:294) and the malformed-path rejection that already validates carried `meta.review_record_path` as repo-relative and `.claude/reviews/`-prefixed (:311-318); no partial-state fallback to a weaker field exists (unknown review_source stays UNSTAMPED, :331-334). (2) Traversal via the new `--check-live-linkage` reading a receipt-declared record path — existing audit indexes records from the git tree by exact repo-relative path with no basename fallback (linkage-audit.js:406-429), and the write side already rejects `..`/absolute/drive-letter/NUL (plan-review/cli.js:1456-1468, linkage-defs isRepoRelativePath); the plan explicitly reuses rather than redefines these (DD4). (3) Escalation via the new exit-0 oracle — it is a read-only audit tool, not wired into any gate approval; check 1 depends on the hash-sealed, git-tracked ship receipt whose overwrite guard is fail-closed (§3.12), so an author-forged record cannot make the strongest check pass. (4) Bypass surface — the plan adds no env toggle, no override, and explicitly refuses round-cap raising and ledger deletion (DD7, DD6). (5) install-skew.js output shape for path leakage — skeleton() carries no path field (install-skew.js:95-105), and the cache-containment check uses path.relative rather than substring (:124-137). (6) Whether plan-path entry (PRD_MODE=false) would starve `review_source='multi-agent'` and make Task 1 condition 3 unreachable — the PRD_MODE branch at plan.md:200-254 governs the Phase 2.5 research fan-out, not the 5.2 review panel, so I could not land it. Only the report-transcript home-path leak reached a concrete consequence. |
| test | fail | plan의 F5·F6·F15 인용을 finalize-receipt.js:270-337에서 직접 대조(정확히 일치, 반증 실패) · F11/F9/F13 계열 인용도 형태상 일치 확인 · linkage-audit.js의 CHECK_EXIT_CODES/STATE_EXIT_CODES 분리와 post_baseline denominator 계산 범위(:358-369)를 읽어 강제 뷰 검사 3·4의 scope 결함을 확인 · 기존 linkage-audit.test.js를 훑어 이번 변경이 뒤집을 기존 단언(동결 바이트·exit ladder)이 있는지 확인했으나 추가 서브커맨드라 회귀 압력은 없었음 · Validation 블록의 경로·test 파일 실재 확인. 남은 결함은 위 네 건. |
| invariant | fail | F5·F6·F15 인용을 finalize-receipt.js:281-336에서 대조(정확히 일치, carry-forward 유일 경로·정확히 1건·source enum 모두 참). DD3의 종료코드 분리 주장을 linkage-audit.js:109-133의 CHECK_EXIT_CODES/STATE_EXIT_CODES에서 확인(참). DD4의 join_note 계약과 back-patch 잔여를 pr.md:1049-1085에서 확인(plan의 Risk 서술이 주석과 일치, dangling 잔여는 정직하게 기록됨). 다음으로 게이트를 열려고 시도: (1) Task 0 preflight의 두 갈래를 install-skew.js:271-299 실제 판정 순서로 재구성해 통과 조건이 무조건 참임을 확인, (2) Acceptance 7항목을 서로 대조해 exit 0 요구와 산문 escape의 충돌을 확인, (3) Task 1의 fail-closed 주장을 제시된 명령의 종료코드로 검증, (4) 검사 3·4의 읽기 원천을 HEAD 트리로 추적. 반면 DD7(슬러그 축)·DD5(M5 status)·재봉인 금지(§3.12) 준수·present-only 규율에서는 결함을 찾지 못했다. |

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
  "wall_clock_ms": 255026,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:1bf8698abc99fc11bf71f27e2923712971f192e07f786325263a051ec5e3c219",
  "plan_path": ".claude/plans/review-record-linkage-m7.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-08T02:26:37.737Z",
  "rounds": 1
}
```
