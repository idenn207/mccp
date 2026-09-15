# Implementation Report: closure-accounting M4 — instrument-repair

**Plan**: `.claude/plans/closure-accounting-m4.plan.md`
**PRD**: `.claude/prds/closure-accounting.prd.md` (자식 C11 of `harness-wiring-integrity`)
**Branch**: `c11-closure-accounting` · base `origin/main` = `6425ff8`
**날짜**: 2026-09-14

## Summary

M1은 격차를 **보이게** 했고 M2는 **닫는 경로**를 만들었다. M4는 그 두 산출물이 **스스로 틀린 값을
내던 경로 여섯**을 닫고, 계기를 CI에서 주기적으로 부르게 하고, PRD의 상태 표류를 정리했다.
부채는 한 건도 갚지 않았다 — `fixed`는 여전히 1이다.

가장 중요한 한 줄: **m10 게이트는 여전히 exit 1이다.** 바뀐 것은 red의 *이유*이지 red 자체가
아니다. 조상 결속 1115줄을 불일치로 보고하던 것이 `dispositions.open = 1740`으로 옮겨졌다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 맞음 |
| Files Changed | 18 (16 UPDATE + 2 CREATE 외 보고서) | 17 tracked UPDATE + 3 신규 |
| 신규 test | 명시 없음 | **13종 추가**, mutation 16회 실측 |
| 새 schema 필드 | 0 | **0** (약속대로) |
| `plugin.json` diff | 0 (UI13 · §3.7) | **0** — `version-declaration-guard` exit 0 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 전제 확인 | 완료 | 7개 함수 전건 존재 · `origin/main`이 HEAD의 조상(머지 불필요, 내용 diff 0) |
| 1 | 봉인이 자기 commit·digest를 기록한다 | 완료 | `buildCandidate(repoRoot, doc, plan)` 시그니처 변경 |
| 2 | m10 조상 결속 3분할 · archived PRD | 완료 | `prd_flip`이 `ok:false → ok:true`로 복구 |
| 3 | reseal.js 운영 안전 | 완료 | **계획보다 넓다** — 아래 Deviations 참조 |
| 4 | 리포트 정직성 | 완료 | backlog MEDIUM(비-숫자 응답) 함께 흡수 |
| 5 | registry 열거 실패 degraded | 완료 | security MEDIUM(negative assert) 함께 흡수 |
| 6 | 수락 마커 stripper | 완료 | security S-HIGH-2 흡수로 규칙이 바뀜 |
| 7 | CI 주기 호출 | **부분** | workflow·test 착지. **PR run URL 미확보** — 아래 참조 |
| 8 | 문서 · PRD · CHANGELOG | 완료 | M2·M4 `complete` · OQ 1·5 닫음 · OQ2 관측 갱신 |
| 9 | 라이브 완주와 보고서 | 완료 | 이 문서 |

## Validation Results

plan의 `## Validation` 8단계 **전건**:

| # | 검사 | 결과 |
|---|---|---|
| 1 | 단위·인접 스위트 8파일 | **197/197 pass** |
| 2 | `report.test.js` cwd 독립 (`cd plugins/mccp`) | **41/41 pass** |
| 3 | 커밋된 봉인: meta만 변경, 결속 불변 | exit 0 · `git diff --numstat` = **`2 6`** |
| 4 | 리포트 exit 0 유지 (UI7) + 행 형태 | exit 0 · `{closed:1101,total:2841,pct:38.75,resolved:131,fixed:1}` |
| 5 | m10 seal 축 green, 게이트는 여전히 exit 1 | `seal.ok:true` · `mismatched 0` · `ancestor_bound 1115` · exit 1 ← `dispositions.open 1740` |
| 6 | 라이브 판정 유효성 불변 | `invalid_dispositions` **0 → 0** |
| 7 | `reseal plan` 종료코드가 `plan.ok` 반영 | exit 0 (`ok:true` · carried 1100 · dropped 1 · unjudged 2188) |
| 8 | 선언·삭제 가드 | `version-declaration-guard` exit 0 · 삭제 **0건** |

추가로 `instruction-contract lint` exit 0.

