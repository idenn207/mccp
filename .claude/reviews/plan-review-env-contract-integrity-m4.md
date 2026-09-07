# Plan Review Panel — env-contract-integrity-m4

**Plan**: `.claude/plans/env-contract-integrity-m4.plan.md` · **Plan version**: `sha256:1fe9b5a363b7ff2672d09dee88ba325a59ec85ecf8009554ef8ddc479fbec09c`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 9 blocking finding(s): architect/HIGH, architect/FAIL, security/HIGH, security/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 「정본 오라클 하나」라는 표제 주장이 색인 행에서 깨진다 — lint.js가 이미 같은 registry→문서 투영을 자기 렌더러로 소유하고 있고, plan은 그 중복을 인지·조정하지 않는다. 더구나 plan이 확정한 표기 규약이 기존 상수와 문자 그대로 다르다. | lint.js:210-221 `const EMPTY_CELL = '(빈 값)'` + `renderValues(entry)`/`renderDefault(entry)`가 L2의 색인 대조(lint.js:372-375)에서 쓰인다. plan Task 1은 `renderDerived(entry) → { …, indexRow }`와 `compareDerived`의 surface 열거에 `index-row`를 넣고(plan:162-167), Task 2는 「소유하는 줄 … 색인 표의 그 이름 행」이라 선언하며(plan:202-204), 표기 규약 1은 `default === ''` → **`빈 값`**(괄호 없음, plan:170-171)이다. docgen이 그 규약으로 색인 행을 `--write`하면 L2의 `(빈 값)` 기대와 어긋나 L2가 붉어지고, 규약을 색인에만 예외로 둔다면 '오라클 하나'가 아니라 표면별 렌더러 둘이다. plan 어디에도 lint.js의 기존 두 렌더러를 docgen으로 이전하거나 재사용한다는 문장이 없다(Files to Change의 lint.js UPDATE 사유는 'L13' 뿐 — plan:139). |
| architect | MEDIUM | Task 3의 「방향은 예외 없이 레지스트리 → 문서」 근거로 든 선례가 오인용이다 — L2는 `summary`를 대조하지 않는다. | plan:272-274 "`summary`는 L2가 색인과 대조하는 반면, 문서의 사본은 어느 검사도 읽지 않는다. 검증된 쪽이 정본이다". 실제 L2는 kind·values·default 세 열만 비교한다 — lint.js:371-375 (`row.kind`, `renderValues`, `renderDefault`). `row.summary`는 parseIndex(lint.js:235)가 파싱만 하고 어떤 검사도 소비하지 않는다. 즉 registry `summary`는 '검증된 쪽'이 아니며, 색인 summary는 오늘 아무 검사도 읽지 않는 **세 번째 사본**이다. |
| architect | MEDIUM | UI5(「먼저 채우고 켠다」)를 뒷받침하는 드리프트 모집단에 색인 행 표면이 통째로 빠져 있는데, L13은 그 표면을 소유한다. 켜는 순간 실패 건수가 측정치 31건을 초과할 수 있고 Acceptance (a)의 '31건' 관측은 그때 근거를 잃는다. | G2 표(plan:72-79)의 측정 표면은 상세 `**소비처**`·상세 `**한 줄**`·상세 헤더·색인 TOC 개수·상세 앵커 부재 다섯 뿐이고 '색인 행'이 없다. 반면 compareDerived의 surface 상수에는 `index-row`가 있다(plan:167). Acceptance (a)는 "`docgen --check`가 수리 전에 exit 1과 **31건**을 보고"할 것을 요구한다(plan:390-391). 색인 summary는 어떤 lint도 읽지 않으므로(lint.js:235 파싱 후 미소비) 그 표면의 드리프트 수는 오늘 미지수다. |
| security | HIGH | Task 1의 표기 규약 3번(`values === null` → int는 `—`)이 실제 코퍼스와 정반대다. mccp 소유 int 항목 33건 전부가 오늘 `**값** 자유 문자열`로 적혀 있고 `—`를 쓰는 항목은 0건이다. 계획대로 frozen 상수를 두면 L13은 켜는 순간 33건에서 붉고 `docgen --write`는 git-tracked 문서 6장의 헤더 33줄을 일괄 재작성한다. 이는 G2의 «헤더 드리프트 2건» 측정과 Risks의 «규약은 오늘의 표기를 코드로 승격하는 것이며 새로 정하지 않는다 / Likelihood 낮음»을 직접 반증하며, PRD 최상위 Risk(«검사를 켜는 순간 대량 실패»)와 UI5(«먼저 채우고 켠다»)가 그대로 실현되는 경로다. | plan L173 "`values === null` → **`자유 문자열`** (string) / `int`는 `—`. 오늘의 표기 그대로" vs 실측 corpus: docs/environment/cost.md:17 · gates.md:376 · review.md:94 · orchestration.md:85 · observability.md:17 · hooks.md:113 (총 33건) 전부 `**종류** `int` — **값** 자유 문자열` |
| security | HIGH | `not-consumed` 19건의 미소유 선언이 `**소비처**` 축에만 걸려 있어, 같은 19건의 **헤더 줄**은 여전히 오라클 소유다. 그 헤더는 레지스트리에서 파생 불가능한 사람 지식(벤더 관측 기본값·단위)을 담고 있으므로 `--write`가 이를 파생 형태로 덮어써 git-tracked 문서에서 영구 소실시킨다 — 계획이 최상위 Risk로 든 바로 그 유실이며, Task 1이 `**소비처**`에 대해 정정한 결함이 헤더 축에 그대로 남아 있다. | plan L176 "status 분기는 evidence 축에만 걸고" + L202-204(소유 줄에 `**종류**` 헤더 1줄 포함) vs docs/environment/external.md:598 `**종류** `int` — **값** 정수 (재시도 횟수) — **기본값** 미설정 (mccp 기본값 없음 — 읽지 않는다) · impeccable 3.5.0 관측 소스 상수 `DEFAULT_REPAIR_ATTEMPTS``(동종 542·570·719·809) |
| security | MEDIUM | 소유 헤더 줄에 사람이 쓴 괄호 주석이 실재하므로 «파생 줄은 순수 파생값이다»가 active 항목에서도 거짓이다. `--write`는 이 주석을 삭제한다. | docs/environment/review.md:477 `**종류** `string` — **값** 자유 문자열(strict 사유 검증) — **기본값** 없음 (미설정이 기본)` |
| security | MEDIUM | 파괴적 `--write`의 유일한 독립 검증으로 제시된 Task 3 diff-형태 대조 명령이 구조적으로 절대 실패하지 않는다(`... && exit 1 \|\| true`가 비영점 종료를 삼킨다). 또한 허용 정규식이 `\\\|`[A-Z]`(색인 표의 임의 행)과 `- \\[`(임의 TOC 불릿)을 통째로 허용해, 오라클이 소유하지 않는 색인 행 삭제도 «소유 형태»로 통과한다. | plan L278-280 `git diff ... && echo 'UNOWNED LINE CHANGED ...' && exit 1 \|\| true`, 허용 패턴 `'^[+-](\\*\\*종류\\*\\*\|\\*\\*한 줄\\*\\*\|\\*\\*소비처\\*\\* `\|\\\|`[A-Z]\|- \\[)'` |
| security | LOW | Task 6의 CI paths-filter 검증이 (a) `js-yaml`이 설치돼 있으면 아예 실행되지 않고 (b) 실행돼도 정규식 리터럴 `/docs/environment/**/`가 이스케이프되지 않은 슬래시로 SyntaxError다 — 게이트 입력 커버리지 주장에 검증이 없다. | plan L334-337 `node -e "require('js-yaml')" 2>/dev/null \|\| node -e "... if(!/docs/environment/**/.test(y)) ..."` |
| test | HIGH | H2(생성기가 `사용 예시`를 만들지 않는다 — 이 계획의 최상위 안전 주장)를 반증할 test가 하나도 없고, 오라클 시그니처는 오히려 그 반대를 선언한다. Task 1은 `renderDerived(entry) → { …, exampleSkeleton }`을 export한다고 적어 예시 골격을 여전히 렌더한다. docgen.test.js는 '렌더 형태'를 단언하므로 그 필드의 존재를 오히려 pin하게 되고, docgen-apply.test.js의 단언은 (a)(b)(c) 절의 '소유 줄 외 바이트 보존'뿐이라 apply가 exampleSkeleton을 새 절에 써 넣어도 붉어지지 않는다(신규 생성 절 (c)에는 보존할 기존 바이트가 없다). 유일한 falsifier는 Acceptance (b)의 1회 수동 완주이며 그것은 회귀에 대해 아무것도 보장하지 않는다 — 즉 '생성이 L7을 스스로 만족시켜 UI1 후반부를 후퇴시킨다'는 실현된 위험이 test로 봉인되지 않은 채 남는다. | plan:162 `renderDerived(entry)` → `{ headerLine, summaryLine, evidenceLine, indexRow, exampleSkeleton }` vs plan:223 "**생성기는 `**사용 예시**` 블록을 만들지 않는다**"; plan:248-254(docgen-apply.test.js 단언 범위 = 바이트 보존), plan:389-397(Acceptance (b) = 수동 1회). lint.js:491 `no 사용 예시 block`가 차단의 마지막 고리. |
| test | MEDIUM | Task 5가 지시하는 pin 값 `13`이 틀렸다. `negativeFixtures`는 검사 개수가 아니라 **fixture 개수**를 세며 오늘 12 증가분은 11개 검사에 대한 12개 fixture다. Task 5는 L13 fixture 4종 + 역방향 1종을 더하라고 하므로 실제 값은 16(역방향은 붉지 않으므로 증가시키지 않는다면 16)이 되어야 하는데 plan은 13으로 올리라고 적었다. 이 지시를 그대로 따르면 스위트가 붉거나, 더 나쁘게는 구현자가 pin을 맞추려고 L13 fixture를 1종만 작성해 계획된 나머지 3종이 조용히 사라진다 — 즉 '검사마다 그것 하나만 위반하는 fixture' 규약이 pin 때문에 훼손된다. | lint.test.js:214 `let negativeFixtures = 0;` + :236/:246/:258/:270/:278/:287/:297/:323/:346/:382/:405/:530 (12회 증가, 11개 검사) + :599 `assert.equal(negativeFixtures, 12, 'L1..L7 · L9 · L10 · L11 · L12 …')`; plan:298-309 "fixture **4종**" + 역방향 1종인데 "`12` pin … `13`으로 올라가야 한다". |
| test | MEDIUM | Task 6의 유일한 자기검증(CI paths 필터가 L13 판정 입력을 덮는가)이 실행되지 않거나 실행돼도 무의미하다. 정규식 리터럴 `/docs/environment/**/`는 첫 `/docs/`에서 종료되는 문법 오류/무의미 표현이고, 그 블록 전체가 `node -e "require('js-yaml')" 2>/dev/null \|\|` 뒤에 있어 js-yaml이 설치돼 있으면 아예 돌지 않는다. Task 6이 바꾸는 파일(`env-contract-drift.yml`)에 대응하는 실효 검증이 0이 된다. | plan:334-337 `node -e "require('js-yaml')" 2>/dev/null \|\| node -e "… if(!/docs/environment/**/.test(y)) …"` |
| test | LOW | Task 3의 '독립적 diff 형태 대조'가 소유 5종 중 TOC `(N개)` 축을 실제로는 허용 목록에 넣지 않았을 수 있다 — 허용 패턴은 `- \\[`(색인 리스트 줄)뿐이고 TOC 개수 토큰이 그 형태가 아니면 정상 수리가 'UNOWNED LINE CHANGED'로 오탐된다. 반대로 그 패턴이 TOC 줄 전체를 덮으면 색인 줄의 임의 변경도 통과시켜 대조가 느슨해진다. 어느 쪽인지 plan이 실측을 대지 않았다. | plan:263-264 소유 집합에 TOC `(N개)` 포함 vs plan:279 허용 정규식 `'^[+-](\\*\\*종류\\*\\*\|\\*\\*한 줄\\*\\*\|\\*\\*소비처\\*\\* `\|\\\|`[A-Z]\|- \\[)'` — TOC 개수 토큰에 대한 전용 대안 없음 |
| invariant | HIGH | 이 계획은 M3가 세운 라운드 캡 강제를 '슬러그를 바꿔 예산을 리필하는' 경로로 정규화한다. 원장은 plan hash가 아니라 decision slug로 키잉되므로(ledger.js:16,20,107 — "키는 decision slug이지 plan hash가 아니다(DD6)"), 같은 마일스톤 아티팩트를 새 slug로 재실행하면 캡이 소진된 사실이 사라진다. 캡은 여전히 캡처럼 보이지만 아무것도 멈추지 않는다. | plan.md:490 — 원장 `.claude/state/review-rounds/mccp-plan-codex__env-contract-integrity.json`에 panel round 0 기록. plan.md:498-499 — "실효 복구는 셋이다: (a) 새 slug로 재실행 … (slug `env-contract-integrity-m4`, 라운드 예산 fresh)". plan.md:502-505 — "사용자는 (a)를 택했다". 이는 CLAUDE.md §3.16의 "원장을 지우는 것은 그 목록에 없다"와 동형인 행위이며, 계획은 그 등가성을 논하지 않고 receipt에도 재-slug 사실을 봉인하는 필드를 두지 않는다. |
| invariant | MEDIUM | Task 6의 CI paths-filter 검증은 어떤 경우에도 의도한 속성을 검사하지 못하는 '게이트처럼 보이는 no-op'이다. 가드가 `require('js-yaml')` 성공 시 검사를 통째로 건너뛰고(저장소에 js-yaml 의존성이 없음), 실패 시 실행되는 본체는 정규식 리터럴이 깨져 있다. | plan.md:334-337 — `node -e "require('js-yaml')" 2>/dev/null \|\| node -e "… if(!/docs/environment/**/.test(y)) …"`. `/docs/environment/**/`는 `/docs/` 정규식 리터럴 뒤에 `environment` 토큰이 이어져 파싱 자체가 실패한다(항상 비영점). 그리고 `package.json`에 js-yaml 없음(grep 결과 0건) → 가드는 항상 fallback으로 가므로 이 줄은 항상 붉고 검사 내용과 무관하게 실패한다. 실제 필터는 .github/workflows/env-contract-drift.yml:39-45에 이미 존재하므로 이 검사는 진짜 붉음이 아니라 잡음이며, 흔한 해소는 삭제다. |
| invariant | MEDIUM | Acceptance (b)가 레지스트리에 임시 토글을 심고 `docgen --write`로 git-tracked 문서에 절을 생성하게 하는데, 그 인공물을 제거하는 단계가 계획 어디에도 없다. 착지 검증이 착지물을 오염시킬 수 있고, Acceptance의 diff 검사는 삭제만 본다. | plan.md:390-396 — "(b) 레지스트리에 임시 토글을 **`kind: 'bool'`로** 심고 `docgen --write` → …". 제거·복원 지시 없음. plan.md:398의 유일한 diff 게이트는 `git diff --diff-filter=D --name-only`로 **삭제만** 검사하므로 추가된 가짜 토글·생성된 문서 절은 통과한다. |
| invariant | LOW | Task 3의 diff 형태 대조는 게이트 기계 자체가 실패할 때(예: `git diff` 실패, 파이프 오류) 조용히 통과한다 — 후행 `\|\| true`가 비매칭과 오류를 구분하지 않는다. | plan.md:278-280 — `git diff -U0 -- docs/ \| grep … && echo 'UNOWNED LINE CHANGED …' && exit 1 \|\| true`. 매칭 0건과 명령 실패가 동일하게 exit 0으로 접힌다. 이 대조는 계획이 "사람의 눈이 아니라 이것이 증거다"(plan.md:266)라고 선언한 유일한 파괴적 변경의 증거다. |
| invariant | LOW | CI 워크플로의 스텝 이름이 L12로 고정돼 있는데 계획은 헤더 주석만 갱신한다고 선언한다 — L13 추가 후 CI 표면이 실제 검사 범위를 잘못 보고한다. | .github/workflows/env-contract-drift.yml:70 `- name: env-contract lint (L1..L12)` 및 :3-4 주석. plan.md:320-323는 "헤더 주석에 L13이 무엇을 지키는지 한 문단 추가"만 지시하고 스텝 이름을 언급하지 않는다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용을 전수 대조했다: lint.js:491(L7 사용 예시 요구)·:797(L12가 enum/list + non-retired만)·:781(L12 등록 형태)·:122(EXAMPLE_EXEMPT='retired.md')·registry.js:31-48(not-consumed evidence가 docs 앵커를 가리킨다는 서술)·evidence-name.js:17-20(역방향 양방향 요구)·:40-43(순수·주입 가능 코어)·lint.test.js:218/:226(12 pin, 합성 baseline)은 전부 plan 서술대로였다. G1의 차단 연쇄(L2→L3→L7/L12)와 H2 흡수(생성기가 사용 예시를 만들지 않으면 L7이 붉게 남는다)는 L7 구현(:486-496)이 status로 분기하지 않고 전 앵커를 순회하므로 성립한다. H1/H3의 not-consumed 미소유 규칙도 registry.js:31-40과 정합한다. 깨진 것은 세 곳이다 — (1) 색인 행을 lint.js가 이미 자기 렌더러로 투영하는데 docgen이 같은 행을 소유한다고 선언하면서 규약(`빈 값` vs `(빈 값)`)까지 어긋난다, (2) L2가 summary를 대조한다는 선례 인용이 코드와 다르다, (3) 색인 행이 드리프트 모집단에서 빠져 UI5 근거가 그 표면을 덮지 못한다. retired 제외 선언·fail-closed 위임·CI paths 필터·L12와의 질문 분리는 공격했으나 결함을 찾지 못했다. |
| security | fail | (1) `not-consumed` 19건이 정말 다중행 산문 `**소비처**`인지 실측 대조 — 참이었고 external.md에 정확히 19건, 그 축의 반박은 실패했다. (2) 소유 `**소비처**` 줄에 코드 스팬 뒤 추가 산문이 붙은 항목이 있는지 grep — 0건, 반박 실패. (3) 표기 규약 3건을 실제 코퍼스와 대조 — int 규약이 33건과 정면 충돌(F1). (4) 미소유 선언의 축 범위를 헤더·한 줄까지 확장해 추적 — external.md 19건 헤더가 벤더 관측 지식을 담고 소유 대상이라 유실 경로 성립(F2). (5) 파괴적 write를 막는다고 주장한 검증 명령들의 실제 종료코드·정규식 검토 — 둘 다 무력(F4·F5). (6) 절대경로/사용자명 leak, `--name` 경로 주입, registry evidence 값 변조 경로는 시도했으나 근거를 찾지 못했다(레지스트리 값 불변 + evidence는 repo-relative 강제, registry.js:55-56). |
| test | fail | plan의 두 최강 주장(H2 '생성이 게이트를 약화시키지 않는다', H1/H3 '미소유 규칙')이 어떤 test로 반증되는지 추적했다. H1/H3는 Task 5 역방향 fixture + docgen-apply.test.js (b)절로 실제 덮인다고 판단해 기각하지 않았다. H2는 오라클 시그니처(`exampleSkeleton`)와 정면 충돌하고 falsifier가 수동 Acceptance뿐이라 finding으로 남겼다. lint.js:355-887을 읽어 L1~L12 등록 형태와 L7(:491)·L12(:797, retired/enum/list 제외)·BLOCK_END_LABEL(:140) 인용이 plan 서술대로인지 확인했고 전부 정확했다. lint.test.js:205-300·:599를 읽어 plan이 지목한 pin 2개(:226·:599)의 실재를 확인했고, `negativeFixtures`의 의미가 plan의 가정과 어긋남을 발견했다. 각 Task의 Validate 줄이 그 Task가 바꾸는 파일을 실제로 돌리는지 대조했고 Task 6에서 실효 0을 찾았다. Task 3의 순환성 지적은 plan이 이미 흡수했으므로 재지적하지 않았다. |
| invariant | fail | L7 차단 연쇄가 생성물로 자기 만족되는지 실제 코드로 확인(lint.js:491의 `/\\*\\*사용 예시/`는 섹션 어디든 매칭 — 계획의 TODO 주석 형태는 이를 만족시키지 않아 주장은 성립). L12의 retired/enum·list 제외 근거(lint.js:794-798)와 EXAMPLE_EXEMPT(:122)를 대조해 Task 2의 retired 제외 선언이 형제 검사와 정합함을 확인. sliceBlock(:150-168)·splitAnchorSections(:181)로 「1줄 소유」 재정의가 다중행 산문을 실제로 피하는지 추적. L13 read-failure fail-closed 규약(lint.js:5-7, :810)이 실재함을 확인. docgen↔L13 순환성은 계획이 Task 3에서 독립 diff 대조로 이미 다루고 있어 그 지점은 반증하지 못했다. 남은 공격 성공 지점은 위 5건이며, 그중 slug 재발급에 의한 라운드 캡 원장 리필이 핵심이다. |

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
  "wall_clock_ms": 285633,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:1fe9b5a363b7ff2672d09dee88ba325a59ec85ecf8009554ef8ddc479fbec09c",
  "plan_path": ".claude/plans/env-contract-integrity-m4.plan.md",
  "recorded_at": "2026-09-01T02:18:36.347Z"
}
```
