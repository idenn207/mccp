# Implementation Report: Multi-Session Work Loop — M2 (관측 계측)

**Plan**: `.claude/plans/multi-session-work-loop-m2.plan.md`
**Branch**: `v1-22-6-multi-session-m2`
**Date**: 2026-07-24 → 2026-07-25
**Version**: 1.22.6 (patch — 단일 milestone ship, §3.7)

## Summary

M1이 계약층으로 freeze한 지표 10개를, **추가 LLM 호출 없이 구조화 데이터로만** 전향 기록·산출해 대시보드에 표시하는 M2 계측 인프라를 구현했다. 핵심은 기존 세션 라이프사이클 hook에 **sidecar append-only event log**(`.claude/state/msw-events/`)를 얹어 M2 이벤트를 기록하고(session-ledger 스키마 불변), derive 층에서 지표로 합성하는 것.

착수 전 **진입 게이트**(`measurement-feasibility.md` 재-freeze)를 먼저 처리했다 — durable-evidence-substrate + ledger 술어 정정(v1.22.5)이 착지해 진입조건이 해제됐고, 부패 corpus 기준 baseline 고정을 막기 위해 현재 corpus로 재산출했다.

이 사이클은 **santa-loop 에스컬레이션**(divergent plan-codex 게이트, 운영자 accept-and-proceed)을 거쳐 진입했고, **Codex 전면 unavailable**(usage limit, ~Jul 29 복구) 상태에서 진행 — implement-codex 게이트는 advisory, 최종 cross-model 검증은 PR-Codex로 이연.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (10 tasks, dependency pipeline) |
| Files Changed | ~24 | 15 modified + ~18 new (msw-metrics/ 4파일 + fixture 포함) |
| Execution | 격리 worker 위임 (F5) | 3-layer isolated agent 위임 + controller 검증 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | measurement-feasibility 재-freeze | Complete | ledger 판별력 복원 실측(29/29→{converged:26,skipped:2}, fp 3→0), ship git-tracked(34), gitignore-first |
| 2 | msw-events sidecar (O_APPEND) | Complete | 동시성 stress test 추가(controller) → Windows O_APPEND 원자성 empirical 입증 |
| 3 | toggle-snapshot (env redaction) | Complete | name+boolean만·raw 값 0 leak 실측 |
| 4 | handoff-items (A4) | Complete | |
| 5 | derive sources (session-activity·toggle-usage) | Complete | malformed 격리, producer coverage |
| 6 | msw-metrics + anti-gaming + metrics-assert | Complete | R2-F2 gate 미배선 결함 수정(controller) → gate가 실제로 뭄 확인 |
| 7 | A3 instruction-cost | Complete | source-text-0 경계 실측(raw 0 leak), tiktoken 부재→not-delivered loud |
| 8 | C1 recoverability probe | Complete | read-only, 4 임계 frozen, verdict insufficient(정직) |
| 9 | 대시보드 섹션 | Complete | H10 em-dash 위반 수정(controller), design constraints, XSS escape |
| 10 | measurement-instrumentation.md + 릴리스 메타 | Complete | plugin.json 1.22.6, footer 3면 sync |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| MSW 단위/acceptance 스위트 | Pass | 54/54 |
| derive 회귀 | Pass | 114/114 |
| renderer 회귀 | Pass | 666/667 (1 pre-existing: verdict-label, MSW 무관) |
| metrics-assert gate (R2-F2) | Pass | fixture exit 0 · sparse real exit 1(고무도장 아님) |
| run --strict (schema) | Pass | exit 0 |
| no-LLM (Validation 5, 전 파일 + hook stub test) | Pass | clean |
| toggle 분모 (Validation 4) | Pass | scan 101 == snapshot 101 |
| dashboard render + design-lint | Pass | 0 violations (H10 fixed) |
| version 3면 sync | Pass | plugin.json + md + html = 1.22.6 |

### Design Grounding

Phase 2.5.5b design detect가 `design_signal=false`(gate 시점 UI diff 없음 — 코드 미작성)로 silent-skip → Phase 2.5.5c capture 미발생 → Phase 3.7 H15 lint no-op(문서화된 "untracked greenfield trigger gap"). 대신 renderer 자체 design-lint(H10 em-dash)가 produced 섹션을 검증 → 위반 1건 적발·수정 → 0 violations.

## Controller가 적발·수정한 실질 결함 (subagent 자기보고 검증)