### 광역 회귀 — 그리고 red 2건은 M4 소관이 아니다

변경 모듈 6개를 소비하는 test 전수(14파일 · 292건): **290 pass · 2 fail.**

두 red(`M8-B3-SET-EQUALITY`, `santa-loop-cap` DD3 symlink)는 **선재 결함이다.** 방법으로
확인했다 — M4가 바꾼 6개 모듈을 전부 `HEAD`로 되돌리고 같은 test를 돌리면 **같은 2건이 같은
사유로 실패한다**(fail 2 동일). 둘 다 M4의 `## Files to Change`에 없는 축이라 backlog로 이연했다
(2026-09-14 MEDIUM 2행). 조용히 넘기지 않았다.

### Design Grounding

**N/A (no design trigger).** `impeccable-detect --mode implement` → `skill_available:true` ·
`design_signal:false` · `silent_skip:true reason=no-signal`. 제어면 전용 변경이라 디자인 표면이
없고, Phase 3.6·3.7은 no-op이다. receipt에 `impeccable_silent_skip=true`로 봉인됐다.

## Mutation red/green — 비공허성 실측 16회

test가 실제로 무언가를 잡는지 확인한 기록이다. 각 행은 **그 수정을 되돌리면 red**를 뜻한다.

| Task | Mutation | 결과 |
|---|---|---|
| 1 | `sealed_at_commit`을 전임에서 복사하도록 되돌림 | `not ok 17` |
| 2 | (Task 2 test는 수정 **전** red를 직접 관측) | `not ok 18` → 수정 후 green |
| 3 | lock 획득 제거 | `not ok 20` |
| 3 | 회수 직렬화(`.reclaim`) 제거 — Codex F1 | `not ok 21` |
| 3 | 재생성을 `wx` → `w` — security S-HIGH-1 | `not ok 22` |
| 3 | preflight scrub 제거 | `not ok 26` |
| 4 | `verifyDispositions` 호출 제거 — DD3/B21 | `not ok 35, 36` |
| 4 | 비-숫자 invalid 응답을 clean으로 — backlog MEDIUM | `not ok 41` |
| 4 | 조기 반환에서 앞선 degraded 누락 — B15 | `not ok 38` |
| 4 | 비배열 findings를 통과 — B18 | `not ok 39` |
| 4 | 행에서 `resolved`/`fixed` 제거 — DD4 | `not ok 35, 37, 40` |
| 5 | 모든 오류를 삼키는 `catch` 복원 | `not ok 24` |
| 5 | `err.code` → `err.message` (경로 유출) — security MEDIUM | `not ok 24` |
| 6 | 균형 블록 pre-strip + inline span 제거 | `not ok 33` |
| 7 | `pull_request` 트리거 삭제 | `not ok 1` |
| 7 | checkout을 태그로 unpin | `not ok 4` |
| 7 | `continue-on-error` 추가 | `not ok 3` |
| 7 | CLI를 redirect 그룹 안으로 — DD10 함정 | `not ok 2` |

**Task 4의 비-숫자 가드는 처음에 공허했다** — mutation이 `fail 0`을 냈다. `(v4)`를 추가해 채웠다.
그 한 번이 이 표를 만드는 이유다.

## Backlog triage 표 최종 상태 — **M4** 행과 그것을 닫은 test

