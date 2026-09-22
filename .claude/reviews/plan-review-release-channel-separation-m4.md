# Plan Review Panel — release-channel-separation-m4

**Plan**: `.claude/plans/release-channel-separation-m4.plan.md` · **Plan version**: `sha256:342f47cf9a575be88f10ee6f5b1765f4251126a81ae9d4917fc8d288b342001c`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 12 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, security/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Validation 검사 4('렌더러 두 면에 버전 리터럴 0건')는 어떤 구현으로도 통과할 수 없다. 정규식 /v[0-9]+\\.[0-9]+\\.[0-9]+/g가 footer가 아니라 파일 전체를 훑는데, html.js에는 footer와 무관한 이력 주석 버전이 8건 이상 상주한다. Task 5를 완벽히 수행해도 검사 4는 throw한다 — 통과시키려면 §3.7·§3.17이 보존을 지시한 provenance 주석을 지워야 한다. 즉 이 검사는 '리터럴 footer'라는 불변식을 담지 못하고 '버전 문자열 언급'을 잰다. | plan L265 검사 4는 파일 전체 match. 실측: plugins/mccp/scripts/lib/renderer/html.js:7 `// v1.13.0 — vendored-inline jQuery`, :44 `v1.17.0`, :64 `v1.18.0 M2`, :70, :77, :540, :614, :795 — footer(:1422) 외 8건. 같은 앵커 결함을 i18n-surface.test.js:98-100이 이미 겪고 '<footer> 태그 앵커'로 고쳤다고 기록한다. Task 8의 역방향 단언(`version-face-literal-reintroduced`)도 앵커 규칙을 명시하지 않아 같은 오탐을 가드에 이식할 수 있다(현행 앵커는 version-declaration-guard.js:101 `page-foot[^']*?>v`). |
| architect | HIGH | Validation 검사 10('PRD 마일스톤 4행')은 PRD의 숫자 시작 표가 셋인데 전역으로 센다. 현재 트리에서 이미 9행이 매칭되고 M4 추가 후 10행이 되어 검사는 확정 HALT한다. 마일스톤 표라는 경계를 잡지 못한 단언이다. | plan L284 `rows = 본문 전체에서 /^\\\|\\s*[0-9]+\\s*\\\|/ 매칭; if(rows.length!==4) throw`. 실측 매칭원: prd Success Metrics L41-43(`\| 1 \| 사용자 노출 릴리스 수 \|` 등 3행) · '못박는 결정 3건' L59-61(`\| 1 \| **단일 릴리스 라인.**` 등 3행) · Delivery Milestones L78-80(3행) = 9행. |
| architect | MEDIUM | Task 1의 '`sha` 키 부재' 상시 위반 + escape 부재는 PRD 결정 2가 명시로 허용한 사고 대응 경로를 기계로 금지한다. 그런데 Task 11의 PRD 편집 목록에 결정 표 정정이 없어, 문서는 계속 허용하고 기계는 거부하는 상태로 착지한다. | prd L60 결정 2: "이 선택은 불변 핀을 포기하는 것이므로, 특정 커밋에 못박아야 하는 사고 대응 시에는 `sha`를 일시적으로 추가한다". plan L94-97: "`sha` escape는 두지 않는다 … `sha`가 있으면 가드가 붉어지고 그 red가 타이머 역할을 한다". Task 11(plan L214-228)이 손대는 PRD 절은 Delivery Milestones · Open Questions · Scope 문장 셋뿐이고 결정 표는 없다. |
| security | HIGH | Axis A의 상시 가드가 `source.url`을 값이 아니라 **존재**로만 검사한다. url은 이 좌표 파일에서 유일하게 '코드를 어디서 가져오는가'를 결정하는 필드이고, 같은 파일의 편집은 (문서가 실측으로 확인한 대로) 머지 즉시 모든 설치에 도달한다. 따라서 plan이 세우려는 '릴리스 좌표의 상시 불변식'은 가장 결과가 큰 축을 비워 둔 채 성립한다. 구체 경로: 병합 사고(§3.5.1 선례)나 잘못된 PR이 `url`을 다른 저장소로 바꾸면 `ref`·`path`·`sha` 단언은 전부 통과하고, `version-declaration-guard`는 marketplace.json을 아예 보지 않으며, `known_marketplaces.json`에 ref가 없어 그 편집은 릴리스 컷을 거치지 않고 사용자 clone에 도달해 다른 출처의 plugin 본문이 fetch된다. | plan L86-89 "`source.source === 'git-subdir'` · `source.ref === 'release'` · `source.path === 'plugins/mccp'` · **`sha` 키 부재**. `url` 존재도 함께 본다." / docs/release-channel.md:265-268 "`.claude-plugin/marketplace.json` **자체의 편집**…은 머지 즉시 설치에 도달한다" / .claude-plugin/marketplace.json:11 `"url": "https://github.com/idenn207/mccp.git"` / scripts/version-declaration-guard.js:40-43 (감시 대상 파일 목록에 marketplace.json 없음) |
| security | MEDIUM | `sha` 핀에 대해 audited escape를 두지 않는 설계가, PRD가 명시로 허용한 사고 대응 행위를 감사 기록 없는 게이트 무시로 밀어낸다. plan은 `paths` 필터 없이 모든 PR에서 도는 워크플로를 만들면서(Task 3) `sha`가 있으면 무조건 red라고 정했다(Task 1). 사고 대응으로 `sha`를 박는 순간 그 red는 '핀 PR'이 아니라 **그 이후의 모든 PR**에 걸리므로, 수정 커밋을 머지하려면 red 체크를 무시하거나 워크플로를 끄는 수밖에 없다. 그 우회는 어디에도 사유가 봉인되지 않는다 — 같은 저장소가 `MCCP_RELEASE_CUT`(값이 곧 사유)로 이미 해결한 형태를 여기서는 의도적으로 거부했다. | plan L94-97 "**`sha` escape는 두지 않는다.** … 대신 `sha`가 있으면 가드가 붉어지고 그 red가 타이머 역할을 한다" + L112-116 "`paths` 필터를 두지 않는다" vs PRD L60 결정 2 "특정 커밋에 못박아야 하는 사고 대응 시에는 `sha`를 일시적으로 추가한다" / 대비: scripts/version-declaration-guard.js:126-141 `releaseCutReason` (≥30자·≥3단어 사유가 감사 기록) |
| security | LOW | Task 10의 `escalate_pending` 해소는 '지적 전건이 backlog 행을 갖는가'라는 판정을 저자 세션이 스스로 내리고 그 결과를 승인 필드에 쓰는 구조다 — 기계 대조가 없고, plan이 이미 대조 결과(9건)를 자기 본문에 미리 적어 두어 확인 단계가 형식화되기 쉽다. Validation 검사 12도 값을 **출력만** 하고 어떤 조건도 강제하지 않아, 근거 없이 해소해도 어떤 검사도 붉어지지 않는다. | plan L198-203 "현재 확인된 것: 2026-09-01 santa R0 4행 …" / plan L290 검사 12 `console.log('escalate_pending =', …)` — 단언 없음 |
| test | HIGH | Validation 검사 4('렌더러 두 면에 버전 리터럴 0건')는 이 계획대로 구현해도 **반드시 실패**한다 — 정규식이 footer가 아니라 파일 전체를 훑어 주석의 버전 문자열까지 잡는다. 즉 R2의 핵심 주장을 검증하는 유일한 검사가 판별력이 아니라 오탐으로 붉어진다. | plan:265의 `match(/v[0-9]+\\.[0-9]+\\.[0-9]+/g)` 대 실측: html.js:7 `// v1.13.0 — vendored-inline jQuery`, html.js:44, :64, :70, :77, :540, :614, :795, :1425가 모두 매칭. Task 5(plan:144)는 'html.js:1422 … 나머지 문구 무변경'이라 이 주석들을 지우지 않는다. Acceptance는 'Validation 1~13 전건 exit 0'(plan:328)을 요구하므로 자기모순. |
| test | HIGH | Validation 검사 10(PRD 마일스톤 4행 단언)도 반드시 실패한다 — 행 정규식이 Success Metrics 표와 '못박는 결정 3건' 표의 숫자 첫 열까지 센다. PRD 구조 변경(Task 11)을 검증하는 유일한 검사가 무엇도 재지 못한다. | plan:284의 `/^\\\|\\s*[0-9]+\\s*\\\|/`가 PRD에서 실제 매칭하는 줄: prd:41,42,43(지표) · 59,60,61(결정) · 78,79,80(마일스톤) = 현재 9행. M4 추가 후 10행 → `throw new Error('milestone rows=10')`. |
| test | HIGH | Task 7의 극성 반전(리터럴 존재 = 위반)은 기존 `version-declaration-guard.test.js`의 다수 케이스를 무효화하는데, 계획은 '두 케이스 추가'만 말하고 기존 단언 회수 계획이 없다. 특히 현행 test는 '리터럴 부재 → version-face-unreadable'을 **정답으로 고정**하고 있어, 바꾸려는 동작을 test가 핀으로 박고 있다. | scripts/tests/version-declaration-guard.test.js:106-113 ('a face whose literal shape moved is reported, not silently skipped' — MD에 리터럴이 없으면 status 1을 단언)과 seed()가 모든 fixture에 리터럴 footer를 심는다(:36-39) → 반전 후 :68 'clean branch passes' · :76 · :86 · :115 케이스가 전부 `version-face-literal-reintroduced`로 붉어진다. 계획의 Task 8(plan:182-184)은 이 회귀를 언급하지 않는다. |
| test | MEDIUM | Task 9·10의 Validate 라인은 단언이 아니라 출력문이라 어떤 실패도 잡지 못한다 — 실패 방향(escalation이 근거 없이 해소됨 / 채널 ref가 움직임)이 검증 밖이다. | plan:290 검사 12는 `console.log('escalate_pending =', …)`로 값을 찍기만 하고 throw가 없다. plan:281 검사 9는 `git ls-remote origin refs/heads/release` 출력뿐이며 시작 시점 SHA와 비교하는 단계가 없는데 Acceptance(plan:337)는 '시작 시점과 동일'을 요구한다. |
| test | MEDIUM | Task 6이 markdown footer 정보 동등을 고정한다고 하지만, 그 test는 stub 모델 렌더 출력만 보므로 '설치 캐시에서 require가 해소된다'는 Task 4의 load-bearing 주장은 어떤 자동 test로도 반증되지 않는다(수동 1회 관측에만 의존). | plan:132-134 '설치 캐시 … 2026-09-04 확인'은 일회성 수동 실측이고, plan:331-336 Acceptance도 '1회 돌려 … 보고서에 전사'라는 수동 절차다. i18n-surface.test.js:94는 worktree 상대경로 manifest를 require하므로 캐시 배치 실패를 재현할 수 없다. |
| invariant | HIGH | Task 7 inverts a fail-closed branch into a fail-open one, and hands the compensating check to a test that no CI workflow runs. Today `version-declaration-guard.js:207-213` treats an unreadable face (regex no match → `undefined`) as a violation (`version-face-unreadable`) — unknown blocks. After Task 7 the same unknown becomes `faces.<face> = 'derived'` = pass, so any future footer format change, footer deletion, or file rename in html.js/markdown.js reads as clean at the only CI-enforced point. The plan's mitigation ("그 축은 가드가 아니라 i18n-surface.test.js가 렌더 출력에서 잡는다", plan L176-177, Risks L319) is not CI-backed: the five workflows are axis-k-m2-cross-platform, gitignore-drift, env-contract-drift, version-declaration-gate, test-suite-baseline, and none of them invoke `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` (`.github/workflows/version-declaration-gate.yml:64-68` runs only `scripts/tests/version-declaration-guard.test.js`). Net effect: a CI-blocking unknown becomes a locally-checked-only unknown. | scripts/version-declaration-guard.js:207-213 (`rule: 'version-face-unreadable'`) vs plan L168-169 "버전 리터럴이 있으면 위반 …, 없으면 faces.<face> = 'derived'"; .github/workflows/version-declaration-gate.yml:64-68 (only guard test invoked); Glob .github/workflows/*.yml = 5 files, none run i18n-surface.test.js |
| invariant | HIGH | The mitigation for the plan's highest-likelihood risk (Task 5 and Task 7 landing separately → every PR red) is Validation check 4, but check 4 is unsatisfiable in any state and therefore carries zero discriminating power. Check 4 rejects *any* `/v[0-9]+\\.[0-9]+\\.[0-9]+/` occurrence in html.js and markdown.js, and html.js carries nine historical version literals in comments (v1.13.0, v1.17.0, v1.18.1, v1.18.7 …) that Task 5 does not touch. So check 4 throws before and after the change alike; "검사 4와 6을 같은 Validation 블록에 두어 한쪽만 착지한 상태가 green이 될 수 없게 한다" (L317) is satisfied vacuously — every state is red, including the correct one. Acceptance L328 ("Validation 1~13 전건 exit 0") is then unreachable, and the predictable repair is to loosen the matcher, which is exactly how a gate stops stopping anything. | plan L265 (check 4 regex) and L317 (risk mitigation); html.js:7, :44, :64, :70, :77, :540, :614, :795 all contain `v1.x.y` comment literals outside the footer at html.js:1422 |
| invariant | MEDIUM | Validation check 10 (PRD structure gate) counts every table row beginning with a digit, not milestone rows, so it throws regardless of whether Task 11 landed correctly. The PRD has three tables with numeric first columns: Success Metrics (prd:41-43), 결정 3건 (prd:59-61), and Delivery Milestones (prd:78-80). After adding M4 the regex `^\\\|\\s*[0-9]+\\s*\\\|` matches ~10 rows, so `rows.length!==4` always throws. Same failure class as check 4: a gate that is red in every state teaches the operator to weaken it. | plan L284 (`rows.length!==4`); .claude/prds/release-channel-separation.prd.md:41-43, :59-61, :78-80 |
| invariant | MEDIUM | Check 12 is the only mechanical trace of R5 (santa escalation closure) and it asserts nothing — it prints `escalate_pending` and exits 0 whether the value is `true`, `false`, or absent. Task 10's real invariant ("전건이 backlog 행을 갖는지 대조" before clearing, L201-203) has no machine check at all; the branch decision is taken by the implementing LLM and the Acceptance criterion "Validation 1~13 전건 exit 0" (L328) is satisfied by an unconditional `console.log`. That is a skip predicate whose proof can exist without the work. | plan L290: `console.log('escalate_pending =', m?m[1]:'(absent)');` — no throw on any value; contrasted with plan L201-203 branch condition |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Task 4의 require 상대경로를 실제 트리 깊이로 계산해 검증(plugins/mccp/.claude-plugin/plugin.json으로 정확히 해소 — 결함 없음). host-version.js sentinel 인용, i18n-surface.test.js:88-107의 파생 원칙과 <footer> 앵커 주석, version-declaration-guard.js의 violations[]/fail() 구조·merge-base 비교·MCCP_RELEASE_CUT 사유 검증(126-141)을 전부 열어 대조 — plan의 Patterns to Mirror 인용은 모두 실재하고 정확했다. Task 7이 주장하는 '4면 → 2면 축소가 약화가 아니다'도 공격했으나, 파생 후에는 footer가 번호를 담지 않아 half-declaration 경로가 구조적으로 닫히고 부재 축은 i18n-surface가 렌더 출력에서 잡으므로 논증이 성립한다고 봤다. Task 10의 state-writer 경로도 확인(state-writer.js:450-455가 escalate_pending/decision_id patch를 지원, 라운드트립 test 존재 — 결함 없음). marketplace.json 실물이 Task 1의 넷을 그대로 만족함도 확인. 검사 13의 backlog 4열 헤더도 실재(codex-findings-backlog.md:8). 남은 결함은 위 셋이며, 앞의 둘은 plan 자신의 Acceptance가 요구하는 'Validation 1~13 전건 exit 0'을 구조적으로 불가능하게 만든다. |
| security | fail | 공격한 것: (1) Task 1 가드의 단언 집합을 marketplace.json 실물·런북 6절과 대조해 url 축이 비어 있음을 확인하고, known_marketplaces에 ref가 없다는 실측 문장으로 '머지 즉시 도달' 결과까지 경로를 이었다. (2) `sha` no-escape 설계를 PRD 결정 2의 사고 대응 허용과 충돌시켜 우회 압력을 추적했고, 같은 저장소의 `MCCP_RELEASE_CUT` 선례와 대조했다. (3) Task 7의 역방향 단언이 신뢰를 약화하는지 — plugin_json 면이 남으므로 번호 선언 경로는 여전히 잡힌다고 판단해 finding으로 올리지 않았다. (4) Task 4의 `../../../.claude-plugin/plugin.json` 상대 require를 실제 디렉토리 깊이로 계산해 traversal/오해소가 없음을 확인했고, sentinel이 throw하지 않아 fail-open이지만 그 값이 승인 결정에 쓰이지 않아 무해로 판단했다. (5) 절대경로 유출 축 — 검사 15가 커밋 후에만 의미가 있다는 한계는 plan이 스스로 적었고, 새로 커밋되는 산출물(report·STATE.md·PRD)이 절대경로를 나를 구체 경로를 찾지 못해 finding으로 올리지 않았다. (6) `.claude/cache/` 렌더 산출물의 version stamp가 durable artifact 유출이 되는지 — 캐시 경로이고 값이 manifest 공개 번호라 결과가 없다. |
| test | fail | plan의 Validate 라인 16개를 실제 소스와 대조했다: 검사 4의 정규식을 html.js/markdown.js에 grep으로 돌려 주석 매칭 8건을 확인, 검사 10의 행 정규식을 PRD에 돌려 9행(→10행)을 확인. version-declaration-guard.js 전문과 그 test 전문을 읽어 Task 7 극성 반전이 기존 단언·seed fixture를 어떻게 무효화하는지 대조했고, i18n-surface.test.js:88-105의 파생 앵커가 Task 5·6 이후에도 유효한지 검사해 문제 없음을 확인했다. 검사 3(paths 필터)·13(4열 헤더)·7(우산 결정 1)은 공격했으나 결함을 찾지 못했다. |
| invariant | fail | Read the M4 plan and C0 PRD, then opened the baseline gate it rewires (scripts/version-declaration-guard.js) to establish what currently blocks. Traced the unknown-input direction of Task 7's face inversion (undefined face → today violation, after M4 → 'derived' pass) and checked whether the claimed compensating check (i18n-surface.test.js) is enforced anywhere — enumerated all five .github/workflows and confirmed it is not. Executed the Validation block by hand against the real tree: check 4's literal scan against html.js/markdown.js (9 pre-existing comment literals → always red), check 10's milestone-row regex against the PRD's three numeric tables (~10 rows → always red), check 12 (print-only, no assertion), check 13 (backlog header verified 4-column, sound), check 3's `paths:` regex (sound). Also probed Task 1's HALT-on-instrument-failure claim versus Task 2's `evaluateManifest` entry-absent case — both non-zero exit, no gate opens, so not reported. Did not find a defect in the sha-pin-has-no-env-escape design or in the plugin.json exclusion. |

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
  "wall_clock_ms": 219649,
  "halt_stage": null,
  "backlog_appended": 12,
  "backlog_skipped_nonblocking": 7,
  "granted": 4,
  "reviewed_plan_hash": "sha256:342f47cf9a575be88f10ee6f5b1765f4251126a81ae9d4917fc8d288b342001c",
  "plan_path": ".claude/plans/release-channel-separation-m4.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-04T05:42:32.754Z"
}
```
