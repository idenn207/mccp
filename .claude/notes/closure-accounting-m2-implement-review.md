# closure-accounting M2 — implement-gate review record

> `/mccp:prp-implement` 2.5.4의 review record다. **plan 본문이 아니라 여기 산다** —
> plan의 `## Codex Adversarial Review`가 "이 절 밖을 고치면 receipt를 다시 쓸 수 없다"고
> 본문을 동결했고, 실제로 append하자 `mccp-plan-codex` receipt가 즉시 `stale`이 됐다
> (plan hash `d22035b3…` → `fa64453e…`). 명령 본문이 제공하는 `.claude/notes/<topic>.md`
> 경로가 정확히 이 경우를 위한 것이다.

- Plan: `.claude/plans/closure-accounting-m2.plan.md` (본문 무변경)
- Gate: `mccp-implement-codex` · decision `closure-accounting-m2`

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: **1** (`MCCP_GATE_ROUND_CAP=1`, §3.16 — 라운드를 늘리지 않는다)
- 합치 결론: **`divergent`** — 리뷰어가 `needs-attention`을 냈고 그 값을 그대로 봉인한다.
  finding 자체는 전건 흡수했지만 verdict를 재작성하지 않으므로 cross-gate dedupe는 닫힌 채이고
  `/mccp:pr`에서 PR-Codex가 반드시 발화한다(§3.12).
- 리뷰 대상: plan이 **pre-commit하지 않은** 구현 시점 결정 8건(모듈 분할 · 후보 인벤토리
  선검증 방식 · `checkSuccessor` 시그니처 확장 · 멱등 필터 위치 · manifest 재진입 판별 ·
  git 저장소 fixture · 모듈 경계를 넘는 `scrubPathsFromMessage` 재사용 · exit 12)

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — 완료된 manifest가 복구 분기를 영구 선택한다 | HIGH | ACCEPT_NOW | 실재. 아래 전문 흡수 |

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0건)
- Codex session 참조: threadId `01a08009-a904-7763-b52b-4bc25efeb8dd`

### F1 흡수 (HIGH · ACCEPT_NOW) — manifest에 상태가 없으면 이 설계는 1회성이다

**지적**: 구현 결정 5는 "manifest의 `new_sha`가 디스크의 봉인과 같으면 planReseal을 건너뛰고
append만 완료한다"였다. 재봉인이 **성공한 뒤에도 그 조건은 영원히 참**이므로, 새 부채가 쌓인 뒤의
2차 재봉인이 매번 이미 끝난 append 재시도로 접힌다. manifest를 지우는 것은 plan이 명시적으로
거부(fail-closed)하므로 퇴로도 없다. 즉 DD9-b가 N세대를 위해 만든 조상 **집합** 검증이 정작
도구 자신의 재진입 규칙 때문에 도달 불가가 된다. plan 본문 `:338-340`이 그 규칙을 적은 자리다.

**성립한다.** plan은 재진입 판별자를 요구했을 뿐 **완료 상태**를 정의하지 않았고, 초안의 결정 5는
그 공백을 "sha 일치"로 메웠는데 그 술어는 진행 중과 완료를 구분하지 못한다.

**흡수 — manifest는 상태를 갖고, 완료→다음 세대 전이가 명시된다.**

manifest 스키마에 `state`(`in-progress` | `complete`)와 `completed_at`을 추가한다(plan이 정한
`old_sha`·`new_sha`·`carried_item_ids`·`started_at`은 그대로). 재진입 판정은 디스크만 읽는
결정적 규칙 4갈래다:

1. `state='in-progress'` ∧ `new_sha` = 디스크 봉인 → **이어서 완주**. 라이브를 다시 만들지 않고
   `carried_item_ids`로 3단계만 수행한다(plan의 원래 의도).
2. `state='in-progress'` ∧ `new_sha` ≠ 디스크 봉인 → 봉인 교체 **전에** 죽은 것이다. 파괴적
   변경이 0건인 지점이므로 처음부터 다시 계획하고 manifest를 덮어쓴다.
3. `state='complete'` → 그 작업은 **끝났다**. 다음 호출은 새 세대다: `planReseal`을 정상 수행하고
   manifest를 새 `old_sha`(= 현재 봉인)로 다시 연다. 단 `planReseal`이 낸 `new_sha`가 현재 봉인과
   같으면 재봉인할 것이 없다는 뜻이므로 **noop + exit 0**(쓰기 0). 이것이 리뷰어가 요구한
   "deliberate start-next-generation transition"이고, 멱등 재시도는 그 noop이 보장한다.
