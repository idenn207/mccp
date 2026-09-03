# Implementation Report: leadtime-observability M3 — one-line-consumption

> Plan: `.claude/plans/leadtime-observability-m3.plan.md` (본문 무편집 — `plan_hash` 봉인)
> 게이트 기록: `.claude/notes/leadtime-observability-m3.md`

## Summary

M1(벽시계)·M2(패널 종료→ship)가 standalone 도구 안에만 살던 것을 **소비 회로 하나**로 잇는다.
derive가 `model.leadtime`을 싣고, renderer가 STATUS.md·status.html 상단 상태 띠 바로 다음에
값과 커버리지를 **함께** 붙인 한 줄을 내며, 같은 투영이 git-tracked
`.claude/state/leadtime/distribution.json`으로 떨어져 C7이 worktree 밖에서 인용할 수 있다.

새 계측은 심지 않았다. 오라클·수집·CLI 계약은 그대로 두고 **투영 함수 하나와 spawn 게이트
하나**만 더했다. CLI 사람 출력까지 같은 한 줄로 시작하게 되어 네 면이 한 문장을 공유한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 26행(중복 2행 포함 → 실 24) | 신규 8 · 수정 12 (계 20) + 산출물 1 |
| 신규 test 파일 | 4 | **5** (`derive/tests/leadtime-source.test.js` 추가 — plan Validation이 실행하지만 어떤 Task도 만들지 않았다) |
| version | `1.35.0` (minor) | `1.35.0` — origin/main이 `1.34.4`로 움직였으나 minor 자리는 forward-only라 상향 불필요 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `leadtime.js` — spawn 게이트 + 순수 투영 | 완료 | `allowGit`(기본 true) · `summarizeForSurface` · 헤더 M3 절 |
| 2 | 한 줄 포매터 `leadtime-surface.js` | 완료 | 단위 어휘 소유 이전(순환 회피) · `assertCoverageAdjacency` |
| 3 | derive source + 모델 필드 | 완료 | `leadtime-derive.js` · `model.js` · `index.js` · 렌더 진입점 **둘** |
| 4 | 렌더 한 줄 (md + html) | 완료 | **배선 경로가 plan과 다르다** — 아래 Deviations D1 |
| 5 | distribution 파일 writer | 완료 | `cmdRender` 단독 배선 · unique tmp |
| 6 | 회귀 test | 완료 | 5면(계획 4면 + `leadtime-source.test.js`) |
| 6b | backlog HIGH 2건 흡수 | 완료 | 100칼럼 초과가 지목된 2줄이 아니라 **5줄**이었다 — D4 |
| 7 | 문서 2면 + PRD | 완료 | 동결 블록 바이트 일치 재확인 |
| 8 | §3.7 version 4면 + CHANGELOG | 완료 | `1.34.3 → 1.35.0` |

## Validation Results

| # | 항목 | Status | Notes |
|---|---|---|---|
| 1 | 도구 계약(git 모드 동치 · 강등 표면화 · 두 앵커 키) | 통과 | |
| 2 | 포매터 — 값 부재는 0이 아니고 지표 4는 한 줄에 없다 | 통과 | |
| 2b | DD14 인접성 + **짝 없는 입력이 실제로 붉어진다** | 통과 | falsifier가 no-op이 아님을 확인 |
| 2c | DD12 — 투영에 경로·레코드명·해시 0건 (성공 경로) | 통과 | |
| 2d | DD12 실패 경로 — sentinel 닫힌 열거형 | 통과 | 10/10 (의존성 주입) |
| 3 | 실제 렌더 산출물 — 상태 띠 **바로 다음** | 통과 | md·html 양면 |
| 3b | auto-refresh 경로도 한 줄 · tracked 파일 미기록 | 통과 | 양방향 |
| 4 / 4b | C7 산출물 · 한 줄과 동일 투영 · tracked 경로 | 통과 | |
| 5 | DD6 content-stability (**반환값** 판정) | 통과 | 8/8 |
| 6 | 회귀 test 6파일 | 통과 | **112/112** |
| 6b | 사람 출력이 공유 한 줄로 시작 · 전 줄 ≤ 100칼럼 | 통과 | 최대 91칼럼 |
| 7 | renderer + derive 스위트 회귀 | 통과 | renderer 683/683 · derive 147/147 |
| 8 | UI7 — `corpus.js` 무변경 (base + worktree) | 통과 | |
| 9 | UI11 — 게이트 배선 diff 공집합 (base + worktree) | 통과 | |
| 10 | §3.5.1 — 삭제 파일 0건 | 통과 | 빈 출력 |
| 11 | §3.7 version 4면 동기 | 통과 | i18n-surface 10/10 |
| 12 | plan L1 | exit 0 · 9 violation | 전부 `C3_CREATE_EXISTS` — CREATE 대상이 **구현으로 실재하게 된** 사후 상태다. L1은 구현 전 lint이므로 결함이 아니다 |

