# Plan: santa 델타 리뷰 M1 — 델타 스코프 계산 + 상태 단언 금지 가드

**Source PRD**: `.claude/prds/santa-delta-review.prd.md`
**Selected Milestone**: 1 — 델타 스코프 계산 + 상태 단언 금지 가드
**Complexity**: Medium

## Summary

santa-loop의 라운드 2 이후 리뷰 스코프를 직전 라운드들이 커밋한 fix hunk 범위로 좁히되,
리뷰어에게 가는 것은 **범위 지정뿐**이고 "이전은 통과했다"류 상태 단언은 구조적으로 실을
자리가 없게 만든다. 축소는 새 순수 oracle `santa/scope-delta.js`와 CLI 하위명령
`scope-delta`가 계산하고, 상시 스코프(plan/PRD)는 축소 **뒤에** 합류하므로 면제가 특례가
아니라 순서로 성립한다. M1의 기본값은 `off`이며 발화는 명시 opt-in이다 — 탐지율 보존을
실측하는 것은 M2이고, 그 전에 리뷰 스코프를 좁히는 것이 PRD가 지목한 최상위 위험이다.

**축소 여부와 크기는 원장·receipt에 durable하게 남는다**(Task 4). 발화·미발화·강등 사유가
전부 라운드 단위로 기록되므로, "이 축이 실제로 착지했는가"와 "델타가 한 번도 발화하지
않았는가"를 세션이 끝난 뒤에도 receipt만으로 답할 수 있다 — 그것이 없으면 기본값 `off`가
영구화돼도 조용하다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이번 라운드 구현이 pass면 다음 리뷰에서 전체를 다시 보지 말고 수정 내역만 보게 한다 | direction |
| UI2 | 리뷰어에게 이전 라운드가 통과했다는 상태 단언을 전달하지 않는다 (승계 불변식 I2) | constraint |
| UI3 | 라운드 1에는 델타를 적용하지 않는다 — 초회는 전체 스코프가 정본이다 | exclusion |
| UI4 | P2의 상시 스코프(plan·PRD 정합)는 델타 축소에서 면제한다 | exclusion |
| UI5 | 리뷰어에게 원장을 주입하지 않는다 — 원장은 집계 단계가 읽는다 (I3) | exclusion |
| UI6 | PR·code-review 등 다른 게이트로 델타를 확장하지 않는다 — santa-loop 한정 | exclusion |
| UI7 | 패치 자체의 정당성 판단은 하지 않는다 — terminator가 소유한다 | exclusion |
| UI8 | 탐지율 하락이 검출되면 델타 비활성이 기본 동작이 된다 | constraint |
| UI9 | 합성 fixture의 한계를 acceptance에 명시하고 검증했다고 과대 주장하지 않는다 | constraint |
| UI10 | 게이트 리뷰는 1라운드를 기본으로 하고 계획을 다듬기보다 적용 후 결과로 판단한다 | direction |
| UI11 | 금지 패턴 열거보다 프롬프트 조립의 구조적 분리가 더 강한 통제다 | direction |

## Design Decisions

> 저자 근거다. `## User Intent`에는 넣지 않는다.

- **DD1 — 기본값은 `off`다.** 형제 santa 토글 4종(`BLIND_LANE`·`ALWAYS_SCOPE`·`TERMINATOR`·
  `DEGRADE_GATE`)은 전부 발화를 default에 두고 그 근거는 "오타가 kill switch를 켜면 그
  실행이 도입 이전과 똑같아 보인다"이다. 델타는 **방향이 반대**다 — 발화가 더 느슨한 쪽이고
  (스코프를 줄인다), 틀렸을 때의 대가가 PRD가 인용한 16~93%p 탐지율 하락이며, 그 하락 여부를
  재는 것이 아직 배송되지 않은 M2다. 검증 전에 발화를 기본으로 두는 것은 Risk 1을 그대로
  실행하는 것이다. dark ship 반론은 acceptance로 답한다 — M1은 `=enforce` 라이브 1회 완주를
  acceptance에 걸고, M2가 fixture 비교 후 default를 뒤집는다(그 인계를 PRD 본문에 명시한다).
  비대칭 자체는 `docs/environment/review.md`에 적는다.
- **DD2 — 축소는 diff 스코프에만, 상시 스코프 합류 전에 일어난다.** 순서가
  `diff → scope-delta → scope-always`이므로 UI4의 면제가 조건 분기가 아니라 **순서**로
  성립한다. 특례로 구현하면 그 특례를 잊는 경로가 생긴다.
- **DD3 — 프롬프트에는 범위만 실린다(UI11).** `renderScopeLines`는 `{paths, ranges}` 두
  인자만 받고 서술 인자가 **없다**. `lanes.js#buildBlindPrompt`가 파일 내용을 실을 인자를
  없앤 것과 같은 수단이다. 금지 패턴 목록은 그 위에 얹는 벨트이지 1차 통제가 아니다.
