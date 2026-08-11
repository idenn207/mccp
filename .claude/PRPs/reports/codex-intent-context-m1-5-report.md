# Implementation Report: codex-intent-context M1.5 — 오심(mislabelling) 탐지

**Plan**: `.claude/plans/codex-intent-context-m1-5.plan.md`
**Branch**: `feat/codex-intent-context-m1-5`
**Version**: `1.23.7 → 1.23.8` (plan은 `1.23.5`를 가정 — §3.7 forward-only 상향, 아래 D1)
**Date**: 2026-08-10

## Summary

M1(1.23.4)이 닫은 것은 **누락**이다 — 모든 Codex finding이 명시 판정을 받지 않으면 receipt가 써지지 않는다. 그러나 저자가 전부 `intent_conflict:'none'`으로 찍으면 커버리지 검사는 통과하므로 **오심**은 남았다.

M1.5는 리뷰어에게 per-finding `INTENT:` 계약을 부과하고, 리뷰어 주장과 저자 판정을 **비대칭 대조**한다. 리뷰어가 지목한 `UI` id를 저자가 지목하지 않은 finding은 명시 응답(라벨 정정 또는 `intent_dispute_reason`)을 강제받고, 없으면 `mislabel_unresolved`다. 리뷰어가 계약을 따르지 않아 대조 자체가 성립하지 않으면 `inconclusive`다.

**이 milestone은 지표를 달성하지 않는다.** 기본 모드를 정할 Task 0 실측이 Codex 계정 쿼터 소진으로 막혀 DD10 fallback(`DEFAULT_MISLABEL_MODE = 'warn'`)이 적용됐고, `warn`에서는 UI10이 성립하지 않는다. 배송된 것은 **감사 표면**이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계가 santa-loop 3라운드로 이미 확정돼 구현 판단이 적었다 |
| Files Changed | 21 (CREATE 3 / UPDATE 18) | 22 (CREATE 2 / UPDATE 20) — 아래 D8 |
| Version | `1.23.4 → 1.23.5` | `1.23.7 → 1.23.8` (D1) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 리뷰어 계약 준수율 실측 | **미측정(선행 커밋)** | Codex 쿼터 소진. DD10 fallback 적용 — 이번 cycle에서 재시도하지 않음 |
| 1 | `intent-claims.js` 파서 + 대조 오라클 | 완료 | 순수 함수(fs/process 미참조를 test가 고정) |
| 2 | `intent-claims.test.js` | 완료 | 39 tests |
| 3 | `intent-context.js` verdict·dispute·warn·chain reader | 완료 | 판정 locus 1건 변경(D3) |
| 4 | `intent-context.test.js` 신규 verdict 회귀 | 완료 | 55 tests (신규 20) |
| 5 | `codex-invoke.js` 계약 문단 | 완료 | 배치 위치 변경(D4) + CLI 플래그 추가(D5) |
| 6 | `plan-codex-runner.js` 배선 | 완료 | ⓪①②③④ 순서 불변식 + 동시 변조 회귀 |
| 7 | receipt 표면 4파일 | 완료 | present-only 6필드 + per-verdict 복구 문구 |
| 8 | `plan.md` 본문 + e2e | 완료 | e2e는 **실 receipt writer** 통과 |
| 9 | 버전·문서 동기 | 완료 | 5면 + CHANGELOG 중복 제거(D2) |

## Validation Results

| Level | Command | Status |
|---|---|---|
| 단위 — 신규 | `node --test .../intent-claims.test.js` | 39/39 |
| 단위 — 오라클 | `node --test .../intent-context.test.js` | 55/55 |
| 단위 — runner | `node --test .../plan-codex-runner.test.js` | 32/32 |
| 단위 — wrapper | `node --test .../codex-invoke.test.js` | 43/43 |
| 단위 — renderer | `node --test .../i18n-surface.test.js` | 10/10 |
| 회귀 — off 등가 | `MCCP_INTENT_MISLABEL=off node --test .../intent-context.test.js` | 55/55 |
| 회귀 — receipt 전체 | `node --test plugins/mccp/scripts/receipt/tests/*.test.js` | **554 tests / 553 pass / 0 fail** |
| 회귀 — 인접 소비처 7종 | codex-bridge · codex-invoke-json · codex-result-filter · codex-review-payload · plan-command-marker-states · pr-ship-gate · pr-phase codex-runner | 153/153 |
| 머지 사고 방지 | `git diff --diff-filter=D --name-only origin/main...HEAD` | **삭제 0건** |
| 버전 5면 | `grep -rn "1\.23\.8" …` | 7 hit (plugin.json·html·markdown·i18n×2·CHANGELOG×2) |

