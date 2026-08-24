# Implementation Report: impeccable 탐지 계약 M4 — 게이트 발화 정합

> plan: `.claude/plans/impeccable-detection-contract-m4.plan.md` (`plan_hash sha256:911ff610…1272c`, 미편집)
> 게이트 산출물·라이브 증거: `.claude/notes/impeccable-detection-contract-m4.md`
> version `1.31.3 → 1.31.4` (patch — PRD 내 단일 milestone, M5 잔존)

## Summary

M1~M3이 탐지를 정직하게 만들고 이름을 바로잡았다면, M4는 **그 이름으로 무엇을 부르는가**를 다뤘다.
세 축을 닫았다:

1. **완주 불가능한 발화를 뺐다** — `shape`가 implement에서 `background` → `recommend`. 벤더가 자기
   메타데이터에 "Runs a **required** multi-round discovery interview"라 적었고, 비대화형 게이트가 그
   분기에 들어가면 질문하며 멎거나 "structured simulated user"로 제품 진실을 지어내어 사용자
   저장소에 PRODUCT.md를 **쓴다**.
2. **발화가 0인 단계에 자리를 줬다** — 테이블에 `phase` 축이 생겨 `clarify`·`distill`·`polish`·
   `harden`·`optimize`가 finish(post-EXECUTE)로 모였다. harden 단계가 처음으로 발화한다.
3. **오라클 밖 발화를 기록되게 했다** — `restamp-routed`가 finish 패스 outcome을 implement receipt에
   append한다. 이전에는 Phase 3.6이 오라클을 거치지 않아 실제 발화가 **기록될 경로가 구조적으로 없었다**.

**schema 변경 0.** 공개 반환 스키마도 receipt 스키마도 한 줄 안 바뀌었다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 예측대로 |
| Files Changed | 16 | 14 변경 + 2 신규 (plan의 표와 동수, 구성만 다름) |
| implement 카탈로그 | 16 → 19 (pre 14 + finish 5) | 정확히 일치 |
| 신규 test | 3파일 축 | routing +11 · restamp-routed 14(신규) · guard +4 |

plan의 `Files to Change` 16행 중 `.claude/plans/codex-findings-backlog.md`는 이연 2건 → **5건**으로
늘었고(security 2 + 관찰 1 추가), 나머지는 표 그대로다.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | UI10 재확인 — 차단 근거를 문서 있는 것으로 | 완료 | 4.1.1 실측. **정정 1건**: `teach`는 `command-metadata.json` 23개 카탈로그에 없다(벤더 측 불일치) — 그래도 집합 유지, 근거 기록 |
| 2 | `shape` 강등 + 차단 집합 명시 | 완료 | `INTERVIEW_REQUIRED_COMMANDS` 신설. `background` 도달 불가는 enum 유지 + test 고정 |
| 3 | `phase` 축 + finish 엔트리 | 완료 | pre 14 / finish 5. plan·prd·pr 출력 바이트 동일 |
| 4 | `restamp-routed` | 완료 | append-only + **restamp 내 멱등**(Codex F1) + 게이트 제한 + 키 거부(security) |
| 5 | prp-implement 재배선 | 완료 | 2.5.5b `phase:"pre"` 명시 · Phase 3.6 오라클 구동 + 3.6.5 restamp 신설 · `:448` 낡은 문단 정정 |
| 6 | test | 완료 | 아래 Tests Written |
| 7 | 문서 · version 4면 동기 | 완료 | gate-design `#### 게이트 발화 정합` · CLAUDE.md §3.10(증분만큼 낡은 문장 축소) · CHANGELOG 1.31.4 · 4면 동기 · PRD milestone 4 complete · backlog 5건 |
| 8 | 라이브 완주 | 완료 | 세 acceptance 산출물 실측 확보 — 아래 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| V1 routing 오라클 | 통과 | 37/37 |
| V2 restamp-routed | 통과 | 14/14 (신규) |
| V3 guard 짝 단언 | 통과 | 16/16 |
| V4 M1~M3 회귀 | 통과 | 81/81 — 탐지 축이 M4로 흔들리지 않음 |
| V5 receipt schema 전량 | 통과 | **682 tests · 681 pass · 0 fail · 1 skipped** (`MCCP_BRIEFING=off`) |
| V6 version 4면 동기 | 통과 | 10/10 |
| V7 instruction-contract lint | 통과 | C1~C4 pass, rows=32 |
| V8 수동 매트릭스 | 통과 | 아래 |

### V8 — 게이트별 auto 출력 (post-M4 실측)