1. **O_APPEND 동시성 stress test 누락** (Layer 1 overclaim) — agent가 리포트에서 "4 workers stress test"를 주장했으나 실제 test 파일엔 없었음. 추가 → 4 proc × 25 events 동시 append, torn write 0으로 **Windows O_APPEND 원자성 empirical 입증**(santa Reviewer B·Codex R2-F1 미해결 요건 해소).
2. **`metrics-assert --fixtures` gate 미배선** (Layer 2A) — `--fixtures` 플래그를 무시하고 real 빈 데이터에 derive → gate 항상 실패(exit 1). 공유 fixture 모듈(`fixture.js`)로 수정 → test↔CLI drift 방지 + gate가 실제로 뭄(fixture exit 0, sparse real exit 1) 확인.
3. **H10 em-dash 위반** (Layer 3) — forward-only 값 셀이 raw `'—'` 반환 → rendered prose H10 위반. H10-safe `'-'`로 수정 + test 갱신.
4. **토글 분모 self-reference** — M2 자신이 `MCCP_A3_READ_USER_MEMORY` 토글 추가 → runtime surface 100→101. snapshot 정정.

## Review-driven fixes (Local /mccp:code-review, 2026-07-25)

로컬 코드리뷰가 **fixture는 green이지만 production derive에서는 지표가 산출 안 되는** divergence를 적발했다(`metrics-assert --fixtures` exit 0 ↔ 동일 assertion을 실제 corpus에 돌리면 exit 1, 11건). fixture가 production에 없는 source(`handoff_items`·`findings`)를 직접 주입하고 B3에 별도 버그가 있어, 게이트가 구조적으로 이 gap을 못 잡았다. Codex R1-F2가 지목한 실패 모드 그 자체.

| # | Sev | 결함 | 수정 | 결과 |
|---|---|---|---|---|
| H1 | HIGH | `toggle-usage.js scanDir`이 `byName`만 채우고 `result.count`를 갱신 안 해 B3 denominator 항상 0 → 실 corpus에서 B3 영구 insufficient | `scanDenominator`가 `count = Object.keys(byName).length` 파생 | B3 = **computed** (den=101, 대시보드 렌더 확인) |
| H2 | HIGH | `computeA4`/`computeC1`이 참조하는 `handoff_items`·`findings` derive source가 미등록 → A4 항상 'source unavailable' | `derive/sources/handoff-items.js` 신규 + `index.js` 등록 | A4 = **wired** (데이터 있으면 산출, seeded 2/3 실증). C1 findings source는 별건(아래) |
| M2 | MED | `msw-events.sanitizeField`가 number/boolean을 `String()` 강제(`false`→"false" truthy, `85`→"85") | 타입 보존 분기 추가 | reader 타입 오판 제거 + 회귀 test |
| M3 | MED | `a3` L177 무가드 `delete claude_md.text`가 CLAUDE.md 부재 시 uncaught TypeError | 옵셔널 체이닝 | 잠복 crash 제거 |
| M4 | MED | `tokenizeWithTiktoken` spawn `error` 핸들러 부재 → Windows `python3` 부재 시 Promise hang | `proc.on('error', reject)` + stdin write 가드 | 정상 `baseline-unavailable` 강등 |
| M5 | MED | `handoff-items.restoreAndMatch` O(n²) 재열거 + 다중 handoff 파일 중복 계상(A4 > 1 위험) | enumerate hoist + `(type,id)` dedupe | anti-gaming 준수 + hot-path 비용↓ |
| L1 | LOW | `enumerateUnfinishedItems` 마지막 Task에서 `substring(x,-1)` 뒤집힘 | `content.length` clamp | 정확한 status 스캔 |

**정직한 잔여 상태 (날조하지 않음)**:
- **C1** (PR 역추적 회복성) — 실제 `findings` derive source가 없다. C1 §4 소급 probe도 verdict=insufficient였으므로 이는 **legitimate forward-only**다. computeC1은 source 부재 시 정직하게 insufficient를 반환한다(대시보드 미표시). fixture로만 compute됨을 명시.
- **A1** (세션 착수 안정성) — `task_completions_count`는 `kind:'task_completed'` 이벤트만 세지만 어느 hook도 그 이벤트를 emit 안 한다(session-end는 `task_completed`를 필드로만 기록). 따라서 실 corpus에서 A1은 구조적으로 `0/startups`다. 완료 신호 producer는 **후속 milestone 과제**(현재 대시보드 "0%"는 완료 미기록이지 전량 실패 아님).
- **A2/B2** — source는 배선됨. 각각 context-state 데이터·동시 세션 쌍이 실제로 쌓이면 산출(현재는 데이터 부재의 정직한 insufficient).

**회귀 test 추가**: `msw-derive-sources.test.js`(H1 denominator>0 + H2 A4 산출/dedupe/empty 4건). 원 버그가 새어나온 이유가 **derive source 층에 test가 없었기 때문**(standalone CLI만 검증)이라 그 층을 잠갔다. + msw-events 타입 보존 test 1건.

**검증(post-fix)**: MSW 59/59 · derive 114/114 · renderer 666/667(기존 verdict-label, MSW 무관) · no-LLM clean · fixture 게이트 exit 0 유지 · real-corpus 게이트 11건→6건(B3·A4 해소, 남은 A2/B2/C1은 데이터/source 부재의 정직한 insufficient) · 대시보드 B3 산출 렌더 확인.