> 플랜의 `node --test plugins/mccp/scripts/receipt/tests/` (디렉토리 인자)는 이 Node 버전에서 `Cannot find module`로 실패한다. `tests/*.test.js` glob으로 실행했다.

### Design Grounding

N/A — design trigger 미발화(`design_signal=false`, `silent_skip=no-signal`). Phase 2.5.5c capture·Phase 3.7 lint 모두 no-op.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/intent-claims.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/intent-claims.test.js` | CREATED |
| `plugins/mccp/scripts/lib/intent-context.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/intent-context.test.js` | UPDATED |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATED |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | UPDATED |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATED |
| `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` | UPDATED |
| `plugins/mccp/commands/plan.md` | UPDATED |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED |
| `docs/codex-intent-context/reviewer-contract-compliance.md` | UPDATED (plan은 CREATE — 이미 존재, D8) |
| `CHANGELOG.md` · `CLAUDE.md` · `.claude/prds/codex-intent-context.prd.md` | UPDATED |
| `.claude/plans/codex-intent-context-m1-5.plan.md` | UPDATED (게이트 리뷰 섹션 주입) |

## Deviations from Plan

**D1 — 버전 `1.23.5` → `1.23.8`.** plan 작성 시점 이후 main이 `1.23.7`까지 진행했다(브랜치는 origin/main보다 51 커밋 뒤). §3.7 forward-only에 따라 이미 발행된 번호는 불가침이므로 상향했다. plan의 Risks 표가 이 가능성을 예고하고 있었다(`1.23.6`으로 올릴 준비).

**D2 — CHANGELOG 중복 `## [1.23.4]` 헤딩 제거 (plan 범위 밖).** 이 브랜치에는 같은 milestone에 대한 `[1.23.4]` 항목이 **2개** 있었다. PR #118이 발행한 항목이 파일 중간(1.23.1 아래)에 삽입돼 있었고, 다음 세션이 맨 위 헤딩만 보고 "1.23.4 누락"으로 판단해 하나를 더 추가했다(be88e5c). §3.7이 "헤딩 중복은 조용히 넘어가지 말 것 — CHANGELOG가 깨진 상태"라 규정하므로, main에 있는 항목을 정본으로 두고 미발행 중복을 제거했다. **순서 정렬은 하지 않았다** — main의 배치를 건드리는 것은 머지 해소의 몫이다.

**D3 — `validateReason` 적용 위치.** plan Task 3(c)는 `parseAdjudicationFile`이 길이 검증 + strict `validateReason`을 적용한다고 적었으나, 같은 문장이 위반의 결과를 "그 dispute는 **부재로 취급**돼 `mislabel_unresolved`"라고 규정한다. 파서가 파일을 거부하면 verdict는 `incomplete`가 되어 그 규정과 어긋나고, 파서가 필드를 지우면 DD11이 요구하는 감사 증거(무엇이 왜 기각됐는지)가 사라진다. 따라서 **길이 검증만 파서**(형제 필드와 동형, `dispute-reason-too-long`)에 두고, strict 판정은 신규 `isValidDisputeReason`이 판정 시점에 소유한다. 관측 동작은 plan의 Acceptance와 정확히 일치한다(`"no"` → 부재 취급 → `mislabel_unresolved`).

**D4 — 계약 문단을 reference 블록 *뒤*에 배치.** plan Task 5는 "contract를 base 뒤에"라 적었으나, 같은 Task가 문단 **원문**을 확정하며 그 안에 "위 reference 블록에 **실제로 있는** id만 쓰세요"가 있다. 앞에 두면 그 "위"가 가리키는 대상이 존재하지 않는다. 원문은 손대지 말라고 명시돼 있으므로 배치를 맞췄다. 부수 효과로 `reviewer-contract-compliance.md`가 예고한 "harness와 production의 순서 차이" 확인 숙제가 **소멸**했다(harness도 뒤에 붙였다) — 해당 문서를 그에 맞게 갱신했다.

**D5 — `codex-invoke.js`에 `--mislabel-contract` CLI 플래그 추가 (plan 미기재).** Task 0의 절차가 "wrapper 경유 + 계약 문단 포함"을 요구하는데, 플래그가 없으면 그 조합을 CLI에서 만들 수 없어 절차가 실행 불가가 된다. 이 플래그는 **프롬프트만 조형**하며 어떤 verdict도 결정하지 않으므로, receipt CLI의 "`--intent-*` 플래그 0건" 불변식과 무관하다(그 불변식은 test로 계속 고정돼 있다).

