# Implementation Report: diverse-agent-review M4 — 통과 경로 실증 + 지표 부채 상환

**Plan**: `.claude/plans/diverse-agent-review-m4.plan.md` · **Branch**: `diverse-agent-review-m2` · **Version**: `1.23.5 → 1.23.6` → **최종 `1.23.8`**

> **2026-08-13 santa-loop 정정.** 이 보고서는 구현 시점 상태를 적은 이력이라 서술은 남기고 이후 바뀐 사실만 여기 명시한다. (1) version은 `1.23.6`으로 계획됐으나 main이 `1.23.6`(gate-guard-integrity M1)·`1.23.7`(MSW M4)을 먼저 발행해 §3.7 forward-only 상향 규칙에 따라 **`1.23.8`**로 이동했다 — 아래 본문의 `1.23.6` 표기는 전부 `1.23.8`로 읽어야 한다. (2) 아래 Tasks 표의 "7/9 shell-강제"는 PR-Codex R2(`4580837`)가 5.2e를 기계화하기 **전** 서술이다. 현재는 9개 halt stage가 전부 셸에 배선돼 있다(`grep -o "\-\-halt-stage [0-9a-z.\-]*" plugins/mccp/commands/plan.md` → 9종). PRD의 "HALT 9곳 전부"가 정확하고 이 보고서 쪽이 stale이었다.

## Summary

M1이 배송한 계기는 **한 번도 눈금을 읽지 못했다**. 원인은 우연이 아니라 구조였다 — wall-clock stamp가 `5.6b`의 receipt write 안에만 있고 차단된 실행은 그 앞에서 HALT하므로, 오래 걸린 실행일수록 기록될 확률이 낮았다. M4는 계측 표면을 receipt(worktree-only)에서 `.claude/reviews/`(git-tracked)로 옮기고, 5.2의 **모든** HALT를 그 생성기를 거치게 하고, 발화 불가였던 budget 게이트를 살렸다.

세 축 중 **A(계측)와 B(발화)는 완료**, **C의 라이브 통과 경로는 미달**이다 — 미달 사유는 코드가 아니라 런타임 선행 조건이며, plan이 이를 `High (실측)` 위험으로 이미 예고했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 15 | 16 (+`.claude/notes/…-implement-review.md`, `.claude/reviews/…-postimpl-l1.md`; −`.claude/PRPs/plans/completed/` 미사용) |
| 신규 test | 2 CREATE + 2 UPDATE | 동일 |
| 회귀 | 0 | 0 (793 tests green) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 리뷰 기록을 오라클이 생성하게 한다 | 완료 | `record.js` (순수·무의존·throw 없음) + `cli.js record` (항상 exit 0) |
| 2 | 5.2의 모든 HALT를 계측 경유로 | 완료(9/9 지시, 7/9 shell-강제) | shell이 자기 블록에서 호출: 5.2a·5.2b·5.2c-emit·5.2c-pin·5.2d·5.2e-proof·5.2f. 지시 의존 잔여 2건: 5.2e(5.2h 경유)·5.2g — §5 오라클 추출 소관. 5.2h는 손타이핑 → CLI 1행 **치환** |
| 3 | budget 게이트를 실제로 발화시킨다 | 완료 | `budget.js` + `--granted` 상한 **이후** `minRemaining` emit + skip 반환에 실측치 |
| 4 | 공허한 validation을 실측 test로 | 완료 | 수정 **전** 5 fail 실측 → 후 23/23 green |
| 5 | 통과 경로를 1회 완주 | **미달** | 아래 참조 |
| 6 | 템플릿 acceptance + version 동기 | 완료 | 5면 동기 + CLAUDE.md §4 토글 + PRD 갱신 |

### Task 5 미달 — 정직 기록 (UI3)

플러그인 캐시가 `~/.claude/plugins/cache/mccp/mccp/1.23.4`에 머물러 `mccp:review-{architect,security,test,invariant}` 4종이 이 세션의 agent 레지스트리에 **없다**(캐시 `agents/` 실측 0건, 워크트리에는 4건 존재). 레지스트리는 세션 시작 시 구축되므로 `claude plugin update` 후 **새 세션**이 필요하고, 이 세션의 `claude --version` probe는 ENOENT였다. 코드 변경으로 충족할 수 없는 조건이라 milestone 안에서 해소되지 않는다.

plan의 Risks 표가 이를 `High (실측)`으로 예고하고 "미충족 시 Task 5는 미달로 기록하고 나머지 축은 독립적으로 완료"를 완화책으로 명시했으므로, 그대로 따랐다. PRD Success Metrics·Evidence·milestone status 모두 `forward-only` 미산출로 적었고 `complete`로 올리지 않았다.