| # | 요지 | 닫은 test / 문서 |
|---|---|---|
| B1 | 봉인 sha 형태 검증 없이 아카이브 경로 | `msw-reseal.test.js` "the archive-path guard sits ahead of the manifest write" |
| B2 | `seal_intact` 의미가 한 곳에만 | `debt-inventory.md` `### seal_intact is a narrower claim than it sounds` |
| B15 | 실패 순서에 따라 보고가 달라짐 | `report.test.js` `(o1)` |
| B16·B20 | 디렉토리 열거 실패가 0/0 | `findings-registry.test.js` "readAll degrades when the findings directory cannot be enumerated" |
| B17 | test 5건이 `process.cwd()`에 결속 | `report.test.js` `REPO_ROOT` + 부팅 시 `.git` 단언 (29곳 치환) |
| B18 | `readAll`의 비배열 `findings` | `report.test.js` `(n1)` |
| B21 | 판정 미검증 → 거짓 100% | `report.test.js` `(v1)` `(v2)` `(v3)` |
| B26·B31 | apply TOCTOU, 잠금 없음 | `msw-reseal.test.js` "apply refuses while a live lock is held…" |
| B28 | `buildCandidate`가 commit·digest 승계 | `msw-reseal.test.js` "a re-seal measures its own commit and digests…" |
| B29 | abort 3분류 test 0건 | `msw-reseal.test.js` "each abort leaves the seal untouched and converges…" |
| B30 | 조상 결속 줄은 영구 무검증 | `debt-inventory.md` `### Ancestor-bound lines are validated once, at append time` |
| B32 | A→B→A면 preflight 영구 abort | `msw-reseal.test.js` "debt that moved backwards is refused by the plan…" |
| B33 | plan이 ok:false여도 exit 0 | 같은 test 말미 + `runCli` 단언 |
| B34 | stripper inline·HTML 미제거 | `msw-m10-producers.test.js` "a marker inside a code span or a raw-text block…" |
| B35 | preflight 거부 사유 미스크럽 | `msw-reseal.test.js` "preflight refusals are scrubbed of absolute paths" |

**M4로 분류되지 않은 행**(해소됨·obsolete·이연 유지·범위 밖 20건)은 plan의 triage 표 판정을
그대로 유지한다. 새로 바뀐 것은 없다.

## Deviations from Plan

**D1 — Task 3의 lock이 계획보다 넓다 (게이트가 요구했다).** DD7은 "EEXIST이고 같은 host의 죽은
pid면 1회 회수한다"였다. Implement-Codex R1이 HIGH로 지적했다: 동시 회수자 둘이 같은 죽은 lock을
보면 A가 세운 **살아있는** lock을 B가 옛 관측으로 지운다. 이어 security-reviewer가 S-HIGH-1로
그 흡수조차 불충분함을 지적했다 — A가 unlink한 **직후의 틈**에서 EEXIST를 한 번도 겪지 않은 제3의
프로세스 C가 평범하게 `wx`로 이기고, A의 재생성이 EEXIST를 맞는다.

착지한 형태는 DD7의 **상위집합**이다: 회수를 `.claude/state/reseal-reclaim.lock`으로 직렬화하고,
구간 안에서 소유자를 재확인하고, 재생성도 `wx`이며 그 EEXIST를 `locked`로 **명시 거절**한다
(선례 `pr-phase-lock.js:477-504` 한 줄 차용 — 락 3종 재사용은 여전히 안 한다).

파일명은 `reseal-reclaim.lock`이다. `<lock>.reclaim`으로 두면 `.gitignore:65`의
`.claude/state/*.lock` 단일 레벨 glob에 **걸리지 않아** 매번 untracked로 뜬다. `.gitignore` 편집
0줄이라 `gitignore-drift.yml`도 건드리지 않는다.

**D2 — Task 6의 규칙이 security-reviewer 지적으로 바뀌었다.** Task 6 Action의 "줄 선두"가 균형
블록에도 걸리는지 모호했다. mirror 선례(`intent-claims.js`)는 둘을 **의도적으로 다르게** 다룬다 —
균형 블록 제거는 앵커가 **없고**(`:64-72`), 미종결 open 탐지만 줄 선두다(`:92`). 그리고 그 앵커의
목적은 주석이 밝히듯(`:88-91`) **과다 제거 방지**다. 균형 매칭까지 좁히면 문장 중간에서 열린
`<pre>` 안의 예시 마커가 살아남아 **진짜 승인이 된다** — DD6이 정한 "과다 제거가 안전"의 반대
방향이다. 선례대로 균형 블록은 앵커 없이 매칭한다.

