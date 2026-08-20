# Implementation Report: santa 증거 다양성 M2 — 상시 스코프 + 정합 rubric

**Plan**: `.claude/plans/santa-evidence-diversity-m2.plan.md` (본문 무편집 — `plan_hash` 봉인 유지)
**Source PRD**: `.claude/prds/santa-evidence-diversity.prd.md` · Milestone 2
**Branch**: `santa-evidence-diversity` · **Version**: `1.28.2 → 1.29.1` (§3.7 재계산 — origin/main이 `1.29.0`까지 나가 forward-only 상향)

## Summary

리뷰 스코프가 `git diff`인 한, *두 문서의 관계*인 불변식은 PRD가 diff에 없을 때 구조적으로
검증 불가다 — #125가 실측한 결함이 그것이다. M2는 신규 순수 oracle `scope-always.js`와
`cli.js scope-always` subcommand로 **현재 decision의 plan + 그 plan이 스스로 선언한 Source
PRD**를 diff 여부와 무관하게 스코프에 넣고, 고정 rubric 1행이 그 쌍을 워킹트리 기준으로
대조하게 한다. 리뷰어 수는 늘리지 않았다(UI2) — 바뀐 것은 무엇이 스코프에 들어가는가 하나다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 12 | 13 (+`.claude/notes/…-m2.md` — 게이트 산출물 반입처) |
| 신규 회귀 test | 미명시 | 23건 (santa-lanes M2 블록) |
| oracle export | "6종" | **8종** — plan `:192`의 산문 off-by-one(열거는 7개) + `MAX_ALWAYS_PATHS` |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `scope-always.js` 순수 oracle | Complete | export 8종. security CRITICAL 흡수로 `toRepoRelative` 경계 추가 |
| 2 | `cli.js scope-always` | Complete | 발견 단계(`pairs`/`unresolved`) CLI 소유로 확정 |
| 3 | `santa-loop.md` Step 1·2·3 | Complete | `TMPDIR_SANTA` 정의를 Step 1로 이동 + 주석 2곳 정정 |
| 4 | `santa-lanes.test.js` 확장 | Complete | 23건 신규 (총 47) |
| 5 | 모듈 집합 가드 확장 | Complete | 3목록 등재, 단언 삭제 0건 |
| 6 | 게이트 경로 1회 완주 실측 | Complete | probe 워크트리, 4건 전부 관측 |
| 7 | 문서 4면 + PRD 정정 + version | Complete | ENVIRONMENT · ownership · PRD · 4면 동기 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 1. P2 회귀 + 모듈 가드 | Pass | `santa-lanes` 47 · `santa-loop-cap` 48 pass / 3 skipped(선재) |
| 2. santa 전량 무회귀 | Pass | `santa-adjudication`+`santa-gate`+`santa-seal`+`santa-review-gate` **134/134** |
| 3. version 4면 동기 | Pass | `i18n-surface` 10/10 (기대값을 `plugin.json`에서 파생) |
| 4. CLI 필수 플래그 거부 | Pass | `scope-always --decision x` → exit 2 |
| 5. 소유권 표 등재 | Pass | `grep -c 'scope-always.js'` → 2 |

### Design Grounding (v1.18.22)

**N/A (no design trigger)** — `impeccable-detect --mode implement`가 `design_signal=0`
(`silent_skip`, `reason=no-signal`). Phase 2.5.5c capture 미수행 → Phase 3.7은 완전 no-op.
Phase 3.6 DESIGN FINISH도 트리거 미발화로 skip. Task 7이 건드린 `renderer/html.js` ·
`markdown.js`는 version 리터럴 1개씩이라 rendered surface의 구조·색·마커·항목 수가 무변경이다.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/scope-always.js` | CREATED | +215 · 순수 oracle (외부 require: builtin `path` 1개) |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATED | `scope-always` subcommand + `resolveInRepo`/`discoverSlugPlans` + usage/switch |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | Step 1 병합 블록 · Step 2 고정 행 · Step 3 `--rubric-file` · 주석 2곳 |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | UPDATED | M2 블록 23건 + env 헬퍼 확장 + code-review 회귀 5건 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATED | 모듈 집합 · receipt-free · require allowlist 3목록 + 커맨드 본문 구조 test 3건 |
| `docs/ENVIRONMENT.md` | UPDATED | `MCCP_SANTA_ALWAYS_SCOPE` 등재 |
| `docs/santa-loop/ownership.md` | UPDATED | P2 M2 export 계약 + 연 파일 근거 + P3 소비 계약 + 표 근거 정정 |
| `.claude/prds/santa-evidence-diversity.prd.md` | UPDATED | Milestone 2 complete · Scope (2) 정정 · OQ 2건 해소 · 1건 신규 |
| `CHANGELOG.md` | UPDATED | `## [1.29.1]` + `currently` 노트 + code-review 흡수 절 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | `1.29.1` |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer version 동기 |
| `.claude/notes/santa-evidence-diversity-m2.md` | CREATED | 게이트 산출물 + Task 6 실측 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 패널 · security 판정 2행 |

