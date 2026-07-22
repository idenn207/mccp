# Implementation Report: Multi-Session Work Loop — M1 (측정 설계)

- **Plan**: `.claude/plans/multi-session-work-loop-m1.plan.md`
- **Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
- **Branch**: `v1-22-4-multi-session-work-loop-m1`
- **Final plan_hash**: `sha256:852f4c4ee661a2a31e27ef2d4848c31475dfa4173c994cc96bcce6dac931093f`
- **Version**: `1.22.5`

## Summary

M1은 PRD 7개 milestone 중 유일한 무변경 단계다. 지표를 계산하지 않고, **이후의 측정이 반박 가능해지도록** 분모·결함 정의·관측 창·표본 유효 범위를 사전 고정한다. 산출물은 설계 문서 4건 + 입력 스냅샷 2건이며 동작 코드 변경은 0이다(릴리스 메타데이터인 version surface 3파일은 CLAUDE.md §3.7 의무라 면제 대상이 아니며, 그 diff가 버전 문자열 외 라인을 포함하지 않음을 Validation이 기계 검증한다).

본 세션의 실질 작업은 문서 저작이 아니라 **게이트 재수렴**이었다. 문서 본문은 선행 세션에서 이미 완성됐고(Implement-Codex R1 4건 흡수 포함), 이번 실행은 Validation 블록을 *실제로 실행*하면서 그것이 통과 불가임을 발견하고, 수정하고, 그 수정을 Codex에 재리뷰시키고, 그 재리뷰가 지적한 더 깊은 결함을 다시 닫는 과정이었다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 문서는 선행 완료, 이번 사이클은 게이트 수렴 |
| 산출 문서 | 4건 | 4건 + 입력 스냅샷 2건(`cohort-input-snapshot.md`, `evidence-snapshot.json`) |
| 동작 코드 변경 | 0 | 0 (기계 검증됨) |
| Codex 라운드 | R1·R2·R3 + Implement-R1 (선행) | + **Implement-R2** (본 세션, Validation 수정 재리뷰) |
| Validation 검사 | 13개 통과 | 13개 통과 — **단, 최초 실행에서 CHECK 2c가 통과 불가로 판명** |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 측정 가능성 실측 부록 (`measurement-feasibility.md`) | 완료 | 선행 세션. `STATUS: PROVISIONAL — corpus 기준일 2026-07-22` 첫 줄 확인 |
| 2 | 소급 recoverability 프로토콜 + 임계 | 완료 | 임계 4종(표집 40 · 파싱 60% · 일치율 75% · 셀당 5) 전부 양수 파싱 확인 |
| 3 | 지표 명세 본문 (`measurement-design.md`) | 완료 | 지표 10개 × 6 라벨, 값 실질(≥10자) 기계 검증 |
| 4 | 라벨 규약 (`label-protocol.md`) | 완료 | 밴드 freeze `{1,3,7,14,30}` + 판별기준 3종 |
| 5 | 대형 코호트 규칙 + freeze (`large-cohort-registry.md`) | 완료 | 코호트 2건(임계 규칙 출력) + `충족 불가` 명시 기록 + 입력 sha256 pin 일치 |
| 6 | PRD 갱신 + version surface + CHANGELOG | 완료 | M1 `in-progress` + plan 링크, OQ 4건 closure, `동작 코드 변경 0` 문구 정정, M2 re-freeze 진입 조건, 1.22.5 3종 동기 |

## Validation Results

| Check | Status | Notes |
|---|---|---|
| 0 placeholder guard | 통과 | freeze 아티팩트에 TBD/미정 토큰 0 |
| 1 version surface | 통과 | 3종 전부 파일 직접 읽기로 `1.22.5` |
| 2 동작 코드 무변경 | 통과 | `plugins/` 변경이 allowlist 3파일로 한정 |
| 2c 순수 버전 치환 | **재작성 후 통과** | 아래 "발견한 결함" 참조 |
| 3 지표 10 × 6 라벨 | 통과 | 값 실질 요구 포함 |
| 4 OQ closure | 통과 | distinct 4건 |
| 5b 코호트 입력 pin | 통과 | 레지스트리 sha256 ↔ 스냅샷 일치 |
| 5 코호트 규칙 | 통과 | threshold 마커 존재 · rank 마커 부재 · 사후 메타데이터 부재 |
| 6 밴드 freeze + 판별기준 | 통과 | 밴드 canonical 줄 + 기준 3종 |
| 7 소급 임계 4종 | 통과 | 전부 양수 파싱 |
| 8 C계열 recoverability | 통과 | C1·C2·C3 전부 `recoverability-undetermined` |
| 9 링크 무결성 | 통과 | 신규 문서 상대 링크 전수 |
| 10 회귀 | 통과 | 알려진 fixture 실패 1건 외 신규 실패 0 |

최종 실행은 plan 본문에서 블록을 **그대로 추출해** 돌렸다(스크래치패드 사본이 아니라 spec 원문). exit 0.

