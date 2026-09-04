# Implementation Report: review-record-linkage M4 — review-round-structure

**Plan**: `.claude/plans/review-record-linkage-m4.plan.md` (still active — archiving belongs to `/mccp:archive-complete`)
**Branch**: `review-record-linkage-m4`
**Date**: 2026-09-04

## Summary

패널 레코드의 `## Measurement`가 `rounds`를 싣는다. M1이 D1으로 고정한 정의
(`measurement.rounds`가 정수 ≥ 1)를 착지 후 레코드가 실제로 만족하고, 값의 원천은
`write.js`가 `resolution.rounds`를 파생하는 것과 **같은 review-rounds 원장**이라 결정층과
내용층이 같은 수를 말한다.

**라이브 실값**: `.claude/reviews/plan-review-review-record-linkage-m4.md`의 `rounds: 1`
(commit `19c1fc7`). `classifyRoundStructure` → `present`. 신규 모듈 0개 · receipt 스키마 변경 0건.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 예측대로. 가장 비싼 것은 코드가 아니라 acceptance가 HEAD 트리를 요구한다는 사실을 알아채는 것이었다 |
| Files Changed | 12 (표 기준) | 19 실제 (그중 2건은 상류 게이트·M3 잔재로 이 사이클 산출이 아니다). 차이는 범위 확대가 아니라 표의 불완전 — 아래 Deviations 1 |
| 신규 모듈 | 0 | 0 |
| receipt 스키마 변경 | 0 | 0 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `linkage-defs.js` — D1 자격 3값 | Complete | `classifyRoundStructure` 신설. `hasRoundStructure`·`ROUND_STRUCTURE_CONTROLS`·`classifyShipEligibility`·`classifyLink` 무변경(test가 바이트 단위로 단언). `require` 여전히 0건 |
| 2 | `record.js` — measurement에 `rounds` | Complete | `opts.roundLedger` 주입. 4입력 전부 기대값. 키는 항상 존재 |
| 3 | `record.js` — D1 자기 대조 degradation | Complete | `absent`만 발화, `not_enrolled`은 침묵 |
| 4 | `cli.js cmdRecord` — 원장 읽기 + 봉인 대조 | Complete | 존재 검사 선행 · 세 봉인 분기 · 플래그 0개. security S2 흡수로 판독을 `buildReviewRecord` **밖**으로 분리 |
| 5 | `linkage-audit.js` — 3값 집계 + 경계 종료코드 | Complete | 라이브 파티션 보고 + `--check-round-structure [--since]`. security S1 흡수 |
| 6 | 형식 최소 계약 test | Complete | 14키 리터럴 고정. 서술 본문 무제약(UI3) |
| 7 | 배선 부재 test 2종 | Complete | (a) 정적 2건 · (b) 실제 `spawnSync` e2e |
| 8 | 라이브 실값 산출 | Complete | `rounds: 1`. 재생성 전 원본을 커밋으로 보존(Deviations 2) |
| 9 | PRD 표 + CHANGELOG | Complete | PRD M4 행은 plan 게이트가 이미 `in-progress`로 바꿔 뒀다. CHANGELOG는 `## [Unreleased]` 아래(번호 미부여) |

## Validation Results

| # | Check | Result |
|---|---|---|
| 1 | 단위 + 계약 test (5파일) | **127 pass / 0 fail** |
| 2 | 인접 회귀 (4파일) | **69 pass / 0 fail** |
| 3 | `linkage-audit.js` | exit 0 · 라이브 `round_structure: present=1 not_enrolled=0 absent=68` |
| 3 | `--check-round-structure` | exit 0 · `in_scope=1 present=1 absent=0` — **vacuous pass 아님** |
| 3b | 경계 fail-open 부재 (라이브 반증) | 재생성 **전** 같은 명령이 exit 1 · `absent=1`. 두 방향이 실제 코퍼스에서 관측됨 |
| 4 | 동결 baseline 바이트 불변 | `git diff --stat` 출력 0줄 · `round_structure: 0/42` 그대로 |
| 5 | `version-declaration-guard.js` | exit 0 — `plugin.json` 미선언(UI5) |

Level 1(type-check)·3(build)은 **N/A** — 이 저장소에 `package.json`·lint 설정·빌드 툴체인이 없다. Node native test가 전부다.
Level 4(integration)도 N/A — 서버가 없다.