추가 확인 (Acceptance):

- (a)(b) `.claude/cache/STATUS.md`·`status.html` 상단에 값+커버리지 한 줄 실재.
- (c) `.claude/state/leadtime/distribution.json`이 두 앵커 키를 모두 갖고 실재 · tracked.
- (d) 두 번째 렌더에서 mtime **불변**(`1788413265064.2354` 동일) — content-stable.

### Design Grounding

**N/A (no design trigger).** `impeccable-detect.js detect --mode implement`가 pre-EXECUTE
시점에 `design_signal=false` · `silent_skip=true` · `reason=no-signal`을 냈다(diff가 아직
비어 있어 detector가 렌더 표면을 못 본다 — 문서화된 맹점). 따라서 2.5.5c capture가 없고
Phase 3.6·3.7은 no-op이다. 대신 §3.9 제약 4종은 plan 단계의 critique(CONVERGED, R0→R1)이
DD7·DD15로 이미 흡수했고 이 사이클이 그것을 실행했다 — 신규 heading 0 · 신규 CSS 클래스 0 ·
신규 강조색 0 · 값 항목 3개.

**renderer design-lint의 `H10`·`H16` 2건은 선재 결함이다.** 같은 모델에서 `model.leadtime`을
`null`로 두고 렌더해도 동일하게 2건이 나온다(실측) — M3이 만든 것이 아니다.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime-surface.js` | CREATED | 포매터 + 단위 어휘 + `assertCoverageAdjacency` + `emptySummary` |
| `plugins/mccp/scripts/lib/leadtime-derive.js` | CREATED | `scanLeadtime` + 닫힌 `error_kind` sentinel |
| `plugins/mccp/scripts/lib/leadtime-distribution.js` | CREATED | 원자적 · content-stable writer |
| `plugins/mccp/scripts/lib/renderer/sections/leadtime-line.js` | CREATED | `{md, html}` 또는 `null` |
| `plugins/mccp/scripts/lib/tests/leadtime-surface.test.js` | CREATED | 15 tests |
| `plugins/mccp/scripts/lib/tests/leadtime-distribution.test.js` | CREATED | 8 tests |
| `plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js` | CREATED | 11 tests |
| `plugins/mccp/scripts/derive/tests/leadtime-source.test.js` | CREATED | 10 tests — plan 미기재(D3) |
| `docs/leadtime-observability/one-line-consumption.md` | CREATED | 한계 절이 동결 블록 **위** |
| `.claude/state/leadtime/distribution.json` | CREATED | git-tracked 발행물 |
| `.claude/notes/leadtime-observability-m3.md` | CREATED | Implement-Codex 게이트 기록 |
| `plugins/mccp/scripts/lib/leadtime.js` | UPDATED | `allowGit` · 투영 · `renderHuman` 재구성 |
| `plugins/mccp/scripts/derive/model.js` | UPDATED | `leadtime` additive + present-only(null 허용) |
| `plugins/mccp/scripts/derive/index.js` | UPDATED | 독립 try/catch 스캔 |
| `plugins/mccp/scripts/derive/cli.js` | UPDATED | `leadtimeScan` + distribution writer piggyback |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATED | `leadtimeScan`만 (writer 미배선) |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATED | 섹션 계산 + grid 주입 |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATED | md 삽입 + `leadtimeHtml` 채널 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | hero 삽입 + footer version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 version만 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATED | M3 절 11 tests |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATED | `leadtime` 드리프트 가드 |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATED | §2 표 2a행 + §5 hide 규칙 |
| `.claude/prds/leadtime-observability.prd.md` | UPDATED | milestone 3 → complete |
| `plugins/mccp/.claude-plugin/plugin.json` · `CHANGELOG.md` | UPDATED | `1.34.3 → 1.35.0` |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 신규 5행 + 흡수 표시 5행 |

## Deviations from Plan

plan 본문은 `plan_hash`로 봉인돼 있어 고칠 수 없다(§3.12). 아래는 **구현이 내린 결정**이며
전부 `.claude/notes/leadtime-observability-m3.md`의 D1~D9에 근거와 함께 기록돼 있다.

- **D1 — 한 줄이 `sections` 배열이 아니라 `grid`로 흐른다.** Task 4.2는 `sections` 배열 확장을
  지시했지만 `markdown.js:8`·`html.js:1230`이 정확히 10개 위치로 구조분해하므로 11번째 원소는
  어느 composer도 읽지 않는다(실측). 채널을 `opts.leadtimeLine → renderStatusGrid → grid`로
  바꿨고 — `grid`는 `renderHeroPanel(verdict, grid, …)`이 이미 받는 단일 채널이다. test가
  "두 composer가 정확히 10슬롯을 읽는다"를 단언해 이 결정의 전제를 고정한다.
- **D2 — 한 줄 형태가 plan 예시와 다르다.** plan의 canonical `패널 p50 7.6min`에는 인접
  커버리지가 없어 DD14 규칙과 자기모순이었다. 통계 이름을 헤드에서 한 번 선언하고
  (`리드타임 (50/63 측정) · p50: …`) 모든 값 토큰에 예외 없이 짝을 붙였다. 헤드가
  `리드타임 (`로 시작하는 것은 Validation 3의 리터럴 요구이기도 하다.
- **D3 — `derive/tests/leadtime-source.test.js`를 만들었다.** Validation 2d·6이 실행하는데
  Files to Change에 없었다. plan이 지목한 HIGH 리스크 둘(sentinel 경로 유출 · spawn-free
  예산)의 유일한 falsifier다.
- **D4 — 100칼럼 초과가 5줄이었다.** Task 6b는 2줄만 지목했으나 실측 초과는 5줄이었고
  (`coverage:` 114 · post_panel_span coverage 129 · unmatched 2×112 · 헤드라인 111),
  지목되지 않은 3줄을 두면 Validation 6b가 통과 불가였다. 절삭 표기는 plan의 `(+N — see --json)`
  대신 `(+N in --json)`을 썼다 — 전자는 실측 최장 줄을 101칼럼으로 만든다.
- **D5 — tmp 이름이 `<target>.<pid>-<rand>.tmp`다.** Mirror로 지목된 `writeAtomic`은 고정
  이름이지만 그 목적지는 gitignored `.claude/cache/`다. 여기는 tracked이므로 §3.6 규칙을 따른다.
- **D6 — hide 술어가 "키 부재 **또는** `null`"이다.** DD3 1행은 키 부재만 적었으나
  `emptyModel`이 키를 항상 선언하고 `scanLeadtime`이 `null`을 돌려주므로 실제 판별자는 값이다.
- **D7 — `validateShape`가 선언된 `null`을 허용한다.** 인용 선례(`host_version`)를 그대로
  복제하면 빈 모델이 자기 스키마에 걸린다.
- **투영의 zero-join 계열이 `null`이다.** `{n:0, p50:null}`을 실으면 "관측했더니 0"과
  "관측이 없음"이 구분되지 않는다 — 이 구현 중 test가 잡아 고쳤다.

## Issues Encountered

- **plan-review L2 패널이 `divergent`(quorum 2/4)로 봉인돼 있었다.** blocking finding 5건 중
  HIGH 3건 + Validation을 통과 불가로 만드는 MEDIUM 2건을 §3.14대로 이 사이클에서 흡수했고
  (D1·D2·D3·D4·D5·D6), 나머지 5건은 backlog로 명시 이연했다. plan 본문은 봉인돼 있어 고칠 수
  없으므로 **구현에서** 닫았다.
- **Codex는 발화하지 않았다** — `MCCP_CODEX_DISABLED=1` 영구 운영자 정책(classification
  `disabled`, `CODEX_VERDICT=skipped`). 라운드 캡은 `cap=1 pinned-by=codex-disabled`로 봉인됐다.
- **`node --test <dir>/`가 이 Node(24.19)에서 동작하지 않는다.** Validation 7의 디렉토리 인자가
  `Cannot find module`로 죽어 `<dir>/*.test.js` glob으로 돌렸다. 실행 대상 집합은 동일하다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/leadtime-surface.test.js` | 15 | 값 부재 표기 · DD14 인접성(짝 test 포함) · UI8 · DD11 · 결정성 |
| `lib/tests/leadtime-distribution.test.js` | 8 | content-stability(반환값) · 원자성 · tmp 규약 · 시각 필드 부재 |
| `lib/renderer/tests/leadtime-line.test.js` | 11 | DD3 4갈래 · §3.9 제약 · **배선**(10슬롯 단언 포함) |
| `derive/tests/leadtime-source.test.js` | 10 | spawn-free 예산 · sentinel 닫힌 열거형 · 경로 미유출 · 골격 동일성 |
| `lib/tests/leadtime.test.js` (M3 절) | 11 | git 모드 분포 동치 · `audit()` 첫 직접 커버리지 · DD8/12/13 · 절삭 |
| `derive/tests/schema-drift.test.js` (M3 절) | 1 | additive 필드 + null 허용 + 앵커 키 드리프트 |

## Next Steps

- [ ] `/mccp:prp-commit` — 위 변경 커밋
- [ ] `/mccp:pr` — **진입 직전 §3.7 forward-only 재계산 의무.** 현재 `origin/main`은 `1.34.4`이고
      이 브랜치는 33 커밋 behind다. base 병합 후에는 (a) 삭제 검증(§3.5.1), (b) **문서 동결
      블록 재생성**이 필요하다 — 병합이 리뷰 레코드·아카이브 plan을 코퍼스에 들여 수치를
      바꾼다(M2 실측 선례: `unclassified` 17→8 · `anchor_absent` 12→29로 결론이 뒤집혔다).
      재생성 대상은 **셋**이다: 이 사이클이 만든 `one-line-consumption.md`와, M1·M2가 동결한
      `panel-span.md`·`post-panel-span.md`.
      후자 둘은 **지금 이미 stale**이다 — 이 게이트 실행이 리뷰 레코드를 하나 더해 코퍼스가
      49/62 → 50/63으로 자랐다. 이 사이클에서 재생성하지 **않은 것은 의도**다: base 병합이
      코퍼스를 다시 바꾸므로 지금 맞추면 확실히 두 번 일하게 되고, 두 파일은 plan의
      Files to Change에도 없다. "리터럴이 사는 곳은 재생성되는 문서 동결면뿐"이라는 plan의
      전제가 바로 이 성질이다.
- [ ] PRD 전 milestone complete → `/mccp:archive-complete` 후보 (PR 머지 후, §3.11)
