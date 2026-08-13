# Implementation Report: codex-intent-context M1.5 — 오심(mislabelling) 탐지

**Plan**: `.claude/plans/codex-intent-context-m1-5.plan.md`
**Branch**: `feat/codex-intent-context-m1-5`
**Version**: `1.23.7 → 1.23.8` (plan은 `1.23.5`를 가정 — §3.7 forward-only 상향, 아래 D1)
**Date**: 2026-08-10 (구현) · 2026-08-13 (Task 0 실측 + `enforce` 확정 — 아래 "Post-ship")

## Summary

M1(1.23.4)이 닫은 것은 **누락**이다 — 모든 Codex finding이 명시 판정을 받지 않으면 receipt가 써지지 않는다. 그러나 저자가 전부 `intent_conflict:'none'`으로 찍으면 커버리지 검사는 통과하므로 **오심**은 남았다.

M1.5는 리뷰어에게 per-finding `INTENT:` 계약을 부과하고, 리뷰어 주장과 저자 판정을 **비대칭 대조**한다. 리뷰어가 지목한 `UI` id를 저자가 지목하지 않은 finding은 명시 응답(라벨 정정 또는 `intent_dispute_reason`)을 강제받고, 없으면 `mislabel_unresolved`다. 리뷰어가 계약을 따르지 않아 대조 자체가 성립하지 않으면 `inconclusive`다.

**이 milestone은 두 단계로 착지했다.** 2026-08-10 구현 시점에는 기본 모드를 정할 Task 0 실측이 Codex 계정 쿼터 소진으로 막혀 DD10 fallback(`DEFAULT_MISLABEL_MODE = 'warn'`)이 적용됐고, `warn`에서는 UI10이 성립하지 않으므로 배송된 것은 **감사 표면뿐**이었다 — PRD Milestone 1.5도 그래서 `in-progress`로 남겼다. 2026-08-13에 쿼터가 예고보다 일찍 복구돼 실측을 수행했고, 그 결과가 사전 선언 임계를 넘어 `DEFAULT_MISLABEL_MODE = 'enforce'`로 커밋되면서 milestone이 `complete`가 됐다. 아래 본문은 **구현 시점** 기록이고, 실측·승격은 말미 "Post-ship — Task 0 실측" 절이 소유한다. 두 상태를 한 문서에 두는 이유는 구현 판단(D1~D9)이 `warn` 전제 위에서 내려졌기 때문이며, 그 전제가 언제 어떻게 바뀌었는지를 같은 파일에서 추적할 수 있어야 한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계가 santa-loop 3라운드로 이미 확정돼 구현 판단이 적었다 |
| Files Changed | 21 (CREATE 3 / UPDATE 18) | 22 (CREATE 2 / UPDATE 20) — 아래 D8 |
| Version | `1.23.4 → 1.23.5` | `1.23.7 → 1.23.8` (D1) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 리뷰어 계약 준수율 실측 | **완료 (2026-08-13)** | ship 시점엔 쿼터 소진으로 미측정이었고 DD10 fallback(`warn`)을 적용했다. 쿼터가 예고(08-16)보다 일찍 복구돼 재실행 — 10회 전부 `full`, `enforce` 확정. 아래 "Post-ship" 절 |
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

**D7 — plan을 `completed/`로 아카이브하지 않았다.** 명령 본문 Phase 5는 아카이브를 지시하지만 (a) §3.11이 정한 목적지는 `archived/`이고 조건은 **PRD 전 milestone 완료**인데 이 PRD는 M2가 `pending`이라(구현 시점엔 M1.5도 미완료였고, 2026-08-13 승격 후에도 M2가 남아 조건은 그대로 불충족) 여전히 대상이 아니며, (b) `mccp-plan-codex`·`mccp-implement-codex` 두 receipt가 이 plan을 `plan_hash`로 **봉인**하고 있어(둘 다 `sha256:b4b2dc24…`) 이동하면 `/mccp:pr` 진입 전에 chain이 stale로 깨진다. 선례도 같다 — M1 plan은 ship 후에도 `.claude/plans/`에 남아 있다.
>
> 참고: 명령 본문이 지시하는 목적지는 `completed/`인데 §3.11 관례와 `/mccp:archive-complete`가 쓰는 목적지는 `archived/`다. 이 불일치는 선재 결함이며 backlog에 기록했다(2026-08-13 MEDIUM). 이번 milestone은 아카이브를 수행하지 않으므로 발현하지 않는다.

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
| Task 0 실측 **또는** milestone을 `complete`로 올리지 않고 UI10 미달성 명시 | **양쪽 순차 충족** — ship 시점엔 후자(4면 명시), 2026-08-13에 전자를 수행해 `enforce` 확정 + PRD `complete` |
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
- [x] ~~2026-08-16 이후~~ **2026-08-13 수행** — `reviewer-contract-compliance.md` 절차 실행 → `DEFAULT_MISLABEL_MODE = 'enforce'` → PRD Milestone 1.5 `complete`. 아래 절 참조

## Post-ship — Task 0 실측 (2026-08-13)

ship 시점의 유일한 미충족 축이 닫혔다. 경위와 결과:

**쿼터가 예고보다 일찍 복구됐다.** 2026-08-09 차단 시 companion이 `"try again at Aug 16th, 2026 6:07 AM"`을 반환했으나, 08-13에 1-token probe(`codex exec`, 694 tokens)가 정상 반환했다. 리뷰를 한 건도 쓰기 전에 확인했으므로 실패 시 비용은 0이었다 — 같은 형태로 막히면 인용된 시각을 기다리기 전에 재probe하는 편이 싸다는 것이 이 cycle의 실측 교훈이다.