### Design Grounding (v1.18.22)

| Field | Value |
|---|---|
| Verdict | N/A — 캡처하지 않음 |
| Rendered delta | 없음 (`renderingSurface=false`) |
| Receipt | `design_grounding_captured: false`, `design_grounding_verdict: null` |

**캡처하지 않은 이유(정직한 기록)**: 2.5.5c 캡처는 **pre-EXECUTE** 스냅샷이어야 하는데, 본 세션 진입 시점에 EXECUTE는 선행 세션에서 이미 끝나 있었다. 지금 찍은 스냅샷을 "pre-EXECUTE"라 부르면 delta가 인위적으로 0이 되고, 그건 검사가 아니라 검사처럼 보이는 것이다. 더불어 이번 diff에는 rendered surface가 아예 없어(`.tsx/.css/.html` 0건, `.claude/cache/*.md` 미변경) grounding lint 범위가 구조적으로 비어 있다 — generic `.md`는 §3.9가 명시적으로 scope에서 제외한다. 따라서 캡처 여부와 무관하게 이 게이트는 no-op이며, 없는 캡처를 지어내는 대신 `false`로 정직 기록했다.

### Design Critique (§3.9)

| Field | Value |
|---|---|
| Trigger | `SKILL_AVAIL=1` · `SIGNAL=1` (renderer 2파일이 design-surface whitelist에 걸림 — 경로 기준) |
| Routing mode | `auto`, `renderingSurface=false` → discovery/refine/simplify/system 전부 recommend 강등, evaluate만 invoke |
| Detector | 실행됨 — `.claude/cache/status.html` 스캔, 1건(`numbered-section-markers`, severity `advisory`) |
| Verdict | **CONVERGED** (rounds=1) |

detector가 잡은 유일한 항목은 본 diff가 저작하지 않은 기존 대시보드 렌더 결과물이고, 해당 숫자열(`06, 10, 11, 12`)은 장식 eyebrow가 아니라 실제 milestone 순번이다 — impeccable 자신의 기준("numbers earn their place when the section actually IS a sequence")으로 이 타깃에는 false positive라 findings에 싣지 않았다.

## 발견한 결함

### D1 — Validation CHECK 2c가 통과 가능한 입력을 갖지 않았다 (자체 발견, 실행 중)

`pjoff` 필터가 `grep -vE '"version"…'`이었는데, plugin.json 변경이 version 필드뿐인 **정상 통과 케이스**에서 grep이 매칭 0건으로 exit 1을 반환하고 `set -euo pipefail`이 스크립트를 그 자리에서 죽였다. 실측: CHECK 2c가 아무 메시지 없이 exit 1.

이것으로 이 Validation 블록의 "가드가 가드하지 못함" 결함이 셋이 됐다. 앞선 둘은 백슬래시 붕괴로 각각 *항상 실패*(지표 검사)와 *항상 통과*(임계표 검사)였고, 이번 것은 **성공할 때만 실패**한다. 세 가지 모두 **검사를 실제로 실행해야만** 드러났다는 공통점이 있다.

### D2 — CHECK 2c는 고친 뒤에도 Acceptance 명제를 증명하지 못했다 (Codex Implement-R2 F1, HIGH)

D1 수정 직후 Codex 재리뷰가 더 깊은 결함을 지적했고, 합성 입력으로 **양 갈래 모두 재현**했다:

- diff의 +/- 부호를 떼고 세기 때문에 **동일한 추가 라인 2개**는 count 2(짝수)로 통과한다. 1개는 홀수라 잡히지만 2개는 안 잡힌다
- plugin.json 필터가 라인 단위라 `"version": "1.22.5", "telemetryEndpoint": "…"`처럼 **한 라인에 결합**하면 통과한다

수정: diff 라인 파싱을 **폐기**하고, Acceptance가 실제로 주장하는 명제를 그대로 단정하도록 바꿨다 — `git show main:<file>` ↔ 작업본을 **파일 전문 대조**(renderer는 버전 토큰 중화 후, plugin.json은 파싱 후 `version` 제거하고 키 정렬 구조 비교). 양방향 실측: 정상 통과 · 공격 2종 거부 · 파일 복원 확인.

### D3 — impeccable detector의 severity 어휘가 mccp oracle의 alias 표에 없다 (자체 발견, 이연)

detector는 `severity: "advisory"`를 emit하는데 `design-critique-decide.js#normalizeSeverity`는 이를 모르므로 `UNKNOWN` → fail-closed → `divergent` → `/mccp:pr` chain-check BLOCK으로 이어진다. 즉 **detector가 advisory 1건만 내도 PR이 막힌다.** 지금 잠복인 이유는 oracle의 입력이 detector raw가 아니라 critique이 합성한 P0–P3 findings라는 *관행* 덕분이고, 그 관행은 어디에도 강제돼 있지 않다. M1 범위 밖이라 backlog 이연.