- **DD4 — 금지 패턴은 두 목록으로 나눈다.** rubric은 본문 규약상 "PASS/FAIL condition"을
  포함하므로(Step 2), 단일 목록을 전체 프롬프트에 걸면 정상 rubric이 매 라운드 터진다.
  `SCOPE_ASSERTION_PATTERNS`(엄격 — pass/승인/문제없음/approved/clean)는 **델타가 렌더한 줄**
  에만 걸고, `PRIOR_ROUND_PATTERNS`(좁음 — "이전 라운드"/"이미 검토"/"already reviewed"/
  "previously approved" 류 직전-라운드 상태 단언)는 조립된 프롬프트 **전체**(rubric 포함)에
  건다. 후자가 UI2를 caller-authored rubric까지 덮는 유일한 통제다.
- **DD5 — 후자의 검사는 `applied=true`인 라운드에만 건다.** 오탐이 정상 라운드를 막지 않게
  폭발 반경을 델타 라운드로 묶는다. M1에서 델타는 opt-in이므로 그 반경은 다시 opt-in 안이다.
- **DD6 — 누적이다(OQ 5).** 델타 = **존재하는 fix anchor 전부**의 hunk 합집합(라운드 N
  진입 시점에 그것이 라운드 0..N-1의 anchor다 — Task 2가 라운드 번호를 쓰지 않는 근거).
  비누적이 축소 효과는 크지만 "라운드 1이 rev0을 제대로 봤다"에 의존한다. 캡 기본 3에서
  누적 대상은 최대 2~3개 fix 커밋이라 축소 효과는 여전히 압도적이고, 안전한 쪽이 싸다.
- **DD7 — 문맥 폭은 상수 20줄이다(OQ 2).** env를 하나 더 만들지 않는다. 블라인드 레인은
  포인터만 받고 리뷰어가 자기 도구로 파일 전체를 읽으므로 문맥 부족이 구조적으로 없고,
  상수가 실제로 묶는 것은 번들 레인의 재현성이다. 값의 타당성은 `before`/`after` 스코프
  크기가 매 실행 관측되므로 사후 조정 가능하다.
- **DD8 — 모르면 좁히지 않는다.** anchor 부재·rev 형식 이탈·`git show` 실패·hunk 0건·
  축소 결과가 빈 집합 — 전부 **전체 스코프 passthrough**이고 사유 토큰이 붙는다.
  `patchRangesFrom`의 "모르면 종료하지 않는다"와 같은 방향이다.
- **DD9 — 삭제·이동은 이미 닫혀 있다(OQ 3).** `DIFF_FILE_RE`가 `+++ b/`만 앵커하므로
  `+++ /dev/null`(삭제)은 집합에 열리지 않고, rename은 새 경로가 `+++ b/<new>`로 잡힌다.
  M1은 이 성질을 **회귀 test로 고정**할 뿐 코드를 바꾸지 않는다.
- **DD10 — 계측은 M1이 소유한다.** 초안은 durable 봉인을 M2로 이연했으나 L2 패널
  (invariant, HIGH 3건)이 한 축으로 수렴해 반박했다: 이연을 명시해도 **계측 없는 축은 착지
  여부를 사후에 못 가린다**. 구체적으로 (1) Task 10의 증거가 손으로 쓴 노트뿐이라 세션이 죽으면
  사라지고, (2) `applied=false` 강등이 세션 경계를 넘기면 흔적이 없으며, (3) M2가 밀리면
  기본값 `off`가 조용히 영구화된다. 셋 다 원장 라운드 레코드 + `seal` + receipt 2필드로 닫힌다
  (Task 4). 형제 축의 선례가 그대로 있다 — `santa_blind_records`/`santa_blind_rounds`
  (`seal.js:493-496` · `write.js:764-765`)와 M3의 degrade 관측 3종이 같은 조건부 재료화
  규약을 쓴다. 그 규약이라 **미전달 receipt는 키 자체를 갖지 않고 canonical hash가
  무변동**이므로 §3.12의 tracked ship corpus 해시 안정성이 유지된다.
- **DD11 — 계측 필드는 관측이지 게이트가 아니고, 위조 저항을 주장하지 않는다.**
  `--scope-file`이 나르는 수치는 호출자가 쓴 것이고 CLI가 git으로 재도출하지 않는다.
  `record --lane`/`record --model`이 재도출로 닫은 것과 **다른 자세**이며, 그 차이의 근거는
  이 필드를 읽는 게이트가 없다는 것이다 — 위조가 사는 것이 0이다. santa-loop.md Notes에
  그 천장을 `--lane`·`--model` 항목과 같은 형태로 적는다.
- **DD12 — 관측은 kill switch와 무관하게 stamp한다.** `off` 실행도
  `santa_delta_rounds=0`을 남긴다. M3의 degrade 관측 3종이 같은 근거로 그렇게 한다 —
  **필드 부재는 "이 축이 없던 시절"이고 관측된 0과 다른 상태**다. 이것이 없으면 `off` 실행이
  M1 이전 실행과 구별되지 않고, 그것이 정확히 DD10이 닫으려는 결함이다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle 경계 | `plugins/mccp/scripts/lib/santa/scope-always.js:26-40` | fs·git·시각을 모르고 env 파서 1종만 읽는다. 파일 읽기·git 호출은 전부 `cli.js`가 진다 |
