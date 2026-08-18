# Implementation Report: multi-session-work-loop M6 — 진행 상태 기계 판정 (B1)

- **Plan**: `.claude/plans/multi-session-work-loop-m6.plan.md`
- **Branch**: `v1.24.0-multi-session-m6` (base `origin/main` @ `767a2c7`, v1.26.2)
- **Version**: `1.26.2 → 1.26.3` (§3.7 forward-only, 11번째 재발 — 아래 D2)
- **게이트 기록**: `.claude/notes/multi-session-work-loop-m6-implement-gate.md`
- **설계 문서**: `docs/multi-session-work-loop/status-adjudication-design.md`

## Summary

`computeB1` 은 M2 이래 `insufficient('independent evidence source unavailable')` 상수를
반환해 왔다. M6 은 문서 status 와 **문서에서 파생되지 않은** 증거를 대조하는 판정 오라클을
배송해 B1 을 `computed` 로 뒤집고, 대시보드와 `/mccp:archive-complete` 가 **같은 오라클**을
공유하게 만들었다.

**전환 실측 (UI6 — 완료 판정의 유일 근거)**:

| | before (`m6-before.json`) | after (`m6-after.json`) |
|---|---|---|
| `B1.status` | `insufficient` | **`computed`** |
| `numerator` / `denominator` | `null` / `null` | **1 / 39** |
| `value` | `null` | `null` (건수가 계약이다 — UI4) |
| `raw_row_count` | — | 41 |
| `noncanonical_status_count` | — | 2 (분모 제외) |
| `undetermined_evidence_count` | — | 30 (분모 포함 · 분자 제외) |
| 실제 대조된 행 | — | **9 / 39** (`shipped` 8 · `not-shipped` 1) |
| `independence_ok` | — | `true` |

두 앵커의 `plan_file_hash`(`e2338ca5…`)와 `prd_milestone_rows`(41)가 일치하므로 두 수는
**통약 가능**하다. `tracked_receipt_count` 는 양쪽 53 이지만 이것은 관측이지 게이트가 아니다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 실결함 2건을 구현 중 발견해 흡수(아래 Deviations) |
| Files Changed | 27 (CREATE 12 · UPDATE 15) | 31 (CREATE 14 · UPDATE 14 · 게이트 노트 1 · plan/review 2) |
| 활성 PRD (분모) | 1개 | **9개** — main 병합으로 실질화 |
| drift 실측 | 미지 | **1건** (위양성 3건은 구현 중 제거) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 착수 실측 스냅샷 | 완료 | `m6-before.json` — `B1=insufficient` 봉인. **재실행 0회** |
| 1 | 판정 오라클 `b1-status-drift.js` | 완료 | 순수 함수(자체 I/O 0) · evidence 5필드 양방향 거부 |
| 2 | 독립성 test + 정적 lint | 완료 | 변조 불변성 **양방향** + lint 4축 + 음성 fixture 4종 |
| 3 | derive source `milestone-evidence.js` | 완료 | 전역 중복 검출 · 분모 규약 2축 분리 · 행별 판정 전수 |
| 4 | `computeB1` 배선 + derive 등록 | 완료 | `invalid` > `insufficient` > `computed` 사다리 |
| 5 | 대시보드 표면 | 완료 | 건수 렌더 + 커버리지 단서 + 기존 collapse 안 단일 muted 줄 |
| 6 | `archive-complete` ledger 강등 | 완료 | 판정 축을 공유 오라클로 · 실패 fail-closed |
| 7 | 설계 문서 + 단언 매니페스트 | 완료 | 비보증 12항 · `REQUIRED_IDS` 21종 · 대조기 자신도 test |
| 8 | 릴리스 메타 동기 | 완료 | 4면(i18n test 는 자체 파생 — 아래 D4) |
| 9 | 라이브 전환 실측 | 완료 | `computed` 확인 + 감사 표본 1/1 일치 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| §1 신규/변경 test | 통과 | 아래 Tests Written |
| §1b manifest 대조 | 통과 | `checked 21 assertion(s); required floor 21`, exit 0 |
| §2 독립성 lint | 통과 | `ok — 4 axes clean`, exit 0 |
| §3 전환 + 앵커 + 감사 표본 | 통과 | `B1 drift=1/39 undetermined_evidence=30 audited=1/1` |
| §4 대시보드 표면 | 통과 | `\| **B1** · 진행 상태 drift \| 1건 (대조 9/39) \| 산출됨 \| milestone-evidence \|` |
| §5 기존 표면 무손상 | 통과(주의) | `archive-complete scan` exit 0 · `evidence-audit` **exit 4 (선재)** — 아래 Issues |
| §6 전체 스위트 | 통과 | 310 파일 · **tests=4487 pass=4472 fail=0 skipped=15** · 신규 red **0** |