**하니스는 문서에서 재건했다.** 원본은 세션 scratchpad에 있었고 세션과 함께 소멸했다. `reviewer-contract-compliance.md`의 재현 절차만으로 복원 가능했으나 fixture 원문이 없어 재작성이 필요했으므로, 이번에 fixture의 `## User Intent` 표와 focus 원문 전체를 그 문서에 적어 **다음 재건이 전사로 끝나게** 했다.

**결과** — production 경로(`codex-invoke#composeFocus` → `parseReviewPayload` → `parseReviewerClaims`, `MCCP_CODEX_DISABLED`는 자식 env에서만 제거) 10회, 전부 `classification=ok`:

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Duration | 543 s | 335 s | 307 s | 266 s | 269 s | 283 s | 414 s | 302 s | 268 s | 360 s |
| Claimed | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| Compliance | `full` | `full` | `full` | `full` | `full` | `full` | `full` | `full` | `full` | `full` |

4축 전부: (a) 50/50 유효 주장 → `full` 100% · (b) 심어둔 충돌 40/40 정확 지목 · (c) 날조 주장 0 · (d) `inconclusive` 오탐 0/10. 사전 선언 규칙 ≥95%가 `enforce`를 정했다. **규칙을 사후에 조정하지 않았다** — 80%가 나왔다면 같은 규칙이 `warn`을 유지했을 것이고, 임계를 spike 이전에 선언한 이유가 바로 그 재량을 없애기 위해서다.

**5회 → 10회 확장은 리뷰가 만든 것이다.** 처음 5회 후 정지 규칙의 두 조건이 이 결과에서 충돌한다는 지적을 받았다 — 100%는 만장일치(5회 종료)이면서 동시에 95% 경계에서 10%p 이내(10회 연장)다. 어느 쪽이 우선하는지를 논증하는 대신 연장을 수행했다. 6~10회차에 non-`full`이 하나라도 있었으면 90%가 되어 `warn`이 유지되고 milestone은 닫히지 않았을 것이므로, 이 확장은 형식이 아니라 실제로 결론을 뒤집을 수 있는 시험이었다.

**변경한 표면 6면**: `intent-context.js`(상수 + 근거 주석) · `reviewer-contract-compliance.md`(측정 기록 전문) · `docs/ENVIRONMENT.md` §11 · `CLAUDE.md` §3.13.1 · `CHANGELOG.md` `[1.23.8]` · PRD milestone 표 + 근거 노트.

**plan 본문은 고치지 않았다.** `planAwareMarkdownHash` 대조 결과 `mccp-plan-codex`·`mccp-implement-codex` 두 receipt가 현재 plan과 정확히 일치하므로(`sha256:b4b2dc24…`), Task 0 블록의 "미측정" 문구를 갱신하면 두 앵커가 동시에 stale이 된다.

> **받아들인 대가**: plan을 봉인해 두면 `/mccp:dashboard`의 활성 plan 요약이 plan 산문에서 파생되므로, 그 카드가 계속 "리뷰어 준수율 실측이 default를 정하기 전까지 … 지표를 달성하는 것이 아니다"를 보여준다. 실측 후에도 그렇다. 이는 누락이 아니라 앵커 보존의 필연적 귀결이며, 완화는 두 가지다 — plan의 Task 0 블록이 이미 `reviewer-contract-compliance.md`를 가리키고 그 문서가 정본이라는 것, 그리고 대시보드 산출물(`.claude/cache/`)은 **git-tracked가 아니라**(`.gitignore:94`) 재생성물이라 커밋 표면을 오염시키지 않는다는 것. milestone status의 정본은 PRD다.
>
> **대조 시 오라클을 혼동하지 말 것.** 같은 plan 파일 위에 digest 함수가 **둘** 있다. `plan_hash`를 생산하는 것은 `receipt/hash.js#planAwareMarkdownHash`(게이트 주입 섹션을 정규화)이고, `intent-context.js#stableBodyDigest`는 runner가 review↔write 사이 본문 변조를 잡는 **별개 검사**(`stableAtReview`)에 쓰인다. 후자로 재면 `sha256:33d74351…`이 나오는데 이는 receipt의 `plan_hash`와 비교할 값이 **아니다** — round-2 리뷰어 한 명이 실제로 이 혼동으로 "hash 주장이 거짓"이라 판정했고, 재현 결과 주장은 참이었다. plan은 계획의 봉인 기록이고 실행 결과는 이 report와 증거 문서가 소유하며, plan의 Task 0 블록은 이미 그 문서를 가리킨다.

**측정이 세우지 못한 것**(근거 문서에 동일 기재): 10회는 **단일 fixture 반복**이라 일반화가 아니고, fixture는 각 결정이 제약 하나씩만 위반하는 쉬운 표본이며, 회차당 finding이 5건뿐이라 DD5 이분법의 오탐 노출이 실제 리뷰보다 작다. `stripQuotedStructures`의 backlog 2건(HIGH fail-open CDATA/DOCTYPE/PI · MEDIUM fail-closed 미종결 `<!--`)도 이 측정으로 닫히지 않았다 — 이번 10회에서 발화하지 않았을 뿐이다.