| gate | phase | n | non-recommend 발화 |
|---|---|---|---|
| prd | pre / finish | 20 / 0 | (none) |
| plan | pre / finish | 20 / 0 | (none) |
| implement | **pre** | 14 | `refine/layout` `refine/typeset` `refine/animate` `refine/colorize` `simplify/adapt` `evaluate/critique` `evaluate/audit` |
| implement | **finish** | 5 | `simplify/clarify` `simplify/distill` `harden/harden` `harden/optimize` `polish/polish` |
| pr | pre / finish | 7 / 0 | (none) |

`discovery/shape`가 발화 목록에서 사라졌고(M4 이전엔 `background`), harden 단계가 처음 발화한다.
plan·prd·pr은 M4 이전 기준선과 동일하다.

### Design Finish (v1.31.4 M4 — 이 사이클에서 실제로 돈 finish 패스)

**돌았다.** 오라클이 `phase=finish mode=auto renderingSurface=1`로 5종을 `invoke`로 답했고, M3
call-form carrier가 지목한 `impeccable:impeccable`로 전부 호출해 완주했다. **어느 것도 질문하며
멎지 않았다** — UI11이 요구하는 성질이 정확히 이것이고, `shape`는 벤더 계약상 그럴 수 없어서 빠졌다.

| command | call_form | status |
|---|---|---|
| clarify · distill · harden · optimize · polish | `invoke` | `invoked` (5/5) |

**적용한 finding: 0건.** 디자인 내용이 공허하기 때문이며 그 이유를 숨기지 않는다 — M4는
control-plane 변경이라 렌더 표면이 없고, 유일한 표면은 게이트를 발화시키려고 만들었다 지운
합성 파일(`scratch-m4-surface.css`, 커밋 전 삭제 확인)이었다. 이 항목이 증명하는 것은 **경로가
작동한다**이지 *의미 있는 디자인 산출이 나왔다*가 아니다. plan이 이 경계를 미리 적었다.

**restamp 실패 기록: 있음(그리고 복구됨).** 첫 3회 시도가 설치된 plugin cache(1.31.0, pre-M4)의
`cli.js`를 불러 `unknown subcommand "restamp-routed"`로 실패했다. 구현한 fail-open 경로가 설계대로
동작했다 — 3회 재시도 · 매회 loud stderr · **entries 산출물 보존** · 구현 미차단. 저장소 소스로
다시 부르자 착지했고 보존된 산출물이 그대로 쓰였다.

### Design Grounding

**N/A (no capture).** Phase 2.5.5c는 트리거가 꺼진 상태(pre-EXECUTE `design_signal=false`)라 돌지
않았고, 따라서 Phase 3.7은 아티팩트 부재로 **완전 no-op**이다. receipt의
`design_grounding_captured=false` · `design_grounding_verdict=null`이 그 사실과 일치한다.

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-routing.js` | UPDATED | `INTERVIEW_REQUIRED_COMMANDS`·`ROUTING_PHASES` 신설 · `entry()` 5번째 인자 `phase` · implement 테이블 재구성 · `routeCommands` phase 필터 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | `restampRoutedCommands` + `canonicalRoutedEntry`/`isRoutedTailMatch` · `receiptPath` import |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATED | `restamp-routed` dispatch + usage 1행 |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | 2.5.5b `phase:"pre"` · `:448` 문단 정정 · Phase 3.6 전면 재배선(3.6.1~3.6.5) |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | UPDATED | 상수 재정의 · test (a)/(l) 갱신 · M4 test 11건 추가 |
| `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` | UPDATED | M4 짝 단언 4건 |
| `plugins/mccp/scripts/receipt/tests/restamp-routed.test.js` | **CREATED** | 14건 |
| `.claude/notes/impeccable-detection-contract-m4.md` | **CREATED** | 게이트 산출물 + Task 1 실측 + 보안 리뷰 + Task 8 라이브 증거 |
| `docs/gate-design.md` | UPDATED | `#### 게이트 발화 정합 (v1.31.4 …)` |
| `CLAUDE.md` | UPDATED | §3.10 — 낡은 stage→command 나열 제거 + M4 문단 |
| `CHANGELOG.md` | UPDATED | `## [1.31.4]` + `currently` 노트 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | `1.31.3 → 1.31.4` |
| `plugins/mccp/scripts/lib/renderer/html.js` · `markdown.js` | UPDATED | footer version 동기 (4면 중 2·3면) |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATED | milestone 4 → complete |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 이연 5건 |

## Deviations from Plan

1. **`INTERVIEW_REQUIRED_COMMANDS`의 `teach` 근거가 plan 서술과 부분적으로 달랐다.** plan은 "벤더가
   같은 문장에서 `shape`와 묶은 형제"라 했고 그 절반은 사실이다(`context.mjs:1116`·`:1132`가 한
   문장에서 셋을 묶는다). 그러나 `teach`는 4.1.1의 23개 명령 카탈로그에 **없다**. 집합은 plan대로
   유지하되 근거를 정정해 기록했다 — 이 불일치는 집합 유지를 오히려 강화한다.