4. manifest **부재** → 두 경우를 갈라야 한다. manifest는 step 0에서 **어떤 파괴적 변경보다 먼저**
   쓰이므로 정상 흐름에서 부재는 "아직 아무것도 하지 않았다"이고, 이때만 최초 재봉인이 성립한다
   (부재를 무조건 거부하면 **1회차조차 불가능**하다 — plan의 fail-closed 문장을 문자 그대로 읽으면
   그렇게 된다). 다만 manifest가 **지워진** 고아 상태는 디스크에서 탐지된다: 봉인 doc에
   `meta.supersedes`가 있고, 현재 봉인 sha에 결속된 원장 줄이 **0건**이며, `supersedes`의 sha에
   결속된 줄이 존재하는 형태 — 그것이 정확히 "봉인은 교체됐는데 승계가 착지하지 않은" 상태다.
   이때는 **exit 12로 거부**하고 복구 경로(manifest 재구성)를 말한다. plan이 지키려던 fail-closed는
   여기에 산다.

**Validate 추가 (리뷰어가 지정한 형태 그대로)**: 하나의 fixture에서 공개 apply 경로로
**A→B 재봉인 → 무변경 재실행이 신규 줄 0건 → 부채 추가 후 B→C 재봉인 성공**을 연속 실행한다.
B→C가 성립하면 규칙 3이 실제로 전이를 열었다는 뜻이고, 중간의 0건이 멱등을 보인다. 이 test는
plan Validate 5(c)의 "완주 후 재실행 0건"을 포함하면서 그 뒤 한 세대를 더 간다.

**주의**: B→C의 성립은 DD9-b(조상 **집합** 검증)에도 의존한다 — C 세대의 승계 줄은
`succeeded_from`이 B이지만 successor 문서의 마커는 A를 담고 있다. 두 축이 한 test에서 함께
반증 가능해지므로, 이 test가 red일 때 원인이 둘 중 어디인지는 실패 메시지가 구분해야 한다.

### Security Reviewer

`Task(mccp:security-reviewer)` — "review proposed implementation: 경로 처리 · git argv ·
마커 정규식 · 서명 밖 신뢰 경계 · append-only 원장 무결성". **CRITICAL 0건 · HIGH 2건 ·
MEDIUM 3건 · LOW 2건.** HIGH 둘은 새 결함이 아니라 **plan이 의도로만 적고 구현 규칙으로
못박지 않은 것**이라는 지적이며, 둘 다 여기서 규칙으로 승격한다.

| # | Severity | Verdict | 처리 |
|---|---|---|---|
| S1 | HIGH | ACCEPT_NOW | `execFileSync` argv 배열 강제 + sha 전문 검증을 파생보다 **먼저** |
| S2 | HIGH | ACCEPT_NOW | 모든 원장 write는 `appendDispositions` 경유 — 스캔으로 단언 |
| S3 | MEDIUM | ACCEPT_NOW (예외) | 마커 스캔의 fence/인용 제거 — 아래 사유 |
| S4 | MEDIUM | DEFER_TO_BACKLOG | `normalizeCitedPath`의 심볼릭 링크 미해소 (M2가 만든 것이 아님) |
| S5 | MEDIUM | DEFER_TO_BACKLOG | 멱등 필터의 TOCTOU (배타 잠금 부재) |
| S6 | LOW | ACCEPT_NOW | manifest 부재 분기의 "갓 봉인된 정상 창" fixture test |
| S7 | LOW | ACCEPT_NOW | 아카이브 파일명 sha 길이 불일치 — 단일 상수로 고정 |

**S1 (HIGH)** — `git ls-files --error-unmatch`는 반드시 `execFileSync('git', [...])`로 부른다.
문자열 조립 + `execSync`는 셸을 띄우므로 실제로 주입 가능해진다. 이 하위 시스템의 기존 호출
전건이 이미 argv 배열이다(`debt-inventory.js:373-376` · `m10-coverage-gate.js:195` ·
`v1.22.4-cwd-rebind.js:75,84`). 더불어 sha는 `^sha256:[0-9a-f]{64}$` **전문 일치**로
검증한 **뒤에야** 12자 slice·`path.join`·argv에 닿는다 — 순서가 뒤집히면 검증되지 않은
문자열이 경로가 된다. 정규식은 새로 만들지 않고 `receipt/schema.js:63`의 canonical을 쓴다.
argv는 `--`로 pathspec 경계를 못박는다(실측: 플래그 모양 인자가 옵션으로 해석되지 않고 exit 1).

**S2 (HIGH)** — `reseal.js`에 `fs.appendFileSync` 직접 호출이 **0건**임을 test가 스캔으로
단언한다. plan Acceptance가 이미 요구한 항목이고, 리뷰어의 지적은 그것이 "의도"로만 적혀 있고
기계 검사로 고정되지 않았다는 것이다 — 고정한다.