### Design Grounding (v1.18.22)

| Field | Value |
|---|---|
| Verdict | `anchor_clean` |
| Mode | `enforce` |
| Rendered delta | **no** — 변경이 렌더러 **소스**(`.js`)이고 렌더 산출물 `.claude/cache/*` 는 gitignored 라 diff 에 들어오지 않는다 (control-plane no-op) |
| Advisories | `no rendered-surface added lines in EXECUTE delta (gate no-op)` |

Phase 3.6 DESIGN FINISH 는 같은 이유(`FINISH_SURFACE=0`)로 skip 됐다. **디자인 축이 비어
있지는 않다** — Task 5 의 4개 Output Constraint 는 detector 에 의존하지 않는 회귀 단언
(`B1-RENDER-CONSTRAINTS`)이 렌더 **산출 문자열**에 대해 직접 강제한다: 신규 h4+ 0 · 신규
accent 클래스 0 · 인라인 마커 0 ∧ 신규 em-dash 0 · 신규 collapse 0(개수 ∧ 배치 ∧ 유사 위젯)
∧ 상위 3건 + `(+N건)` 절삭 병기. impeccable detector 관측은 선재 2건뿐이고 **신규
HIGH/CRITICAL 0건**이다(`em-dash-overuse` warning · `numbered-section-markers` advisory —
plan 이 사전 기록한 항목과 동일).

## 감사 표본 (UI14)

기계 판독본: `docs/multi-session-work-loop/m6-audit-sample.json`.
표본 크기 `min(3, drift_count) = min(3, 1) = 1`. **1/1 일치**.

| decision_id | 문서 status | 자동 판정 | 사람 판정 | 일치 |
|---|---|---|---|---|
| `workflow-orchestration-live-activation-m2` | `in-progress` | drift (증거 `shipped`) | drift | ✔ |

확인한 원자료 4종(자동 산출값을 보고 따라 적지 않고 원자료에서 독립 판정한 뒤 대조):

1. PRD 표 2행 Status 셀이 문자 그대로 `in-progress`.
2. `git cat-file -e HEAD:.claude/receipts/mccp-pr-codex/workflow-orchestration-live-activation-m2.json` → **exit 0** (ship receipt 가 커밋에 도달).
3. 커밋된 본문의 `decision_id` 가 `workflow-orchestration-live-activation-m2` 로 행의 plan
   basename 파생 키와 일치하고 `resolution.codex_verdict='converged'`.
4. **대조군** — 같은 PRD 의 M1·M3 행은 문서가 `complete` 이고 receipt 도 커밋돼 있어 일치로
   판정됐다(drift 아님). 즉 오라클이 이 PRD 의 모든 행을 무차별로 drift 로 만들지 않는다.

> 감사 표본의 **수행 자체**는 기계적으로 강제되지 않는다. 강제되는 것은 (i) 기록 없이 완료를
> 주장하지 못함, (ii) 기록된 불일치가 게이트를 통과하지 못함 두 가지뿐이며, 그 한계는
> `status-adjudication-design.md` 비보증 절이 소유한다.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/b1-status-drift.js` | CREATED |
| `plugins/mccp/scripts/lib/msw-metrics/b1-evidence-builder.js` | CREATED |
| `plugins/mccp/scripts/lib/msw-metrics/b1-independence-lint.js` | CREATED |
| `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js` | CREATED |
| `plugins/mccp/scripts/derive/sources/milestone-evidence.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/b1-status-drift.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/b1-independence-lint.test.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/assertion-manifest-check.test.js` | CREATED |
| `plugins/mccp/scripts/derive/tests/milestone-evidence.test.js` | CREATED |
| `docs/multi-session-work-loop/status-adjudication-design.md` | CREATED |
| `docs/multi-session-work-loop/m6-assertion-manifest.json` | CREATED |
| `docs/multi-session-work-loop/m6-before.json` · `m6-after.json` · `m6-audit-sample.json` | CREATED |
| `.claude/notes/multi-session-work-loop-m6-implement-gate.md` | CREATED |
| `plugins/mccp/scripts/derive/index.js` | UPDATED (source 등록) |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATED (`computeB1` 사다리 + 병기) |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATED (건수 렌더 + drift 상세) |
| `plugins/mccp/scripts/lib/archive-complete/scan.js` | UPDATED (판정 축 교체 + fail-closed) |
| `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` · `msw-metrics-render.test.js` | UPDATED |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` | UPDATED (version 4면) |
| `docs/multi-session-work-loop/measurement-instrumentation.md` | UPDATED (B1 행) |