## PR-Codex R1 흡수 (2026-07-25, Codex 복귀 후 실발화)

Codex 복귀 후 `/mccp:pr` PR-Codex가 full diff에 **실발화**(dedupe fail-closed — plan-codex divergent) → **No-ship, 3 HIGH**. 전부 실측 재현·수정(운영자 accept-and-fix):

| # | Sev | Finding | 수정 |
|---|---|---|---|
| F1 | HIGH | handoff-items sidecar(`.claude/state/<sid>.handoff-items.json`, 세션 id·미완 항목명)가 `.gitignore` 누락 → 커밋 유출 + stale baseline 오염. plan CL-1이 msw-events·env-snapshot만 등록하고 이 파일을 빠뜨림 | `.gitignore`에 `.claude/state/*.handoff-items.json` 등록. tracked 유출 0 실측 |
| F2 | HIGH | A1 완료가 phantom `kind:'task_completed'` 이벤트에만 의존하는데 그 producer가 없어 실 corpus A1은 항상 `0/startups`인데 `computed`로 표기(fixture만 통과) | `completions_producer_present` 신호 추가 → producer 부재 시 A1 **forward-only**(신호 미배선)로 정직 표기, `computed 0%` 위장 제거. fixture는 present=true로 compute 경로 실증 |
| F3 | HIGH | session-end는 **Stop hook**(매 응답)이라 session_end를 여러 개 emit하는데 reader가 **첫** session_end를 span 종료로 써서 첫 응답 이후 지속 세션이 inactive → B2 동시성 undercount | span 종료를 **마지막(최대) session_end**로. 회귀 test(첫 기준이면 놓치는 overlap을 마지막 기준으로 잡음) |

F2는 본 로컬 code-review의 M1 finding과 **독립 일치**(cross-model 교차확인). 회귀 test +2(A1 forward-only, F3 last-span). MSW 61/61.

### R2 흡수 (수정 후 재실행 — 새 findings 3건)

R1 3건 해소 확인 후 PR-Codex 재실발화 → 여전히 No-ship, **새 findings 3건**(2 HIGH + 1 MED, 2건은 본 code-review에서 문서화만 했던 것):

| # | Sev | Finding | 수정 |
|---|---|---|---|
| R2-F1 | HIGH | B2 값이 collision **rate**(collisions/pairs)인데 라벨은 "충돌 **회피**율" → 운영자 역독 | B2 라벨을 값에 맞춰 "동시세션 충돌률 (낮을수록 안전)"으로 정정(invert 대신 relabel — 단위 불일치 회피) |
| R2-F2 | HIGH | A2가 p50/p95 잔여%를 산출하나 renderer가 coverage(num/den)만 표시 → 컨텍스트 고갈 은폐 | `formatValue`가 `value={p50,p95}`를 직접 렌더 + A2 meta를 잔여% 표면으로 정정 |
| R2-F3 | MED | C1은 `findings` derive source가 아예 미배선 → fixture-only masquerade | C1을 **forward-only**로(C2·C3 동형) + claimed-computable·fixture에서 제외. A1은 실 source(session_activity)라 유지 |

**정직성 원칙 확립**: claimed-computable = live derive source로 실 corpus 산출 가능한 것만(A2/A4/B2/B3 + A1은 실 source가 producer-absent 정직 보고). A1·C1·C2·C3는 forward-only. 회귀 test +1(F3 span). MSW 49/49 · renderer 666/667(기존 verdict-label). 재수정 후 PR-Codex 재실행.

## Deviations from Plan

- **Plan 아카이브 보류** — 표준 Phase 5는 plan을 `completed/`로 이동하지만, PR이 Codex 복귀(Jul 29)까지 이연되고 plan이 PR-Codex 리뷰 SoT이므로 `.claude/plans/`에 유지(PR ship 후 아카이브).
- **Auto-chain 미실행** — Codex unavailable + 운영자 accept-and-proceed 결정으로 commit/PR은 운영자 판단에 위임.

## Security Boundaries (santa/Codex 흡수 실측 확인)

- env-snapshot raw 값 0 leak (secret token/path/aws key 부재 실측) — R3-F2/CL-4
- A3 artifact source-text-0 (CLAUDE.md raw 텍스트 0) + user-memory opt-in — R3-F3
- msw-events/env-snapshot `.gitignore` 등록 (sidecar 생성 전) — CL-1/santa R1

## Next Steps

- [ ] `/mccp:prp-commit` — 변경 커밋 (운영자 판단)
- [ ] Codex 복귀(~Jul 29) 후 `/mccp:pr` — PR-Codex가 최종 cross-model 검증 (dedupe fail-closed → 실발화 보장)
- [ ] merge 후 `claude plugin update`로 1.22.6 캐시 반영
- [ ] PR ship 후 plan을 archived/로 이동