| env 파서 | `plugins/mccp/scripts/lib/santa/lanes.js:80-93` | 미설정=default, 열거 밖=loud stderr warn 후 default, trim+소문자 정규화, 던지지 않음 |
| 미발화 사유 토큰 | `plugins/mccp/scripts/lib/santa/terminator.js:56-62` | 자유 문장이 아니라 고정 하이픈 토큰 enum. 어느 항이 막았는지를 그대로 지목 |
| 실을 자리를 없앤다 | `plugins/mccp/scripts/lib/santa/lanes.js:150-160` | `buildBlindPrompt`에 파일 내용을 실을 **인자가 없다**. 사후 검사 대신 자리를 제거 |
| hunk 범위 추출 | `plugins/mccp/scripts/lib/santa/cli.js:663-720` | `git show --unified=0` → `{file:[[start,end]]}`. 부재·불량은 오류가 아니라 빈 집합 |
| 경로 열거 (주입 없음) | `plugins/mccp/scripts/lib/santa/cli.js:1166-1186` | 호출자 경로를 받지 않고 `readdirSync` + 리터럴 prefix 매칭으로 자체 열거 |
| 관측 stderr 라인 | `plugins/mccp/commands/santa-loop.md` Step 1 always-on 블록 | 축이 무엇을 했는지 매 실행 stderr로 표면화 — 0건 라운드가 미도입 라운드와 구별되게 |
| 커맨드 본문 정적 단언 | `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | 본문의 배선·순서를 test가 리터럴로 고정 (산문 불이행이 아니라 배선 누락을 잡음) |
| env 4면 등재 | `env-contract/registry.js:120` + `docs/ENVIRONMENT.md:94` + `docs/environment/review.md:315` | registry 1행 → §11 색인 1행 → 상세 절 1개 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/scope-delta.js` | CREATE | 순수 oracle — env 파서·범위 확장·축소 판정·금지 패턴 2목록·범위 렌더 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | `scope-delta` 하위명령 + anchor 열거. `patchRangesFrom` 재사용, `lanes`에 `--ranges-file` 추가 |
| `plugins/mccp/scripts/lib/santa/lanes.js` | UPDATE | `buildBlindPrompt`가 `ranges`를 받아 `- path:12-40` 형태로 렌더 + `PRIOR_ROUND_PATTERNS` 단언 |
| `plugins/mccp/scripts/lib/santa/ledger.js` | UPDATE | 라운드 레코드에 additive present-only `scope` 저장 (`beginRound` 신규 push 분기 한정) |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATE | `project()`가 `scope`를 투영 + `deltaCoverageFrom`을 `writeArgs`에 stamp |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `SANTA_INT_FIELDS`에 2행 (`santa-delta-rounds` · `santa-delta-paths-dropped`) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | 위 2필드의 present-only 비음 정수 검증 |
| `plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js` | CREATE | 원장 저장·투영·집계·stamp·부재 구분 회귀 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | Step 1에 델타 삽입(상시 스코프 **앞**), Step 3 `--ranges-file`, 번들 레인 지시, Notes |
| `plugins/mccp/scripts/lib/tests/santa-scope-delta.test.js` | CREATE | oracle 회귀 — 축소·누적·경계·passthrough·금지 패턴 |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | UPDATE | ranges 렌더 + 조립된 프롬프트의 상태 단언 0건 단언 |
| `plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js` | CREATE | 본문 배선·순서 정적 단언 (델타가 상시 스코프보다 앞) |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_SANTA_DELTA_SCOPE` 1행 |
| `docs/ENVIRONMENT.md` | UPDATE | §11 색인 1행 |
| `docs/environment/review.md` | UPDATE | 상세 절 1개 — default 비대칭 근거 포함 |
| `.claude/prds/santa-delta-review.prd.md` | UPDATE | M1 행 `pending`→`in-progress` + Plan 셀, OQ 1·2·3·5 해소 표기 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.30.0` → `1.30.1` (§3.7 patch — 2 milestone 중 1번째) |
| `CHANGELOG.md` | UPDATE | `[1.30.1]` 항목 + `currently` 노트 동기 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |

## Tasks

