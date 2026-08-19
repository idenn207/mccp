# Implementation Report: 환경변수 문서 최신화 + 값 규약 통일

- **Plan**: `.claude/plans/environment-doc-uniformity.plan.md` (본문 무변경 — `plan_hash=sha256:a3c83fa3…`가 봉인된 `mccp-plan-codex` receipt와 MATCH)
- **Branch**: `docs/environment-uniformity` (worktree `.worktrees/environment-uniformity/`)
- **Version**: 1.29.0 → **1.29.1** (patch — 단일 plan ship)
- **Implement-Codex**: `codex_verdict=skipped` (`MCCP_CODEX_DISABLED=1` env 정책) · receipt `mccp-implement-codex/environment-doc-uniformity.json`

## Summary

`docs/ENVIRONMENT.md`가 낡은 두 축을 한 단위로 닫았다. **문서가 코드를 못 따라가던 축**(실 토글 117개 중 22개 미등재 · 문서에만 있는 이름 10개 · `defaults_conflicts` 1건)과 **값의 어휘가 토글마다 달랐던 축**(production 코드에 boolean 파싱 규약 8종 공존)이다.

해법은 «문서를 고치는 것»이 아니라 **선언을 하나로 만들고 문서를 그 투영으로 바꾸는 것**이다. `env-contract/registry.js`가 157개 이름을 단일 선언하고, `value.js`가 그 선언만 읽어 파싱하며, 색인과 상세 문서는 레지스트리에서 파생 가능한 형태로만 값을 적는다. 세 면의 정합은 `lint.js`의 9개 fail-closed 검사가 강제한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 예측대로 |
| 레지스트리 항목 | 117 + 24 + 7 + 2 ≈ 150 | **157** (외부 prefix가 24가 아니라 28) |
| Files Changed | ~30 (Files to Change) | **56** (+ `docs/environment/` 8장 · `env-contract/` 7파일 신설) |
| 이관 지점 | 8종 규약 | raw 비교 44곳 + 로컬 파서 13개 → 전부 `parseBool` |
| 색인 크기 | ≤ 28,000 B | **27,297 B** (99,040 B에서 축약, 보존 손실 0) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 수용 집합 균일성 감사 | 완료 | 감사표 4/9/3을 Validation 0b가 재산출해 **일치**. 계측 정의 정정 1건(아래 D1) |
| 1 | 값 규약 파서 신설 | 완료 | `value.js` — 7개 export, kind 분기, 미등록 이름 throw |
| 2 | 토글 레지스트리 신설 | 완료 | `registry.js` — 157항목, `Object.freeze`, ASCII 이름 불변식 |
| 3 | TOGGLE_DEFAULTS 진실원 통합 | 완료 | 56개 리터럴 → 레지스트리 파생(112개). `defaults_conflicts` 0 |
| 4 | boolean 파서 이관 | 완료 | 3배치 51치환 + command body 4곳. lint L9 = 0건 |
| 5 | 정합 lint 신설 | 완료 | `lint.js` 9검사 + `scan.js#walkSurfaces` 단일 범위 소유 |
| 6 | 상세 문서 8장 신설 | 완료 | 140개 앵커 전부 사용 예시 보유 · 원문 150줄 보존 |
| 7 | 색인 재작성 | 완료 | 6열 156행 + 도메인 목차 8줄 |
| 8 | 인바운드 포인터 정합 | 완료 | CLAUDE.md ×2 + instruction-contract S4.2. lint C1~C4 pass |
| 9 | 버전 4면 동기 | 완료 | plugin.json · html.js · markdown.js · CHANGELOG |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 0 module contract | Pass | bypass-flag 집합 3개 이름 일치 · bool-null 0 · walkSurfaces 363파일 |
| 0b 수용 집합 감사 | Pass | `{SKIP_RECEIPT:4, ALLOW_CODEX_UNAVAILABLE:3, CODEX_DISABLED:9}` — Task 0 표와 일치 |
| 0c 이관 목록 완전성 | Pass | 스캔된 raw-비교 파일 전건이 Files to Change에 있음 |
| 0d 경고 도달성 | Pass | command body 4블록, `2> /dev/null` 0건 |
| 1 진단 재산출 | Pass | toggles=117 registry=157 undocumented=0 conflicts=0 |
| 2 삼각 정합 lint | Pass | 9/9 **보고되고** 통과 (보고되지 않은 검사는 통과가 아님) |
| 2b 사용 예시 커버리지 | Pass | **140/140** (존재 + JSON.parse + values 정합) |
| 3 고아 줄 검사 | Pass | **0** — 축약이 삭제가 아니라 이전임이 기계로 확인됨 |
| 4 색인 형태 | Pass | 27,297 B · 156행 6열 · stale 마커 0 |
| 4b heading depth | Pass | 9개 파일 전부 depth ≤ 3 |
| 5 지시문 도달성 | Pass | instruction-contract C1·C2·C3·C4 |
| 6 version 4면 | Pass | 1.29.1 |
| 7a 신규 test 실재 | Pass | 3/3 |
| 7b 전수 회귀 | **Pass (선재 실패 1건 제외)** | **4249 tests / 4233 pass / 1 fail** — 아래 참조 |
| 7c 비공허성 | Pass | T-BYPASS=30 · REGISTRY=157 · fixtures=9 (js=1 md=1) · L8-order=ok · walk-spy=2 |
| 8a bool 확대 라이브 | Pass | `on`=true · `1`=true · `off`=false |
| 8b bypass-flag 불변 라이브 | Pass | `true`=inert · `enabled`=inert · `1`=active |