### Design Grounding

**N/A (no design trigger)** — `impeccable-detect --mode implement`가 `design_signal=false`
(`reason=no-signal`). 2.5.5c capture 미실행이므로 Phase 3.7은 완전 no-op이고 Phase 3.6도
트리거 미충족으로 skip. plan의 Design Critique 절이 예측한 대로다(렌더링 표면 0건).

## Files Changed

| File | Action | Note |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | UPDATED | +79 — `classifyRoundStructure` · `ROUND_STRUCTURE_VERDICTS` |
| `plugins/mccp/scripts/lib/plan-review/record.js` | UPDATED | +38 — `rounds` 파생 + D1 자기 대조 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATED | +137 — `readRoundLedgerForRecord` · `compareRoundSeal` · `cmdRecord` 배선 |
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATED | +180 — 3값 집계 · `checkRoundStructure` · CLI 분기 |
| `docs/review-record-linkage/m4-enforcement-boundary.md` | CREATED | DD7 경계의 거처 |
| `plugins/mccp/scripts/lib/tests/linkage-defs.test.js` | UPDATED | +4 tests |
| `plugins/mccp/scripts/lib/tests/plan-review-record.test.js` | UPDATED | +12 tests, 기존 1건 갱신 |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | UPDATED | +12 tests |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATED | +2 tests |
| `CHANGELOG.md` | UPDATED | `## [Unreleased]` 항목 |
| `.claude/plans/review-record-linkage-m4.plan.md` | UPDATED | 게이트 주입 + `Files to Change` 정정 + 이탈 기록 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 이연 1건 |
| `.claude/reviews/plan-review-review-record-linkage-m4.md` | UPDATED | Task 8 산출물 |
| `.claude/prds/review-record-linkage.prd.md` | UPDATED | plan 게이트가 이미 갱신 |
| `.claude/PRPs/reports/review-record-linkage-m4-report.md` | CREATED | 이 파일 |
| `.claude/state/STATE.md` · `fix-task-applied.md` | UPDATED | hook 산출 |
| `.claude/state/findings/…m4.jsonl` · `completion-ledger/…m3….json` | (미산출) | 각각 plan 게이트와 M3가 남긴 것 — 이 사이클의 산출이 아니다 |

## Deviations from Plan

**1. `Files to Change` 표를 구현 중에 4행 늘렸다.**
`plan-conflict-detector.js`가 `file-expansion`으로 잡았고, 확인 결과 결함은 구현이 아니라
**표**였다 — plan이 자기 Task 8의 산출물도, §3.14와 게이트 2.5.4가 요구하는 이연 채널도,
hook이 쓰는 STATE 파일도 열거하지 않았고 `docs/review-record-linkage/`는 디렉토리로만 적혀
있었다. 범위가 늘어난 것이 아니라 표가 처음부터 불완전했다. 정정은 두 차례였다 — 처음 4행(레코드·backlog·STATE 2종)을 더한 뒤 untracked까지 포함해 다시
재면 plan 자신·이 보고서·상류 게이트 산출물 2종이 남아 그 4행도 더했다. 최종 17→21행에서
탐지기 `conflict:false`(tracked·untracked 모두 포함). 표에는 이 사이클이 만든 것과 상류가
남긴 것을 구분해 적었다 — 후자를 자기 산출로 적으면 그것도 부정확이다.
전문은 plan 본문의 "이탈 기록" 블록.

**2. Task 8 실행 전에 기존 레코드를 커밋으로 보존했다 (`c1b3bfa`), 재생성은 별도 커밋(`19c1fc7`).**
plan은 "재생성이 `wall_clock_ms`를 재계산값으로 대체하지만 **원본은 git 이력이 보존한다**"고
적었는데 그 파일은 **untracked였다** — 즉 그 완화가 거짓이었다. 커밋이 그것을 참으로 만든다.
재생성을 별도 커밋으로 둔 이유는 acceptance 때문이다: `--check-round-structure`도 라이브
파티션도 **HEAD 트리**를 읽으므로(작업 트리를 보면 커밋되지 않은 레코드가 통과 근거가 되어
우회가 지표를 강등시키지 않는다) 커밋 이전에는 어느 쪽도 판정할 수 없다.
`/mccp:prp-implement`가 보통 커밋하지 않는다는 점에서 절차 이탈이지만, 이 두 커밋 없이는
이 마일스톤의 유일한 실측 acceptance가 성립하지 않는다.