## Deviations from Plan

1. **게이트 산출물을 plan 본문이 아니라 노트에 기록** — `## Codex Implementation Review`를
   plan에 주입하면 `plan_hash`가 바뀌어 방금 재발행한 `mccp-plan-codex` receipt가 stale이
   되고 `/mccp:pr`이 §3.11 guard 2에 막힌다. M1·santa-adjudication M1~M3의 선례를 따랐다.
2. **export "6종" → 8종** — plan `:192`가 6이라 적었으나 `:195-207`의 열거가 7개이고
   (`ENV_ALWAYS_SCOPE`·`ALWAYS_SCOPE_DEFAULT`·`ALWAYS_SCOPE_VALUES`·`parseAlwaysScope`·
   `sourcePrdFrom`·`mergeScope`·`CONSISTENCY_RUBRIC`), Task 4가 요구하는 절삭 단언에는
   상한 값이 필요해 `MAX_ALWAYS_PATHS`를 함께 export했다(`lanes.js`의 `MAX_TARGET_PATHS`
   선례). plan review LOW finding이 지적한 산문 off-by-one이며 backlog에 등재돼 있다.
3. **containment 정책 분리** — plan Task 2의 "전 경로 `assertContained`"를 문자 그대로
   따르면 부재 경로가 exit 2가 되어 DD4와 충돌한다(`path-containment.js:30-36`이
   `fs.realpathSync` 실패를 전부 `PATH_ESCAPES_GATE`로 던진다). 필수 입력은 그대로 두고
   도출 경로만 (1) 문자열 이탈 거부 + (2) 던지지 않는 realpath 격납/존재 확인으로 나눴다.
   직전 plan-review 패널의 security HIGH가 지목한 모순이며 그 처방을 그대로 이행했다.
4. **`unresolved` 항목에 `reason` 필드 추가** — plan은 `unresolved[]`만 규정했으나 이유
   없는 드롭은 "조용하지 않게 한다"(DD4)를 절반만 지킨다. Step 1이 그 이유를 stderr에 찍는다.

## Issues Encountered

1. **plan 게이트 슬러그 불일치** — 진입 시 `mccp-plan-codex` receipt가 PRD-레벨 슬러그에
   파일링돼 있어 게이트가 막혔다(게이트 미실행이 아니라 파일링 불일치 — `plan_hash` 바이트
   일치로 확인). §3.15가 파일명 변경을 금지하므로 같은 본문에 패널을 정상 슬러그로 1패스
   재발행했다. verdict는 `divergent` 그대로 봉인.
2. **같은 본문에서 두 패널이 갈렸다** — 직전 4/4 fail·blocking 10 → 재발행 3/4 pass·blocking 2.
   직전 security HIGH를 재발행 security 리뷰어는 pass로 판정했다. 앞 판정은 철회하지 않고
   (그 모순은 코드로 재확인된 실재) 위 3번으로 고쳤다. 기록 대상은 판정 불안정 자체다.
3. **Codex 미발화** — `MCCP_CODEX_DISABLED=1`이 user-level settings에 상주해
   `classification=disabled`. `codex_verdict='skipped'`라 cross-gate dedupe는 fail-closed
   유지 → `/mccp:pr`에서 PR-Codex가 실제 발화한다. 이 사이클의 cross-model 축은 비었고
   security-reviewer가 그 자리를 대신하지 않는다.
4. **probe 워크트리 삭제가 1회 실패** — Windows 파일 잠금으로 `git worktree remove`가
   `Permission denied`. `rm -rf` + `git worktree prune`으로 해소. 브랜치 `santa-m2-probe`는
   증거 트레일로 보존(M3 선례).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `santa-lanes.test.js` (M2 블록) | 23 | env 방향 4 · `sourcePrdFrom` 6(보안 경계 1건이 8 케이스) · `mergeScope` 5 · 고정 rubric 1 · CLI 계약 5 · #125 회귀 2 |