**D3 — Task 3(h)는 test로 도달할 수 없어 순서 단언으로 대체했다.** `archiveRelFor`가 null을 내는
분기는 `apply` 경로에서 **도달 불가**다: `plan.old_sha`는 `planReseal`의 digest 재계산
(`reseal.js:126`)을 통과한 값만 쓰고 `inventoryHash`는 항상 `sha256:`+64 hex를 낸다.
security-reviewer도 같은 판정을 냈다("방어적 하드닝이지 현재 도달 가능한 취약점의 수정이 아니다").
도달 불가한 분기에 통과하는 test를 지어내는 대신, **실제로 회귀할 수 있는 것**(순서)을 소스 스캔으로
단언했다 — 가드가 manifest write 뒤로 되돌아가면 red다.

**D4 — `.claude/state/fix-task.md`가 생겼지만 M4가 쓴 것이 아니다.** receipt write가
`codex_verdict=divergent`를 보고 `stop-review-loop` 채널로 자동 생성했다
(`created_at 08:49:27`, `originating_receipts`가 M4 implement receipt를 가리킨다). UI4의
"fix-task를 편집하지 않는다"는 지켰다 — 편집도 삭제도 하지 않았다. M3가 흡수할 기존 fix-task와는
다른 파일 상태이므로, 커밋 전에 사람이 볼 것.

## Issues Encountered

**I1 — plan-codex receipt가 stale이고, HEAD부터 그랬다.** 게이트 2.5.7 read-back이 `ok:false`를
냈다. 원인 규명:

```
mccp-plan-codex 가 리뷰한 해시   sha256:cd495af9…
HEAD(a925286) 의 plan 해시       sha256:300602ae…   ← 내 편집 이전에 이미 불일치
게이트 편집 후                    sha256:851276…
```

plan 게이트가 해시를 뜬 **뒤에** 자기 산출물(`## Multi-Perspective Fan-out` ·
`## External Research Provenance`)을 plan에 stamp하므로 구조적으로 어긋난다. 그리고 **M3도 같은
상태로 착지했다** — `closure-accounting-m3` implement receipt는 escape 플래그가 전부 `false`인데
plan 해시는 `4d712e44` 대 현재 `859537d0`이다. 즉 이전 사이클들은 이 stale을 **기록 없이**
지나쳤다.

처리: §3.16대로 라운드를 늘리지 않고 감사 우회로 진행했고, 사용자 승인을 받았다. 중요한 것은
**`MCCP_SKIP_RECEIPT=1`이 stale을 지우지 않았다는 점**이다(§1.2대로 누락만 통과) — validator는
계속 진실을 보고하고, `resolution.codex_verdict`는 `divergent` 그대로 봉인됐다. **위장 0건.**
`/mccp:pr`에서 같은 stale이 다시 보일 것이고, PR 본문 `## Gate Deviation`에 기록해야 한다.

실질 델타는 확인했다 — `Tasks`·`Design Decisions`·`User Intent`·`Files to Change`는 불변이고
늘어난 것은 게이트가 쓴 감사 섹션뿐이다. 다만 `cd495af9` 시점 파일이 디스크에 없어 **기계로
증명할 수는 없다.** 그 한계를 적어 둔다.

**I1a — implement receipt는 stale이 아니다 (오탐 정정).** 구현 말미에 `cli.js hash-markdown`으로
plan을 해시해 receipt의 `plan_hash`(`851276…`)와 다른 값(`29414c5…`)을 얻고 "receipt 이후 누가
plan을 고쳤나" 하고 멈췄다. **그 비교 자체가 틀렸다** — `hash-markdown` CLI와 receipt가 쓰는
`plan_hash` 정규화는 같은 함수가 아니다. 권위 있는 답은 validator이고, 그것은 두 명령
(`mccp:prp-implement` · `mccp:pr`) 모두에서 `stale=["mccp-plan-codex"]` 하나만 보고한다 —
`mccp-implement-codex`는 **어느 쪽에도 없다**. plan의 mtime(17:48:28)도 receipt write(17:49:27)보다
앞선다. 기록으로 남기는 이유: 같은 비교를 하는 다음 사람이 같은 오탐에 멈추지 않도록.