### Task 1: `scope-delta.js` 순수 oracle
- **Action**: export — `ENV_DELTA_SCOPE`, `DELTA_SCOPE_DEFAULT`(`off`), `DELTA_SCOPE_VALUES`,
  `parseDeltaScope(env)`, `CONTEXT_LINES`(20), `NO_NARROW`(사유 토큰 enum:
  `env-off`·`no-anchor`·`no-ranges`·`empty-result`), `expandRanges`,
  `narrowScope({mode, diffPaths, patchRanges})`,
  `renderScopeLines({paths, ranges})`, `SCOPE_ASSERTION_PATTERNS`, `PRIOR_ROUND_PATTERNS`,
  `assertNoStatusAssertion(text, patterns)`.
  `narrowScope`는 어떤 입력에도 던지지 않고 `{applied, reason, paths, ranges, before, after}`
  를 낸다.

  **`paths`의 의미를 양쪽 경우 모두 명시한다**(L2 architect MEDIUM 흡수 — 초안이 false
  경우만 적었다). `applied=false`면 입력 그대로이고 `ranges`는 빈 객체다. `applied=true`면
  **`diffPaths` ∩ `keys(ranges)`**, 즉 fix 커밋이 건드리지 않은 파일은 목록에서 **빠진다**
  (diff 순서 보존). 그 제거가 곧 축소이고 `before - after`가 `santa_delta_paths_dropped`의
  정의다. UI4의 면제는 이것과 충돌하지 않는다 — DD2대로 `scope-always`가 **그 뒤에** plan/PRD를
  붙이므로, 여기서 빠진 파일이 plan/PRD였더라도 되돌아온다.
  `expandRanges`는 각 범위를 앞뒤 `CONTEXT_LINES`만큼 넓히고 1 미만은 1로 clamp한 뒤
  겹치는 범위를 병합한다. `renderScopeLines`는 자기 출력에 `SCOPE_ASSERTION_PATTERNS`를
  스스로 걸어 위반 시 던진다(DD3의 구조를 미래 편집으로부터 동결).

  **두 패턴 목록은 예시가 아니라 닫힌 리터럴 집합이다**(L2 invariant MEDIUM 흡수).
  모듈에 정규식 배열로 고정하고 test가 그 **원소 집합 자체를 pin**한다 — 원소를 지우면
  test가 붉어지므로, 목록이 조용히 줄어드는 경로가 없다. 초기 원소:
  `SCOPE_ASSERTION_PATTERNS` = `pass(ed)?` · `승인` · `문제\s*없` · `approved` · `clean` ·
  `no issues` · `looks good`; `PRIOR_ROUND_PATTERNS` = `이전\s*라운드` · `직전\s*라운드` ·
  `이미\s*(검토|리뷰|확인)` · `previous(ly)?\s+round` · `earlier\s+round` ·
  `already\s+(reviewed|approved|checked)` · `previously\s+approved`. 전부 대소문자 무시.
  **완결성은 주장하지 않는다** — 열거식의 우회 가능성은 Risks 1행이 천장으로 명시하고
  1차 통제는 DD3의 구조 분리다. 목록의 값은 caller-authored rubric까지 덮는 것뿐이다.
- **Mirror**: `scope-always.js` 모듈 헤더 + env 파서 · `terminator.js` `NO_FIRE` 토큰 enum
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-scope-delta.test.js`

### Task 2: `cli.js` — `scope-delta` 하위명령 + anchor 열거
- **Action**: `--decision`은 다른 모든 하위명령과 동일하게 `baseOpts(args)`가 해석한다
  (L2 architect LOW 흡수 — 초안 명세가 이 인자를 빠뜨렸다). 자체 인자는
  `--paths-file`(필수, diff 스코프 JSON 배열) **하나뿐이다**.

  **`--round`는 없다**(L2 architect HIGH 흡수). 초안은 `--round`를 필수로 두고 이 명령을
  Step 1에 배치했는데, `$ROUND`는 Step 3의 `begin-round`가 비로소 할당하므로 명세가 자기
  모순이었다. 해소는 인자를 옮기는 것이 아니라 **없애는 것**이다 — 델타가 `--round`로
  답하려던 질문은 "어느 anchor가 직전 것인가"인데, `.claude/state/santa-loop/tmp/<decision>/`에
  **존재하는 anchor 집합이 이미 그 답**이다. anchor는 Step 5(NAUGHTY 경로)가 닫힌 라운드마다
  하나씩 쓰므로, 라운드 0 진입 시점에는 0개이고 라운드 N 진입 시점에는 N개 이하다. 따라서
  "라운드 1에는 델타 미적용"(UI3)이 별도 검사가 아니라 **anchor 0개 → `no-anchor`
  passthrough**로 성립한다. 라운드 번호를 여기서 재도출하면 `counter.decideRound`와 판정
  자리가 둘이 되어 갈릴 수 있는데, 그 자리 자체가 사라진다.

  anchor는 호출자에게서 받지 않고 위 디렉토리를 `readdirSync`로 열어 `round-<r>-fix-rev.txt`
  만 리터럴 매칭으로 수집한다(`discoverSlugPlans` 동형 — 경로 주입 표면을 설계로 제거).
  각 rev를 기존 `patchRangesFrom`에 태워 합집합을 만들고 `narrowScope`에 넘긴다. stdout 1회:
  `{mode, applied, reason, revs, paths, ranges, before, after}`.
  판정은 exit 0(보고이지 게이트가 아님 — `check-termination` 동형), usage 오류만 exit 2.
  `lanes`에는 선택 `--ranges-file`을 추가하고 `buildBlindPrompt`로 forward한다.

  **`runCli`의 dispatch switch와 `usage()`를 함께 갱신하고, 그 동기를 test가 pin한다**
  (L2 test HIGH ×2 흡수). 초안은 둘 다 load-bearing이라고 **선언만** 하고 기계적 강제를
  두지 않았다 — switch만 갱신하고 `usage()`를 잊으면 모든 단위 test가 통과하고 결함은 Task
  10 라이브 실행에서야 드러난다. 그 상태는 이 plan이 스스로 적은 "단위 test 통과 ≠ 경로
  작동"에 기대는 것이고, 지금 기계화 가능한 것을 라이브에 미루는 것은 그 문장의 용법이
  아니다. Task 6에 **dispatch↔usage 동기 test**를 둔다(아래).
  신규 exit code는 만들지 않는다 — 기존 `EX_OK`/`EX_USAGE` 매핑을 그대로 쓴다.
- **Mirror**: `cmdScopeAlways`(전 검증 후 단일 `out()`) · `cmdCheckTermination`(항상 exit 0)
- **Validate**: test에서 임시 git fixture repo로 `runCli` 직접 호출

### Task 3: `lanes.js` — 범위 렌더 + 상태 단언 차단
- **Action**: `buildBlindPrompt`에 `ranges`(객체) 인자를 더한다. `## Target paths` 목록의
  각 줄은 `scope-delta.renderScopeLines`가 만든다 — 범위가 있으면 `- path:12-40, 88-95`,
  없으면 `- path`. **서술 인자는 더하지 않는다.** 범위가 하나라도 있으면(=델타 라운드)
  조립 직후 `assertNoStatusAssertion(prompt, PRIOR_ROUND_PATTERNS)`를 걸고 위반 시 던진다.
  `MAX_TARGET_PATHS` 절삭과 `TRUNCATED:` 줄은 무변경.
