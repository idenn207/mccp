# Implementation Report: PR-Codex R1 흡수 (v1.22.3 M3 follow-up)

## Summary

PR-Codex R1이 지적한 HIGH 2건(F1 scope-excluded 불투명 차단 · F2 유령 예약)과 plan 게이트 중 자체 발견한 HIGH 1건(F5 free-text verdict blindness)을 흡수했다. 구현 중 **F1의 전제가 거짓임을 발견**해(아래 Deviations) 필터 매처까지 복구했다 — 이 수정이 없었다면 F1 전체가 발화 불가능한 죽은 코드였다.

세 결함은 모두 **같은 실패 양식**이다: *stub/fixture가 실제 producer 계약이 아니라 구현의 가정을 인코딩해, 테스트 suite가 green인 채 프로덕션이 blind했다.* M3의 원래 `.stdout` blindness가 그랬고, F1의 필터가 그랬고, F5의 free-text 스캔이 그랬다. 이번 사이클의 회귀 test는 전부 **실제 producer 형태**(codex 1.0.4 `render.mjs#normalizeReviewFinding`)로 고정했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium-High (F1 전제 복구가 추가됨) |
| Files Changed | 16 (+2 CREATE) | 19 (+2 CREATE) — 승인된 deviation 2건 |
| Tasks | 13 | 13 + F1 전제 복구 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| — | **F1 전제 복구** (계획 외) | Complete | `codex-result-filter` 매처 — 사용자 승인 후 추가 (Deviations 참조) |
| 1 | F1 `deriveEffectiveReview` 순수 오라클 | Complete | export + 직접 단위 test 9건 |
| 2 | F1 runner `codex_scope_excluded_verdict` emit | Complete | raw verdict는 raw 유지 |
| 3 | F1 receipt forward (finalize/write/schema) | Complete | `meta.codex_raw_verdict` 병기 (R1 F4) |
| 4 | F1 회귀 test (stub 충실도) | Complete | 실 producer 형태로 6건 |
| 5 | F2 2단계 예약 lifecycle | Complete | `reservationId` + `reconcileReservation` + lease |
| 6 | F2 `reconcile` CLI | Complete | exit 0 고정 — pipeline 미차단 |
| 7 | F2 회귀 test | Complete | 원자성 `[4,4,1,1,1]` green 유지 |
| 8 | F2 preview read-only 불변식 확장 | Complete | `reconcileReservation` denylist 추가 |
| 9 | F2 `work.md` 예약 + route reconcile | Complete | 합성 harness 4 case ALL GREEN |
| 10 | F2 `plan.md` 예약 + 2.5.3 reconcile | Complete | route 경계 부재 → 호출 후 전 경로 명시 commit |
| 11 | F1 `pr.md` 정직 표면 | Complete | review-only 유지(body 텍스트만) |
| 12 | F5 구조화 verdict 단일 파서 | Complete | `codex-review-payload.js` — 3게이트 공용 SoT |
| 13 | 문서 + backlog | Complete | CLAUDE.md §1.4 + §4 토글 2건 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 프로젝트에 lint/type-check 없음 (순수 Node, package.json 부재) |
| Unit Tests | Pass | 아래 표 |
| Build | N/A | 빌드 단계 없음 |
| Integration | Pass | 합성 harness (LLM 0회) |
| Edge Cases | Pass | fail-closed 가드 전수 |

| Suite | Result |
|---|---|
| `codex-result-filter.test.js` | 40/40 (기존 33 back-compat + 신규 producer-shape 7) |
| `codex-review-payload.test.js` | 15/15 (신규) |
| `orchestration-runaway.test.js` | 39/39 (원자성 `[4,4,1,1,1]` 포함) |
| `orchestration-preview.test.js` | 16/16 (read-only 디스크 불변 포함) |
| `pr-phase-helpers/` (runner + finalize) | 60/60 |
| `codex-runner.test.js` (오라클 직접 test 추가 후) | 28/28 |
| `implement-dispatch/tests/` | 153/153 (F5 4번째 게이트) |
| `dispatch-cli.test.js` | 60/60 (verify-decide CLI + 실측 R1 회귀) |
| `receipt/tests/` 전체 | 431 중 430 pass / **0 fail** |
| **최종 전체 회귀** (`lib/tests/` + nested + `implement-dispatch/tests/`) | **1125 중 1120 pass / 1 fail(pre-existing, 증명됨) / 4 skipped** |