**3. Phase 2.5.6/2.5.7(receipt write + read-back)을 순서대로 실행하지 않았다.**
2.5.5b 뒤에 곧바로 Phase 3으로 넘어갔고, receipt는 Phase 4 뒤에 썼다. 봉인된 `plan_hash`가
구현 종료 시점의 판본을 가리키므로 오히려 diff와 더 정합하지만, **순서를 지키지 않은 것은
사실**이고 그것을 감춘다면 이 마일스톤이 고치려는 종류의 침묵이다.

**4. plan 본문의 verdict 이름 표류 — `not_applicable` 대 `not_enrolled`.**
DD5·Task 1·Task 5·Acceptance는 `not_enrolled`을, Task 3만 `not_applicable`을 쓴다. 후자는
DD5 개정 이전 판본의 잔재라 `not_enrolled`을 채택했다. 코드·test·문서 전부 그 이름이다.

## Issues Encountered

**1. `plan-review-cli-emit.test.js` 9건 실패 — M4 회귀가 아니다.**
저장소 안에서 9 fail, **저장소 밖에서 12 pass**(같은 커밋·같은 코드). 원인은
`cmdEmitWorkflowArgs` → `resolveRoundBudget()`이 `seal.resolveGitDir(process.cwd())`로
**실제 저장소의 봉인**을 읽는 것이고, 그 봉인은 이 게이트 자신이 Phase 2.5.0에서 썼다
(`mccp-implement-codex__review-record-linkage-m4`, cap 1/1 소진). M4는 `cmdRecord`만
건드렸다. sibling 브랜치 `ci-full-suite-m2`가 이미 같은 축을 고치고 있으므로
(`resolveRoundBudget(opts)`의 프로그래매틱 `opts.gitDir` 시임) **중복 수정하지 않고**
backlog에 관측으로 남겼다. 봉인을 지우면 재현이 없어지지만 그것은 이 게이트의 캡 강제를
끄는 행위라 하지 않았다.

**2. 상류 `mccp-plan-codex` receipt가 stale이다 (미해소, `/mccp:pr`로 이월).**
`validate --command mccp:prp-implement` → **exit 2**, `stale` 1건:
`receipt_plan_hash=sha256:b39fca3d…` vs `current=sha256:bb9acb51…`.
이것은 plan의 R11이 **확정·이미 발생**으로 등재한 구조적 상태다 — R1 흡수 편집이 receipt
봉인 **뒤**에 일어났고(게이트 진입 시점에 이미 stale), 2.5.4의 섹션 주입과 위 이탈 1이
더 벌렸다. 이 저장소의 모든 shipped 사이클이 겪는다(memory: plan-receipt-goes-stale-at-implement).
**해소하지 않았다.** §3.16대로 라운드를 늘려 `/mccp:plan`을 재실행하는 대신, 이 사실을
그대로 보고하고 `/mccp:pr`에서 문서화된 감사 우회 + 사유로 처리한다. 위조는 없다 —
implement receipt 자체는 유효하고 `codex_verdict=skipped`가 정직하게 봉인돼 있다.

**3. 재생성된 레코드의 `wall_clock_ms`는 패널 지속시간이 아니다.**
`360957` → `58316230`(약 16시간). 필드의 정의(패널 시작 → 레코드 기록)는 그대로 참이지만
읽는 사람이 가정하는 "패널이 걸린 시간"은 아니다. plan이 이 대가를 명시적으로 수용했고,
원본은 `c1b3bfa`가 보존한다. 재생성 staleness를 레코드가 스스로 말하게 하는 것은 새 동작이라
이 사이클 범위 밖이다.

## Security Review

`Task(mccp:security-reviewer)` 정상 실행(auto-fallback 없음). CRITICAL 0건 → MCCP-GATE-STOP 미해당.
HIGH 1 · MEDIUM-HIGH 1 · LOW-MEDIUM 1 — **3건 전부 즉시 흡수, 기각 0건.**