- **Mirror**: `lanes.js:150-160`(실을 자리를 없앤다) · `DO_NOT_TRUST_NARRATIVE` 고정 문구
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 4: durable 계측 — 원장 · seal · receipt (DD10~DD12)
- **Action**: 4개 층을 잇는다. 각 층은 형제 축(blind lane)이 이미 지나간 자리다.
  1. **원장** — `ledger.beginRound`가 라운드 레코드에 additive present-only `scope`
     (`{applied, reason, before, after}`)를 쓴다. **신규 push 분기에서만** 쓰고 멱등
     OPEN 분기(`write:false`)는 손대지 않는다 — 같은 라운드의 두 번째 `begin-round`가
     첫 기록을 덮으면 "이 라운드가 무엇으로 열렸는가"가 흔들린다.
     `SCHEMA_VERSION`은 **올리지 않는다**(`ledger.js:50` 주석 — 올리면 기존 원장이 전부
     `SANTA_LEDGER_CORRUPT`로 읽히고 캡이 무의미해진다). `terminated` 필드가 같은 방식으로
     additive하게 들어온 선례다.
  2. **CLI** — `cmdBeginRound`에 선택 **스칼라 플래그 4종**을 더한다:
     `--scope-applied`(`true`/`false`) · `--scope-reason`(`NO_NARROW` 열거 ∪ 부재) ·
     `--scope-before`(정수 ≥0) · `--scope-after`(정수 ≥0). 넷이 다 있고 전부 유효할 때만
     `scope`를 기록하고, 하나라도 빠지거나 어긋나면 **기록하지 않는다**(부분 기록 금지 —
     `applied` 없는 `before`는 아무 뜻이 없다). 넷 다 부재는 정상(델타 미사용 실행)이다.

     **JSON 파일을 받지 않는다**(L2 security HIGH 흡수). 초안은 `--scope-file`로 Task 2의
     JSON을 그대로 받으라고 했는데, `cli.js:76-79`가 문서화한 prototype pollution이 정확히
     그 경로다 — `JSON.parse`가 `__proto__`를 own property로 만들고, 이 값은 **원장에
     durable하게 저장**돼 뒤에 `seal.js`의 `Object.assign` 경로로 흘러간다. `loadReviewer`는
     그래서 `assertSafeGraph`를 부르는데, 초안은 "`--reviewer-file` 동형"이라고만 적고 그
     단계를 명세하지 않았다. 해소는 검증을 나열하는 것이 아니라 **파싱을 없애는 것**이다:
     스칼라 4개는 `parseFlags`가 문자열로만 만들 수 있어 그래프가 존재하지 않고, 따라서
     오염될 객체도 malformed JSON도 없다(`--lane`·`--model`·`--id`가 이미 스칼라다).
     이것이 `lanes.buildBlindPrompt`에서 "실을 자리를 없앤다"를 쓴 것과 같은 수단이다.

     남은 검증은 **값 검증뿐**이고 그것을 명시한다: `applied`는 두 리터럴 중 하나,
     `reason`은 `NO_NARROW` 열거의 원소(자유 문자열 금지 — 열거 밖은 기록 거부),
     `before`/`after`는 `Number.isInteger` ∧ ≥0 ∧ `after` ≤ `before`. 이 넷이 원장에 들어가는
     `scope`의 스키마 전부이며, `parseState`가 라운드 내부를 검사하지 않으므로(L2 security
     MEDIUM) **쓰기 시점의 이 검증이 유일한 관문**이라는 사실을 코드 주석에 남긴다.
  3. **집계 + seal** — `scope-delta.js`에 `deltaCoverageFrom(projection)` →
     `{deltaRounds, pathsDropped, rounds}`를 더한다(`lanes.laneCoverageFrom` 동형: 순수,
     어떤 입력에도 던지지 않음). `seal.project()`가 `scope`를 투영하되 형태가 어긋나면
     `null`로 접는다(`lane` fold와 같은 이유 — 모르는 값을 리포트가 보여주고 집계는 세지
     않으면 두 표면이 갈린다). `seal`은 `laneCoverage` 블록(`seal.js:493-496`) 바로 옆에
     같은 `rounds >= 1` 가드로 `writeArgs['santa-delta-rounds']` +
     `writeArgs['santa-delta-paths-dropped']`를 stamp한다. **kill switch와 무관하게**
     stamp한다(DD12).
  4. **receipt** — `write.js`의 `SANTA_INT_FIELDS` 표에 2행(min 0), `schema.js`에
     present-only 비음 정수 검증 2건. 조건부 재료화 규약이라 미전달 receipt는 키를 갖지
     않고 canonical hash가 무변동이다(§3.12).