## Deviations from Plan

| # | 항목 | 계획 | 실제 | 근거 |
|---|---|---|---|---|
| D1 | base 트리 | `c5b2e04` | Task 0 **전** `origin/main`(102 커밋 앞섬) fast-forward 병합 | 병합을 Task 0 뒤로 미루면 활성 PRD 가 1 → 9 로 늘어 `anchor.prd_milestone_rows` 가 어긋나고 Validation §3 이 `denominator incommensurable` 로 throw 해 Task 0 재실행이 강제된다. 사용자 승인 후 실행 |
| D2 | version | `1.23.10 → 1.23.11` | **`1.26.2 → 1.26.3`** | main 이 이미 1.26.2. §3.7 forward-only 상향(11번째 재발) — plan Risks 표가 사전 승인한 편차 |
| D3 | 게이트 기록 위치 | plan 본문(`## Codex Implementation Review`) | `.claude/notes/…-implement-gate.md` | plan 본문 주입이 plan hash 를 바꿔 상위 `mccp-plan-codex` receipt 를 즉시 stale 로 만든다(실측 재현: validate exit 2). `gate-guard-integrity-m3` 선례와 동일 해소 |
| D4 | version 동기면 | 5면(i18n test 단언 2개 포함) | **4면** | `i18n-surface.test.js` 는 `plugin.json` 에서 version 을 **파생**한다(`MANIFEST_VERSION`, `:94`) — 동기할 리터럴이 없다. §3.7 이 hardcode 를 금지한 결과가 이미 반영돼 있었다 |
| D5 | Validation 명령 형태 | `node --test <디렉토리>` | 파일 열거(배치 러너) | 이 환경의 Node 24 가 `--test <dir>` 를 `MODULE_NOT_FOUND` 로 거부한다(손대지 않은 디렉토리에서도 동일 — 환경 특성). 310 파일 일괄 전달은 Windows 커맨드라인 길이 제한에 걸려 40개씩 배치 |
| D6 | 오라클 test 위치 | `B1-MUTATION-*` 3종이 `b1-status-drift.test.js` | 동일(매니페스트대로) | 변조 test 는 Task 3 열거를 필요로 하므로 그 파일이 source 를 require 한다 |
| D7 | source 산출 필드 | plan 명세 11필드 | + `adjudications[]` | 행별 판정 전수가 없으면 UI14 감사 표본이 "대조한 범위" 를 확인할 수 없고, 변조 불변성의 증거층 단언도 쓸 대상이 없다 |
| D8 | `scan()` 주입 seam | 미명세 | `opts.adjudicate` 추가 | plan 이 요구한 "오라클이 throw 하는 stub" 회귀를 고정할 유일한 방법. 프로덕션 기본값은 실제 오라클이고 CLI 에서 도달 불가 |
| D9 | plan 경로 해석 | 미명세 | join key 가드 + PRD 기준 상대 링크 정규화 | plan 은 `decision_id = planBasename` 만 규정하고 Plan 셀이 **plan 파일이 아닐 때**와 **PRD 기준 상대일 때**를 다루지 않았다. 실측에서 둘 다 나왔고 각각 위양성 3건과 커버리지 누락 5행을 만들었다(아래 Issues 1·3) |
| D10 | plan 아카이브 | 명령 템플릿의 `mv → .claude/PRPs/plans/completed/` | **수행하지 않음** | 이 repo 의 관례는 §3.11 이다 — plan 은 PRD **전체**가 완료될 때 `/mccp:archive-complete` 가 `.claude/PRPs/plans/archived/` 로 옮긴다. main 의 최근 ship(`santa-adjudication-m1` · `diverse-agent-review-m6`)도 plan 이 `.claude/plans/` 에 그대로 있다. 지금 옮기면 (i) PRD M6 행의 링크가 stale 해지고 (ii) B1 자신이 그 행을 해석하지 못하며 (iii) Validation §3 의 재해싱 대조가 깨진다 |

