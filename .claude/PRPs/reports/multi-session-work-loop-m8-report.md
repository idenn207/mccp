# Implementation Report: multi-session-work-loop M8 — 측정 부채 상환

## Summary

M2가 "배송했다"고 선언한 지표 producer 중 프로덕션에서 한 번도 발화하지 않은 것들을
실제로 배선했다. **뿌리는 세 개가 아니라 하나였다** —
`observer-sessions.resolveSessionId()`가 이 하네스에 존재하지 않는 `CLAUDE_SESSION_ID`만
읽어 빈 문자열을 반환했고, 그 falsy 값이 `session-start.js`/`session-end.js`의 M2 계측
블록 **전체**를 실행되지 않게 했다. A1 착수 · A2 종료 · B3 사용이력이 같은 한 줄 때문에
전부 죽어 있었다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 9 task, 소스 30개 + test 8개 + 문서/산출물 9개 |
| 지표 전환 | A1·A2·B3 전부 `computed` | **B3만 전환**. A1은 구조적 순환(이 PR 이후), A2는 상류 텔레메트리 부재 |
| 승인 emit 지점 | "정확히 5개" | **7개**(실측) — plan이 선재 2곳을 누락 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 세션 식별 단일 진실원 | 완료 | `session-identity.js` 신설 + 소비처 17곳 전환. `process.env.CLAUDE_SESSION_ID` 런타임 잔존 **0건** |
| 2 | legacy 이름 부재 test 단언 | 완료 | (a)(b)(b3)(c1)(c2)(c3) 6단언. **red 확인함**(probe 심어 (a) 실패 → 제거 후 green) |
| 3 | A1 착수 producer | 완료 | `receipt-prompt.js` 4개 ALLOW 경로에 emit. 차단 경로 미emit을 실행으로 실증 |
| 4 | A1 완주 producer + 봉인 병기 | 완료 | `state/cli.js msw-event emit` + `pr.md` Phase 5 + `finalize-receipt.js` |
| 5 | A1 집계·지표 정정 | 완료 | 분모를 세션 수 → distinct `work_unit`으로. 분모 producer 게이트 신설 |
| 6 | A2 세션 바인딩 | 완료 | 스냅샷 `session_id` 보존 + `resolveSessionBoundPct` 게이트. 4경로 test |
| 7 | C2/C3 귀속 스캐폴드 | 완료 | allowlist 2필드 + 형태 검증 + emit 3지점 배선 + 커버리지 집계. **status는 forward-only 유지** |
| 8 | B3 분자 커버리지 | 완료 | 양방향 차집합 공집합(116 = 116). 은퇴 **0건** |
| 9 | coverage gate · 스냅샷 · 문서 · 릴리스 | 완료 | `m8-coverage-gate.js` + 산출물 4종 + 문서 4면 + version 4면 |

## Validation Results

| 검사 | 결과 |
|---|---|
| `lib/tests` | pass (0 fail) |
| `derive/tests` | 127 pass / 0 fail |
| `receipt/tests` | 687 pass / 0 fail |
| `state/tests` | 215 pass / 0 fail |
| `hooks/tests` | 286 pass / **1 fail** — `Axis B (f)`, 확인된 **선재 환경 의존**(아래) |
| `renderer/tests` | 0 fail |
| `m8-coverage-gate.js --json` | exit 0 (승인 7지점 실재 · lint 위반 0) |
| `assertion-manifest-check` | exit 0 — 20 assertion / floor 20 |
| B3 집합 등식 (plan inline) | OK den=116 num=116 |
| `metrics-assert --fixtures` | exit 0 (게이트 형태) |
| `metrics-assert` (live) | exit 1 — A1·A2(미전환, 문서화) · A3·B2(선재) |
| `derive/cli.js render` | exit 0 |
| `instruction-contract/lint.js` | C1~C4 pass, advisory 0 |
| `env-contract/lint.js` | L1~L10 **전부 ok** |
| `gitignore-provision.test.js` | 88 pass / 0 fail |
| UI12 감사 표본 대조 | OK — 12 samples / 4 metric cross-check |
| `evidence-audit --json` | exit 4 `state=incomplete` (coverage 0.568 · false_positive 0) — **선재 corpus 상태**, M8은 ship receipt를 건드리지 않음 |

### `Axis B (f)` 실패에 대해

`hooks/tests/ecc-context-monitor.test.js`의 `Axis B (f)`는 이 셸의
`MCCP_CONTEXT_MONITOR_COST_WARNINGS=0`이 경고를 억제해 실패한다. 같은 파일의
`withThresholds`가 임계값 토글을 격리하는 것과 달리 이 토글은 격리하지 않는다.
**M8 변경과 무관함을 실측 확인**: `env -u MCCP_CONTEXT_MONITOR_COST_WARNINGS`로 돌리면
통과한다. 선재 test isolation 결함이라 §3.14대로 backlog에 이연했다.

### 라이브 전환 (DD10 — 워크트리 hook 직접 실행)

| 산출물 | 이전 | 이후 |
|---|---|---|
| `msw-events` kind | `evidence_guard_active` 한 종류(트리 전체 116건) | + `session_start` · `session_end` · `task_started` |
| `*.env-snapshot.json` | 트리 전체 **0건** | 1건 |
| B3 | `forward-only` | **`computed` 20/116** |