- **Mirror**: `seal.js:493-496`(laneCoverage stamp) · `write.js:764-765`(SANTA_INT_FIELDS)
  · `schema.js:1041-1047`(present-only 비음 정수) · `ledger.js:296`(`terminated` additive)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js`

### Task 5: `santa-loop.md` 배선
- **Action**: Step 1에서 diff 스코프 확정 직후, `scope-always` **앞에** `scope-delta` 블록을
  삽입한다(DD2 — 순서가 UI4 면제다). always-on과 같은 형태로 (a) 파싱 여부를 먼저 묻고
  (b) 관측 stderr 라인을 매 실행 낸다(`mode`/`applied`/`reason`/`before`→`after`/`revs`).
  **Step 1의 데이터 흐름을 명세한다**(L2 architect MEDIUM 흡수 — 초안이 "always-on과 같은
  형태로"라고만 적고 ranges의 생존 경로를 비웠다). 순서와 변수가 계약이다:

  1. 기존대로 `SCOPE_PATHS_JSON`(diff)을 만들고 `$TMPDIR_SANTA/scope-diff.json`에 쓴다.
  2. `scope-delta --paths-file "$TMPDIR_SANTA/scope-diff.json"` 호출. 출력을
     `$TMPDIR_SANTA/delta.json`에 보존한다 — Step 3이 라운드 번호를 알기 전이라 파일명에
     `$ROUND`를 쓸 수 없다(그 의존이 architect HIGH의 뿌리였다).
  3. `paths` 배열이 **존재하는지 먼저** 묻고(`PATHS_STATE` 3상태 검사 동형: `absent`는
     producer 고장 → 정지, `empty`는 정상 → 정지 없이 상위 규약대로), 통과하면
     **`SCOPE_PATHS_JSON`을 그 값으로 교체**한다. 이것이 축소 지점이다.
  4. `ranges`는 `$TMPDIR_SANTA/delta-ranges.json`으로 따로 뽑는다. Step 3이 이 파일을
     `lanes --ranges-file`에 그대로 넘기므로 라운드 번호가 필요 없다.
  5. `scope-always`를 **그 다음에** 호출해 `SCOPE_PATHS_JSON`을 다시 교체한다(DD2 — 상시
     항목이 축소 뒤에 붙으므로 UI4 면제가 순서로 성립).
  6. `APPLIED`/`REASON`/`BEFORE`/`AFTER`를 `delta.json`에서 뽑아 Step 3의 `begin-round`
     스칼라 4종(Task 4)으로 넘긴다.

  번들 레인에는 "이 범위에 해당하는 파일을 그 범위 중심으로 싣는다"만 지시하고 이전 라운드
  상태를 서술하지 않는다. Notes에 델타 축 5항목(범위만 전달 · 상시 스코프 면제 · 누적 ·
  기본 off와 그 이유 · 계측 2필드와 **그 위조 저항 천장**(DD11 — `--lane`·`--model`
  항목과 같은 형태로))을 더한다.
- **Mirror**: Step 1 always-on 블록의 `PATHS_STATE` 3상태 검사 + 관측 라인
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js`

### Task 6: 회귀 test
- **Action**: (a) oracle — 라운드 0 passthrough, `off` passthrough, anchor 부재 passthrough,
  누적 합집합, 문맥 확장·병합·clamp, 축소 결과 빈 집합 시 passthrough, 삭제 파일 미포함,
  rename 새 경로 포함(DD9); (a2) **dispatch↔usage 동기** — `cli.js` 소스를 읽어 `runCli`
  switch의 `case '<name>':` 집합과 `usage()` 본문이 명명하는 하위명령 집합을 뽑아 **양방향
  동일**을 단언한다(`scope-delta` 한 건만 검사하지 않는다 — 한 건만 pin하면 다음 하위명령이
  같은 방식으로 새고, 두 집합의 동일성은 지금 전부 성립한다). 이것이 L2 test HIGH가 요구한
  기계적 강제이고, 라이브 실행(Task 10) 이전에 붉어진다; (b) I2 — `renderScopeLines` 출력에 `SCOPE_ASSERTION_PATTERNS`
  0건, 조립된 블라인드 프롬프트에 `PRIOR_ROUND_PATTERNS` 0건, 그리고 "PASS/FAIL condition"을
  담은 **정상 rubric이 통과한다**는 단언(DD4의 오탐 경계를 test가 고정); (c) 본문 정적 단언 —
  `scope-delta` 호출이 `scope-always` 호출보다 **앞**에 있고 `--ranges-file`이 `lanes`에
  넘어간다.
