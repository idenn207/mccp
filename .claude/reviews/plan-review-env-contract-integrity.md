# Plan Review Panel — env-contract-integrity

**Plan**: `.claude/plans/env-contract-integrity-m4.plan.md` · **Plan version**: `sha256:28a3bf8ae83db4f125a01cc44208fe58416002de8012439de5d40c3deb3122f3`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 10 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, security/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 1의 `not-consumed` 규칙(`evidenceLine: null` + `compareDerived`가 줄의 **부재**를 요구)은 현재 코퍼스와 정합하지 않는다. 19건 전부 지금 `**소비처**` 줄을 갖고 있으므로 L13은 켜는 순간 측정되지 않은 19건에서 붉어진다 — UI5("먼저 채우고 켠다")와 G3의 "165건 중 31건" 산정이 함께 무너진다. | plan.md:167-168 "오늘 19건 전부 드리프트 목록에 없으므로 이 규칙은 현재 코퍼스와 정합한다" ↔ plan.md:75 G2 표 "`**한 줄**` / `**소비처**` 줄 자체의 부재 \| 0". 실측: docs/environment/external.md:289, :327, :357, :388, :419, :452, :483 등 not-consumed 항목 전부가 `**소비처**` 줄을 갖는다 (registry.js:262-271이 그 이름들의 status=`not-consumed`를 선언). |
| architect | HIGH | `--write`의 «소유한 줄만 치환» 추상화가 «기계가 사람의 산문을 지우지 않는다»는 불변식을 담지 못한다. not-consumed 19건의 `**소비처**`는 (a) 사람이 쓴 실질 산문이고 (b) **2줄**이다 — 1줄 소유 가정으로 치환하면 고아 줄이 남고, 부재를 요구하는 규칙대로 지우면 진단 명령 안내가 소실된다. | docs/environment/external.md:289-290 "**소비처** mccp는 이 변수를 **읽지 않는다** … / `node plugins/mccp/scripts/lib/impeccable-detect.js resolve`가 설치원·버전·경로째로 알려준다." ↔ plan.md:176-177 "소유하는 줄은 정확히 넷: … `**소비처** …` 1줄", plan.md:288 Risk 1 완화 주장. |
| architect | MEDIUM | `retired` 도메인이 L13/docgen 범위에서 다뤄지지 않는다. L7·L12는 그 도메인을 명시 면제하는데 M4는 면제도 포함도 선언하지 않고, Files to Change에서 8장 중 `retired.md`만 빠졌다. 더구나 Task 2의 생성 규칙(파생 4줄 + `**사용 예시**` JSON 블록)은 retired.md가 명시한 «사용 예시 없음» 규약과 정면 충돌한다. | plan.md:128-134(gates·review·orchestration·cost·hooks·observability·external만 열거, retired.md 없음) · plan.md:181-183 생성 규칙 ↔ docs/environment/retired.md:11 "여기 있는 이름에는 **사용 예시가 없다** … 정합 lint도 이 파일을 예시 검사에서 제외한다" · lint.js:794-797 L12의 `e.domain !== 'retired'` 면제. |
| security | HIGH | M4의 생성 기능은 게이트를 실제로 약화시킨다 — `docgen --write`가 만든 skeleton은 bool/int/string/bypass-flag 토글에서 L7을 만족시키고 L12는 애초에 적용되지 않으므로, 판단 산문이 TODO 주석뿐인 빈 문서로도 lint가 green이 된다. plan이 그 반대를 단언한다. | plan:181-185 «생성물은 … `**사용 예시**` JSON 블록이며 … 그 표시는 L7/L12를 만족시키지 못하므로 … 여전히 착지가 막힌다». 그러나 lint.js:491-517의 L7은 (a) `**사용 예시` 문자열 존재 (b) json/bash fence 존재 (c) fence가 JSON.parse되고 **그 JSON이 이름 키를 가질 때만** values 대조 — 즉 생성된 예시 블록이 그대로 통과한다. 그리고 lint.js:797 `return e.domain !== 'retired' && (e.kind === 'enum' \|\| e.kind === 'list');`이므로 L12는 비-enum/list 토글에 **대상 자체가 아니다**. plan G1의 표(plan:55)도 L12를 «enum이었다면»으로 한정한다. 결과: 새 bool 토글 + `docgen --write` → L2·L3·L7·L13 전부 green → PRD Success Metric «토글 추가 시 문서 갱신 누락 → 착지 차단»(prd:55)이 M4 이후 오히려 거짓이 된다. |
| security | MEDIUM | Acceptance (b)가 이 우회를 잡지 못한다 — 검증 시나리오가 임시 토글의 kind를 지정하지 않아 enum을 고르면 통과 관측이 나오고 bool을 고르면 실패한다. | plan:302-305 «(b) 레지스트리에 임시 토글을 심고 `docgen --write` → lint가 **여전히 붉은지**(판단 산문 미충족)». 붉음 여부가 kind에 전적으로 의존하는데(lint.js:797) plan은 kind를 명시하지 않는다. plan G1의 probe 이름이 `mccp_m4_probe_bool`(plan:53)인 점을 보면 bool 사용이 유력하며, 그 경우 (b)는 통과할 수 없다 — 즉 acceptance가 자기 주장을 반증하거나(bool) 회피한다(enum). |
| test | HIGH | The plan's most destructive component — `docgen-apply.js`, which rewrites 9 tracked docs — has no test file and no Validate line that exercises `--write` at all. Its load-bearing invariant is verified only by a one-time human eyeball. | `Files to Change` creates `docgen.js` + `docgen.test.js` + `docgen-apply.js` but no `docgen-apply.test.js` (plan:121-123). Task 2's claim is absolute — "그 밖의 어떤 바이트도 건드리지 않는다" (plan:179) — yet its Validate runs only `docgen --check --json`, `docgen --bogus`, and `cli.test.js` (plan:192-196); `--write` is never run under test. The only check of the byte-preservation claim is Task 3's manual "`git diff`를 줄 단위로 검토" (plan:201-203), and the Risks table itself rates the failure mode likelihood 중간 (plan:288). A regression that clobbers `**값별 결과**`/`**극성**` prose after this cycle would be caught by nothing. |
| test | MEDIUM | Task 3's Validate is circular and cannot falsify the oracle: the same `docgen` oracle both writes and checks, so a wrong rendering rule is green in both consumers. | Task 3 Validate: "`node …/cli.js docgen --check` → exit 0" (plan:212) after Task 3 ran `docgen --write` (plan:200). The plan states the two-consumer design explicitly — "생성기와 게이트가 같은 판정을 쓰므로 '생성했는데 검사는 다른 것을 본다'가 구조적으로 불가능하다" (plan:16-17). That property also means the notation conventions (plan:156-161) and the `not-consumed → evidenceLine: null` rule (plan:163-169, self-labelled "검증 대상") have no independent oracle; `docgen.test.js` asserts them against the same frozen constants, so the assertions are hand-built to the expected shape. |
| test | MEDIUM | Existing tests pin the current check set at 12 and the fixture repo has no derived lines/TOC counts, but Task 5 does not name those pinned assertions or the baseline-fixture work — so the "기존 12검사 무영향" claim is asserted without identifying what must change. | `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js:226` `assert.equal(Object.keys(r.checks).length, 12);` and `:599` `assert.equal(negativeFixtures, 12, …)`; the baseline test at `:218` requires every check green on the synthetic `makeRepo()` tree, which will fail L13 unless the fixture docs gain `**종류**`/`**한 줄**`/`**소비처**` lines and `(N개)` TOC tokens. The plan only says "L13 fixture 4종(…) + 기존 12검사 무영향 단언" (plan:127, 229-231). |
| test | LOW | Task 6 changes the CI workflow and CLAUDE.md but its Validate command exercises neither. | Task 6 edits `.github/workflows/env-contract-drift.yml` and `CLAUDE.md` §3.17/§4 (plan:241-245), yet its Validate is only `node --test …/renderer/tests/i18n-surface.test.js` (plan:251). The instruction-contract lint that would catch a §3.17 edit appears only in the plan-level `## Validation` (plan:281), not on the task that changes it. |
| invariant | HIGH | Task 1의 `not-consumed` 규칙(‘**소비처** 줄 자체가 없어야 한다’)은 현재 코퍼스와 정합하지 않는다 — 19건 전부가 그 줄을 갖고 있으며, 그 줄은 사람이 쓴 산문이다. 따라서 (a) `docgen --check`는 Task 3이 예상한 31건이 아니라 50건을 보고하고, (b) 그 줄을 ‘오라클이 소유하는 줄’로 선언한 `--write`는 사람이 쓴 산문을 삭제한다 — plan이 최상위 Risk로 든 바로 그 유실이다. | docs/environment/external.md:289,327,357,388,419,452,483,516,546,574,602,630,661,692,723,751,782,813,841 — 19줄 전부 `**소비처** mccp는 이 변수를 **읽지 않는다** — impeccable 본문이 읽는다. 어느 본문이 열리는지는`(다음 줄로 이어지는 다중행 산문). plan은 이와 반대로 «renderDerived는 그 부류에 대해 **`evidenceLine: null`**(줄 자체가 없어야 한다)을 돌려주고 compareDerived는 줄의 **부재**를 요구한다. 오늘 19건 전부 드리프트 목록에 없으므로 이 규칙은 현재 코퍼스와 정합한다»라고 적는다(plan L163-169). ‘드리프트 목록에 없음’은 드리프트 측정이 registry `status='active'`만 비교했기 때문이지(registry.js:262-280의 19건은 전부 `not-consumed`, 반면 드리프트 20건에 든 `IMPECCABLE_FORCE_OVERRIDE_REASON`은 registry.js:261에서 `active`) 부재를 뜻하지 않는다. plan 자신의 G2 표도 «`**소비처**` 줄 자체의 부재 0»이라 적어 같은 사실을 말한다(plan L75). |
| invariant | HIGH | ‘생성이 게이트를 약화시키지 않는다’는 주장이 bool·string·int 토글에서 거짓이다. 그 kind들은 L12 대상이 아니므로(enum/list 전용), `docgen --write`가 만든 파생 4줄 + 기계 생성 `사용 예시` JSON 블록만으로 L2·L3·L7이 전부 green이 되고 판단 산문은 HTML 주석 TODO뿐인 채 착지가 통과한다. G1이 실측한 차단 연쇄(L2→L3→L7)를 M4가 자동으로 만족시켜 버리는 셈이라, UI1 후반부가 신규 bool 토글에 대해 오히려 후퇴한다. | lint.js:794-798 — L12 targets는 `e.kind === 'enum' \|\| e.kind === 'list'`만. lint.js:491-496 — L7은 `사용 예시` 블록 존재 + fence + values 정합만 본다(전부 기계 생성 가능). plan L181-185는 «그 표시는 L7/L12를 만족시키지 못하므로 저자가 채우기 전에는 여전히 착지가 막힌다»라고 주장하지만 같은 문단이 생성물에 «`**사용 예시**` JSON 블록»을 포함시킨다. G1 표의 probe도 bool(`#mccp_m4_probe_bool`, plan L53-55)이며 그 경로의 마지막 차단이 바로 L7이었다. |
| invariant | MEDIUM | Acceptance (b)의 라이브 완주는 위 결함을 잡지 못한다 — 그 시나리오가 어떤 kind의 임시 토글을 심는지 지정하지 않아, enum을 고르면 L12가 붉어져 주장이 성립하는 것처럼 보이고 bool을 고르면 green이 된다. 게이트 강도가 실행자의 선택에 좌우된다. | plan L302-305: «레지스트리에 임시 토글을 심고 `docgen --write` → lint가 **여전히 붉은지**(판단 산문 미충족)» — kind 미지정. L12의 kind 필터는 lint.js:797. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan이 인용한 file:line을 전부 열어 대조했다 — evidence-name.js:44/17(순수 코어·역방향 양방향), lint.js:5(fail-closed 규약)·:781(L12 등록 형태·retired 면제), cli.js:4(새 선언원 금지)·:26(USAGE)·:44(COMMAND_FLAGS), registry.js:5(선언/투영)·:48(not-consumed evidence=문서 앵커)는 전부 plan이 주장한 대로였다. G2의 \\"레지스트리가 정본\\"(L8·L10이 검증 / 문서 사본은 미검증) 논거도 evidence-name.js:12-20과 lint.js:16-18로 확인돼 반증 실패. docgen을 정본 오라클로 두고 lint L13과 CLI 둘이 소비하는 구조 자체도 이중 판정 경로를 만들지 않아 공격 실패. 실제로 무너진 것은 status 분기(not-consumed)의 코퍼스 정합 주장과 «소유 줄» 추상화의 경계, 그리고 8번째 도메인(retired)의 누락 셋이다. |
| security | fail | 공격한 축: (1) `docgen --write`의 경로 처리 — 출력 파일은 registry `domain` enum과 `^[A-Z][A-Z0-9_]*$` 이름에서 파생되어 traversal/절대경로 입력 경로를 찾지 못했다. (2) 절대경로·홈 디렉토리 유출 재발(§3.12 선례) — docgen이 문서로 옮기는 `evidence`는 lint.js:525-543 L8이 어휘 스크린을 fs보다 먼저 걸어 repo-relative를 강제하므로 새 유출 경로를 열지 않는다. (3) 수리 방향(registry → docs)이 L13을 자기 침묵시키는 권한 상승인지 — registry 쪽은 L8/L10이 실제 검증하므로 정당한 정본이고 반증 실패. (4) `--name` 미검증(cli.js:29의 `validateChoice` 관례 부재) — 도달 가능한 결과가 no-op뿐이라 finding으로 올리지 않았다. 실제로 착지한 것은 생성물이 게이트 검사(L7)를 스스로 만족시켜 UI1 후반부를 무력화하는 bypass 경로다. |
| test | fail | Read the M4 plan and the PRD in full. Checked each cited mirror: `evidence-name.js:17` (역방향 요구) and `:44`/`:45` (pure-core boundary) — accurate; `lint.js:781` L12 registration form — accurate. Mapped every CREATE/UPDATE file to a Validate line and found `docgen-apply.js` (the only fs-mutating, prose-destroying module) untested and `--write` never invoked under test. Attacked the two strongest claims: (1) \\"오라클이 소유하지 않는 줄은 건드리지 않는다\\" — only a human git diff backs it; (2) \\"docgen --check exit 0\\" as proof of repair — circular, same oracle on both sides. Read the existing `lint.test.js` for assertions that must change and found the count pins at :226/:599 plus the synthetic baseline repo, unacknowledged by Task 5. Checked cli.test.js for a COMMANDS enumeration pin — none found, so no finding there. Checked the failure-direction coverage of L13 (over-permissive: stale doc passing) — Task 5's 4 fixtures + reverse `not-consumed` fixture do cover it; no finding. Acceptance (a)(b)(c) genuinely demand live observation rather than unit-test green; no finding. |
| invariant | fail | plan의 G1/G2 실측 주장을 코드·문서로 재대조했다: (1) `not-consumed` 19건의 `**소비처**` 줄 실재 여부를 external.md에서 직접 확인해 plan의 정합 주장을 반증했고, 드리프트 20건 목록이 active-only임을 registry.js:261 vs 262-280으로 교차 확인했다. (2) 생성 경로가 기존 차단 연쇄(L2·L3·L7·L12)를 자동 만족시키는지 lint.js:472-522·781-798을 읽어 kind별로 추적했고 bool 경로에서 fail-open을 확인했다. (3) Task 4의 fail-closed 주장(읽기 실패 = drift)은 lint.js:5-7·810의 기존 규약과 일치해 반증하지 못했다. (4) 방향(registry → 문서)의 anchoring 근거(L8/L10이 registry evidence를 검증)는 lint.js 헤더 L8/L10 서술과 일치해 반증하지 못했다. (5) UI4 충돌·version forward-only·CI paths 필터 축은 결함을 찾지 못했다. |

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
  "wall_clock_ms": 313119,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:28a3bf8ae83db4f125a01cc44208fe58416002de8012439de5d40c3deb3122f3",
  "plan_path": ".claude/plans/env-contract-integrity-m4.plan.md",
  "recorded_at": "2026-09-01T01:28:36.796Z"
}
```