**D6 — `intent_mislabel_audit[].resolution` enum에 `unresolved` 추가.** DD11은 `'relabelled'|'disputed'`만 열거했으나, 저자가 라벨을 정정하면 분류가 `agree-conflict`가 되어 **audit 배열에 애초에 들어오지 않으므로** `relabelled`은 구조적으로 도달 불가다. 반대로 `warn`에서는 미해소 항목을 담은 receipt가 실제로 작성되는데, 그때 표현할 값이 없으면 **감사 배열이 가장 필요한 순간에 비게 된다**. 스키마는 DD11 원문 두 값을 계속 허용하되 runner는 `disputed`/`unresolved`만 발급한다.

**D7 — plan을 `completed/`로 아카이브하지 않았다.** 명령 본문 Phase 5는 아카이브를 지시하지만 (a) §3.11이 정한 목적지는 `archived/`이고 조건은 **PRD 전 milestone 완료**인데 이 PRD는 M1.5가 의도적으로 미완료·M2 pending이며, (b) receipt 3종이 `.claude/plans/codex-intent-context-m1-5.plan.md`를 참조하므로 이동하면 `/mccp:pr` 진입 전에 chain이 stale로 깨진다. 선례도 같다 — M1 plan은 ship 후에도 `.claude/plans/`에 남아 있다.

**D8 — `reviewer-contract-compliance.md`는 CREATE가 아니라 UPDATE.** Task 0 커밋(1327bc6)이 이미 생성해 뒀다.

**D9 — runner test fixture의 기본 주장.** `envelopeWith`가 이제 finding마다 `INTENT: none`을 기본 주입한다. default mode가 `off`가 아니므로 주장 없는 fixture는 설계상 `inconclusive`가 되고, 그러면 M1 축을 검증하던 기존 3개 test가 M1.5 사유로 실패한다. 명시적으로 비준수를 원하는 test는 `{rawFindings: true}`로 선언한다.

## Issues Encountered

- **게이트 순서 상호작용**: Phase 2.5.4가 plan 본문에 `## Codex Implementation Review`를 주입하면 `plan_hash`가 바뀌어 상위 `mccp-plan-codex` receipt가 stale이 된다(`markdownHashStructural`은 체크박스·PR번호·status 토큰만 정규화하고 섹션 추가는 정규화하지 않는다). 주입 **후** 상태로 plan 게이트를 재봉인해 해소했다. 체인 위반이 아니라 순서 문제다.
- **receipt slug 불일치(진입 시)**: `/mccp:plan`이 PRD 경로로 호출돼 receipt가 `codex-intent-context` slug로 써졌으나 `/mccp:prp-implement <plan path>`는 `codex-intent-context-m1-5`를 파생한다. `plan-codex-runner.js`를 올바른 slug로 직접 호출해 복구했다(plan 본문 보존).
- **동시 변조 회귀의 창**: `waitForAdjudication`이 `Atomics.wait`로 스레드를 블록하므로 같은 프로세스에서는 "대기 중 변조"를 만들 수 없다. 별도 child process가 awaiting을 고쳐 쓴 뒤 adjudication을 투입하도록 했고, runner의 `finally`가 awaiting을 지우므로 helper가 변조본 사본을 남겨 증거로 삼는다.

## Tests Written

| Test File | Tests (총) | 신규 커버리지 |
|---|---|---|
| `lib/tests/intent-claims.test.js` | 39 | 앵커 오탐 0 · 인용 5종 · 2건 이상/콤마/dangling/상한 → `unclaimed` · DD3 6분류 · 1/20 vs 19/20 계측 · 분할 불변식 · 순수성 |
| `lib/tests/intent-context.test.js` | 55 | verdict 2종 · dispute strict 기각 · warn 3분리 · `isIntentChainAllowed` 화이트리스트 · off 등가 · DD12 3조합 · `parseMislabelMode` |
| `lib/tests/plan-codex-runner.test.js` | 32 | enforce 차단/warn 봉인/dispute 통과 · **대기 중 awaiting 변조 무효**(child process) · off의 파서 미호출 spy + 프롬프트 불변 · **실 writer e2e** |
| `lib/tests/codex-invoke.test.js` | 43 | 계약 미요청 시 **byte-identical** · 1회만 삽입 · reference 뒤 배치 · `--mislabel-contract` |
| `receipt/tests/intent-gate-fields.test.js` | 24 | present-only · `makeSkeleton` 미포함(실호출 검증) · counts 분할/닫힌 키 · audit 스키마·상한 · warn의 chain-allow ∧ dedupe-refuse |