### 7b의 단일 실패는 선재 결함이다

`hooks/tests/ecc-context-monitor.test.js` — `Axis B (f): default thresholds → $85 emits COST WARNING`.
**같은 test가 `origin/main`(HEAD `1fc8657`) 체크아웃에서도 동일하게 실패한다**(baseline worktree를
따로 만들어 대조: 양쪽 모두 23 tests / 22 pass / 1 fail, 실패 test 이름 동일). 이 변경이 만든
회귀가 아니며, 본 plan의 범위 밖이라 고치지 않고 기록한다.

**환경 주의**: `MCCP_REVIEW_SINGLE_PASS`가 셸에 설정된 상태로 전수 회귀를 돌리면 santa CLI test
30여 건이 실패한다 — §3.15대로 `begin-round`가 exit 2(`SANTA_SINGLE_PASS_ACTIVE`)를 내기 때문이고
이 역시 선재 조건이다. 위 수치는 그 변수를 unset하고 측정했다.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/registry.js` | CREATED | 157항목 단일 선언 |
| `plugins/mccp/scripts/lib/env-contract/value.js` | CREATED | parseBool/parseEnum/parseIntInRange/parseList |
| `plugins/mccp/scripts/lib/env-contract/scan.js` | CREATED | `walkSurfaces` — 범위의 단일 소유자 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | CREATED | L1~L9 fail-closed + `--json` CLI |
| `plugins/mccp/scripts/lib/env-contract/tests/{value,registry,lint}.test.js` | CREATED | 41 tests |
| `docs/environment/{gates,review,orchestration,cost,hooks,observability,external,retired}.md` | CREATED | 상세 8장 |
| `docs/ENVIRONMENT.md` | UPDATED | 99,040 B → 27,297 B 색인 |
| `plugins/mccp/scripts/state/toggle-snapshot.js` | UPDATED | TOGGLE_DEFAULTS 파생 + env-contract 스캔 제외 |
| 코드 이관 26파일 · command body 3파일 | UPDATED | raw 비교 → `parseBool` |
| `CLAUDE.md` · `instruction-contract.md` | UPDATED | §11 → §3 포인터 정정 |
| `plugin.json` · `renderer/{html,markdown}.js` · `CHANGELOG.md` | UPDATED | 1.29.1 |
| `plugins/mccp/scripts/lib/tests/{subscription,orchestration-runaway}.test.js` | UPDATED | 구 어휘 고정 해제 (D8) |

## Deviations from Plan

**D1 — Validation 0b의 계측 정의를 정정했다.** 계획서 스니펫의 `sites++`는 «이름이 등장하는 모든
비주석 줄»을 세는데, Task 0 감사표의 4/9/3은 **실제 read site** 수다. 실측하면 전자는 16/17/6이라
표와 결코 맞지 않는다(문자열 메시지·상수 키·usage 텍스트까지 세기 때문). 표가 정본이므로 read
site만 세도록 고쳤고, 그 정의로 재산출한 값이 **정확히 4/9/3**이다. 감사의 의도는 그대로 지켰다.

**D2 — `MCCP_GOAL_FEATURE` · `MCCP_ULTRACODE_FEATURE`를 `bool`이 아니라 `enum`으로 등록했다.**
두 detector는 `available|missing|unknown` 3상태를 받고 미설정이면 settings 신호를 실제로 probe한다
(`goal-detect.js:59` · `ultracode-detect.js:50`). boolean으로 등록하면 `parseBool`이 3상태를 2상태로
뭉갠다. 이 둘의 `default: null`은 «확정 불가»가 아니라 «리터럴 default가 존재하지 않는다»는 사실이다.

**D3 — `MCCP_MULTI_SESSION_SCAN`은 3상태라 존재 검사를 따로 뒀다.** 명시 off = kill switch,
명시 on = opt-in, 미설정 = 호출자의 `opts`가 결정. `parseBool` 하나로는 미설정과 off를 구분할 수
없으므로 `worktrees.js`에서 존재 여부를 별도로 본다. 값 비교가 아니라 길이 검사로 한 것은 lint L9가
그것을 raw 비교로 오인하지 않게 하기 위함이다.

**D4 — `CODEX_DEDUPE_AT_PR`을 `bypass-flag`가 아니라 `string`으로 등록했다.** 활성화가 PR-Codex를
skip시키므로 성격은 가깝지만, `bypass-flag`는 DD1이 **이름까지 3개로 못 박았고** registry test가
집합 동일성을 단언한다. 이 이름은 운영자의 escape가 아니라 게이트가 스스로 도출해 자식 프로세스에
넘기는 신호이고, 파싱도 JS가 아니라 셸 비교라 공유 파서를 지나지 않는다. `values: ['1']`로 실제
어휘는 정직하게 적었다. (레지스트리에 주석으로 이 판단을 남겼다.)

**D5 — `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`을 레지스트리에 `test-only`로 추가했다.** 계획서
Task 3이 지시한 `defaults_conflicts` 해소 방법 그대로다. 파생 규칙이 `test-only`를 분자에서 빼므로
모순이 사라진다(실측 conflicts 1 → 0).

**D6 — `scanRuntimeSurface`가 `env-contract/`를 제외하도록 고쳤다.** 레지스트리는 은퇴한 이름까지
**이름으로** 적으므로, 스캐너가 그 파일을 세면 «선언»이 «사용»으로 집계된다. 실측: 제외 전
`toggle_count` 117 → **127**, 그리고 은퇴 이름이 런타임 표면에 되살아났다. 자기참조를 끊는 최소
변경이며, lint의 `walkSurfaces`가 같은 이유로 같은 디렉토리를 빼는 것과 짝이 맞는다.

**D7 — 색인 데이터 행은 파이프 주변 공백을 두지 않는다.** 157행 × 10바이트가 곧 1.5 KB이고, 그것이
28,000 B 상한을 넘느냐 마느냐를 갈랐다. 렌더 결과와 열 수 계약은 동일하다.

**D8 — 기존 test 2건을 새 계약으로 갱신했다.** `subscription.test.js`는 `yes`/`true`를 false로,
`orchestration-runaway.test.js`는 `enabled`를 불량값으로 고정하고 있었다 — 둘 다 이 plan이 의도적으로
교체하는 **구 어휘**다. 통과시키려고 느슨하게 만든 것이 아니라 **더 넓게** 다시 썼다: 별칭 집합
전량을 양방향으로 단언하고, 오타는 여전히 기본값으로 떨어지는지까지 본다.

**D9 — 계획서의 L8 fixture 예시(`path.resolve("package.json")`)를 쓸 수 없었다.** 이 저장소에는
`package.json`이 없다(Phase 0에서 확인). 그 경로는 실재하지 않으므로 두 순서 모두가 거부해 fixture가
**공허**해진다 — 계획서가 스스로 경고한 바로 그 실패다. `__filename`을 쓴다: 런타임 계산이라 커밋물에
절대경로가 0건이고, 디스크에 반드시 실재하므로 순서를 실제로 구분한다. test가 `fs.existsSync`로 그
전제를 먼저 단언한다.

**D10 — Validation 블록을 스크래치패드 스크립트 파일로 실행했다.** Bash 도구가 `node -e` 문자열의
백슬래시를 한 단계 먹어 `[\/\\]` 같은 정규식이 문법 오류가 된다(실측). 계획서 Task 5가 «0b·0c를
스크립트 파일로 꺼내는 것은 범위 밖»이라 한 것은 **커밋되는 lint 대상으로 만드는 것**을 가리키므로,
커밋되지 않는 실행 수단으로 쓰는 것은 그 범위와 충돌하지 않는다. 로직은 계획서 본문과 동일하다(D1 제외).

## Issues Encountered

**증거 claim 충돌 (해소).** implement receipt를 쓰려 할 때 `environment-doc-uniformity` 작업 단위를
직전 세션(`c87e63e1`, 같은 `claude.exe` PID)이 점유하고 있어 `other-live-holder`로 거부됐다. PID가
살아 있어 조기 승계가 불가했으므로 **가드를 약화하지 않고** 15분 TTL 만료를 기다린 뒤 재시도해
성공했다. `MCCP_EVIDENCE_CONFLICT_GUARD=warn`은 쓰지 않았다.

**security-reviewer 9건 판정.** CRITICAL 1 / HIGH 2를 이번 cycle에서 흡수하고 나머지는 §3.14대로
backlog로 보냈다(기각 2건은 증거 첨부). 상세는
`.claude/notes/environment-doc-uniformity-implement-review.md`. 흡수분 중 실질적인 둘:

- **F2 (HIGH)** — 모듈 상수 별칭이 L9를 피해 «raw 비교 0건»이 fail-open으로 참이 되던 문제. L9가
  이제 직접 비교 · load-time 별칭 포획 · 구조분해 **세 형태**를 본다. 별칭 해석이 파일 안 1단계까지라는
  한계는 `lint.js` 헤더에 명시했다 — 그 한계를 적는 것이 «0건» 보고를 정직하게 만든다.
- **F3 (HIGH)** — 위 D9. 리뷰어의 공격선이 계획서 자신의 fixture 결함을 드러냈다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `env-contract/tests/value.test.js` | 13 | T-BYPASS 적대 코퍼스 30조합 · 별칭 양방향 · fail 방향 · 미등록 throw · prototype 오염 |
| `env-contract/tests/registry.test.js` | 14 | bypass-flag 집합 동일성 · default/극성 정합 · ASCII 이름 · freeze · 분류 합계 |
| `env-contract/tests/lint.test.js` | 14 | L1~L9 각각 붉어지는 fixture · `.js`/`.md` 양쪽 · L8 순서 · walk-spy |

## Next Steps

- [ ] `/mccp:prp-commit` — 커밋
- [ ] `/mccp:pr` — **진입 직전 §3.7대로 version target 재계산**(main이 1.29.1을 선점했으면 상향 후 Validation 6 재실행)
- [ ] 머지 후 worktree 정리(§3.8)