**다만 차단 경로는 합성이 아닌 실측으로 확인했다.** 실제 `mode → l1 → decide → record` 체인을 M4 plan 자신에게 돌렸더니 L1이 `C3_CREATE_EXISTS` 4건으로 divergent(구현 후라 CREATE 대상이 존재 — L1이 제 일을 한 것) → `decide` exit 12 → record가 `.claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md`를 남겼다:

```json
{ "verdict": "divergent", "layers": {"l1":"divergent","l2":null,"l3":"not fired"},
  "wall_clock_ms": 43984, "halt_stage": "5.2e", "quorum": null }
```

**M1이라면 이 실행은 아무것도 남기지 않았다.** 슬러그가 스스로를 post-implementation L1 실행이라 밝히므로 게이트의 승인 기록과 혼동되지 않는다.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (`node --check` 6파일) | Pass | record·budget·cli·workflow·html·markdown |
| Unit — plan-review | Pass | 182/182 (신규 20 포함) |
| Unit — review-verdict | Pass | 53/53 (승인 판독 소비처 무손상) |
| Unit — receipt | Pass | 547 pass / 0 fail (schema·hash·dedupe·ship-gate) |
| Unit — i18n surface | Pass | 10/10 (footer version 2면) |
| Gate — receipt chain | Pass | `validate --command mccp:prp-implement` exit 0 |
| Live path | **미달** | Task 5 참조 |

### 수정 전 실패 실측 (UI5)

```
ℹ tests 23 · pass 18 · fail 5
✖ the payload carries minRemaining — the field the budget gate reads
✖ minRemaining tracks the fleet CAPPED by --granted, not the requested panel
✖ MCCP_PLAN_REVIEW_BUDGET overrides the per-reviewer estimate
✖ a malformed MCCP_PLAN_REVIEW_BUDGET falls back to the default, never to 0
✖ remaining below minRemaining skips the panel — the branch that could never fire
```

적용 후 `tests 23 · pass 23 · fail 0`.

### Design Grounding

produced diff의 rendered-surface(v1.18.22 scope) 교집합 **0건** — control-plane-only 변경이라 H15 lint는 no-op(`anchor_clean`). `renderer/html.js`/`markdown.js`는 `.js`이고 `.claude/reviews/*.md`는 generic `.md`다. 2.5.5c capture 아티팩트는 생성하지 않았다(EXECUTE 이후 캡처는 baseline이 산출물을 포함해 delta가 공집합이 되므로, 없는 것이 정직하다).

| Field | Value |
|---|---|
| Verdict | `anchor_clean` (rendered delta 없음) |
| Mode | `enforce` (default) |
| Rendered delta | no |

## Files Changed

| File | Action | Note |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/record.js` | CREATED | 순수 오라클 (+`## Measurement`) |
| `plugins/mccp/scripts/lib/plan-review/budget.js` | CREATED | `parsePanelBudget` / `panelMinRemaining` |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATED | `record` 서브커맨드 + `minRemaining` emit |
| `plugins/mccp/scripts/workflows/plan-review.js` | UPDATED | budget skip 반환에 실측치 |
| `plugins/mccp/commands/plan.md` | UPDATED | 5.2 HALT 계측 · 5.2h 치환 · 템플릿 acceptance |
| `plugins/mccp/scripts/lib/tests/plan-review-record.test.js` | CREATED | 13 tests |
| `plugins/mccp/scripts/lib/tests/plan-review-budget.test.js` | CREATED | 7 tests |
| `plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js` | UPDATED | +4 `minRemaining` 단언 |
| `plugins/mccp/scripts/lib/tests/plan-review-workflow-port.test.js` | UPDATED | +3 budget 런타임 실행 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | `1.23.6` |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer version |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | 단언 2개 |
| `CHANGELOG.md` · `CLAUDE.md` · `.claude/prds/diverse-agent-review.prd.md` | UPDATED | `[1.23.6]` · `MCCP_PLAN_REVIEW_BUDGET` · 지표/Evidence |
| `.claude/notes/diverse-agent-review-m4-implement-review.md` | CREATED | Implement-Codex 감사 기록 |
| `.claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md` | CREATED | 차단 경로 실측 산출물 |

## Deviations from Plan