**I2 — 비용 tier가 `critical`이다.** receipt write 중 `[mccp:briefing] skipped reason=tier-critical`.
사용자가 인지하고 계속을 선택했다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/reseal.js` | UPDATED | +239 / −6 |
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATED | +85 / −7 |
| `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` | UPDATED | +40 / −5 |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATED | +97 / −16 |
| `plugins/mccp/scripts/lib/closure/cli.js` | UPDATED | +11 / −1 |
| `plugins/mccp/scripts/state/findings-registry.js` | UPDATED | +36 / −10 |
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | UPDATED | +314 / −2 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATED | +79 / −4 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATED | +291 / −29 |
| `plugins/mccp/scripts/lib/tests/findings-registry.test.js` | UPDATED | +40 / −0 |
| `docs/multi-session-work-loop/debt-inventory.json` | UPDATED | **+2 / −6** (meta 2필드) |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATED | +93 / −2 |
| `.claude/prds/closure-accounting.prd.md` | UPDATED | +25 / −9 |
| `CHANGELOG.md` | UPDATED | +39 / −0 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +3 / −0 |
| `.claude/plans/closure-accounting-m4.plan.md` | UPDATED | +84 / −0 (게이트 감사 섹션) |
| `.claude/state/STATE.md` | UPDATED | +5 / −5 (receipt write) |
| `.github/workflows/closure-report.yml` | CREATED | +81 |
| `scripts/tests/closure-report-workflow.test.js` | CREATED | +101 |
| `.claude/state/fix-task.md` | (게이트 생성) | D4 참조 |

## Tests Written

| Test File | 신규 | Coverage |
|---|---|---|
| `msw-reseal.test.js` | 8 | 자기 commit·digest 측정 · m10 조상 분할(비공허 대조 포함) · abort 3종 수렴 · lock 3종(live/dead/abort-release) · 회수 직렬화 · **재생성 틈 주입** · body 없는 lock · 순서 단언 · A→B→A · scrub |
| `report.test.js` | 6 | `(v1)`~`(v4)` 판정 유효성 4갈래(양성 대조 포함) · `(o1)` 순서 무관 · `(n1)` 비배열 findings · `(r1)` DD4 3분할 |
| `msw-m10-producers.test.js` | 2 | archived PRD 폴백(+ 비-complete 대조 + 양쪽 부재) · stripper 11케이스(양성 대조 3 포함) |
| `findings-registry.test.js` | 1 | ENOTDIR degraded · **경로 미포함 negative assert** · ENOENT 불변 · `listWorkUnits` 반환형 불변 |
| `closure-report-workflow.test.js` | 6 | 트리거 4종 · redirect 그룹 밖 · no `continue-on-error` · SHA pin(태그 거부 음성 대조) · permissions · **CLI 실제 spawn** |

## 라이브 완주 산출 (2026-09-14)

```
closure report        exit 0 · wall 188ms
  Sealed commit:      e5d274c4e621541f9a26e42bb85761387c5859b2   ← 정정됨 (was 9093b08)
  sealed 2841 · live 3290 · gap 457 (13.89%)
  Disposed: 1101 / 2841 · Resolved: 131 (fixed 1) · Pct 38.75%   ← 3분할 렌더

m10-coverage-gate     exit 1
  seal.ok             true          (was false)
  bound_lines         1101
  ancestor_bound      1115          (신규 — was mismatched)
  mismatched_lines    0             (was 1115)
  prd_flip            ok:true · .claude/prds/archived/multi-session-work-loop.prd.md  (was "PRD absent")
  dispositions.ok     false · open 1740                          ← exit 1 의 이유

