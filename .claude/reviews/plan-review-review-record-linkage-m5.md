# Plan Review Panel — review-record-linkage-m5

**Plan**: `.claude/plans/review-record-linkage-m5.plan.md` · **Plan version**: `sha256:6fd9ad778399bde00b6ea1dfa323ff5a9dceffd62a93a1ceb6dfbef999a5b936`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 12 blocking finding(s): architect/HIGH, architect/FAIL, security/HIGH, security/FAIL — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD5(사유 이분화)는 동결 baseline 블록의 바이트를 **확정적으로** 바꾼다. 그런데 plan은 같은 문서에서 '동결 블록은 불변'을 단언하고(Files to Change 80행), Risks 표는 그 파손을 '중' likelihood의 가능성으로만 적는다. 즉 M5가 내거는 UI6 불변식(과거 코퍼스 소급 금지)을 자기 Task 4가 반드시 위반한다. | docs/review-record-linkage/frozen-baseline.md:317-319 — 동결 블록의 `pre_baseline.ship_eligibility.by_reason` 키가 `"no explicit meta.plan_review_expected — …the upstream plan receipt was never git-tracked": 75`로 축자 봉인돼 있다. 이 문자열은 linkage-defs.js:218-223이 반환하는 바로 그 사유이고, linkage-audit.js:539 `ship_eligibility: { counts: eligibility, by_reason: eligibilityReasons }`가 그것을 pre_baseline에 싣는다. DD5는 이 사유를 `producer_absent_in_build`로 대체하므로 75건 전건의 키가 바뀐다 — plan의 '동결 블록은 불변'(plan L80)과 Risks의 '중'(plan L331)은 둘 다 거짓이며, 실제로는 `linkage-frozen-baseline.test.js`의 바이트 비교가 100% 붉어진다. |
| architect | MEDIUM | DD5는 `undecidable` 사유가 '단일 문자열'이라고 전제하고 둘로 가르지만, 정의 소유 모듈에는 서로 다른 undecidable 사유가 **셋** 있다. 이분화 규칙이 나머지 둘에 대해 무엇을 반환할지 정하지 않아 결정이 구현자에게 떠넘겨진다. | plan L224 "`ship_eligibility.by_reason`의 **단일 문자열**을 DD5의 두 사유로 가른다". 그러나 linkage-defs.js `classifyShipEligibility`는 세 갈래로 undecidable을 낸다 — :198 `receipt has no readable meta object`, :212-216 `plan_review_expected=false but no_plan_review_reason is absent or empty`, :218-223 `no explicit meta.plan_review_expected …`. DD5의 판별 기준('M3 키 집합 중 하나라도 있는가')은 앞의 두 갈래에 적용하면 의미가 어긋난다(meta 판독 불가 receipt는 M3 키 유무를 물을 수 없고, 무증거 exclusion은 '생산자 부재'도 '미stamp'도 아니다). |
| security | HIGH | M5의 유일한 탐지 채널(SessionStart skew 배너)이 env 토글 하나로 조용히 꺼진다. Task 3은 배너를 `session-start.js`의 dep-check 블록 '안에서' 내라고 지시하는데, 그 블록 전체가 `MCCP_CODEX_DISABLED`로 가드된다. CLAUDE.md §3.12가 '표준 설치(MCCP_CODEX_DISABLED=1이 사용자 settings.json에 존재)'라고 적은 구성에서는 skew가 한 번도 발화하지 않으며, 이는 Summary가 약속한 '발화하지 못했을 때 그 사실이 조용히 지나가지 않게 만든다'를 정면으로 반증한다. 판본 격차는 Codex 가용성과 무관한 축인데 Codex 토글에 결속된다. | plugins/mccp/scripts/hooks/session-start.js:1066 `if (!envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED')) {` — plan Task 3(라인 214-216)이 지목한 1063-1136 블록 전체가 이 가드 안에 있다. CLAUDE.md §3.12: "표준 설치(`MCCP_CODEX_DISABLED=1`이 사용자 `settings.json`에 존재)". |
| security | MEDIUM | '기존 24h throttle을 그대로 공유한다(새 throttle 채널을 만들지 않는다)'는 인용은 그 코드가 스스로 반박한 설계다. `dep_check_at`은 dep-check가 도는 매 세션 재스탬프되므로 24h 시계 단독은 rate-limit이 아니고, 자기 축의 present-only 키가 없으면 배너는 한 번 뜨고 다시는 뜨지 않으며 상태 변화(캐시가 새로 뒤처짐/해소됨)도 다시 말하지 못한다. 즉 plan이 명시적으로 금지한 '새 채널'이 없으면 skew 경고는 사실상 1회성이 되어 위 finding과 같은 침묵으로 수렴한다. | plugins/mccp/scripts/hooks/session-start.js:1114-1121 "the 24h clock ALONE is not a rate-limit here: dep_check_at is re-stamped on every session that runs dep-check, so an operator who opens a session daily would see this once and never again ... Hence dep_check_eclipsed, its own present-only field." 대 plan 라인 215-216 "throttle은 그 블록의 24h 규율을 **그대로 공유한다**(새 throttle 채널을 만들지 않는다)". |
| security | MEDIUM | `plugin_dir_override=true`가 침묵 조건인데, 그 조건이 참인 상태가 곧 M5가 탐지해야 할 실패 상태를 포함한다. `CLAUDE_PLUGIN_ROOT`가 캐시 밖(예: M3·M4 이전의 오래된 sibling 워크트리 `plugins/mccp`)을 가리키면 판정 없이 skew가 무관하다고 단정하고 배너가 침묵한다 — 실행 중인 본문이 HEAD 배선을 갖는지는 검사되지 않는다. | plan 라인 191-193: "`plugin_dir_override`는 `CLAUDE_PLUGIN_ROOT`가 `.claude/plugins/cache/` 밖을 가리키면 `true`(이미 dogfood 경로로 돌고 있어 skew가 무관하다)." 어떤 Task도 그 디렉토리의 커밋 도달성을 재판정하지 않는다. |
| security | LOW | 경로 유출 회귀 단언의 형태 목록이 macOS/UNC를 덮지 못한다. Windows 드라이브와 `/home/`만 보므로 `/Users/<name>/…`나 `\\\\host\\share\\…`를 싣는 미래 필드는 그 test가 green인 채 통과한다 — M4 H1이 닫은 축과 같은 유출이 다른 플랫폼에서 재개방된다. | plan 라인 199-201: "반환 어디에도 `[A-Za-z]:\\` / `/home/` 형태 문자열이 없음". |
| security | LOW | 레지스트리에서 읽은 `gitCommitSha`가 형태 검증 없이 git 인자로 전달된다. `installed_plugins.json`은 mccp가 쓰지 않는 외부 소유 파일이고, `-`로 시작하는 값은 `merge-base --is-ancestor`/`rev-list`에서 rev가 아니라 옵션으로 해석된다. execFileSync라 셸 주입은 없고 결과는 `unknown`으로 접히므로 영향은 낮지만, plan은 `^[0-9a-f]{7,40}$` 같은 입력 검증을 어디에도 요구하지 않는다. | plan 라인 103-104 `git merge-base --is-ancestor <installedSha> HEAD` · 라인 109 `git rev-list --count <sha>..HEAD`; Task 1(라인 189-196)의 반환·enum 명세에 sha 형태 검증 요구가 없다. |
| test | HIGH | UI6(동결 블록 바이트 불변)의 유일한 실제 falsifier인 linkage-frozen-baseline.test.js가 Validation·Files to Change 어디에도 없다. 대신 plan이 지정한 검사는 `node ... linkage-audit.js --frozen-only`(plan L311) 한 줄인데, 이 명령은 출력만 뿜을 뿐 docs/review-record-linkage/frozen-baseline.md와 비교하지 않아 드리프트가 나도 exit 0이다. Task 4 Validate가 '`--frozen-only` diff 0줄'이라 적었지만 diff 대상을 명령이 갖지 않는다. | plan L230-232 '동결 블록 바이트 불변(`--frozen-only` diff 0줄) ... 이것이 UI6의 실제 시험' vs plan L310-311(비교 없는 단독 실행). 실제 비교는 plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js:41-62 'byte-identical to the live --frozen-only output'이며 plan의 Validation 1~6 어디에도 없음. |
| test | HIGH | DD5(사유 이분화)는 pre_baseline의 by_reason 문자열을 필연적으로 바꾸므로 동결 블록 바이트가 확정적으로 움직이고, 그 순간 linkage-frozen-baseline.test.js가 red가 된다. plan은 이를 '중' 확률 Risk로만 적고 그 suite의 존재·재생성 의무·prose 단언(건수 문구)까지의 파급을 열거하지 않는다 — 즉 이미 존재하는 test가 이 plan의 변경을 거부하는데 plan의 어떤 Validate 줄도 그것을 실행하지 않는다. | linkage-audit.js:539 `ship_eligibility: { counts: eligibility, by_reason: eligibilityReasons }`(pre_baseline 경로) + linkage-frozen-baseline.test.js:62 `assert.equal(committed, live)` 및 :77 prose 단언. plan Risks L331은 '중' likelihood로만 기재. |
| test | HIGH | Task 2가 dep-check.js의 checkAll을 바꾸는데, 그 계약을 실제로 단언하는 기존 suite(dep-check.test.js, 'checkAll: strict superset — the four pre-M2 keys keep their meaning')를 Validate 줄도 Validation 블록도 실행하지 않는다. Task 2의 Validate는 명령 없는 산문 서술뿐이라 상위집합 주장이 반증 불가하다. | plan L209-210 Task 2 Validate(명령 미지정) / plan L300-308 Validation에 dep-check.test.js 부재. 실재 suite: plugins/mccp/scripts/lib/tests/dep-check.test.js:263. |
| test | HIGH | Task 3은 session-start.js의 dep-check 블록(1063-1136)을 바꾸면서 그 블록 전용 회귀 suite(hooks/tests/session-start-dep-check.test.js)를 돌리지 않는다. plan이 지정한 install-skew-wiring.test.js는 '문자열이 파일에 실재하는가'의 정적 스캔이라, 배너가 실제로 발화하는지·24h throttle이 보존되는지는 어떤 test도 보지 않는다. | plan L219-220 'session-start.js에 오라클 소비 줄이 실재하고 ... 정적 단언'; 미실행 suite: plugins/mccp/scripts/hooks/tests/session-start-dep-check.test.js. |
| test | MEDIUM | Task 4가 판별 함수를 linkage-defs.js에 두는데 그 모듈의 기존 suite(linkage-defs.test.js)와 배선 suite(linkage-wiring.test.js)가 Validation에 없다. 정의 소유권 주장(M1 DD1a)이 test로 확인되지 않는다. | plan L224-226, L300-308; 실재 파일 plugins/mccp/scripts/lib/tests/linkage-defs.test.js · linkage-wiring.test.js. |
| test | MEDIUM | Validation 5와 Acceptance L344는 '`bidirectional >= 1` 또는 그것이 0인 이유를 보고서에 적는다'로 되어 있어, 이 마일스톤의 유일한 라이브 acceptance가 어떤 결과로도 충족된다 — 실패 방향(배선이 여전히 발화하지 않음)을 걸러낼 기계 판정이 없다. | plan L341 'Validation passes (1·2·3·4·6 — 5는 Task 6 결과에 따름)' + L344 '또는 그것이 `0`인 이유가 보고서에 적혀 있다'. |
| invariant | HIGH | DD5의 `undecidable` 사유 이분화는 동결 baseline 바이트를 '움직일 수도 있는' 위험이 아니라 **확실히 움직인다**. 그런데 plan은 그 경우의 처방을 '동결 문서를 함께 갱신하고 이탈로 적는다'로 두어, PRD 결정 1/UI6가 세운 no-retro 동결 불변식을 block에서 warn으로 강등한다. 동결 블록은 '값이 안 움직인다'는 것 자체가 계약인데, 움직였을 때 문서를 따라 고치면 그 계약은 탐지 기능을 잃는다. | `linkage-audit.js:539` `ship_eligibility: { counts, by_reason: eligibilityReasons }`가 `result.pre_baseline`에 실리고, `frozenOnly()`의 화이트리스트가 `linkage-audit.js:826` `out.pre_baseline = result.pre_baseline`로 그것을 동결 뷰에 포함한다. 사유 문자열은 `linkage-defs.js:219-223`이 생성하며 88건 전건이 그 값이다. plan Task 4 `:230-232` "바이트가 움직이면 동결 문서를 함께 갱신하고 그 사실을 보고서에 이탈로 적는다" · Acceptance `:346` "— 또는 차이가 이탈로 기록됨" · Risks `:331` likelihood '중'(실제로는 확정). |
| invariant | HIGH | DD7이 선언한 게이트 이탈 경로가 실재하지 않는다. 라운드 캡 차단은 `emit-workflow-args`의 fail-closed EX_BLOCK이고, §3.16이 열거한 감사 우회(`MCCP_SKIP_RECEIPT`·`MCCP_SKIP_INTENT_GATE`·`MCCP_ALLOW_CODEX_UNAVAILABLE`·`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`) 중 어느 것도 이 초크포인트에 작용하지 않는다. 코드가 명시한 복구는 캡 상향 또는 §3.16 triage뿐이며 pin된 캡에서는 '상향 경로가 아예 없다'. 존재하지 않는 우회를 미리 '확정'으로 선언하면 실행자에게 남는 유일한 행동이 §3.16이 금지한 원장 삭제다. | `plan-review/cli.js:526-536` (`BLOCK: round cap reached … the L2 panel is not launched`), `cli.js:387-405` `describeRoundCapRecovery` — "The in-band recovery is to raise MCCP_GATE_ROUND_CAP (max 3)" / pinned일 때 "there is no cap-raising path at all and goes straight to 3.16 triage". plan DD7 `:170-175` "문서화된 감사 우회를 쓰고 사유를 남기는 것 … 우회로 열리는 것은 receipt 작성뿐". 덧붙여 F12의 전제도 어긋난다 — 이 plan의 명시 슬러그 원장은 `.claude/state/review-rounds/mccp-plan-codex__review-record-linkage-m5.json`이고 rounds는 index 0 **1건**이지 소진된 `review-record-linkage`(3라운드)가 아니다. |
| invariant | MEDIUM | 이 마일스톤의 유일한 실측 acceptance(UI7)가 산문 escape로 언제나 충족 가능하다. 라이브 실값 미발화가 곧 '완료'가 되므로, PRD Risks 첫 행이 지목한 '통로는 만들었는데 안 부른다'의 재발을 이 게이트가 구조적으로 잡지 못한다. | plan `:344` "`bidirectional >= 1` — 또는 그것이 `0`인 이유가 보고서에 명령·출력과 함께 적혀 있다" · `:341` "Validation passes (1·2·3·4·6 — 5는 Task 6 결과에 따름)" — 라이브 실값 검사(Validation 5)가 acceptance 목록에서 조건부로 빠진다. UI7은 `:30`에서 "acceptance는 producer가 아니라 산출된 실값이다"라고 못박았다. |
| invariant | MEDIUM | Task 5(b)가 backlog HIGH(강제 범위 대 지표 범위 어긋남)를 '문구로' 닫는다고 하지만, 그 문구는 이미 코드에 존재한다. 즉 HIGH 항목이 실질 변경 0으로 닫힌 것으로 기록된다. | `linkage-audit.js:659-661` note가 이미 "REPORT only — the enforced denominator is the M4 landing boundary, not this partition (DD7). Run --check-round-structure for the enforcing view."를 싣고 있다. plan `:237-240`은 같은 명제를 `--help`와 출력 note에 명시하는 것을 그 HIGH의 처방으로 삼는다. |
| invariant | MEDIUM | Task 8의 기본 선택 (ii)는 skip predicate다 — '대상 결정이 ship됐다'를 escalation 소멸의 증거로 삼는데, 그 증거는 escalation이 미해소인 채로도 성립한다(실제로 M4가 그렇게 ship됐다). 즉 건너뛰는 작업이 수행됐다는 증거가 아니라 수행되지 않았어도 존재하는 사실이다. | plan `:266-275`: "**기본 선택은 (ii)** — escalation의 대상 결정(`review-record-linkage-m4`)이 이미 종결됐으므로". F11 `:51`은 `fix-task-applied.md`가 `escalate: true` + `verdict: codex_divergent`를 보유하고 STATE.md `Escalation Pending`이 미러임을 스스로 기록한다 — divergent 판정은 ship 여부와 독립 축이다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan이 인용한 file:line을 직접 열어 대조했다 — dep-check.js:116-157(checkImpeccable lazy-require + fail-closed sentinel, 인용 정확) · checkAll의 '엄격한 상위집합' 선례(:154-166, 정확) · linkage-defs.js:186-233(3값 자격 판정, 정확하나 undecidable이 3갈래) · linkage-audit.js:308-360/539(by_reason 배선) · finalize-receipt.js:309-315(review_record_path carry-forward, 정확). '동결 블록 불변' 주장을 frozen-baseline.md의 실제 봉인 바이트와 대조해 DD5가 그것을 확정적으로 깬다는 것을 확인했다. 그 밖에 공격했으나 결함을 못 찾은 축: DD4 fail-open이 dep-check 헤더의 'Never throws' 계약과 정합한다(:14-16) · install_skew 키 추가가 기존 4키를 침범하지 않는다 · session-start 24h throttle 공유가 새 채널을 만들지 않는다는 설계 · DD6 rounds_fidelity가 임계 없이 계수만 해 C4의 해석 소유권을 선점하지 않는다 · DD8의 M5/M6 분리가 Task 7 기계 분류로 근거를 남긴다는 점. |
| security | fail | plan과 PRD를 읽고 인용된 모듈을 실제로 열어 대조했다. (1) `dep-check.js:90-166`의 checkImpeccable sentinel/상위집합 패턴 인용은 정확했고 `install_skew` 추가가 기존 키 의미를 바꾸지 않는다는 주장도 반박하지 못했다. (2) STATE.md가 git-tracked인데 dep-check가 거기에 쓰므로(`stateWriter.update` at :1132) 절대경로·머신명 유출을 노렸으나, plan의 반환 shape는 version·sha·boolean·enum뿐이고 plan은 STATE 신규 필드를 요구하지도 않아 유출 경로를 성립시키지 못했다. (3) DD4 fail-open이 게이트 우회로 쓰일 수 있는지 봤으나 진단은 어떤 판정 필드도 쓰지 않아 권한 상승 경로가 없었다. (4) DD5의 사유 이분화가 `undecidable`을 `eligible`로 승격시켜 지표를 부풀릴 수 있는지 봤으나 두 사유 모두 undecidable 하위 분류라 자격 판정을 바꾸지 않는다. (5) DD7의 라운드 예산 우회는 receipt를 위조하지 않고 verdict를 봉인 유지하므로 dedupe 우회가 성립하지 않음을 확인했다. 실제로 착지한 것은 침묵/우회 축이다 — `MCCP_CODEX_DISABLED` 가드(session-start.js:1066), 코드 주석이 스스로 반박하는 throttle 인용(:1114-1121), plugin_dir_override의 무판정 침묵, 그리고 유출 회귀 단언·sha 인자 검증의 저severity 공백. |
| test | fail | plan의 각 Task가 편집하는 파일에 대응하는 기존 suite를 Glob/Grep으로 찾아 Validation 블록·Validate 줄과 대조했다(dep-check.test.js · session-start-dep-check.test.js · linkage-defs.test.js · linkage-wiring.test.js · linkage-frozen-baseline.test.js 모두 미실행). linkage-audit.js에서 --frozen-only/--check-round-structure/by_reason/denominator 실재를 확인해 Validate 경로 realism은 통과였다(플래그 전부 실재). DD5가 pre_baseline by_reason을 건드리는지 소스(:539)로 확인해 '이미 있는 test가 이 변경을 거부한다' 축을 실증했다. 반대로 UI8 축(version-declaration-guard.js)과 --check-round-structure 종료코드 사다리는 명령이 실재하고 plan이 직접 돌리므로 결함을 찾지 못했다. |
| invariant | fail | 동결 baseline 불변식을 공격했다 — `frozenOnly` 화이트리스트(`linkage-audit.js:819-829`)와 `pre_baseline.ship_eligibility.by_reason`(`:539`), 사유 생성지(`linkage-defs.js:195-224`)를 읽어 DD5가 동결 바이트를 확실히 움직임을 확인했고 plan의 처방이 갱신+이탈 기록임을 확인했다. DD7의 롤백/이탈 경로를 실제 초크포인트(`plan-review/cli.js:517-536`, `describeRoundCapRecovery:387-405`)와 대조해 열거된 감사 우회 중 작용하는 것이 없음을 확인했고, F12가 인용한 원장 대신 이 plan 자신의 슬러그 원장(m5, 1라운드)을 열어 전제도 어긋남을 확인했다. Acceptance/Validation의 각 체크가 실패로 끝날 수 있는지 추적해 라이브 축 두 개가 '또는 보고서에 적는다'로 닫히는 것을 확인했다. Task 5(b)가 닫는다고 한 HIGH가 이미 코드에 있는 note임을 대조했다. Task 8의 skip proof가 작업 수행 없이도 존재 가능한지 검사했다. 반면 DD4(fail-open 진단)는 게이트를 막지 않는 자리(`session-start` 배너·`dep-check` never-throws)에 붙으므로 fail-open drift가 아니라 정당한 선택으로 보였고, DD2의 `unknown`을 `current`로 접지 않는 규칙, Task 1의 경로 유출 형태 단언, present-only/schema 축 침해는 공격해도 결함을 찾지 못했다. |

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
  "wall_clock_ms": 347617,
  "halt_stage": null,
  "backlog_appended": 12,
  "backlog_skipped_nonblocking": 10,
  "granted": 4,
  "reviewed_plan_hash": "sha256:6fd9ad778399bde00b6ea1dfa323ff5a9dceffd62a93a1ceb6dfbef999a5b936",
  "plan_path": ".claude/plans/review-record-linkage-m5.plan.md",
  "recorded_at": "2026-09-04T05:41:48.380Z"
}
```