- **Mirror**: `santa-lanes.test.js` · `review-single-pass-command-body.test.js`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-*.test.js`

### Task 7: env 등재 3면
- **Action**: `registry.js`에 `MCCP_SANTA_DELTA_SCOPE` 1행(enum `enforce`/`off`, default
  `off`, status `active`, group `review`, 소비처 `scope-delta.js:<line>`).
  `docs/ENVIRONMENT.md` §11에 색인 1행. `docs/environment/review.md`에 상세 절 —
  **default가 형제 토글과 반대 방향인 이유(DD1)와 M2가 뒤집는다는 인계**를 명시.
- **Mirror**: `MCCP_SANTA_ALWAYS_SCOPE` 3면 — `plugins/mccp/scripts/lib/env-contract/registry.js:120`
  · `docs/ENVIRONMENT.md:94` · `docs/environment/review.md:315`
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js`

### Task 8: PRD 갱신
- **Action**: Delivery Milestones M1 행을 `in-progress` + Plan 셀
  `.claude/plans/santa-delta-review-m1.plan.md`. Open Question 1(열거 vs 구조) · 2(문맥 폭) ·
  3(삭제·이동) · 5(누적)를 M1 결정으로 해소 표기하고, **4(fixture 출처)는 M2 소유로 남긴다**.
  Success Metrics 2행(스코프 축소 실효)에 "M1은 실행 단위 관측, durable 봉인은 M2"를 부기.
  M2 인계로 "fixture 비교가 하락 없음을 보이면 default를 `enforce`로 뒤집는다"를 명시.
- **Mirror**: `santa-evidence-diversity.prd.md`의 milestone/OQ 갱신 관행
- **Validate**: `git diff .claude/prds/santa-delta-review.prd.md`

### Task 9: version 4면 동기
- **Action**: `plugin.json` `1.30.0` → `1.30.1`, `renderer/html.js` page-foot,
  `renderer/markdown.js` derived 줄, `CHANGELOG.md` `[1.30.1]` 항목 + `currently` 노트.
  §3.7대로 **머지 해소 시점과 `/mccp:pr` 진입 직전에 번호를 재계산**한다.
- **Mirror**: CHANGELOG `[1.30.0]` 항목의 §3.7 노트 형식
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 10: 라이브 완주 1회 (acceptance)
- **Action**: `MCCP_SANTA_DELTA_SCOPE=enforce`로 라운드 2 이상인 santa-loop을 실제로 돌려
  (a) `scope-delta` 관측 라인, (b) `before` > `after`인 실측 수치, (c) 조립된 블라인드
  프롬프트 본문에 범위가 실리고 상태 단언이 0건인 것, (d) **봉인된 receipt의
  `meta.santa_delta_rounds` ≥ 1 · `meta.santa_delta_paths_dropped` > 0**을 확인하고
  산출물을 `.claude/notes/santa-delta-review-m1.md`에 남긴다.
  **(d)가 1차 증거이고 노트는 서술이다** — 노트는 손으로 쓰므로 세션이 죽으면 사라지지만
  receipt는 남는다(DD10). 노트 유실이 acceptance를 무효화하지 않는다.
- **Mirror**: santa-evidence-diversity M1~M3의 `.claude/notes/` 실측 기록 관행
- **Validate**: 노트에 3항목 증거가 실재

## Validation

```bash
node --test plugins/mccp/scripts/lib/tests/santa-scope-delta.test.js
node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js
node --test plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js
node --test plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js
node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js \
            plugins/mccp/scripts/lib/tests/santa-gate.test.js \
            plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js \
            plugins/mccp/scripts/lib/tests/santa-seal.test.js
node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js
node plugins/mccp/scripts/lib/env-contract/lint.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
```

## Out of scope for M1 (명시 이연)

- **탐지율 fixture 비교** — PRD Milestone 2 소유. M1은 탐지율 보존을 **주장하지 않는다**.
  M1이 세우는 계측(Task 4)은 *스코프가 얼마나 줄었는가*를 재고, *줄여도 결함을 놓치지
  않는가*는 재지 않는다. 둘은 다른 질문이고 후자가 M2다.
