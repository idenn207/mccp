# Plan Review Panel — review-record-linkage

**Plan**: `.claude/plans/review-record-linkage-m1.plan.md` · **Plan version**: `sha256:e85bad7d90d1cff70f321767ca36f4261edcd59292cc891d8586e4775b3f21ee`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, test/FAIL, invariant/HIGH, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | DD5와 Task 2가 pre_measurement 날짜 원천 명령을 서로 다르게 못박는다 — Task 2가 지정한 형태는 DD5가 '동결 불변성을 반증한다'며 명시적으로 거부한 바로 그 형태다. 구현자는 Task를 따르므로 정본이 둘이다. | plan.md:175 표 3행 `git log --diff-filter=A --follow -1 --format=%cI -- <path>` + :181 "`-1`(마지막 손댄 커밋)이 아니라 `--diff-filter=A --follow -1`(추가된 커밋)인 것이 핵심이다" vs plan.md:296 "(`pre_measurement`는 `git log -1 --format=%cI -- <path>`)". (Task 4:337의 rename 불변성 test가 사후에 잡으므로 침묵 실패는 아니다.) |
| architect | MEDIUM | DD1a의 '복제 금지'를 지키는 기계 가드가 복제 표면의 절반만 덮는다. DD1a가 corpus 소유로 열거한 것은 서명 정규식 **과 `## Measurement` 펜스 파싱** 둘인데, Validation의 grep은 서명 쪽만 검사한다 — `linkage-defs.js`가 ```json 펜스 파서를 재구현해도 전 단언이 green이다. | plan.md:96 "`PANEL_TITLE_RE`(`corpus.js:211`) · `isPanelRecord`(`:213-217`) · `## Measurement` 펜스 파싱(`:242-273`)" 이 corpus 소유로 열거됨. 그러나 plan.md:374 `grep -c "isPanelRecord\\\|Plan Review Panel" ... # 0` 과 Task 3:320의 단언은 `isPanelRecord` 부재만 본다. corpus.js:225-273에 실재하는 펜스 파서는 어느 단언에도 걸리지 않는다. |
| architect | MEDIUM | `classifyLink`의 `record` 인자 타입이 미정이라 DD1a 경계가 계약으로 닫히지 않는다. `linkage-defs.js`는 `require` 0건(Validate)이므로 파싱된 measurement 객체만 받을 수 있는데, Task 3의 긍정 픽스처는 '`## Measurement` JSON에 receipt_hash가 실린 레코드'라는 원문 단위로 기술돼 있다. | plan.md:284 `classifyLink(receipt, record)` (타입 미명시) · :288/:373 `require` 0건 계약 · :316 "(b) `## Measurement` JSON에 `receipt_hash`가 실린 레코드 → `review_to_receipt` 참" |
| architect | MEDIUM | `--frozen-only` 출력이 파티션에 속하지 않는 코퍼스-전역 수치(`undated` 건수와 파일명 목록)를 담으므로, DD7이 `post_baseline`을 빼서 제거했다고 주장한 가변성이 다른 경로로 되돌아온다. 날짜 원천이 없는 레코드가 미래에 하나라도 생기면 동결 블록의 바이트가 바뀌어 `linkage-frozen-baseline.test.js`가 무관한 착지로 붉어진다. | plan.md:206-208 "`--frozen-only` … `baseline` 메타 · `pre_baseline` 파티션 · **`undated` 건수와 그 파일명 목록**을 방출" — `undated`는 정의상 어느 파티션에도 속하지 않는다. 같은 DD가 :203에서 "예측 가능하게 실패하는 검증은 … 장치가 있다는 착각"이라며 가변 값의 동결 포함을 거부한다. |
| security | MEDIUM | Validation 5b's absolute-path leak check does exactly what the plan says it must not do — it enumerates POSIX top-level directories — and it can never fail non-zero, so the only mechanism guarding the git-tracked frozen artifact against the repo's known absolute-path leak precedent (§3.12 meta.cwd sanctioned re-seal) passes silently for any checkout root outside the enumerated list (e.g. /workspace, /builds, /data, /srv2, /c/...). | plan.md:394-398 — comment claims '열거식 화이트리스트가 아니라 형태로 잡는다 … (열거하면 열거 밖 환경 — /root, /mnt, /var — 에서 조용히 통과한다)', yet the regex is `(^\|[^.])/(home\|root\|mnt\|var\|tmp\|opt\|srv\|Users)/` — an enumeration. Additionally the pipeline `grep … && echo "ABSOLUTE PATH LEAKED" \|\| echo "no absolute path"` exits 0 in both branches, so it is eyeball-only; no task in Tasks 3/4 adds a test asserting the tool's output contains no absolute path, so DD6 (plan.md:230-236) has no machine enforcement at all. |
| security | MEDIUM | `classifyLink` is declared to be M3's path-join security predicate, but the plan pins only a denylist-shaped test set (absolute · `..` · drive letter · UNC) and never specifies allowlist semantics — unlike the sibling precedent it cites. Forms outside the four enumerated shapes (Windows drive-relative `C:foo`, mixed separators `a/..\\b`, embedded NUL, `....//`) would satisfy every stated assertion while reaching M3's path construction. | plan.md:310 — '`classifyLink`: 절대경로 · `..` · 드라이브 문자 · UNC 형태의 링크 값은 `receipt_to_review`가 거짓 … M3가 이 술어를 경로 결합 판별자로 재사용하므로 test로 봉인한다'. The mirrored precedent is an allowlist, not a denylist: plugins/mccp/scripts/lib/plan-review/record.js:69-73 `sanitizeSlug` = `s.replace(/[^A-Za-z0-9._-]/g,'-')`. The plan lists that precedent in Patterns to Mirror (plan.md:248) but no Task references it and Task 1 (plan.md:284) gives `classifyLink` no shape contract. |
| security | MEDIUM | M1 claims ownership of specifying M3's forward discriminator ('명시 proof 필드') but omits the one property the cited precedent exists to enforce — that the field must not be reachable from `receipt/cli.js`'s generic flag surface. Without that, any shell caller can stamp `eligible` and move the denominator of Success Metric 2. | plan.md:146-148 asserts '명시 proof 필드다(§3.12의 ambient `codex_disabled` 대 명시 `codex_disabled_at_pr` 구분과 동형)' — but the §3.13 precedent for a self-attested approval field is 'intent 결정은 CLI 표면을 갖지 않는다', which exists because plugins/mccp/scripts/receipt/cli.js:44-61 `parseFlags` accepts and forwards any `--*` into `write()`. Neither the plan's DD3 nor Task 3(d) (plan.md:318-319) states the field must be withheld from that surface. |
| test | HIGH | Task 2의 구현 스펙이 DD5가 못박은 날짜 원천과 정면으로 모순된다 — 구현자가 Task 2를 그대로 따르면 Task 4가 새로 쓰는 불변성 test가 확정적으로 붉어진다(또는 test가 스펙에 맞춰 완화되어 DD5의 핵심 주장이 반증 불가가 된다). | plan:175 `git log --diff-filter=A --follow -1 --format=%cI -- <path>` (**추가 커밋** 시각) 및 plan:181-186 "`-1`(마지막 손댄 커밋)이 아니라 … 인 것이 핵심이다" vs. plan:296 Task 2 Action: "날짜 원천은 DD5의 3행 표를 따른다(`pre_measurement`는 `git log -1 --format=%cI -- <path>`)" — DD5가 명시적으로 거부한 바로 그 형태. plan:337 Task 4는 "파일 내용 수정·rename 후에도 불변"을 단언한다. |
| test | MEDIUM | DD6('절대 경로 미출력')의 유일한 기계 장치가 test가 아니라 Validation 블록의 grep 한 줄이고, 그 grep은 스스로 '열거식이 아니라 형태로 잡는다'고 주장하면서 실제로는 디렉토리 이름 열거다 — 자기가 지목한 실패 모드(열거 밖 환경에서 조용히 통과)를 그대로 갖는다. | plan:394-397 "열거식 화이트리스트가 아니라 형태로 잡는다 … (열거하면 열거 밖 환경 — /root, /mnt, /var — 에서 조용히 통과한다)" 바로 아래 정규식이 `(home\|root\|mnt\|var\|tmp\|opt\|srv\|Users)`를 열거한다. `/workspace/...`, `/data/...`, `/opt2/...` 절대경로는 통과한다. Task 1~5 어느 Validate 줄에도 절대경로 회귀 test가 없다. |
| test | MEDIUM | Acceptance 4·5가 DD7/Acceptance 1이 방금 금지한 리터럴 건수 고정을 스스로 위반하고, 어느 파티션에 대한 수치인지도 지정하지 않아 병렬 자식이 ship하는 순간 예측 가능하게 붉어진다(= 재생성으로 덮이는 검증). | plan:444-450 "리터럴 고정 금지 — 코퍼스가 움직이면 확정적으로 붉어지는 acceptance 는 DD7 이 거부한 형태다" vs plan:457 "`ship_eligibility` 가 **71건 전건** `undecidable`". plan:417 Risks: "동결 baseline이 새 ship 착지로 조용히 드리프트한다 \| **높음** — 사이클 중 병렬 자식이 ship한다". |
| test | LOW | Task 6가 편집하는 대상(PRD 행 갱신, git diff 무접촉/무삭제 검증)과 그 Validate 줄이 대응하지 않는다 — `i18n-surface.test.js`는 version 4면만 검사하며 게이트 무접촉·삭제 사고 축을 전혀 실행하지 않는다. | plan:362-363 Action(`git diff --name-only` 교집합 0 · `--diff-filter=D` 공집합) vs plan:367 "**Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`" — 해당 test는 plugin.json 파생 version 단언만 한다(CLAUDE.md §3.7 "기대값을 `require('plugin.json').version`으로 파생"). |
| invariant | HIGH | 동결(freeze) 산출물이 실제로는 가변이다 — `--frozen-only`가 파티션되지 않는 `undated` 집합과 프로세스 전역 `state`를 함께 싣기 때문에, 새 ship 하나가 날짜 원천 없이 착지하면 동결 블록의 바이트가 바뀐다. DD7이 `post_baseline`을 뺀 이유(예측 가능하게 붉어지는 검증은 장치가 아니라 착각)가 `undated`/`state` 경로로 그대로 되살아난다. | plan:206-208 "`--frozen-only` 플래그를 둔다: `baseline` 메타(ref · 해소된 시각 · state) · `pre_baseline` 파티션 · **`undated` 건수와 그 파일명 목록**을 방출" + plan:220 "`degraded` \| 1 \| … **`undated > 0`**" + plan:329 test 주장 "`post_baseline` 파일을 추가해도 … `--frozen-only` 출력 바이트가 불변". `undated`는 정의상 pre/post 어느 파티션에도 속하지 않으므로 post-baseline 신규 파일이 undated가 되면 건수·파일명·state가 모두 동결 블록 안에서 변한다 — Task 4의 불변성 단언은 픽스처가 그 조합(post_baseline ∧ undated)을 만들지 않는 한 green으로 남는다. |
| invariant | HIGH | DD5가 "동결의 불변성을 자기 날짜 원천이 반증한다"며 명시적으로 금지한 mutable 날짜 원천을, 같은 계획의 Task 2가 구현 지시로 그대로 적었다. 구현자가 Task를 따르면 동결 파티션이 파일 편집/`archive/` 이동만으로 조용히 이동한다. | plan:175 "`git log --diff-filter=A --follow -1 --format=%cI -- <path>` (**추가 커밋** 시각)" 및 plan:181-186 "**`-1`(마지막 손댄 커밋)이 아니라 … 인 것이 핵심이다**" 대(對) plan:296 "날짜 원천은 DD5의 3행 표를 따른다(`pre_measurement`는 `git log -1 --format=%cI -- <path>`)" — Task 2가 지시하는 명령이 DD5가 거부한 바로 그 형태다. |
| invariant | MEDIUM | 동결의 앵커인 `--baseline-ref` 기본 핀 상수의 값이 계획 어디에도 지정되지 않아, 무엇이 동결되는지가 구현자 재량으로 남는다. DD5는 "어느 쪽을 고르는지가 '무엇이 동결되는가'를 결정한다"며 날짜 원천은 못박았지만 경계 자체는 못박지 않았다. 핀이 브랜치-로컬 커밋이면 머지 후 `git show`가 실패해 `unresolved`(exit 3)가 되고 Task 5의 바이트 일치 test가 영구히 붉어진다. | plan:164 "`--baseline-ref`(기본값: 핀 고정 상수)", plan:296 "`--baseline-ref`(기본 핀 상수)" — 값이 명시된 곳이 grep 결과 0건(유일한 SHA 언급은 plan:41의 실측 base `bacd96a`이며 기본값으로 선언되지 않음). plan:222 `unresolved` exit 3. |
| invariant | MEDIUM | state ladder에 우선순위 규칙이 없어, 무결성 위반이 서로를 가릴 수 있다. 특히 경계 ref 해소 실패(`unresolved`, DD7이 유일한 fail-closed 장치로 세운 것)와 `degraded`/`blind`가 동시에 성립할 때 어느 state가 보고되는지 미정이며, `degraded`(1)로 접히면 "동결이 성립하지 않았다"는 신호가 커버리지 경고로 강등된다. | plan:216-228 state ladder 표는 조건만 나열하고 상호배타성·평가 순서를 규정하지 않는다. Task 4(plan:328)도 "state ladder 4분기 각각"만 단언하고 조합 케이스(예: ref 해소 실패 ∧ parse_failures>0)를 test 대상으로 두지 않는다. |
| invariant | MEDIUM | Acceptance 4가 계획 자신이 금지한 리터럴 건수 고정을 한다 — 병렬 자식의 ship이 사이클 중 착지할 가능성을 계획이 스스로 '높음'으로 평가하는데도 "71건 전건"을 acceptance로 박았다. | plan:457 "출력의 `ship_eligibility` 가 71건 전건 `undecidable`" 대 plan:449-450 "리터럴 고정 금지 — 코퍼스가 움직이면 확정적으로 붉어지는 acceptance 는 DD7 이 거부한 형태다" + plan:417 Risk "동결 baseline이 새 ship 착지로 조용히 드리프트한다 \| **높음**". |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용을 전수 대조했다: corpus.js:211/213-217(PANEL_TITLE_RE·isPanelRecord 실재) · :225-273(parseRecord 4분류 실재) · :670(fail-open `ok` 실재 — DD7의 '미러하지 않는다' 근거 참) · :103-106,678-696(REVIEW_SUBDIRS 2경로 비재귀 — Task 4의 archive/ 픽스처 요구가 실제 이유를 가짐) · :723-725(err.message 절대경로 누출 실재) · evidence-audit.js:20-51,62-73(state ladder + 미지 state→1 형태 일치). DD5의 `meta.created_at` 원천은 schema.js:306이 필수로 강제하므로 ship 층 `undated` 경로가 사실상 도달 불가임을 확인했다(플랜에 불리한 방향의 오류 없음). DD1의 전이 의존 논증도 공격했다 — M4가 필요로 하는 것은 `hasRoundStructure(measurement)` 하나이고 그것은 순수하므로 record.js:16-21의 dep-free 계약과 충돌하지 않는다(반증 실패). 순환 의존(linkage-audit → corpus → ?)도 확인했으나 corpus.js는 linkage를 모르므로 무해. 깨진 것은 위 4건이며 전부 MEDIUM이고 HIGH로 올릴 근거를 찾지 못했다 — 특히 DD5/Task2 모순은 Task 4:337의 rename 불변성 test가 기계적으로 잡는다. |
| security | pass | Checked every cited module against the plan's claims. corpus.js:670 fail-open and corpus.js:723-725 `err.message` absolute-path leak are real and the plan correctly declines to mirror both (verified). evidence-audit.js:20-51/62-73 ladder and unknown-state→1 fail-closed citation is accurate. Attacked: (1) command injection via `--baseline-ref` — refuted, the mirrored `resolveSplitMs` uses `execFileSync` with an argv array (corpus.js:714) and the plan pins `-- <path>` separation for the per-file git call; (2) path traversal through the corpus scan — refuted, names come from `readdirSync` on two fixed non-recursive dirs, not from file content; (3) state-ladder fail-open when several conditions hold simultaneously (unresolved + degraded) — refuted, every non-ok branch is non-zero so no ordering choice yields a silent exit 0; (4) frozen-artifact tamper surface — the frozen block is byte-compared by linkage-frozen-baseline.test.js, so drift is caught; (5) reviewer-authored markdown as untrusted input — DD6 totality plus Task 3's adversarial fixtures cover it, and parsing is delegated to the already-hardened corpus.js#parseRecord. What I could land: the leak check contradicts its own stated design and cannot fail, classifyLink's security shape is denylist-by-test with no allowlist contract while being declared M3's path judge, and the M3 proof-field requirement omits the CLI-forgery closure its own cited precedent turns on. |
| test | fail | 인용 검증: corpus.js의 `parseRecord` export(:869)·`PANEL_TITLE_RE`(:211)·`isPanelRecord`(:213)·4분류 kind(:219-252)·fail-open `state=...:'ok'`(:670)·`REVIEW_SUBDIRS`(:103) 전부 plan 주장대로 실재함을 확인 — DD1a/DD7 인용은 반증하지 못함. Validate가 지목한 test 파일 실재 확인(`plan-review-corpus.test.js`, `evidence-audit.test.js` 모두 존재). 두 강한 주장 공격: (1) \\"동결은 test가 지킨다\\" → `linkage-frozen-baseline.test.js`가 실제로 신설되고 Validate 줄에 있어 반증 실패, (2) \\"0 값이 상수 스텁으로 만족된다\\"는 자기 지적을 Task 3 긍정 픽스처 4종 + Acceptance 5b가 실제로 닫음 — 반증 실패. 대신 날짜 원천 스펙이 DD5와 Task 2 사이에서 갈리는 것, 절대경로 가드가 test가 아니라 자기모순 grep인 것, Acceptance의 리터럴 71이 자기 규칙 위반인 것, Task 6 Validate 불일치를 찾았다. |
| invariant | fail | DD1a의 `corpus.js#parseRecord` export·`kind` 4분류·`isPanelRecord`/`PANEL_TITLE_RE` 인용을 corpus.js에서 직접 대조(corpus.js:211,213-217,225,240,249,868-869 — 전부 참). DD7이 미러하지 않겠다고 선언한 fail-open `corpus.js:670`을 열어 인용문 축자 일치 확인(참 — 정직한 인용). 그 위에서 게이트를 열려고 시도한 경로: (1) `--frozen-only` 출력이 정말 불변인가 → `undated`·`state`가 파티션 밖의 가변 축으로 남아 있음을 발견; (2) DD5 날짜 원천 표와 Task 2 구현 지시의 명령줄 대조 → 불일치 발견; (3) 동결 앵커 기본값 추적(grep) → 미지정; (4) state ladder의 조합 입력(unresolved ∧ degraded, blind ∧ unresolved) 추적 → 우선순위 미정; (5) acceptance 리터럴 대 자기 규칙 대조 → 71 리터럴. 반면 `hasRoundStructure`의 unknown 입력 방향(비정수·문자열·null 전부 false = 최엄격), `undecidable` 3값의 0-접기 금지, 절대경로 누출 검증(Validation 5b의 형태 기반 정규식), Task 3 긍정 픽스처(상수 스텁 통과 차단)는 공격했으나 결함을 찾지 못했다. |

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
  "wall_clock_ms": 179485,
  "halt_stage": null,
  "backlog_appended": 5,
  "backlog_skipped_nonblocking": 13,
  "granted": 4,
  "reviewed_plan_hash": "sha256:e85bad7d90d1cff70f321767ca36f4261edcd59292cc891d8586e4775b3f21ee",
  "plan_path": ".claude/plans/review-record-linkage-m1.plan.md",
  "recorded_at": "2026-09-01T07:03:32.527Z"
}
```