## Acceptance Criteria

| 항목 | 판정 |
|---|---|
| Task 0 실측 **또는** milestone을 `complete`로 올리지 않고 UI10 미달성 명시 | **후자로 충족** — PRD·CHANGELOG·CLAUDE.md·상수 주석 4면에 명시 |
| enforce: reviewer-only + dispute 부재 → receipt 미작성 / warn: 봉인 작성 + `isIntentApproved=false` | 충족 |
| id-mismatch 미정정 + dispute 부재 → enforce 미작성 | 충족 |
| dispute 기재 → pass / 라벨 정정 → M1 override 규칙 이관 | 충족 |
| `partial`(1/20) → `inconclusive` | 충족 (19/20도 동일) |
| `claimed/total`이 receipt에 남아 1/20과 19/20 구분 | 충족 |
| fence·blockquote·2건 이상·콤마·dangling → 전부 `unclaimed`(`none` 아님) | 충족 |
| warn이 dedupe 미개방 ∧ force_override 미재사용 ∧ mislabel 축 외 미개방 | 충족 |
| off end-to-end 등가(focus byte-identical ∧ 파서 미호출 ∧ 판정 동일) | 충족 (3축 모두 test 고정) |
| `intent_mislabel_audit` 봉인 + `finding_digest` bind + truncation 경로 부재 | 충족 |
| `intent_claims_digest`가 전체 claim map 봉인 | 충족 |
| DD12 3조합 | 충족 |
| `DEFAULT_MISLABEL_MODE` 명명 상수 + 근거 문서·측정일 주석 | 충족 |
| validate-cmd 신규 verdict 2종 개별 복구 문구 | 충족 |
| dispute strict validator | 충족 |
| "기록 없는 수용 0" 서술 · "오심 0" 문구 부재 | 충족 |
| 주장이 메모리에서만 — awaiting 변조 무효 | 충족 (동시 변조 + 소스 스캔 2중) |
| `--intent-*` CLI 플래그 0건 | 충족 |
| 신규 meta 6필드 present-only + `makeSkeleton` 미포함 + 구 corpus 무손상 | 충족 (receipt 554 회귀 0) |
| 버전 5면 + CHANGELOG + CLAUDE.md 동기 | 충족 (`1.23.8`) |
| 의도치 않은 삭제 0건 | 충족 |
| Patterns mirrored, not reinvented | 충족 |

## 검증 공백 (정직 표기)

- **Implement-Codex 미발화** — 운영자 환경의 `MCCP_CODEX_DISABLED=1`로 `classification=disabled`. receipt는 `codex_verdict='skipped'`로 봉인됐고 이는 승인이 아니다. cross-gate dedupe가 fail-closed이므로 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
- **security-reviewer 미호출** — 세션 정책상 Agent/subagent 호출 불가. 본 변경은 신뢰할 수 없는 LLM 출력에 대한 입력 검증 + 게이트 인가 표면을 동시에 다루므로 무해한 skip이 아니다. receipt에 `security_skipped=true`로 봉인돼 `/mccp:pr`을 fail-closed로 막는다.
- **santa-loop R4 미실행** — plan `## Adversarial Review Record` 말미가 "cap 이후 수정분(#19~#22 + Reviewer A 채택 3건)은 어느 리뷰어의 검증도 받지 않았다 — 구현 전 R4를 돌리거나 Implement-Codex가 대신해야 한다"고 적었는데, **어느 쪽도 충족되지 않았다.** 여기에 구현 중 발생한 D3~D6 판단이 더해졌다.

## Next Steps

- [ ] `git merge origin/main` — 브랜치가 51 커밋 뒤. §3.5.1 절차(파일 단위 해소 + `--diff-filter=D` 확인) 필수. CHANGELOG는 1.23.5~1.23.7 항목이 들어오며 `[1.23.8]`이 맨 위로 정렬돼야 한다
- [ ] `/mccp:santa-loop` — 위 검증 공백 3건에 대한 적대 검증 (Reviewer B는 `codex exec` 직접 호출이라 `MCCP_CODEX_DISABLED`와 무관)
- [ ] `/mccp:prp-commit` — auto-chain은 이미 green(`should_abort:false`)
- [ ] `/mccp:pr` — `security_skipped=true`가 막으므로 security-reviewer 재실행 또는 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<사유>"` 필요
- [ ] 2026-08-16 이후 — `reviewer-contract-compliance.md` 절차 실행 → `DEFAULT_MISLABEL_MODE` 갱신 → PRD Milestone 1.5 `complete` 승격 판단