## Issues Encountered

### 실결함 3건 (구현 중 자체 발견 — join key 축에 몰려 있었다)

1. **Plan 셀이 `.plan.md` 가 아닌 행이 `not-shipped` 로 오계상** (위양성 **3건**).
   `plan-body.js#extractPlanPath` 는 렌더러용이라 `.plan.md` 링크를 못 찾으면 *괄호 안 아무
   것이나* 돌려준다(`:85-86`). `review-loop-trust.prd.md` 의 세 행이 자식 **PRD**
   링크(`archived/santa-loop-materialize.prd.md`)를 물고 들어와 있지도 않은 receipt 를 조회한
   뒤 drift 로 잡혔다. **join key 가드**(`.plan.md` 접미사 ∧ repo-root 앵커)를 추가해 확정
   불가를 `undetermined` + `no_plan_count` 로 둔다 — 확정 불가를 판정으로 접는 것이 E1
   위반이다. 이 3건이 남아 있었다면 UI14 감사에서 `agreed:false` 가 나왔을 것이고, 그것이
   그 축이 존재하는 이유다.
2. **plan 이 아카이브로 이동하면 `not-shipped` 로 오계상**. 정확 경로 `ls-tree` 가 빗나가면
   basename 으로 한 번 더 본다 — 아카이브 chore(§3.11)가 지나간 모든 milestone 이 drift 로
   잡히는 것은 측정하려는 drift 가 아니라 **링크의 낡음**이다.
3. **PRD 기준 상대 링크를 거부해 커버리지를 조용히 깎았다** (1번 가드의 과잉 교정). 이 repo 의
   PRD 는 두 관례를 섞어 쓴다 — 백틱 셀은 repo-root 기준(`.claude/plans/x.plan.md`)이고
   마크다운 링크는 **PRD 파일 기준 상대**(`../plans/x.plan.md`)다. 초안 가드가 `..` 를 무조건
   거부해 5행이 대조 범위에서 빠졌고, **하필 `multi-session-work-loop` PRD 자신의
   milestone 들**이 그 대상이었다 — B1 이 존재하는 이유가 정확히 그 PRD 의 자기 drift 를 보는
   것이므로 가장 나쁜 자리에 구멍이 났다. 링크를 PRD 디렉토리 기준으로 정규화한 뒤 `.claude/`
   앵커를 재검사하도록 고쳤다. 위양성을 만들지 않는 방향의 수정이다(거부 → 대조).
   **대조 6행 → 9행**으로 늘었고 drift 는 1건 그대로다. 이 결함은 fail-safe 였지만
   (`undetermined` 는 분자에 안 들어간다) 커버리지 구멍은 지표의 신뢰도를 직접 깎는다.

### lint 품질 결함 1건

초안 lint 가 금지 패턴을 **설명하는 주석**에 걸렸다(자기 자신의 4축 설명 주석에서 즉시
재현). 주석에 반응하는 lint 는 노이즈일 뿐 아니라 저자에게 "규칙을 설명하지 말라" 를
학습시킨다. 줄 번호를 보존하는 주석 제거기를 넣고, 그 동작 자체를 test 로 고정했다.

### 선재 red / 선재 위반 (M6 이 만들지 않았고 고치지 않는다)

- `evidence-audit.js` **exit 4** — `INCOMPLETE: unverifiable=19 ledger entries have no
  matching ship receipt`. 이 도구는 `receipt/hash` · `receipt/schema` · `review-verdict` 만
  require 하고 `.claude/state/completion-ledger/` + `.claude/receipts/` 를 읽는데, M6 은 그
  셋 중 어느 것도 건드리지 않았다. main 선재 상태다.
- renderer `design-lint` **H16 1건**(`bold-asterisk(1)`, advisory). B1 이 낸 두 줄을 제거하고
  다시 lint 해도 **동일하게 1건**이 남아 선재임을 확인했다.
- impeccable detector 2건(`em-dash-overuse` warning · `numbered-section-markers` advisory) —
  plan 이 사전 기록한 항목과 동일하고 HIGH/CRITICAL 아님.

### 병렬 flake 1회 관측 (M6 과 무관 — 판정 근거를 남긴다)

중간 스위트 실행에서 2건이 실패했다 — `review-verdict-corpus-hash.test.js` 의
`briefing_* stays carved out` 과 `receipt/tests/decision.test.js` 의 `deriveDecisionId: PRP/ECC
aliases share branch-derivation…`. "내 변경이 아니다" 를 주장으로 두지 않고 세 가지로 확인했다:

1. **깨끗한 `origin/main` worktree**(`git worktree add --detach`)에서 두 파일을 실행 → 61/61 통과.
2. **내 워크트리에서 같은 두 파일을 격리 실행** → 61/61 통과, exit 0.
3. `briefing_* stays carved out` 은 **완전 합성** test 다 — 디스크·git 을 읽지 않고 메모리 객체
   두 개의 `receiptHash` 를 비교한다. M6 은 `receipt/hash.js` 를 건드리지 않았으므로 영향 경로가
   구조적으로 없다. `deriveDecisionId` 쪽은 git 을 spawn 하는 느린 test(개당 ~1.5s)로 병렬 부하에
   민감하다.

그리고 **재실행에서 재현되지 않았다**(최종 4487/4472, fail 0). STATE.md 가 기록한
`perf-budget 병렬 flake` 와 같은 계열이며, 40파일 동시 `node --test` 실행의 특성이다.
M6 이 만든 red 는 0 이다.

### Codex / security-reviewer 미발화

- Codex: `MCCP_CODEX_DISABLED=1` env 정책으로 first-class skip(`classification=disabled`,
  `blocking=false`). `codex_verdict='skipped'` 로 봉인돼 cross-gate dedupe 가 fail-closed 로
  남고 `/mccp:pr` 의 PR-Codex 는 그대로 발화한다.
- security-reviewer: 이 세션의 harness 정책이 subagent 발화를 금지해 호출 불가.
  **fail-closed 로 남겼다** — receipt 에 `security_skipped=true` 가 실려 `/mccp:pr` 이 이
  상태로 통과하지 못한다. 게이트를 조용히 approving 으로 만들지 않기 위한 의도된 결과이며,
  복구는 subagent 가 가능한 세션에서 `/mccp:prp-implement` 재진입이다.

### Task 0 재실행

**0회.** before 스냅샷은 한 번 봉인한 뒤 갱신하지 않았고, `plan_file_hash` 는 Task 9 시점에도
디스크의 plan 과 일치했다(Validation §3 이 재해싱해 대조). 다만 이 기록은 **사람의 규율**이지
게이트가 아니다 — before 스냅샷이 in-place 덮어쓰기라 재실행 앵커와 원래 앵커는 기계적으로
구별 불가능하다(설계 문서 비보증 절).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/b1-status-drift.test.js` | 8 | 판정 사다리 · 스키마 양방향 거부 · divergent ship · 변조 불변성 양방향 · fixture 건전성 |
| `lib/tests/b1-independence-lint.test.js` | 9 | 4축 음성 fixture · builder 수단 고정 · 구간 마커 · 주석 면제 |
| `derive/tests/milestone-evidence.test.js` | 11 | 커밋 도달성 3분기 · default-ref fallback 3분기 · 전역 중복 · 분모 항등식 · degraded · join key 가드 2축(거부 ∧ 상대 링크 해석) |
| `lib/tests/assertion-manifest-check.test.js` | 7 | 대조기 자신(누락 id · 미발견 title · exit 2 사용 오류 · 중복 id) |
| `lib/tests/msw-metrics.test.js` | +5 | `computeB1` 4분기 + source 부재 |
| `lib/tests/msw-metrics-render.test.js` | +3 | `B1-RENDER-CONSTRAINTS` 4제약 + drift 0 · 커버리지 단서 |
| `lib/archive-complete/tests/scan.test.js` | +4 | ledger 강등 · 오라클 판정 · fail-closed degraded · archivable 불변 |

## Next Steps

- [ ] `/mccp:code-review` 로 변경 코드 review
- [ ] `/mccp:prp-commit` → `/mccp:pr`
- [ ] **PR 전 확인**: `security_skipped=true` 가 `/mccp:pr` 을 막는다. subagent 가 가능한
      세션에서 재진입하거나 운영자가 그 축을 명시적으로 처리해야 한다.
- [ ] ship 후 PRD `## Delivery Milestones` M6 행을 `complete` 로 정정. **지금 미리 바꾸지
      않는다** — receipt 가 없는 상태에서 `complete` 로 두면 B1 이 그 행을 drift 로 잡고,
      그것은 이 지표가 정확히 작동한다는 뜻이지만 문서를 먼저 틀리게 만드는 순서다.