reseal plan           exit 0 · ok:true · carried 1100 · dropped 1 · unjudged 2188
verifyDispositions    invalid_dispositions = 0                   (수정 전후 불변)
봉인 digest 재계산      일치 · git diff --numstat = 2 6
```

**wall clock 188ms** — Risk 표의 "리포트가 느려진다"는 발현하지 않았다. 캐시를 새로 만들지 않았다.

### Task 7 PR run URL — **미확보**

plan의 Acceptance는 "PR에서 `closure-report.yml`이 paths 트리거로 실제 실행돼 job summary가 생긴
run URL"을 요구한다. **아직 없다** — PR을 열지 않았기 때문이다. 이것이 이 milestone에서 유일하게
**충족되지 않은 acceptance 항목**이고, `/mccp:pr` 직후 이 절을 갱신해야 한다. 대신 `(w6)`이 CLI를
실제로 spawn해 exit 0과 출력 형태를 확인하므로, 미확인으로 남는 것은 **GitHub 러너에서의 실행**
하나로 좁혀진다.

## 로컬 코드 리뷰 흡수 (2026-09-15)

`/mccp:code-review`(Local Review Mode)가 커밋 전 diff에서 HIGH 1 · MEDIUM 1 · LOW 3을 냈다.

- **H1 흡수 — Task 6 stripper가 HEAD 대비 회귀였다.** 균형 raw-text 블록 제거가 fence 판정보다
  먼저 문서 전체에 돌아, prose의 `` `<pre>` `` 언급부터 뒤따르는 fence 안의 `</pre>`까지를 한 블록으로
  지우면서 fence 여는 줄까지 삼켰다. 그 결과 fence 안에 인용된 마커가 수락됐다(HEAD 모듈은 거절,
  작업트리 모듈은 수락 — 같은 입력으로 비교 실측). S-HIGH-2 흡수가 과소 제거 경로 하나를 닫으면서
  다른 하나를 열었다. 수정: fence·blockquote·들여쓰기 pass를 먼저 돌리고, 그 결과에만 블록 매칭을
  적용한다. test **(t4)** 2케이스 추가 — 수정 전 코드에서 `:772` red를 확인한 뒤 고쳤다.
- **L1 흡수** — 차단된 행이 `null / null`·`null%`로 찍히던 표 출력을 `not counted (see Denominator)`·`n/a`로.
- **L3 흡수** — workflow `pull_request` paths에 load-time 전이 require 2개(`derive/sources/backlog.js`·
  `receipt/decision.js`)를 추가하고, json 산출물을 실제로 parse하는 step을 뒀다.
- **M1(파일 크기)·L2(successor 소실 시 행 전체 null)** — backlog 2026-09-15 두 행으로 이연.

## M4가 주장하지 않는 것

- **부채를 줄이지 않았다.** `fixed`는 1 그대로다. M4의 수정도 disposition으로 기록하지 않았다.
- **격차의 목표값을 정하지 않았다.** CI는 수치를 보이게 할 뿐 막지 않는다(UI7·UI12).
- **위조 방지가 아니다.** lock은 단일 host 동시 실행만 막는다. §3.12와 같은 위협모델이다.
- **registry 종결률 1.4%는 오르지 않았다.** M3 소관이고 이번에 건드리지 않았다.
- **CI green은 결함이 없다는 뜻이 아니다.** 계기가 실행됐다는 뜻일 뿐이다.
- **조상 결속 줄의 판정이 지금도 유효한지 증명하지 않는다.** append 시점에 한 번 검증되고 그
  뒤로는 세지기만 한다 — 그 한계를 문서에 적었을 뿐 닫지 않았다.
- **plan-codex receipt의 stale을 해소하지 않았다** (I1). 감사 우회로 진행했고 기록을 남겼다.

## M3로 넘긴 것 (UI4 — 편집하지 않음)

- `.claude/state/fix-task-applied.md` — `decision_id: closure-accounting-m3` 축
- backlog 2026-09-14 M3 plan 게이트 이연 9건(L3 1 · L2 8)
- M3 Validation의 test 경로 오기(`state/tests/` → 실제 `lib/tests/findings-registry.test.js`)
- plan의 `## Multi-Perspective Fan-out` findings(전부 M3 plan을 겨냥)

## Next Steps

- [ ] **`/mccp:pr`** — PR 본문에 `## Gate Deviation`으로 I1(plan-codex stale, 감사 우회) 기록 필수
- [ ] PR 생성 후 `closure-report.yml` run URL을 위 "Task 7 PR run URL" 절에 채울 것
- [ ] `.claude/state/fix-task.md`(게이트 생성분) 커밋 여부를 사람이 판단
- [ ] PRD 전 milestone이 `complete`가 됐으므로 **`/mccp:archive-complete`** 대상 — 단, M4가 머지된 뒤에