## Deviations from Plan

| # | What | Why |
|---|---|---|
| 1 | plan 본문을 implement 중 편집(CHECK 2c 2회 + 감사 주석 + R2 리뷰 섹션) | D1/D2. plan의 Validation 블록이 곧 M1의 유일한 기계적 강제 수단이라, 통과 불가/증명 불가인 채로 두면 Acceptance를 정직하게 주장할 수 없다 |
| 2 | `mccp-plan-codex` receipt를 수동 재anchor(2회, 최종 1회 유효) | 편집이 `plan_hash`를 이동시켜 upstream receipt가 stale → 차단. 운영자가 세 선택지(plan 게이트 전체 재실행 / 재anchor+Implement-Codex 재실행 / 수정 철회) 중 재anchor 경로를 선택 |
| 3 | Implement-Codex를 R2로 재실행 | 편집 대상이 유일한 기계적 강제 수단이므로 무검증 통과 금지. 실제로 F1(HIGH)을 잡아냄 |
| 4 | backlog 2행 추가 (`.claude/plans/codex-findings-backlog.md`) | 2.5.4 DEFER_TO_BACKLOG 절차. plan의 `Files to Change`에 없지만 command body가 규정한 경로 |
| 5 | **Plan을 `completed/`로 아카이브하지 않음** | 아래 참조 |

### Deviation 5 상세 — 아카이브 미실행

Phase 5의 Archive Plan 단계는 `$ARGUMENTS`를 `.claude/PRPs/plans/completed/`로 옮기도록 돼 있으나, 본 실행의 인자는 **plan이 아니라 PRD 경로**(`.claude/prds/multi-session-work-loop.prd.md`)다. 그대로 실행하면 M2~M7이 pending인 PRD가 활성 표면에서 사라진다. plan 쪽도 옮기면 안 된다 — PRD의 M1 행이 `../plans/multi-session-work-loop-m1.plan.md`를 링크하고 있고, receipt chain의 `--plan` 경로도 여기를 가리킨다. CLAUDE.md §3.11대로 아카이브는 **PRD 전체 완료 시 `/mccp:archive-complete`** 소관이다.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `docs/multi-session-work-loop/measurement-design.md` | CREATE | 162줄 · 계약층 FROZEN |
| `docs/multi-session-work-loop/measurement-feasibility.md` | CREATE | 256줄 · 가용성층 PROVISIONAL |
| `docs/multi-session-work-loop/label-protocol.md` | CREATE | 128줄 · 계약층 FROZEN |
| `docs/multi-session-work-loop/large-cohort-registry.md` | CREATE | 96줄 · 계약층 FROZEN |
| `docs/multi-session-work-loop/cohort-input-snapshot.md` | CREATE | 222줄 · 코호트 입력 pin |
| `docs/multi-session-work-loop/evidence-snapshot.json` | CREATE | 80줄 · 이동 수치 참조원 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M1 in-progress · OQ 4건 closure · Evidence 정정 · M2 진입 조건 |
| `.claude/plans/multi-session-work-loop-m1.plan.md` | CREATE | 본 plan (Codex R1·R2·R3 + Implement-R1·R2) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | DEFER 2행 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.22.3 → 1.22.5` (version 필드만) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer 버전 문자열만 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 버전 줄만 |
| `CHANGELOG.md` | UPDATE | 1.22.5 행 |

## Tests Written

신규 테스트 없음 — M1은 동작 코드를 만들지 않는다. 검증 수단은 plan의 Validation 블록(13개 기계 검사)이며, 회귀 검사(CHECK 10)가 기존 테스트 스위트에서 신규 실패 0을 강제한다.

CHECK 2c 교체판은 커밋되지 않는 합성 입력으로 양방향 실측했다(정상 통과 · 동일 추가 라인 2개 거부 · plugin.json 결합 라인 거부 · 파일 복원 확인).

## Issues Encountered

| Issue | Resolution |
|---|---|
| `node --test <dir>/`가 Node 24.11.1에서 `MODULE_NOT_FOUND` | glob 형태로 대체(plan에 기록된 선재 문제) |
| 선재 테스트 실패 1건(`design-critique-loop-e2e` fixture) | §3.9가 미tracked로 명시한 정상 상태. CHECK 10을 "그 1건 외 실패 0"으로 정의 |
| receipt-write가 briefing hang으로 지연 | `MCCP_BRIEFING=off`(문서화된 §4 토글). backlog HIGH로 기등재된 선재 blocker |

## Next Steps

- [ ] `/mccp:prp-commit` — 변경 커밋
- [ ] `/mccp:pr` — PR 생성. **`MCCP_BRIEFING=off` 필요**(backlog HIGH: `finalize-receipt.js:269` timeout → exit 127로 게이트 hard-stop)
- [ ] M2 착수 전 `measurement-feasibility.md` re-freeze (PRD M2 행 진입 조건)