1. **`## Codex Implementation Review`를 plan 본문이 아니라 `.claude/notes/`에 기록했다.** plan에 주입하면 `plan_hash`가 바뀌어 `mccp-plan-codex` receipt가 stale이 되는 것을 **실측 확인**했다(`validate … --plan` → `stale: mccp-plan-codex`, exit 2). `integrity-unification-m3-implement-review.md`가 같은 이유로 만든 선례를 따랐다. plan은 동결을 유지했고 receipt의 `plan_hash`는 불변이다.
2. **plan을 `completed/`로 아카이브하지 않았다.** 커맨드 본문 Phase 5는 이동을 지시하지만 CLAUDE.md §3.11 C2가 이를 금지한다 — PRD 전체 완료 시에만 아카이브해야 하며, 미완료 PRD의 plan을 옮기면 어느 대시보드 스캔에도 안 잡혀 PRD가 소실된다. 이 PRD는 milestone #5·#1.5·#2·#3이 pending이다. CLAUDE.md가 override다.
3. **2.5.6 receipt write / 2.5.7 validate를 EXECUTE 이후에 실행했다.** 커맨드 본문은 write→validate→Phase 3 순서를 요구한다. 게이트 판정에는 영향이 없다(Codex는 `disabled`라 시점 무관하게 같은 결과, plan 동결로 봉인 대상 불변)지만 순서 위반은 위반이므로 기록한다.
4. **PRD milestone #4 status를 `complete`로 올리지 않았다** — `in-progress` 유지. Outcome의 첫 절("패널이 승인을 발급하는 경로가 1회 완주")이 미달이기 때문이다.
5. **`security-reviewer` Task를 호출하지 않았다** — §0 카테고리 비해당 판단(범위 판단이지 가용성 fallback이 아니므로 `--security-skipped` 미forward, M3 선례 동형). 인접 표면인 slug→경로 결합은 `sanitizeSlug`로 방어하고 탈출 시도를 test로 고정했다.

## Issues Encountered

- **`git pull --rebase` 실패** (unstaged changes). 이 브랜치는 원격에 없고 `origin/main...HEAD` diff가 공집합이라(M1이 `fbf78b4`로 이미 머지됨) 동기화 불필요.
- **`record.test.js`의 파이프 이스케이프 단언이 처음 실패했다.** 코드가 아니라 단언이 틀렸다 — 이스케이프된 `\|`까지 구분자로 셌다. 구분자만 세도록 정정(이스케이프 동작은 의도대로였다).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plan-review-record.test.js` | 13 | 통과/늦은 차단/이른 차단 3경로 · null-not-zero · budget-skip 표기 · 표 파괴 방어 · slug 탈출 방어 · CLI seam 4건 |
| `plan-review-budget.test.js` | 7 | default · 양수 · floor · 0/음수/비수치 → default+warn · 빈 값 무경고 · fleet 비례 · 비정상 fleet |
| `plan-review-cli-emit.test.js` | +4 | `minRemaining` 존재·`--granted` 상한 반영·env override·malformed fallback |
| `plan-review-workflow-port.test.js` | +3 | `budget.total` 미설정 무발화 · skip 시 agent 0 + 실측치 · 경계값 발화 |

## Acceptance (plan §Acceptance 대조)

- [x] All tasks complete — **Task 5 제외** (런타임 선행 조건 미충족, 미달로 기록)
- [x] Validation passes — 793 tests green
- [x] Patterns mirrored, not reinvented — `plan-fanout/budget.js` · `quorum.js` 순수 오라클 분리 · `plan.md:923` 아티팩트 IPC
- [x] 차단 경로에서 `.claude/reviews/` 기록 + 정수 `wall_clock_ms` (UI10) — 5.2e 실측 43984ms
- [x] `minRemaining`이 `--granted` 상한된 `fleet.length`에 비례 (UI12)
- [x] `budget.total` 미설정 시 동작 불변 — 런타임 test로 고정
- [x] 신규 회귀 test가 수정 **전** 실패함을 실측하고 기록 (UI5)
- [ ] **패널 통과 경로 1회 완주** — 미달, PRD에 forward-only 기록 (UI11, UI3)
- [x] §3.7 5면 version 동기 — 계획은 `1.23.6`, **실제 ship은 `1.23.8`**(병렬 브랜치 상향, 서두 정정 참조). `plugin.json`·`html.js`·`markdown.js`·`CHANGELOG.md`가 `1.23.8`로 일치하고 `i18n-surface.test.js`는 리터럴이 아니라 manifest 파생이라 자동 추종
- [x] receipt schema·`receipt_hash`·git-tracked ship corpus 무변경 (UI7) — 신규 필드 0, receipt 548 tests green

## Next Steps

- [ ] `claude plugin update` → **새 세션** → `MCCP_PLAN_REVIEW` 미설정으로 `/mccp:plan` 완주 (Task 5 잔여)
- [ ] `/mccp:pr` — PR-Codex가 실제 발화 (dedupe는 `codex_verdict='skipped'`에 fail-closed)