| `santa-loop-cap.test.js` | 확장 | 모듈 집합 · receipt-free · require allowlist (단언 삭제 0) |
| `santa-lanes.test.js` (code-review 흡수) | 5 | `dropped` 계약 2 · `toRepoRelative` export 1 · off/enforce 정규화 등가 1 · 후보 상한·pairs 스코프 불변식 1 |
| `santa-loop-cap.test.js` (code-review 흡수) | 3 | rubric 행 기계적 배선+착지 확인 · `$TMPDIR_SANTA` 재선언 · `PATHS_STATE` 3상태 분기 |

## 측정하지 않은 것 (한계)

- **포착률**. 회귀 fixture가 증명하는 것은 스코프이지 포착이 아니다 — 리뷰어가 불일치를
  실제로 잡는지는 LLM 행위라 셸로 단언할 대상이 없다. test 이름과 주석에 명시했다.
- **receipt 봉인 부재**(DD7). 상시 축이 조용히 0건을 낸 실행은 receipt만 봐서는 M1 시절
  실행과 구분되지 않는다. PRD Open Question으로 등재.
- **폐포의 완전성**. 형제 milestone plan 간 불일치 등 놓치는 변종이 있을 수 있다. 그것이
  나오면 넓힘의 근거가 되는 실측이지 지금 넓힐 근거가 아니다(반대 방향 실측이 7 MB).

## `/mccp:code-review` Local Mode 흡수 (HIGH 2 · MEDIUM 4 · LOW 2)

구현 완료 후 돌린 로컬 리뷰의 지적을 전건 수용했다. §3.14가 MEDIUM/LOW를 backlog로
이연하라 하지만 사용자가 명시적으로 전건 수용을 지시했으므로 그 자리에서 닫았다.

| # | Sev | 결함 | 수정 |
|---|---|---|---|
| H1 | HIGH | `plugin.json` `1.28.3`이 origin/main의 `1.29.0`보다 뒤려 머지 시 version이 역행한다 | `1.29.1`로 forward-only 상향 + 4면·ENVIRONMENT 라벨 재동기 |
| H2 | HIGH | quoted heredoc이 `$CONSISTENCY_RUBRIC_ROW`를 전개할 수 없는데 산문은 verbatim 복사를 요구 — 리터럴로 남아도 exit 0 | 셀이 `printf`로 배선 + `grep -qF`로 착지 확인 후에만 리뷰어 기동 |
| M1 | MED | Step 3가 `$TMPDIR_SANTA`를 재선언하지 않아 빈 변수 시 paths 파일이 루트에 떨어진다 | 상수 1행 재선언(idempotent) |
| M2 | MED | 후보 상한=경로 상한이라 절삭이 나고 `pairs`가 스코프 밖을 가리킨다 | `MAX_ALWAYS_CANDIDATES = MAX_ALWAYS_PATHS / 2` |
| M3 | MED | `paths` 부재와 미변경 빈 배열을 한 분기가 삼켜 오진한다 | `absent`/`empty`/`ok` 3상태 분리 |
| M4 | MED | `off`가 diff 경로를 날것으로 통과시켜 `enforce`와 스코프가 갈린다 | 두 모드 동일 병합 + `dropped` stderr 표면화 |
| L1 | LOW | PRD Open Questions 리스트가 빈 줄로 쪼개짐 | 빈 줄 제거 |
| L2 | LOW | `pairs[].plan`과 `paths`의 표기가 갈릴 수 있음 | `toRepoRelative` export 후 발견 단계가 같은 규칙 사용(export 8 → 9) |

수정은 전부 회귀 test로 잠그고(상표 8건), plan 본문은 `plan_hash` 봉인 유지를 위해
손대지 않았다 — 따라서 plan이 적은 `1.28.3`·`export 6종` 같은 값은 그대로 남고
산문과 구현의 차이는 이 문단과 CHANGELOG가 소유한다.

## Next Steps

- [x] `/mccp:code-review` (Local Mode) — HIGH 2 · MEDIUM 4 · LOW 2 전건 흡수
- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(이번에 `1.29.1`로 상향했으나 main이 또 나갈 수 있다)
- [ ] PRD 전 milestone 완료 후 `/mccp:archive-complete` (M3 `pending` 잔존이라 아직 아님)