## Deviations from Plan

| # | plan | 실제 | 근거 |
|---|---|---|---|
| 1 | Task 9 승인 emit 지점 "정확히 5개" | **7개** | 실측 호출자가 7. plan이 선재 정당 지점 2곳(`receipt/evidence-lock.js` M3 · `state/handoff-items.js` M2)을 누락했고, 5로 두면 gate가 착지 즉시 붉어져 계측이 아니라 오탐이 된다. `plan-conflict-detector` → `conflict:false`(minor) |
| 2 | Task 2 (c) "4개 해소기 반환값이 변환 전후 **동일**" | 축을 둘로 분리 | 문자 그대로면 `observer-sessions`·`session-bridge`의 **깨진 체인을 보존하라**는 요구가 된다(그 수정이 milestone 자체). 완전한 체인이던 둘은 8조합 전수 등가를, 깨져 있던 둘은 (정규화 불변 + 죽은 후보 부활)을 단언 |
| 3 | Task 8 test를 `toggle-snapshot.test.js`에 | `msw-m8-producers.test.js`에 배치 | 세 단언이 전부 M8 축이라 M8 회귀 파일에 모음. 검사 내용 동일 |
| 4 | `assertion-manifest-check.js` 무변경 전제 | `TITLE_PREFIX`에 `M8` + `REQUIRED_IDS`에 M8 20건 추가 | 그 검사기의 접두사 allowlist가 `B1\|C1`만 허용해 M8 id가 구조적으로 통과 불가였다 |
| 5 | plan Validation의 `metrics-assert` | `--fixtures` 형태가 게이트 | CLI 자신의 주석이 "Without --fixtures … used later for monitoring once a baseline has formed"라 적는다. live 형태는 baseline 형성 전 실패가 정상 |

## Issues Encountered

1. **Plan-Codex 슬러그 드리프트** — receipt가 `multi-session-work-loop`로 발행됐는데
   prp-implement는 `-m8`을 도출한다. plan_hash 바이트 일치로 게이트 실행은 확인됨.
   §3.16대로 파일명 변경·blind write 없이 사유를 남기고 진행. `/mccp:pr`에서 재발한다.
2. **security-reviewer BLOCK** — HIGH 1(`findings-registry.appendFindings` 경로 탈출)
   + MEDIUM 4 + LOW 1. **전건 실측 검증 후 R1에서 흡수**, 미해소 CRITICAL/HIGH 0건.
   §3.14 임계를 벗어나 MEDIUM/LOW도 흡수한 근거는 plan 본문 `## Codex Implementation
   Review`에 명시(같은 초크 포인트의 형제 경로 / 아직 쓰지 않은 코드의 구성 제약).
3. **A2 라이브 표본 0건** — 원인은 M8 밖이다. `session-bridge`의
   `context_remaining_pct` 자체가 `null`이고, 전역 `context-current.json`은 11일 전
   다른 세션의 `tool_count=900`이라 out-of-order 가드가 write를 건너뛴다.
   **표본을 지어내지 않았다** — `writeState`를 직접 불러 값을 심는 것은 배선이 아니라
   측정 자체의 위조이고 UI2가 금지하는 바다.
4. **자체 회귀 1건 발견·수정** — `derive/cli.js` destructure를 줄이며
   `B3_TOGGLE_AXES`가 아래에서 여전히 쓰이는 것을 놓쳤다(`metrics-assert` 크래시).
   복원 후 통과.

## Files Changed

소스 20 · test 8 · 문서/산출물 9 · 릴리스 4면. 주요 신규:
`lib/session-identity.js` · `lib/msw-metrics/m8-coverage-gate.js` ·
`lib/tests/session-identity.test.js` · `lib/tests/msw-m8-producers.test.js` ·
`docs/multi-session-work-loop/m8-{before,after,assertion-manifest,audit-sample}.json` ·
`.claude/notes/multi-session-work-loop-m8.md`.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/session-identity.test.js` | 6 | 체인 단일성 · 경로 도달 · 초크 포인트 거절 · 8조합 등가 · 죽은 후보 부활 |
| `lib/tests/msw-m8-producers.test.js` | 16 | A1 분모/병기 · A2 바인딩 4경로 · 경로 방어 · 귀속 형태 · B3 등식 · coverage gate |
| `lib/tests/msw-metrics.test.js` | +4 | 분모 producer 게이트 · sealed 병기 · A2 percentile/표본 |
| `lib/tests/msw-metrics-acceptance.test.js` | +1, 1 재작성 | 두 목록 집합 동일성 · 승격≠위장 |
| 갱신 | 6 파일 | 새 계약으로 이전(구 계약 단언 제거가 아니라 **의미 이전**) |

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(현재 origin/main·로컬 모두
      1.32.2 기준으로 1.33.0을 잡았다). 슬러그 드리프트로 우회가 한 번 더 필요하다
- [ ] PR 생성 직후 POST 검증 1회 실행 → `.claude/notes/multi-session-work-loop-m8.md`에 기록
- [ ] 머지 후 `claude plugin update` (캐시 1.30.0 → 1.33.0)
- [ ] PRD 전 milestone complete이므로 `/mccp:archive-complete` 후보