**S3 (MEDIUM이지만 여기서 흡수한다)** — §3.14는 MEDIUM을 backlog로 보내지만 이 건은 예외로
둔다. 지적 대상이 **지금 새로 쓰는 코드**이고, fence 제거 없이 짜 두고 "fence 제거를 추가하라"를
backlog에 남기는 것은 같은 코드를 두 번 쓰는 일이기 때문이다. DD9는 마커 방식이
"**클래스를 닫는다**"고 주장하는데, 인용 안의 마커가 통과하면 그 주장이 정확히 거짓이 된다 —
흡수는 plan 자신의 주장을 참으로 만드는 일이다.

**단, `intent-claims.stripQuotedStructures`를 재사용할 수 없다 (실측).** 그 함수는 HTML 주석을
위치 무관으로 제거하는데(`intent-claims.js:113` 주변 — type 2를 라인 스캐너 밖에서 처리한다)
DD9의 마커가 바로 HTML 주석 모양이라, 재사용하면 **진짜 마커까지 지워져** 모든 deferral이
거부된다. 실측: 마커 3종이 든 문서를 통과시키면 `accepts-inventory` 잔존 **0건**. 따라서
fence(백틱/틸드) · 4칼럼 이상 들여쓰기 · blockquote만 걷어내는 좁은 로컬 stripper를 쓰고,
**왜 공용 stripper를 쓰지 않는지를 코드 주석에 적는다** — 그러지 않으면 다음 독자가 중복으로 보고
"통합"하다가 마커 인식을 통째로 끈다.

**"정확히 1건" 규칙은 그대로 옮기지 않는다.** `intent-claims`에서 그 규칙이 필요한 이유는 답이
**스칼라**(어느 UI id인가)라 2건이 곧 모호성이기 때문이다. 여기서 답은 **집합 멤버십**이다 —
문서의 모든 well-formed 마커를 모아 `{현재 sha} ∪ {검증된 조상}`과 교집합이 비지 않으면 통과한다.
세대가 늘면 한 문서가 마커를 여럿 갖는 것이 **정상**이므로(DD9-b) 복수를 모호성으로 보면
N세대 누적이 조용히 깨진다. 스캔은 반드시 **전역**이어야 하고 단일 sha에 대한 `test()`가
아니어야 한다. 마커 하나하나가 여전히 사람의 명시 선언이므로 이 완화는 fail-open이 아니다.
스캔 비용은 문자 수 상한으로 유계이며 초과는 **거부**(fail-closed)다. 정규식은 `\s*`가 아니라
`[ \t]*`를 쓴다 — `\s`는 개행을 넘어 라인 앵커링을 무의미하게 만든다. backtracking 형태 없음
(실측: 20만 자 적대적 입력 1ms).

**S6 (LOW, 흡수)** — F1 흡수의 분기 4(manifest 부재)는 "봉인 doc에 `meta.supersedes`가 있고
현재 sha 결속 줄이 0건"을 고아 상태의 표지로 쓴다. 그런데 Task 5의 순서상 **봉인 write 직후
append 직전**에는 정상 실행도 정확히 그 형태를 띤다. 두 상태를 가르는 것은 manifest의 존재뿐이고,
그것은 step 0이 **항상** 봉인보다 먼저 쓰일 때만 성립한다. 그 창을 fixture로 재현하는 test를
추가한다 — 구성상 안전하다고 가정하지 않는다.

**S7 (LOW, 흡수)** — plan이 아카이브 파일명을 `<sha12>`로 3회 부르면서(`DD2` 조건 1 · Task 1
단계 2 · Task 5 단계 1) `Files to Change`의 구체 파일명은 `debt-inventory-f171a42e.json`(8자)이다.
쓰기 측과 읽기 측의 절단 길이가 어긋나면 조상이 **영원히 미검증**이 되므로 방향은 안전하지만
설계가 조용히 죽는다. **단일 상수 하나로 고정**하고 규칙 쪽(`sha12`)을 택한다 — 실제 산출 파일명은
`debt-inventory-f171a42e2c34.json`이 되어 `Files to Change`의 예시 문자열과 다르다. 이 이탈은
Phase 5 REPORT에 WHAT/WHY로 기록한다.

**신뢰 경계에 대한 리뷰어 판정 (지적 아님, 기록)** — DD2가 재계산을 "자기충족적"이라 부르고
git-tracked 조건을 "인덱스 멤버십이지 커밋 이력이 아니다"로 스스로 낮춘 것을 리뷰어가 확인했고,
그 둘이 드리프트·실수를 막을 뿐 §3.12 위협모델의 위조는 막지 못한다는 진술이 **과장이 아니라
정확하다**고 판정했다. 이 축에 finding은 없다.