- **default 뒤집기** — M2가 하락 없음을 보인 뒤. M1은 `off`로 배송한다.
- **다른 게이트로의 확장**(UI6) · **패치 정당성 판정**(UI7) · **원장 주입**(UI5).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 구조적 분리를 뚫고 상태 단언이 caller-authored rubric으로 새어 든다 | Medium | `PRIOR_ROUND_PATTERNS`를 조립된 프롬프트 전체에 걸어 델타 라운드에서 차단(DD4). **천장을 명시**: 이 목록도 열거식이라 우회 가능하고, M1이 강제하는 명제는 "델타 축이 생성한 텍스트에 단언 0건"이지 "리뷰어가 아무것도 추론하지 못한다"가 아니다 |
| 범위 지정 자체가 "나머지는 통과했다"는 추론을 유발한다 | High | **닫지 못한다 — PRD Hypothesis가 이미 "상태 단언 문구 0건"으로 범위를 그었다.** 어떤 델타 구현에도 남는 잔여 편향이고, 실측은 M2 fixture가 한다. 여기서 없다고 주장하지 않는다 |
| `PRIOR_ROUND_PATTERNS` 오탐이 정상 라운드를 막는다 | Low | 검사를 `applied=true` 라운드로 한정(DD5) + M1 default `off`. 정상 rubric("PASS/FAIL condition") 통과를 test가 고정 |
| 델타 밖 실재 결함이 영구 미검출 | Medium | 라운드 1 전체 리뷰 + UI4 상시 스코프 면제 + 누적(DD6). 종료 판정은 terminator 소유이므로 델타는 주의 배분일 뿐 |
| dark ship — default `off`라 아무도 켜지 않고, M2가 밀리면 영구 비활성이 된다 | Medium | Task 10 라이브 완주 + M2 인계 명시(Task 8)에 더해, **Task 4의 `santa_delta_rounds`가 이것을 관측 가능하게 만든다** — `off` 실행도 0을 stamp하므로(DD12) "델타가 한 번도 발화하지 않았다"가 receipt 집계에서 드러난다. 영구 비활성이 **조용할 수 없다**는 것이 이 축이 사는 전부이며, 발화를 보장하지는 않는다 |
| 계측 수치가 위조 가능하다 (`--scope-file`은 재도출되지 않는다) | Medium | **닫지 않는다 — DD11이 천장으로 명시한다.** 이 필드를 읽는 게이트가 없어 위조가 사는 것이 0이고, `record --lane`/`--model`의 재도출과는 다른 자세임을 santa-loop.md Notes에 같은 형태로 적는다 |
| anchor 파일이 gitignored tmp라 worktree 리셋에서 사라진다 | Medium | DD8 — 부재는 전체 스코프 passthrough이고 사유 토큰 `no-anchor`가 붙는다. 손실 방향이 안전한 쪽이고, 그 강등은 Task 4가 `scope.applied=false` + `reason`으로 원장에 남긴다(세션을 넘겨도 흔적이 있다) |
| 병렬 브랜치 version 충돌 (§3.7 실측 4회 재발) | Medium | 머지 해소 시점 + `/mccp:pr` 진입 직전 2회 재계산. 재상향 시 4면 + CHANGELOG 헤딩 재검증 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) —
      구체적으로: `MCCP_SANTA_DELTA_SCOPE=enforce`로 라운드 2 이상인 santa-loop을 실행해
      (a) `[santa] delta scope:` 관측 라인이 `before` > `after`를 실측으로 보이고,
      (b) `lanes` 출력 프롬프트의 `## Target paths`에 `path:start-end` 형태가 실재하며,
      (c) 그 프롬프트에 `PRIOR_ROUND_PATTERNS` 매치가 0건이고,
      (d) 봉인된 `mccp-santa-review` receipt가 `meta.santa_delta_rounds` ≥ 1 과
      `meta.santa_delta_paths_dropped` > 0 을 갖는 것을 확인한다. (d)가 세션을 넘겨 남는
      1차 증거이고 `.claude/notes/santa-delta-review-m1.md`는 그 서술이다
- [ ] `off` 실행이 `santa_delta_rounds=0`을 stamp해 **필드 부재(M1 이전)와 구별된다**
      (DD12) — 이것이 없으면 kill switch가 이 축을 조용히 되돌린다
- [ ] M1은 탐지율 보존을 주장하지 않는다 — 합성 fixture조차 아직 없고 비교는 M2 소유임이
      PRD와 이 plan 양쪽에 적혀 있다 (UI9)

## Design Critique

round=0/2 verdict=CONVERGED (design-critique-decide, v1.3.0-m2 retry loop)

detector가 `design_signal=true`를 낸 근거는 `signal_files` 5건이고 어느 것도 렌더 표면 변경이
아니다 — `renderer/html.js` · `renderer/markdown.js` · `renderer/tests/i18n-surface.test.js`는
Task 9의 **version 문자열 4면 동기**로만 등장하고, `receipt/write.js`는 Task 4의
`SANTA_INT_FIELDS` 표에 정수 2행을 더할 뿐이며, `status.html`은 Out of scope 서술의
`.claude/cache/` 언급이다. 이 milestone은 렌더 표면에 항목·색·위계를 하나도 추가하지 않는다.

4개 Output Constraints 대조 (SKILL.md `## Output Constraints`):

| 제약 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | PASS | 이 plan은 `#`/`##`/`###`만 쓴다. 렌더 표면 추가 0건 |
| 강조색 화면당 1개 | PASS | accent token 변경 0건 — 바뀌는 것은 page-foot의 version 문자열뿐 |
| raw markdown marker 금지 | PASS | 렌더 파이프라인 무변경. version 문자열은 마커를 포함하지 않는다 |
| 한 화면 항목 수 상한 (top 3 + collapse) | PASS (미적용) | 이 제약의 대상 표면은 렌더된 `status.html`의 `list-of-N` 섹션이고, 이 milestone은 거기에 항목을 더하지 않는다. plan 본문 표에 적용하지 **않는** 이유는 별도로 있다 — `receipt/dedupe.js`의 planned matcher가 `Files to Change` 표의 첫 열을 파싱하므로 행을 `<details>`로 접으면 dedupe가 그 파일들을 못 본다 |

HIGH/CRITICAL 잔여 0건이므로 R0에서 수렴한다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤
impeccable 명령도 **호출하지 않는다** — 아래는 구현자용 체크리스트다. 본 milestone은
렌더 표면을 바꾸지 않으므로 실제 라우팅은 `renderingSurface=0`으로 강등될 전망이다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