### 유일한 실패는 pre-existing — 액면 수용이 아니라 증명

`lib/tests/` 949건 중 1건 실패: `design-critique-loop-e2e.test.js` **F) fixture file exists in .claude/cache/**.

**내 변경과 무관함을 기계적으로 증명**했다 — 변경 24개 파일을 `git stash --include-untracked`로 전부 치운 상태에서 **동일하게 실패**한다(6 tests / 5 pass / 1 fail). 근거:

- 이 test는 `fs.existsSync('.claude/cache/test-fixture-status.html')`만 확인하며, 내가 변경한 모듈을 **하나도 import하지 않는다**(node builtin + spawnSync뿐).
- 해당 fixture는 git history가 **전무**하다(한 번도 커밋된 적 없음). CLAUDE.md §3.9가 명시한 그대로다 — "커밋물이 아니라 필요 시 test-time에만 쓰이는 임시 합성 파일이며 현재 tracked 상태가 아닙니다". 즉 test가 문서화된 계약과 어긋나 있는 환경 의존 실패다.

**plan 예측 정정**: plan Acceptance는 pre-existing 실패를 `verdict-label.test.js` 1건으로 적었으나, 그 파일은 `lib/renderer/tests/`에 있어 `lib/tests/` 회귀 범위 **밖**이다(별도 확인: 7 중 6 pass / 1 fail — backlog 2026-07-08자 "origin/main baseline에서 FAILS" 항목과 일치). 따라서 pre-existing 실패는 **2건**이며 둘 다 본 변경 표면 밖이다. plan이 하나만 예측한 것은 부정확했다.

### 합성 검증 (LLM 0회)

**F2 reserve→route→reconcile harness** — ALL GREEN:

| Case | 결과 |
|---|---|
| reserve(4) → prepare 실패 → route=`task` → reconcile(1) | `launched==1` (R1 F1+F2 동시 가드) |
| reserve(4) → route=`workflow-parallel` → reconcile(4) | `launched==4` |
| reserve(4) → 미발화 → reconcile(0) | `launched==0` |
| 재예약 | granted=4 (영구 강등 없음) |

**F5 실측 재현** — 본 사이클 실제 R1 payload:

```
structured verdict : divergent | source: structured | raw: needs-attention
OLD free-text scan : converged   <-- F5 버그
=> FIXED: dedupe fail-closed → PR-Codex 실행
```

**Receipt round-trip** — 실효/원자료 동시 기계 판독:

```
resolution.codex_verdict          : converged        (실효)
meta.codex_raw_verdict            : needs-attention  (원자료, 봉인 receipt 내)
meta.codex_scope_excluded_verdict : true
schema valid: true
```

## Files Changed

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/codex-review-payload.js` | CREATED | F5 — 구조화 `.result.verdict` 단일 SoT (3게이트 공용) |
| `plugins/mccp/scripts/lib/tests/codex-review-payload.test.js` | CREATED | F5 회귀 (실측 fixture) |
| `plugins/mccp/scripts/lib/codex-result-filter.js` | UPDATED | **F1 전제 복구** (deviation) |
| `plugins/mccp/scripts/lib/tests/codex-result-filter.test.js` | UPDATED | **producer-shape 회귀** (deviation) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATED | F1 오라클 + emit; F5 공용 파서 소비 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATED | F1/F4 매핑 |
| `plugins/mccp/scripts/receipt/{schema,write}.js` | UPDATED | present-only meta 2필드 |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | UPDATED | F2 2단계 lifecycle + lease + CLI |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATED | F5 — fallback 전용으로 축소(문서) |
| `plugins/mccp/commands/{work,plan,pr,prp-implement}.md` | UPDATED | 예약 reconcile · 정직 표면 · 구조화 파서 |
| `CLAUDE.md` · `codex-findings-backlog.md` | UPDATED | 문서 + backlog 해소 표기 |

`plugin.json`은 **의도적 미변경** — 미머지 M3 PR의 흡수 커밋이며 1.22.3이 계속 정확히 라벨링한다 (plan Risks 표).

## Implement-Codex R1 — 4 HIGH 흡수 (게이트가 실제로 일을 했다)

게이트를 (순서는 어긋났지만) 돌린 결과 **verdict `needs-attention`, HIGH 4건**이 나왔고 **4건 전부 실제 코드로 재현**한 뒤 흡수했다. 신규 구조화 파서가 프로덕션에서 `divergent`를 정확히 도출했다 — 구 free-text 스캔이었다면 여기서 또 `converged`로 오판했을 지점이다(F5의 실전 증명).

| Finding | 재현 | 흡수 |
|---|---|---|
| **F1** reconcile 실패가 launch 전 성공으로 보고 | lock 고갈 → `reconciled:false`인데 exit 0 → 토큰 삭제 후 4 worker 발화 → lease가 **실제 worker를 미카운트** | CLI exit을 actualN 분기(`>0` ∧ 미commit → exit 11). work.md 3회 재시도 후 **fail-closed HALT**(토큰 보존), plan.md는 launch 이후라 토큰 보존 + loud warn |
| **F2** lease 경과 후 명시 reconcile이 자기 id 상실 | lease-applied view를 먼저 읽어 자기 예약이 pruned → no-op → fan-out이 10분 초과 시 실제 agent 미카운트 | `readCounterRaw` 분리 — 자기 id는 raw에서 먼저 찾고 **나머지에만** expiry. 명시 증거가 lease의 추측을 이긴다 |
| **F3** free-text fallback이 malformed review를 승인 | `{stdout:'MALFORMED'}` + 산문 "we converged on the approach" → **`converged`** → dedupe가 PR-Codex skip | fallback은 `divergent`/`critical`만 발급, **`converged` 불가**. "스캔은 의심을 제기할 수는 있어도 승인을 증명할 수는 없다" |
| **F4** title 키워드 drop이 여전히 in-scope finding 제거 | `"Brand asset loader reads arbitrary local files"` → veto 미매칭 + `\bbrand\b` → drop → survivors 0 → **PASS** | **PASS 자체를 철회** (아래) |

### F4 — PR-Codex R1 F1을 의도적으로 부분 반려

두 Codex 라운드가 충돌했다. PR-Codex R1 F1은 "전부 scope-excluded면 `actionable=false`로 통과"를 요구했고, Implement-Codex R1 F4는 "그 통과의 근거가 불건전하다"고 했다. **F4가 옳다**:

- drop 판정은 자유 텍스트 키워드 매칭이고, producer는 검증할 `category`/scope 필드를 **emit하지 않는다**. 유한한 veto 목록으로 "이 finding은 오직 design이다"라는 **부정을 증명할 수 없다**.
- 오류 비용이 비대칭이다: false pass = 보안 우회(조용함) / false block = 사람이 읽음(fail-closed).
- 원래 backlog 불만은 **"불투명 차단"**이었다 — 차단이 아니라 **불투명함**이 문제였다.

그래서 **non-approving 상태는 유지하고 불투명함만 제거**했다: `deriveEffectiveReview` 규칙 5 → `{actionable:true, scopeExcluded:true}`, `finalize-receipt`는 verdict를 덮지 않고 raw `divergent`를 봉인(dedupe 키이므로 거짓 converged 금지), `pr.md`는 raw verdict·drop 건수·라우팅 소유자를 명시한다. 사용자 승인 후 채택.

**정확한 효력 범위 (과장 금지)**: `codex_actionable_findings`에는 mechanical hard-stop이 **없다** — `pr.md:438`이 파싱만 하고 validate-cmd도 이 필드로 차단하지 않는다(plan의 Ground가 이미 명시한 사실). 따라서 이 수정이 보장하는 것은 **"PR이 기계적으로 막힌다"가 아니라**:

1. receipt가 `divergent`로 정직하게 봉인된다 → cross-gate dedupe가 fail-closed → 후속 사이클에서 PR-Codex가 실제로 발화한다.
2. PR body가 raw verdict·drop 건수·라우팅 소유자를 명시한다 → 사람/LLM 리뷰어가 무엇이 사라졌는지 본다.

즉 이건 **감사 기록의 정직성 + review 표면의 투명성** 보장이다. 초안이 위험했던 이유도 정확히 이 축이다 — `converged` 매핑은 (1)을 무력화해 dedupe가 PR-Codex를 skip하게 만들었을 것이다.

키워드 증거는 **라우팅·감사**에는 충분하고 **통과 승인**에는 불충분하다 — 이 구분이 F4의 핵심이다. 필터 수정의 실질 가치는 그대로다: audit 4필드가 v0.3.6 이래 처음으로 참이 되고 a11y 라우팅이 실제로 동작한다.

### F5 확장 — 4번째 게이트 (사용자 승인 후 흡수)

Task 12는 F5를 3게이트(plan/implement/pr)로 범위 잡았으나, 흡수 검증 중 **`implement-dispatch/verify.js`(aggregate merged-verify, `MCCP_WORK_MERGED_VERIFY` **default enforce**)** 도 같은 free-text 스캔을 쓰는 것을 발견했다.

실측: 본 사이클 실제 R1 payload → `parseVerdict` → **`converged`**. 즉 `/mccp:work`의 통합 verify가 **commit 직전 "No ship" 리뷰를 고무도장** 찍고 있었다 — M3가 PR 게이트에 대해 고쳤다고 주장한 결함이 4번째 게이트에 잔존. 동일 오라클로 전환하고, bare-prose fixture(`stdout:'Verdict: converged. Ship-safe.'` — producer가 emit하지 않는 형태)를 실 producer envelope로 교체했다. `implement-dispatch/tests/` 153/153 green, 실측 R1 → `divergent` + `block=true`.

### 이 사이클이 닫은 동일 실패 양식: 5건

| # | 위치 | 증상 |
|---|---|---|
| 0 | M3 원래 `.stdout` blindness | (기흡수) PR 게이트가 envelope을 읽어 verdict 무시 |
| 1 | `codex-result-filter` | 매처가 `category`/`text`만 읽어 v0.3.6 이래 identity |
| 2 | `plan.md` / `prp-implement.md` | free-text 스캔이 R1을 `converged`로 오판 |
| 3 | `codex-review-payload` fallback | schema drift 시 산문이 승인 발급 |
| 4 | `implement-dispatch/verify.js` | merged-verify가 "No ship"을 통과 |

**공통 원인은 하나다**: test fixture/stub이 **producer 계약이 아니라 구현의 가정**을 인코딩해, suite가 green인 채 프로덕션이 blind했다. 이번 사이클의 모든 신규/수정 fixture는 실제 producer 형태(codex 1.0.4 `render.mjs#normalizeReviewFinding` · codex-invoke envelope)로 고정했다.

## Deviations from Plan

### 1. `codex-result-filter.js` + 그 test 추가 (사용자 승인)

**WHAT**: plan의 Files to Change에 없던 2개 파일을 변경했다.

**WHY**: plan Task 1의 판정 규칙 5(`non-approve + survivors 0 + **dropped > 0** → scopeExcluded`)가 성립하려면 필터가 실제로 finding을 drop해야 한다. 구현 중 확인한 사실:

- 실제 producer(codex 1.0.4 `render.mjs#normalizeReviewFinding`)는 finding을 `{severity, title, body, file, line_start, line_end, recommendation}`로 고정 emit하고 `codex-invoke.js`는 무변형 통과시킨다.
- `findingMatches`는 `finding.category` / `finding.text`만 읽는다 — 실 payload에 **둘 다 부재**.
- 실측: 실 형태 → 드롭 0건, fixture 형태(`{category, text}`) → 드롭 2건. receipt 증거로 `codex_design_scope_excluded=true`인 18개 전부 `dropped=0`.

즉 v0.3.6 이래 필터는 **항상 identity**였고, `dropped > 0`이 구조적으로 불가능하므로 F1은 **죽은 코드**가 될 상황이었다. 더 결정적으로, plan Task 4의 test("전부 design/a11y → scope_excluded=true")를 green으로 만들려면 **producer가 내보내지 않는 형태로 stub을 써야** 했다 — plan 자신이 Task 4에서 금지한 것이고("stub은 구현이 아니라 producer를 미러") M3의 원래 버그와 동일한 실패 양식이다.

Phase 3 진입 전 사용자에게 3개 선택지로 제시해 **"필터 매처까지 함께 수정"** 승인을 받았다.

**설계 판단 — `body`/`recommendation`은 drop 판정에서 의도적 미매칭**: `title`만 추가했다. 두 오류 방향의 비용이 비대칭이기 때문이다.

- false **drop** → in-scope security/correctness finding이 review 표면에서 조용히 사라짐. 게이트가 audit 신호 없이 약화된다.
- false **keep** → finding이 actionable로 남아 PR이 차단되고 사람이 읽는다. fail-closed — 이 게이트가 틀려야 하는 방향.

`\bcolor\b` / `\bbrand\b` / `\bspacing\b`는 비-design 코드 산문에 흔히 등장하므로 `body`로 drop을 판정하면 미미한 recall을 조용한 false drop과 맞바꾸는 거래가 된다.

### 1b. 자체 발견 — 매처를 고치자 **새 구멍이 열렸고**, 같은 사이클에서 닫음

필터를 실제로 동작하게 만든 직후, 스스로에게 던진 질문("title 매칭이 현실적인 bypass를 만드나?")을 실측했더니 **진짜 구멍이었다**:

| 실제 보안 finding (제목에 design 단어) | veto 이전 |
|---|---|
| `Brand asset path traversal` | **DROPPED** (`\bbrand\b`) |
| `Color palette config allows script injection` | **DROPPED** (`\bcolor\b`) |
| `Spacing token loader leaks credentials` | **DROPPED** (`\bspacing\b`) |

필터가 identity이던 시절엔 **존재할 수 없던 위험**이다(아무것도 drop 안 했으므로). 이런 finding이 유일 항목이면 `deriveEffectiveReview` 규칙 5가 review 전체를 scope-excluded로 판정해 **진짜 보안 지적이 표면에서 사라진 채 PR이 통과**한다 — 내가 바로 위에 "절대 안 된다"고 적은 그 방향.

**수정 — in-scope VETO(`hasInScopeSignal`)**: in-scope 신호(injection/traversal/auth/secret/credential/xss/privilege/race condition/data loss/…)가 보이면 제목이 아무리 design스러워도 **절대 drop하지 않는다**. 핵심은 **필드 스캔 범위를 비대칭으로** 둔 것이다:

- **drop 판정** → 좁은 고신호 필드(`category`/`text`/`title`). false drop이 치명적이므로.
- **veto 판정** → `body`/`recommendation`까지 **전 필드**. false veto는 곧 keep = fail-closed = 안전하므로.

즉 "prose로 drop하지 않되, prose로 살리기는 한다". 회귀 test 6건으로 양방향 고정(보안 finding 4종 veto 유지 + 진짜 design finding 3종은 여전히 droppable — veto가 blanket keep으로 퇴화하지 않음).

### 2. Plan 미archive (Phase 5 표준 단계 생략)

prp-implement Phase 5는 plan을 `.claude/PRPs/plans/completed/`로 옮기라고 하나 **의도적으로 생략**했다. 세 근거가 일치한다:

- `dedupe.js#parsePlanFiles`가 `fs.existsSync(planPath)`로 plan 본문을 **디스크에서 읽는다** → 지금 옮기면 다음 단계 `/mccp:pr`의 cross-gate dedupe가 plan을 못 찾는다(fail-closed라 안전하지만 불필요한 낭비).
- `.claude/PRPs/plans/completed/` 디렉토리가 **존재하지 않는다**.
- 직전 shipped M3 plan(`workflow-orchestration-live-activation-m3.plan.md`)도 `.claude/plans/`에 그대로 있다 — 이 프로젝트의 실제 관행은 implement 시점 archive가 아니다.

### 3. plan Validation 명령의 경로 오류

plan은 `node --test plugins/mccp/scripts/receipt/tests/`(trailing slash)를 명시하나 Node가 이를 모듈 경로로 해석해 실패한다. glob 형태(`.../tests/*.test.js`)로 실행했다 — 431/430 pass. plan 문서의 오타이며 코드 문제가 아니다.

## Issues Encountered

### Phase 2.5 게이트 순서 이탈 (내 실수)

F1 전제 붕괴 발견 → 사용자 승인 우회로를 타면서 **MANDATORY인 Phase 2.5 Implement-Codex 게이트를 건너뛰고** Phase 3로 직행했다. 발견 후 즉시 실행했으며(커밋 전이라 흡수 비용은 동일), 그 게이트가 HIGH 4건을 잡았다 — 그중 2건은 실제 worker 미카운트, 1건은 dual-review 우회, 1건은 보안 우회. **건너뛴 채 PR로 갔다면 전부 그대로 나갔다.** plan body의 `## Codex Implementation Review`에 순서 이탈을 정직히 기록했다.

### verify-decide CLI test 누락 (자체 검출)

4번째 게이트 수정 후 `implement-dispatch/tests/`만 돌려 153/153 green을 확인했으나, 같은 코드를 쓰는 `lib/tests/dispatch-cli.test.js`의 `verify-decide` test가 **범위 밖이라 놓쳤다**. 전체 회귀에서 검출 → 그 fixture 역시 bare prose(`stdout:'Verdict: converged'`)라 실 producer envelope로 교체 + 실측 R1 회귀 추가(60/60).

### receipt chain stale (해결)

plan body에 `## Codex Implementation Review`를 append하면서 `plan_hash`가 변해 상류 plan-codex가 stale이 됐다. 직전 M3 사이클과 대조해 **append 후 재봉인이 이 프로젝트의 관행**임을 확인(M3의 plan-codex hash == implement 섹션 포함 최종 plan)하고 같은 verdict로 재봉인 → chain `ok: true`.

- **receipt suite 소요 시간**: 39개 파일이 각각 임시 git repo를 만들어 10분 이상 걸린다. 백그라운드 실행으로 완주했다(430/431 pass). 기존 특성이며 본 변경과 무관.
- **`bumpCounter`의 잠재 함정**: 프로덕션 호출자는 없지만 `open[]`을 쓰지 않고 body를 덮어써 예약을 지울 수 있었다. 보존하도록 수정 + 회귀 test 추가(계획 외 소소한 방어).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `codex-review-payload.test.js` | 15 (신규 파일) | 구조화 우선 precedence · 실측 F5 fixture · fail-closed |
| `codex-result-filter.test.js` | +7 | 실 producer 형태 drop/digest/identity/false-drop 방지 |
| `codex-runner.test.js` | +15 | F1 4중 AND 가드 전수 + 오라클 rule table 직접 |
| `finalize-receipt.test.js` | +5 | scope-excluded 매핑 + raw 보존 + 3종 미완화 가드 |
| `orchestration-runaway.test.js` | +15 | 2단계 lifecycle · lease · back-compat · 멱등 |
| `orchestration-preview.test.js` | +1 assert | read-only denylist 확장 |

## Next Steps

- [ ] `/mccp:pr` 재실행 — PR-Codex가 F1/F2/F5 회귀 확인
- [ ] M2 live row (A)/(B) 완주는 operator 수동 (catastrophic $500 미만이면 진행 가능)