| # | 지적 | 흡수 |
|---|---|---|
| S1 (HIGH) | `--since <ref>`가 `isSafeRef`/`--end-of-options`를 우회하는 새 호출부를 만들 수 있다. `ref + '...HEAD'`는 `--output=/tmp/x...HEAD`를 단일 argv 토큰으로 만들고 git의 prefix matcher가 그것을 여전히 `--output`으로 존중한다 — 이 파일이 `--baseline-ref`에서 **실제 재현했던** 임의 파일 쓰기 | CLI 파싱 시점 `isSafeRef` fail-closed + merge-base를 따로 해소해 SHA 두 개를 독립 argv로. ref는 `--end-of-options` 바로 뒤에만 등장. test 2건이 행동과 구조를 각각 단언 |
| S2 (MEDIUM-HIGH) | `sanitizeSlug`(`[A-Za-z0-9._-]`)와 `SLUG_RE`(`^[a-z0-9][a-z0-9-]{0,80}$`)의 비대칭은 traversal이 아니라 **예외 안전성** 구멍 — `resolveStatePath`의 throw를 `buildReviewRecord({...})` 인자 안에서 평가하면 기존 catch가 삼켜 **레코드 자체가 안 써진다**(DD4가 지키려는 바로 그 표본이 사라진다) | 판독을 `buildReviewRecord` 밖의 독립 try/catch로 분리. Validate 7번째 경우(`Alpha.Beta_1`) 추가 — 레코드가 써지고 `rounds: null` + 사유가 남는다 |
| S3 (LOW-MEDIUM) | Task 2의 4입력이 전부 well-shaped라 M3 선례의 malformed-shape never-throw 재단언이 없다 | 12개 병리 입력에 대한 `doesNotThrow` + 결과가 `null` 또는 정수임을 단언 |

`/mccp:pr`의 PR-Codex가 실제 diff를 상대로 이 축들을 처음 본다 — implement 단계에서
Codex는 발화하지 않았다(`MCCP_CODEX_DISABLED=1` 봉인, `classification=disabled`).

## Tests Written

| Test File | Added | Coverage |
|---|---|---|
| `linkage-defs.test.js` | 4 | 3값 각 분기 도달 · `halt_stage` 불변(자기신고 면제 반증, 40조합) · M1 술어 바이트 불변 · 총함수 |
| `plan-review-record.test.js` | 12 | 4입력 fold · 키 항상 존재 · malformed 12종 never-throw · `absent` 선언 / `not_enrolled` 침묵 / `present` · 14키 집합 계약 · CLI (a)~(g) 7경우 · 플래그 0개 구조 단언 · spawn e2e |
| `linkage-audit.test.js` | 12 | 3값 집계(present/not_enrolled/absent 동시 도달) · 동결 무침습 · 경계 **양방향** · not_enrolled 통과 · degraded ≠ pass · out_of_corpus · unresolved · S1 2건 · 종료코드 표 |
| `plan-review-command-body.test.js` | 2 | 모든 `record` 호출의 `--slug` · 봉인과 record의 동일 파생 |

**합계 +30 tests.** 주장 범위는 좁게 유지했다 — Task 7(a)는 "본문 배선이 존재한다"만
주장하고, 런타임 `--slug` override 축은 Task 4의 (d)(e)(f)가 소유한다(R1 finding 6).

## Post-landing local code-review (2026-09-04) — 4축 흡수

`/mccp:code-review`(Local Review Mode)를 착지 diff 전체에 돌렸다. **전부 실측 재현 후**
수정했고 각각 반증 test를 동반한다. CRITICAL 0건.