2. **Codex 1회차가 인프라 사유로 실패했다.** `~/.codex` sqlite `database is locked`(stale codex
   프로세스 7개). 재시도 1회로 통과. 프로세스는 죽이지 않았다 — 다른 worktree 세션 소유일 수 있다.
3. **게이트 산출물을 plan 본문이 아니라 notes에 썼다.** plan 본문 편집은 `plan_hash`를 바꿔 이미
   봉인된 plan-codex receipt를 stale로 만들고(soft 모드도 stale은 차단) `/mccp:pr`을 막는다. M1~M3의
   관례와 같다. 2.5.6 Step A의 grep은 notes 경로에서 통과했다.
4. **Task 8의 트리거가 임시 파일이 아니라 화이트리스트로 켜졌다.** plan은 임시 UI 파일이
   `renderingSurface`를 만든다고 했고 그건 맞았지만, `design_signal`을 켠 것은 Task 7에서 편집한
   renderer 2파일 + `write.js`였다. detector가 tracked diff만 본다는 서술은 그대로 유효하다.
5. **2.5.5b pre 패스는 돌지 않았다.** 그 시점 트리거가 false였다. 켜려면 audited override로 pre
   7종 + critique 루프를 합성 파일에 지불해야 해서 하지 않았다 — 비용만 있고 신호가 없다.

## Issues Encountered

- **게이트 진입 자체가 막혔다 (해소).** `mccp-plan-codex` receipt가 **base 슬러그**에 실려 있어
  (`/mccp:plan`이 PRD 경로로 호출된 결과) implement가 도출한 `-m4` 슬러그에서 missing이었다. plan
  본문 해시가 receipt의 `reviewed_plan_hash`와 **동일**함을 실측 확인하고(즉 게이트는 이 본문에
  실제로 돌았다) §3.16의 감사 우회로 진행했다. receipt 파일명 변경은 §3.12/§3.16 금지라 하지 않았다.
  사용자 승인 후 진행. 상세와 사유는 notes 첫 절.
- **Codex verdict `divergent`.** HIGH 2건(F1 멱등·F2 fail-open) 전건 R1 흡수. receipt에 `divergent`
  그대로 봉인 — 위장 없음. cross-gate dedupe는 닫힌 채 남아 `/mccp:pr`에서 PR-Codex가 실제 발화한다.
- **security-reviewer 4건 흡수 + 2건 PASS 독립 확인.** F3의 HIGH는 증거로 MEDIUM 정정
  (`assertNoTrackedOverwrite`가 이미 불변식을 지키고 있었다 — fail-fast 보강이지 취약점이 아니다).
- **`receipt/tests/`가 `write()` 1회당 60초.** briefing 훅의 LLM 호출이 tmp repo에서 전체 타임아웃을
  소진한다(실측 61,036ms). 신규 test는 `MCCP_BRIEFING=off`로 11초에 떨어뜨렸고, 기존 test는
  그대로라 backlog에 기록했다. plan의 V5가 그대로는 완주 불가인 이유가 이것이다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `impeccable-routing.test.js` | +11 (총 37) | 전수 128조합 metric(인터뷰형 발화 0) · `background` 도달 불가 · phase 필터 무해성(명시 배열 pin) · pre/finish 서로소 · 0-발화 단계 = `{discovery, system}` · phase 미유출 · 미지 phase = 빈 목록 |
| `restamp-routed.test.js` | 14 (신규) | null/기존 배열 append · 인접 필드 보존 · digest 재봉인 + 디스크 일치 · 중복 2건 유지 · **재시도 no-op(재봉인 없음)** · 다른 내용은 append · 부분 겹침도 append · 여분 키 거부 · `__proto__` 차단 · tracked 게이트 거부 · 빈 배열 no-op · enum 위반 SCHEMA_INVALID · 파일 부재 |
| `impeccable-guard.test.js` | +4 (총 16) | **짝 단언**(`phase:"finish"` ⟺ `restamp-routed`) · `phase:"pre"` 명시 · 하드코딩 3종 나열 부재 · 오라클이 실제로 finish 행을 갖는지 |

## Next Steps

- [ ] `/mccp:prp-commit` — **`git status`에 `scratch-` 파일이 없는지 재확인**(현재 0건)
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(현재 `origin/main` = 1.31.0, 로컬 1.31.4)
- [ ] 머지 후 `claude plugin update` — 설치 cache가 1.31.0이라 `restamp-routed`는 이 세션 밖에서 아직 없다
- [ ] PRD M5(문서·계약 드리프트 정리)가 남아 PRD는 여전히 in-progress — 아카이브 금지(§3.11 C2)