| # | Sev | 지적 | 재현 | 흡수 |
|---|---|---|---|---|
| H1 | HIGH | degradation이 호스트 절대경로를 git-tracked 레코드에 싣는다. `cmdRecord`는 파일명만 싣겠다고 주석에 적고 `err.message`를 이어 붙였는데, `ledger.js`의 손상 에러가 `'... at ' + statePath`다. §3.12가 `meta.cwd`에 대해 닫았던 유출의 새 locus | 임시 repo + 손상 원장 → `C:\Users\...\review-rounds\...json`이 레코드에 기록됨 | `errCode(err)` 도입 — 원인 enum만 싣는다. 회귀 test는 경로의 **형태**(`[A-Za-z]:\` · `/home/` 등)를 보므로 특정 머신에 묶이지 않는다 |
| H2 | HIGH | `wall_clock_ms`가 음수만 방어해, Task 8 재생성이 6분을 971.9분으로 기록(`360957`→`58316230`). `leadtime.js`가 그것을 라이브 분포 최댓값으로 보고 — 그 도구는 "새 계측을 심지 않는다"고 선언하므로 걸러 낼 수 없다 | `node leadtime.js` → `max=971.9min` | `MAX_PLAUSIBLE_SPAN_MS`(6h) 상한 → `null` + degradation. **clamp하지 않는다**(상한으로 자르면 모르는 사실을 만든다). 값은 `codex-policy.js`의 `MAX_SEAL_AGE_MS`와 같은 관측이고 test가 동치를 붙든다. 해당 레코드 재생성으로 정정 → `max=427.4min` |
| M1 | MEDIUM | `classifyRoundStructure`가 사유를 `JSON.stringify`로 만들어 총함수 계약 위반(순환·BigInt·던지는 `toJSON`). write 경로가 import하는 모듈이라 도달 시 `cmdRecord` catch가 **레코드를 아예 안 쓴다** — DD4가 막으려던 표본 손실 | 세 형태 전부 TypeError 재현 | 값 대신 **형태만** 말하는 총함수 `describe()`. 부수 효과로 반신뢰 입력이 `by_reason` 카디널리티를 정하지 못한다 |
| M2 | MEDIUM | `--check-round-structure`의 두 줄이 서로를 지워(가드 + 무조건 `else if`) `degraded`가 항상 `violations`에 덮인다. 창 안에 파손이 있어도 exit 2 → 1, 요약 경고 소실 | 파손 1 + absent 1 fixture → `state=violations`, exit 1 | `degraded`가 이기게 하고(다 보지 못했으면 위반 수는 하한), 경고는 state가 아니라 **배열 길이**로 발화 |
| M3 | MEDIUM | 경계 상수가 HEAD의 조상이 아니고, 머지 직후 기본형이 깨진다(in-flight 브랜치 3건이 `rounds` 없이 대기) | `git merge-base 2cb173c HEAD` = `52e11d7` | `## Validation` 3번과 boundary 문서를 `--since "$(git merge-base origin/main HEAD)"` 명시형으로. 기본형은 탐색용으로 격하 |
| L1~L4 | LOW | usage의 종료코드 표 미분리 · `--since` 무시가 조용함 · test의 죽은 문장 · 235자 행 | — | 전건 수정 |
| L5 | LOW | `linkage-audit.js` 1075줄(>800) | — | **이연.** 추출은 (a) 공개 표면 확대 또는 (b) 코퍼스 소속 판정 복제 둘뿐이고 후자는 M1 DD1a 금지 사항이다. 줄 수를 줄이는 대가가 단일 소유권이라 backlog로 — 근거는 그 항목에 |

재생성 부작용은 확인했다: findings 레지스트리는 `finding_id`로 dedupe하므로(30 events →
15 findings) 이벤트 로그만 늘고 파생 뷰는 불변이다.

**부수 관측 1건** — H2 상한을 넣자 그때까지 가려져 있던 선재 이상치가 드러났다
(`plan-review-review-loop-bypass-m2.md`, 427.4분). UI1이 소급을 금지하므로 손대지 않고
backlog에 등재했다. 그 존재는 새 상한이 M4 한 건을 위한 특수 규칙이 아니라 실재하는
실패 모드에 맞춰졌다는 증거다.

### 재검증

| # | Check | Result |
|---|---|---|
| 1 | 단위 + 계약 test (5파일) | **133 pass / 0 fail** (+6) |
| 2 | 인접 회귀 (4파일) | **69 pass / 0 fail** |
| 3 | `--check-round-structure --since <merge-base>` | exit 0 · `in_scope=1 present=1 absent=0` |
| 4 | 동결 baseline 바이트 불변 | 출력 0줄 |
| 5 | `version-declaration-guard.js` | exit 0 |
| 6 | H1 라이브 재현 | 절대경로 소멸 · 원인 enum 보존 |
| 7 | H2 라이브 재현 | `wall_clock_ms: null` + 사유 · `rounds: 1` 불변 |

## Next Steps

- [ ] `/mccp:prp-commit` — 남은 코드·test·문서 변경 커밋 (레코드 2건은 이미 커밋됨)
- [ ] `/mccp:pr` — PR-Codex가 실제 diff를 처음 리뷰한다(dedupe 닫힘: plan receipt `review_verdict=divergent`)
- [ ] PR 본문에 **`## Gate Deviation`** 으로 상류 plan receipt staleness(exit 2)를 명시 기록
