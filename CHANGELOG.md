# Changelog

All notable ship milestones for **my-claude-code-plugin (mccp)** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Note on versioning**: the project ship tag (e.g. `v1.0.0`) and the inner plugin manifest (`plugins/mccp/.claude-plugin/plugin.json` — currently `1.23.0`) are intentionally decoupled. Plugin semver tracks the mccp namespace's internal API surface; project ship tags track W-VERDICT-gated milestones bundled across the repo.

## [1.23.0] — 2026-07-25

**무결성 통일 cycle M3 — terminal `/mccp:pr` non-approving mechanical hard-stop 재설계 (PRD 종료 → minor bump)** — M1이 durable corpus의 verdict-SoT를 세우고 M2가 독립 무결성 4축을 닫았지만, **terminal `/mccp:pr` 게이트 자체는 여전히 non-approving PR-Codex 결과(`resolution.codex_verdict='divergent'` 등)를 mechanical하게 막지 못했다** — 파서는 복구됐으나 terminal 게이트에서 audit-only였다(backlog 2026-07-21 HIGH). M3은 이 gap을 닫는다: no-ship verdict(`divergent`/`critical`/`unavailable`/absent)를 낸 pr-codex receipt는 push/`gh pr create` **전에** mechanical HALT되고, 유일한 우회는 audited override env `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>"`다. override는 verdict를 `converged`로 **재작성하지 않는다** — receipt는 실제 divergent verdict를 봉인한 채 `meta.pr_codex_force_override=true`와 함께 auditable하게 ship된다(§3.12 봉인 + dedupe fail-closed 무손상). 이 축의 즉시 흡수 시도가 8라운드 비수렴 루프의 직접 원인이었어서 우회 표면(env opt-out·lock·crash-window·session key·absent-verdict·re-entrancy)을 plan 단계 §Design Decisions(DD1~DD7)에서 선제 설계로 닫았다. Implement-Codex는 이번 환경에서 실작동해(R0 probe만 timeout, 실 review는 라운드당 ~8분) M3 ship-gate를 **cross-model 4라운드 적대 리뷰**했고, R1~R3의 core fail-open 5건을 fail-closed로 흡수(아래 Absorbed 참조) 후 R4 F6(defense-in-depth)만 DEFER_TO_BACKLOG했다. Implement-Codex receipt는 §3.12 dogfood대로 **divergent 봉인**(F6 미해소 정직 반영). integrity-unification PRD 전체 완료 → §3.7 minor bump.

### Added
- `plugins/mccp/scripts/lib/pr-ship-gate.js` — 단일 pure 오라클 `deriveShipDecision(receipt, {forceOverrideActive})` → `{ship, blockingVerdict, absent, overrideActive, reason}`. `receipt-convergence.js#isDivergentVerdict`(M1 공유 헬퍼) 재사용 + `unavailable`/absent fail-closed 추가. 이중 enforcement locus(finalize runtime primary + validate-cmd canonical)가 **같은 오라클을 공유**해 판정 drift를 구조적으로 차단(DD2). `EX_SHIP_BLOCKED=12` export(codex-invoke blocking exit 정합).
- `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` — 파티션 전건(converged/skipped→ship · divergent/critical/unavailable/absent→no-ship) + override가 verdict 재작성 안 함(blockingVerdict 보존) + null-safety 17건.

### Changed
- `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` — **runtime 1차 강제**(primary spine). `--pr-codex-force-override-reason` accept+forward → write가 `meta.pr_codex_force_override` stamp. write 성공 후 `gate==='mccp-pr-codex'`이면 방금 쓴 receipt 재read → `deriveShipDecision` → no-ship이면 `[MCCP-GATE-STOP]` stderr + **exit 12** 반환(pr.md HALT). finalize는 write 경로 자체라 LLM이 누락 불가(DD2). 재read 실패는 fail-closed.
- `plugins/mccp/scripts/receipt/validate-cmd.js` — **canonical/외부 표면**(defense-in-depth). preceding-gate 루프 후 `isPrTerminal && opts.checkShipVerdict` gated self-verdict gate: `mccp-pr-codex` receipt를 **verdict를 신뢰하기 전** schema+subject/receipt tamper 재검(4종 fail-closed blocking kind — `pr_codex_nonconverged`·`subject-tamper`·`receipt-tamper`·`ship-gate-schema-invalid`) 후 `deriveShipDecision`(env OR meta override 존중) → no-ship+override 미활성 → `blocking.kind='pr_codex_nonconverged'`, override 활성 → `warning.kind='pr_codex_force_override'`. **flag 미전달 시 전체 skip** → 조기 preflight(1.6)·표준 code-review 무영향(DD4 re-entrancy·DD5 historical 자동 충족).
- `plugins/mccp/scripts/receipt/schema.js` · `write.js` · `cli.js` — `meta.pr_codex_force_override`(bool default false) + `_reason`(string|null, override=true 시 strict `validateReason` REJECT — impeccable 패턴 mirror) present-only 배선 + `validate --check-ship-verdict` 옵션. `receipt_hash` carve-out 무변경(override 결정은 verdict와 함께 tamper-protected). 기존 git-tracked ship corpus는 present-only라 unchanged.
- `plugins/mccp/commands/pr.md` — Phase 0.4 override preflight(0.1/0.2 mirror, 0.3 mutex와 독립) · 2.5.4 line 480 노트 갱신("이제 M3 ship gate가 divergent verdict를 mechanical HALT") · 2.5.7 override forward + `FINALIZE_EXIT==12` ship-block 분기 · Phase 2.5.9 self-gate read-back(`--check-ship-verdict`) — 단일 kind가 아니라 **aggregate `ok===false`로 HALT**(4종 ship-gate blocking kind 전부 존중 + validate 출력 parse 실패도 fail-closed) · Phase 4 `## PR-Codex Override` inject.
- `plugins/mccp/.claude-plugin/plugin.json` `1.22.6 → 1.23.0`(minor — integrity-unification PRD 종료) + renderer footer(html/markdown) 동기 + `CLAUDE.md`/`integrity-unification-m1.plan.md`(M3 in-progress)/`codex-findings-backlog.md`(2026-07-21 HIGH ABSORBED, row 보존).

### Tests
- `lib/tests/pr-phase-helpers/finalize-receipt.test.js` — M3 runtime e2e 7건(divergent→exit12+GATE-STOP · approve→0 · skipped→0 · unavailable→exit12 · override→0+meta stamp+verdict 봉인 · 나쁜 reason write REJECT · plan gate 미발화). `receipt/tests/validate-cmd.test.js` — self-gate 12건(divergent/absent→block · converged/skipped→ok · meta/env override→warning · 나쁜 reason 미우회 · **flag 없으면 무영향**(re-entrancy) · non-terminal 미발화 · pre-write no-op) + ship-gate 무결성 2건(**위조 divergent→converged**=receipt-tamper block으로 silent ship 차단 · schema-invalid enum=ship-gate-schema-invalid block). `receipt/tests/schema.test.js` · `write.test.js` — override 필드 valid/invalid-reason REJECT·round-trip·verdict 봉인 12건.

### Absorbed (Implement-Codex R1 — cross-model, 2 HIGH → fail-closed)
- **F1 (validate-cmd.js)** — `--check-ship-verdict` self-gate에서 `readReceipt`가 `null`(receipt 부재)을 반환하면 read-error만 block하고 null은 comment-only no-op라 `ok===true`로 통과했다. checkShipVerdict는 **POST-finalize read-back(pr.md 2.5.9)에서만** 세팅되므로 receipt 부재는 anomaly → 신규 blocking kind `ship-gate-receipt-missing`으로 fail-closed(pr.md는 이미 `ok===false` 게이트라 무변경, DD4/DD5 무손상 — flag 없는 조기 preflight는 미발화).
- **F2 (pr-ship-gate.js)** — `deriveCodexFlags`가 `codex_outcome ∈ {skipped(reason), deduped, disabled}`를 verdict `skipped`로 매핑하는데, ship-gate가 `skipped`를 무조건 approving으로 취급해 위조/malformed `{codex_outcome:"skipped"}`(reason 없음)이 Codex 승인·증거 없이 ship될 수 있었다. `deriveShipDecision`이 이제 `skipped` verdict를 sanctioned proof 마커(`codex_skipped_at_pr`/`codex_dedupe_at_pr`/`codex_disabled[_at_pr]`) 존재 시에만 ship 허용, 부재 시 `blockingVerdict='skipped-unproven'`로 fail-closed. 정규 skip/dedupe/disabled 경로(전부 proof 마커 stamp)는 무변경.
- 회귀 test 6건 추가/전환(pr-ship-gate skipped proof/unproven/override, finalize skipped-with-reason/deduped/unproven-exit12, validate-cmd skipped-dedupe-ok/skipped-unproven-block, missing-receipt-block).

### Absorbed (Implement-Codex R2 — cross-model, 2 HIGH → fail-closed)
- **F3 (finalize-receipt.js)** — runtime primary 게이트가 receipt 재read 후 schema/subject_hash/receipt_hash 검증 없이 바로 `deriveShipDecision`을 신뢰했다. write 후 corruption/replacement이 non-approving verdict을 converged로 뒤집으면 primary가 exit 0 반환하고, markdown 2.5.9 read-back(skip 가능)에만 의존했다. finalize가 이제 `deriveShipDecision` **전에** validate-cmd와 동일한 schema+subject+receipt hash 검증을 수행하고 mismatch 시 `EX_SHIP_BLOCKED` — 두 locus 모두 tamper에 self-sufficient.
- **F4 (finalize-receipt.js + validate-cmd.js)** — self-gate가 `decisionId`로만 receipt를 로드하고 finalize write에 bind하지 않아, 같은 decision의 **stale converged receipt**(옛 `head_sha`)가 현재 미리뷰 HEAD를 ship 인증할 수 있었다. 두 locus가 이제 `receipt.head_sha`를 현재 `git rev-parse HEAD`와 대조 → 불일치 시 신규 kind `ship-gate-stale-head`로 fail-closed(head_sha는 subject 필드라 tamper-보호됨; git 실패 시 sub-check만 skip). 정규 flow(finalize→read-back 동일 HEAD)는 무영향.
- 회귀 test 2건(validate-cmd stale-head block; finalize 정규 경로가 F3/F4 false-block 없이 여전히 ship) + `sealReceipt` fixture를 실 HEAD로 전환.

### Absorbed (Implement-Codex R3 — cross-model, 1 HIGH → fail-closed)
- **F5 (finalize-receipt.js + validate-cmd.js + cli.js + pr.md)** — R2 F4의 head_sha binding으로는 부족했다: 공격자/동시 `/mccp:pr`이 **같은 decision·같은 head_sha의 converged receipt**를 write와 re-read 사이에 swap하면 head 체크·self-consistency를 통과해 divergent write를 shadow하고 ship됐다. 정합의 유일한 방법은 이번 write가 봉인한 **정확한 receipt_hash** 대조. finalize가 write CLI(pr-codex는 non-quiet)가 반환한 `receipt_hash`를 붙잡아 re-read와 대조 → 불일치 시 `EX_SHIP_BLOCKED`(runtime primary가 write에 self-bind). 추가로 finalize가 sealed hash를 emit → pr.md 2.5.7이 캡처 → 2.5.9 read-back에 `--expected-receipt-hash`로 forward → validate-cmd가 신규 kind `ship-gate-hash-mismatch`로 defense-in-depth 재bind. 정규 flow(동일 receipt)는 무영향.
- 회귀 test 2건(validate-cmd expected-hash match→ok / mismatch→block). finalize 정규 경로가 non-quiet 전환·binding 후에도 여전히 ship(happy-path가 binding 가드).

### Deferred (Implement-Codex R4 — 1 HIGH → backlog, defense-in-depth)
- **F6 (dedupe skip proof 미재검증)** — `pr-ship-gate.js#hasSkipProof`가 `codex_dedupe_at_pr===true`를 `skipped` verdict의 충분 증거로 신뢰하지만 ship gate가 plan/implement receipt의 현재 convergence·residual을 재검증하지 않는다. 실제 flow에선 Phase 2.5.2 `evaluateForDedupe`(v1.20.3 fail-closed)가 dedupe 플래그 세팅 전에 이미 검증하므로 F6은 그 upstream 검증의 ship-시점 재검증(defense-in-depth)이고 exploit은 codex-result.json 파일 위조(단일 사용자 위협모델 밖)를 요구한다. 완전 fix(검증가능 sealed dedupe proof — plan/implement hash·verdict·head/base·residual digest 봉인 후 재검증)는 새 스키마+배선이 필요한 후속 milestone 규모라 `codex-findings-backlog.md`(2026-07-30 HIGH)로 이연. M3 core(non-approving mechanical hard-stop) 무손상.
- Implement-Codex receipt(`mccp-implement-codex/integrity-unification-m3`)는 최종 raw verdict(needs-attention)를 **divergent로 봉인** — cross-gate dedupe fail-closes → M3 코드가 `/mccp:pr` PR-Codex를 실제로 받게 됨(§3.12 dogfood). 4라운드 triage 상세는 `.claude/notes/integrity-unification-m3-implement-review.md`.

### Note
- briefing hang(2026-07-21 HIGH, exit-127)은 M3 scope 밖(PR-gate operability, verdict-SoT 아님)이나 dogfood를 막으므로 implement/test 시 `MCCP_BRIEFING=off`로 우회(문서화된 §4 토글 — 요약 stamp만 끔, 리뷰 무약화). pre-existing 실패 2건(`verdict-label` · `design-critique-loop-e2e` fixture)은 별도 cycle baseline.

## [1.22.6] — 2026-07-24

**무결성 통일 cycle M2 — 독립 무결성 fixes** — M1이 durable corpus를 지키는 tightly-coupled 3축을 닫았다면, M2는 서로 다른 trust boundary에 흩어진 **서로 독립적인** 국소 결함 4건을 닫는다(롤백·호환성 위험이 M1과 분리되므로 별도 milestone; 각 Task 자기완결 회귀 test, 순서 불변식 없음). Implement-Codex는 환경 Codex companion `exit-nonzero`(~20s crash)로 **advisory** 진행(운영자 승인, M1 #110 선례) → receipt `codex_verdict='unavailable'` 봉인 → PR-Codex 별도 발화. security-reviewer agent가 security-sensitive 두 축(leak-scan · subject-tamper)을 독립 검토해 SOUND 확인(Codex 부재 부분 보완). M3(terminal `/mccp:pr` non-approving mechanical hard-stop 재설계)는 별건.

### Changed
- `plugins/mccp/scripts/receipt/validate-cmd.js` · `receipt/preflight.js` — subject_hash mismatch를 `result.stale`→`result.blocking` `kind:'subject-tamper'`로 승격(Task 1). receipt_hash receipt-tamper 블록과 대칭 — `subjectHash`는 SUBJECT_FIELDS self-consistency seal이라 mismatch=서명-후-변조(tamper)이지 plan staleness(별도 plan_hash 비교)가 아니고, stale→"regenerate STALE" 힌트가 tamper 증거를 파괴하던 subject-side 잔여(M1이 `receipt_hash`에 대해 이미 닫은 것과 동일 잠복 결함)를 닫는다. preflight는 subject-tamper에 "Do NOT regenerate" INTEGRITY 힌트 + TAMPER 라벨 확장.
- `plugins/mccp/scripts/lib/history-leak-scan.js` — allowlist를 `oid→paths[]`로 확장(Task 2, R5-F3). `git rev-list --objects`는 blob당 first-path 1개만 방출하므로(실측 — 플랜의 "다중경로 방출" 가정 정정) range 커밋 `git ls-tree -r`로 전 경로를 증강하고 allowlist를 **경로별**로 판정. 같은 blob이 allowlisted fixture 경로 + non-allowlisted real 경로에 도달할 때 real leak을 더 이상 억제하지 않는다(pre-push secret/path backstop 복구). ls-tree 실패는 fail-closed(cat-file scan-error 계약 미러).
- `plugins/mccp/scripts/lib/briefing/invoke.js` — raw `!!res.converged`를 `receipt-convergence#isConvergedVerdict(res)`로 교체(Task 4) + import 추가. divergent/critical ship이 briefing 요약에 "converged: true"로 오기되던 M1 Task 1b sweep의 마지막 raw 소비처를 정합(derive projection은 M1이 이미 교정).
- `plugins/mccp/.claude-plugin/plugin.json` `1.22.5 → 1.22.6` + renderer footer(html/markdown) 동기.

### Tests
- `receipt/tests/validate-cmd.test.js` — subject-tamper 회귀 2건(stale→blocking flip · receipt-tamper pre-empt). `lib/tests/history-leak-scan.test.js` — 다중경로 회귀 2건(non-allowlisted sibling leak 보고 + all-allowlisted 억제 regression-0). `lib/tests/codex-review-payload.test.js` — 실-producer envelope 회귀 4건(Task 3 verify-and-close). `lib/briefing/tests/invoke.test.js` — divergent/critical ship "converged: false" 회귀 4건.

### Note
- Task 3(`parseReviewPayload`)은 **코드 변경 없음** — 현 `.stdout`→`.result.verdict` 파서가 실-producer 응답을 정상 파싱함을 실측·회귀 fixture로 봉인(verify-and-close, "통과했다≠검사했다" drift 방지). backlog 3행(2026-07-08 subject_hash · 2026-07-22 parseReviewPayload · 2026-07-23 R5-F3) ABSORBED 표식(row 보존).

### Fixed (Codex divergent absorption, 2026-07-25 — PR #113)
Codex quota 회복 후 M2 diff에 실제 adversarial-review 재실행 → verdict `needs-attention`(divergent) 2건. 로컬 code-review(Claude leg)가 놓친 것을 cross-model이 잡음. 운영자 결정 = 둘 다 수정.
- **F2 [MEDIUM]** — tamper 메시징이 `preflight.js`(CLI)에만 있고 실제 슬래시-명령 enforcement 표면인 `receipt-prompt.js`(UserPromptExpansion)·`receipt-skill.js`(Skill)는 여전히 generic `INVALID` + 항상 "Write missing receipt"를 출력(tamper receipt regenerate/overwrite 유도 = 증거 파괴). 신규 shared formatter [`receipt/block-format.js`](plugins/mccp/scripts/receipt/block-format.js)(`entryLabel`/`tamperGuidanceLines`/`hasTamper`/`blockDetailLines`)로 **3개 표면 통일** — 어디서나 `TAMPER` 라벨 + "Do NOT regenerate", "Write missing receipt"는 `missing.length>0`일 때만. hook `additionalContext`도 tamper 시 INTEGRITY 분기. hook은 fail-open optional require.
- **F1 [HIGH→실질 MED]** — `history-leak-scan.js`의 `byOid`가 `rev-list --objects base..HEAD`(base 도달 객체 제외)로만 seed되어, base에 이미 존재하는 leaking blob과 동일 콘텐츠를 non-allowlisted 새 경로에 추가하면 미스캔 → `ok` 오보고. **2회 정련**: R1의 순-diff(`git diff --raw base..HEAD`)는 Codex 재리뷰가 ancestor-only 잔여(중간 커밋 복사→HEAD 전 삭제)를 지적해 불충분 → R2에서 **base-tree map(`git ls-tree -r <base>`) + 전-커밋 ls-tree walk**로 교체. 각 range 커밋의 전체 트리를 순회하며 NEW blob 또는 base 미발행 `(oid,path)`의 OLD blob을 fold-in → 삭제된 중간-커밋 경로까지 포착(F-H ancestor-leak 보증 완전화). base map 실패 fail-closed.
- **F3 [MEDIUM]** (Codex R3) — `history-leak-scan.js`의 `resolveBase()`가 null(opts.base·origin/main·origin/master·main·master 전부 부재)이면 `scanRange`가 `ok:true`로 silent pass — unclassified range를 empty range처럼 통과시켜 bare CI checkout에서 HEAD를 미스캔 publish(fail-open). `ok:false` + scan-error로 fail-closed 전환(F1 R2가 표방한 fail-closed 계약 완성). pre-existing이나 흡수.
- **F4 [HIGH]** (Codex R4) — `buildLeakPatterns()`가 repo-root를 case-sensitive RegExp로 컴파일 → Windows(case-insensitive fs)에서 `X:\parent\repo`와 `x:\parent\repo`가 동일 위치인데 방출 casing만 탐지, 다른 casing 같은 경로 leak이 backstop 통과. drive-letter(Windows) root는 `i` 플래그로 컴파일(POSIX는 case-sensitive라 그대로), old-repo drive-letter 패턴은 항상 `i`. 본 환경이 Windows라 실제 dev 플랫폼 우회. pre-existing이나 흡수.
- **F5 [HIGH]** (Codex R5, F4 self-inflicted) — F4 설명 주석/report가 실제 workspace root를 리터럴 예시로 embed했고, F4가 켠 case-insensitive 매칭이 그 줄을 자기-소스 leak으로 탐지 → pre-push 스캔 실패(실측 3 leak). 예시를 전부 synthetic(`X:\parent\repo`)으로 교체 + 실제-root로 컴파일한 패턴이 소스에 0-match임을 단언하는 회귀 test. leaky blob은 F4 커밋(unpushed HEAD)에만 있어 `git commit --amend`로 rewrite(F1 R2 ancestor-leak 보증을 자기 자신에 dogfood, force-push 불필요).
- Tests: `receipt/tests/block-format.test.js`(신규 8) · `hooks/tests/receipt-prompt-tamper.test.js`(신규 3) · `preflight.test.js`(+1 subject-tamper) · `lib/tests/history-leak-scan.test.js`(+5: F1 base-blob-new-path · F1 R2 ancestor-only-deleted-before-HEAD · F3 unresolved-base-fail-closed · F4 windows-case-variant · F5 self-source-no-leak) + 실 pre-push 스캔 leaks=0. Codex 수렴 loop 5+라운드(#1 F1H+F2M → #2 F1 ancestor-only → #3 F3 → #4 F4 → #5 F5 자기-leak), 매 라운드 실제 결함 정확히 좁힘(F3/F4는 pre-existing 하드닝, F5는 스캐너 self-dogfood). 버전은 1.22.6 유지(미머지 M2에 리뷰 흡수).

## [1.22.5] — 2026-07-24

**무결성 통일 cycle M1 — verdict-SoT + hash 무결성 core** — durable-evidence-substrate(#110)가 ship receipt를 git-tracked 감사 corpus로 승격했으나, completion-ledger 승인 술어가 여전히 `resolution.converged`(always-true, "writer finalized" ≠ "Codex approved")를 1차 게이트로 읽어 **거짓 승인이 durable corpus에 영구 기록되는 상태가 진행 중**이었다. M1은 corpus를 지키는 tightly-coupled 3축(ledger 승인 술어 · stage-guard write-side · audit read-side)을 verdict SoT=`resolution.codex_verdict`, 무결성=`receiptHash` 재계산+schema validate로 통일한다. Implement-Codex는 환경 Codex companion timeout(570s)으로 **advisory** 진행(운영자 승인) — cross-model 적대 검토는 plan-codex `divergent` 봉인 → dedupe fail-closed로 `/mccp:pr`(PR-Codex)에 이연. M2(leak-scan·subject_hash·parser fixture)·M3(terminal gate 재설계)는 별건.

### Added
- `plugins/mccp/scripts/lib/receipt-convergence.js` — codex_verdict-first 수렴 read 헬퍼(`isConvergedVerdict`/`isDivergentVerdict`). `codex_verdict ∈ {divergent, critical}`이면 `resolution.converged`가 true여도 **절대 converged 아님**. `resolution.converged`를 직접 읽던 모든 소비처(semantic + display)가 이 한 곳으로 통일.
- `plugins/mccp/scripts/migrations/v1.22.5-ledger-verdict-repair.js` — 기존 ledger 엔트리를 ship receipt와 대조 재판정해 `verdict_provenance`(`codex-verdict`/`legacy-unknown`/`superseded`)를 stamp. idempotent · `--dry-run` · **cardinality-invariant(never drop)** · in-place body edit(receipt_hash·파일명 불변, no-rehash §3.12). 실측: 28 엔트리 → 9 codex-verdict + 19 legacy-unknown + 0 superseded, 28→28 불변.
- 테스트 4종 — `migrations/tests/v1.22.5-ledger-verdict-repair.test.js`(분류 오라클·cardinality·idempotency·superseded 보존·no-rehash) · `lib/tests/receipt-convergence.test.js`(헬퍼 + derive projection + escalate 회귀) + 기존 evidence-stage-guard/evidence-audit/completion-ledger 테스트에 신규 케이스 추가.

### Changed
- `plugins/mccp/scripts/lib/completion-ledger/index.js` — 승인 술어를 **codex_verdict-first**로 교체(Task 1). `resolution.converged`는 신뢰 키에서 은퇴. NEW append = `converged`(∧ actionable≠true)·`skipped`·`unavailable`만; `divergent`/`critical`/absent는 fail-closed skip. **운영자 승인 deviation**(plan의 converged-only 초안 대비): `skipped`(dedupe happy-path)·`unavailable` append 유지 — dedupe는 plan+implement 둘 다 converged일 때만 발화하므로 PR ship이 `skipped`가 되고, 이를 제외하면 가장 잘 리뷰된 결정이 corpus에서 누락된다.
- `plugins/mccp/scripts/lib/completion-ledger/store.js` — 엔트리 스키마에 `verdict_provenance`(present-only enum) 추가.
- `plugins/mccp/scripts/lib/evidence-stage-guard.js` — `validateContent`(PURE)가 hash tamper 검증 후 `schema.validate` + `gate_id==='mccp-pr-codex'` + `phase==='pr'` + 파일명 slug↔`decision_id` 일치를 fail-closed 강제(Task 2, R5-F1).
- `plugins/mccp/scripts/lib/evidence-audit.js` — `hash_bound` 집계가 declared-hash 일치에 더해 `receiptHash` 재계산 + `schema.validate`를 요구(Task 3, R5-F2, Task 2와 대칭). 실측 corpus 불변(hash_bound 9, state incomplete).
- `plugins/mccp/scripts/derive/sources/receipts.js` · `receipt/status.js` · `derive/sources/worktrees.js` · `lib/escalate-detector.js` — `resolution.converged` 직접 읽기를 codex_verdict-aware로 이전(Task 1b). projection source(receipts.js) 수정으로 decision-state·audit-timeline·snapshot이 자동 상속. 실측: divergent ship 3건이 이제 `converged=false`로 표시.
- `plugins/mccp/.claude-plugin/plugin.json` `1.22.4 → 1.22.5` + renderer footer(html/markdown) 동기.

## [1.22.4] — 2026-07-22

**내구 증거층 봉인 — 감사 가능성 복구 (Phase A)** — worktree 삭제 워크플로에서 ship receipt 증거가 소실돼, 교차 세션 감사가 정반대 결론에 도달하는 2차 결함(E1: 대조 대상 부재를 "이상 없음"으로 보고)을 닫는 독립 chore. 핵심 분리: **receipt는 참(`codex_verdict: divergent`를 정직 기록)이고 ledger가 거짓(그것을 `converged`로 뒤집음)** — 따라서 receipt 추적은 지금 가능하고(오히려 술어 결함을 증명), ledger 소급 정정은 술어 수정(별건 E2) 뒤 Phase B로 미룬다. Codex adversarial review는 4라운드에서 수렴(needs-attention→approve).

### Added
- `plugins/mccp/scripts/lib/evidence-audit.js` — ledger↔receipt 대조 감사 도구. `comparable===0`이면 절대 `ok`/`clean`을 반환하지 않고 `state='blind'` + CLI 비영점 exit(E1이 만든 결함의 정확한 반대). 조인 키는 `entry.decision_id`(raw ledger files, no dedup), `entry.receipt_hash`↔`receipt.receipt_hash` 결속은 `hash_bound`로 별도 보고(E4). read-only · LLM-free. main 실측 재현: `comparable=10 · ok=7 · false_positive=3 · unverifiable=19 · hash_bound=10`.
- `plugins/mccp/scripts/receipt/store.js#writeReceipt` — **덮어쓰기 HALT 가드**(Codex R3/R4 F1). git-tracked ship receipt를 다른 hash로 덮어쓰려 하면 fail-closed(정본을 교체하는 유일한 경로에 앵커 → 모든 호출자 커버). 탈출구: 정당한 재-ship은 **새 decision slug**. untracked·멱등 재작성·신규 decision은 무영향.
- 테스트 3종 — `lib/tests/evidence-audit.test.js`(blind 계약 고정) · `receipt/tests/overwrite-guard.test.js`(rebase 미경유 같은-slug 반복을 writer 직접 호출로 재현) · `receipt/tests/cwd-normalization.test.js`(신규 정규화 + carve-out 부재).

### Changed
- `plugins/mccp/scripts/receipt/write.js` — **신규** receipt의 `meta.cwd`를 repo-relative로 정규화(`.`/상대경로, repo 밖은 `<outside-repo>` placeholder). 기존 33건은 읽지도 쓰지도 않으며 `hash.js`에 `meta.cwd` carve-out을 추가하지 않아 기존 해시 불변(E4).
- `.gitignore` — ship receipt(`mccp-pr-codex`)를 감사 대조 corpus로 git-tracked 전환(`.claude/receipts/*` + `!.../mccp-pr-codex/` 선별 해제). plan/implement receipt는 여전히 working-tree only. 부트스트랩 미검토 기본값(commit `375157d`) 대체.
- `plugins/mccp/commands/pr.md` — HEAD_SHA passthrough(F2-a: Phase 2.5 캡처값을 Phase 4가 재계산 없이 사용 → evidence-commit의 HEAD 이동에도 body-file 조회 성립) + receipt-only evidence-commit(Phase 3 push 직전, `mccp-pr-codex/` 한 경로만, `--amend` 금지, `completion-ledger/` 혼입 거부 — E6) + **rebase fail-closed HALT**(자동 재진입 금지 — HEAD 재작성이 ledger↔receipt 결속을 끊음, F2).
- ship receipt **clean 12건** git-tracked(내용 무변경). 유출 21건(구 저장소명 노출)은 Phase B rebind 후 추적(E7 — 감사 기여 0, 비가역 이력 공개 회피).
- `CLAUDE.md` — merge-commit 정책 + 증거 내구성 계약(재봉인 금지 근거 + `resolution.converged` 비신뢰 명시).
- `plugin.json` `1.22.3 → 1.22.4` + renderer footer×2.

### Follow-up — PR-Codex No-ship 흡수 (같은 1.22.4, PR 전 마감)

Phase A의 dogfood PR-Codex(R1 No-ship, 3 actionable)가 내구성 메커니즘 자체의 3결함을 표면화 → 첫 PR 전 흡수(버전 bump 없음 — 1.22.4를 완성). plan-gate는 6라운드 비수렴(`divergent` 봉인), Implement-Codex R1도 No-ship(3 HIGH 전부 ACCEPT_NOW·흡수).

- **F2** — `evidence-audit.js`가 comparable pair면 `state='ok'`/exit 0을 냈다(모순 노출 실패). graduated states로 교체: `inconsistent`(exit 3, `false_positive>0` OR `hash_bound<comparable`) · `incomplete`(exit 4, `unverifiable>0`) + 사다리 문서화. **Implement-Codex IF1**: agreement 검사를 total로(`verdictsAgree` — advisory/skipped ledger verdict도 corroborate 요구, 이전엔 무검증 통과). 실측 corpus는 `inconsistent`/exit 3(19 dangling + 3 false_positive 정직 노출).
- **F1** — `scripts/migrations/v1.22.4-cwd-rebind.js`(CREATE) — 33 tracked receipt의 절대 `meta.cwd`를 redact + 재해시하고 bound된 **git-tracked** ledger 9건을 **원자적으로 재키잉**(`## 3.12` 유일 sanctioned 재봉인). fail-closed lock(withLedgerLock fail-open을 flip) + TOCTOU re-read + new-ledger→receipt→unlink-old ordering + self-contained post-apply invariant scan(index 비의존) + explicit planned-set staging(`git add -A` 금지, E6 제외) + **exact-manifest gate**(정확히 M/D/A + blob content hash — concurrent-recreate 삭제 누락 포착). 16 test.
- **F3** — `pr.md` Phase 3 evidence-commit을 fail-loud-open → **fail-closed**(commit 실패 시 push 차단) + F1 pre-stage 절대-cwd 가드.
- **F-H/F-I** — `scripts/lib/history-leak-scan.js`(CREATE) — pre-push 전-blob HISTORY-leak 게이트: `origin/<base>..HEAD`의 모든 신규 blob(조상 커밋 포함)을 repo-root anchored·separator-flexible 패턴으로 스캔(receipt JSON의 double-backslash 형까지) + line/fixture-specific allowlist(directory-wide 금지). 10 test. 게이트가 tracked corpus의 latent fixture leak(`cwd-normalization.test.js`)을 표면화 → synthetic 경로로 정정.
- `CLAUDE.md` §3.12 — v1.22.4 cwd-rebind을 유일 sanctioned 재봉인으로 문서화(다른 writer는 no-rehash 불변식 유지).

## [1.22.3] — 2026-07-15

**Workflow-orchestration live-activation — M3 (operational USD firing-block 은퇴)** — M2의 firing-preview를 실제 dogfood 환경에 돌린 결과 **핵심 발화 실패 지점**이 표면화됐다: 정규 cost-state가 sticky critical(`$186.92` + `hard_ceiling_reached`)이면 M1이 default를 반전했어도 병렬·fan-out이 **전부 미발화**(`hard-ceiling`)였다. M1의 fail-open은 cost-state **부재**에서만 green을 가정하므로 **존재하는 critical**은 못 뚫었고, 그래서 M2 live 관찰(row A/B)도 비어 있었다. M3은 운영자 철학(비용<품질, cost gate는 환각 최소화 목적이지 절감 아님)을 USD-blocking 표면 전반에 일관 관철하되, Codex R1(No-ship, 2 HIGH + 2 MEDIUM)을 흡수해 "USD를 그냥 은퇴하고 agent-count cap에만 맡긴다"는 순진한 설계를 **다층 대체 backstop**으로 교체했다.

### Changed
- `implement-dispatch/budget.js` · `plan-fanout/budget.js` — **operational USD를 발화 blocker에서 은퇴**. `hard_ceiling_reached` skip은 `usdBomb` opt-in에서만 발동하고, `AUTODISABLE_TIERS_DEFAULT`가 `{critical}`→**empty**로 바뀐다. 명시적 `MCCP_{WORK_PARALLEL,PLAN_FANOUT}_AUTODISABLE_TIER` override는 두 default보다 항상 우선(불변). merge-strategy·single-partition·budget gate는 **무변경**(구조적 안전 보존).
- `implement-dispatch/budget.js` · `plan-fanout/budget.js` — **runaway clamp를 전 run 경로에 적용**(Codex F2). 기존엔 fail-open(telemetry 부재) 경로 전용이었으나, operational USD가 더 이상 metered 경로도 막지 않으므로 agent-count cap이 양쪽의 primary backstop이 된다. clamp는 N을 **낮추기만** 하므로 far-from-cap 세션은 무영향.
- `auto-chain.js` — `checkCostTelemetry`의 hard_ceiling abort를 **catastrophic-USD abort로 정렬**(Codex F3). 발화는 auto-chain gate 이전이라, 오라클만 열고 commit→pr abort를 남기면 stall이 뒤로 밀릴 뿐이다. telemetry-integrity trigger(missing/unreadable/stale)와 `chain_aborted`·kill-switch·receipt·previous-step trigger는 **불변** — 신뢰할 수 없는 신호는 지출액과 직교하므로 보수적으로 유지.
- `commands/work.md` · `commands/plan.md` — 오라클 호출에 `usdBomb`+`catastrophicUsd` forward. **read-then-bump 폐기** → 원자 `reserveWorkers` 위임(별도 `bumpCounter` 제거 — reserve가 이미 카운트). 발화 로그를 "operational USD 비차단 · catastrophic-USD/원자 runaway-cap backstop"으로 갱신.
- `orchestration-preview.js` — `usdBomb`+`catastrophicUsd`를 env 파싱해 양 오라클에 forward(실발화와 drift 구조 차단). runaway는 **read-only `clampForRunaway` 유지** — 관측이 세션 headroom을 소비하면 안 되므로 `reserveWorkers`는 정적으로 금지(test가 mechanical 검증). `oracle_run`/`effective_fire` 분리 불변(M2 F1) 유지.

### Added
- `orchestration-runaway.js#reserveWorkers` — **원자 check-and-bump**(Codex F2). 단일 lock 임계구역에서 `readCounter` → clamp → bump를 수행해 read-then-bump TOCTOU를 봉인한다(재진입/동시 dispatch가 동일 pre-bump 값을 관측해 각자 full fleet을 grant하던 결함). lock 고갈 시 **`granted=0` fail-closed**(`reason='lock-exhausted'`, PR-Codex R1 F1 4라운드) — 기록할 수 없는 launch는 cap 관점에서 fail-open이므로 허가하지 않는다. cap 도달 시 **`granted=0`**(`reason='cap-exhausted'`, PR-Codex R1 F1 5라운드). 순차 reserve 회귀: cap 8 · 요청 4 → `[4,4,0,0,0]`, 누적 총량 8(=cap).
- `orchestration-runaway.js#parseCatastrophicUsd` — `MCCP_ORCHESTRATION_CATASTROPHIC_USD`(default **500**), operational $100과 **분리된 대체 bomb detector**(Codex F1). $186은 통과, 진짜 폭주 비용은 차단. loud fail-open parse.
- `orchestration-runaway.js#parseUsdBomb` — `MCCP_ORCHESTRATION_USD_BOMB`(default **off**, 표준 `1|true|yes|on`), M1 USD bomb-detector를 전 표면(fleet·fanout·auto-chain)에서 정확 복원하는 back-compat kill switch. **unknown non-empty → off + loud warn**(Codex F4 — rollback path라 오타로 조용히 비활성되면 안 됨).
- REASONS `CATASTROPHIC_USD`(양 오라클) · `LOCK_EXHAUSTED`(runaway).

### Verified
- **Mechanical firing-open A/B**(LLM 0): 동일한 seeded sticky 상태($186.92 critical + hard_ceiling)에서 실 CLI로 — `usd_bomb` off(M3 default) → `fleet.run=true reason=ok-run` + `effective_fire.parallel_fires=true`, `usd_bomb=1`(M1 등가) → `run=false reason=hard-ceiling`. `CATASTROPHIC_USD=100` → `catastrophic-usd` skip(대체 bomb 유효). preview는 상태 미기록(read-only 유지).
- `docs/workflow-orchestration/live-activation-observations.md` — `preview-ref (M3)` row + §4.1 **live-완주 경로** 표. claim을 "firing-open + catastrophic 미만 시 live-완주 가능"으로 정직화(live 완주 관찰은 여전히 operator row A/B). build 시점 ambient cost-state가 이미 green으로 리셋돼 있었다는 사실도 정직 기록 — ambient preview는 M3 delta를 입증하지 못하므로 seeded A/B를 쓴 이유.

### Fixed — PR-Codex R1 5라운드 흡수 (2건 전부 ACCEPT_NOW, backlog 이연 0)

4라운드와 **같은 규칙, 인접한 구멍**이다. 4라운드는 `reserveWorkers`의 lock-고갈 분기를 닫고 cap이 지켜진다고 믿었으나, 같은 함수의 **cap-도달** 분기는 열려 있었다. M3이 operational USD를 은퇴시키며 이 카운터를 유일한 구조적 backstop으로 승격시켰으므로, cap 안의 구멍은 곧 M3 헤드라인이 거짓이라는 뜻이다.

- **F1 — cap이 도달 후 전혀 강제되지 않았다** (HIGH). `clampForRunaway`에 0을 반환하는 분기가 없어 cap 초과 시 항상 floor 1을 주고, `reserveWorkers`가 이를 조건 없이 누적·기록했다. 실측(cap=4): `launched`가 5,6,7,8,9…로 **상한 없이** 증가. cap이 아니라 병렬도 throttle이었다. → clamp를 **headroom-aware**로 전환(`remaining===0` → `n:0` + 신규 `cap-exhausted`; `0<remaining<requestedN` → `n:remaining`으로 기존 floor보다 정확). `reserveWorkers`는 `n===0`에 **write 없이** `granted:0`·`reservationId:null` 반환. floor의 명분("파이프라인을 완전히 막지 않는다")은 호출자의 **인라인 fallback**이 제공한다(인라인은 agent 미발화 → cap 미소비, 4라운드가 검증한 전제).
- **F2 — fan-out reconcile 실패가 실제 launch를 카운터에서 지웠다** (HIGH). 3회 재시도 실패 시 경고만 남기고 진행 → 예약이 pending 잔존 → lease가 prune → **떴던 agent가 증발**. 당시 주석은 잔여를 "conservative over-count until the lease resolves it"이라 적었으나, lease는 오차를 해소하는 게 아니라 **안전한 over-count를 위험한 under-count로 뒤집는다**(cap이 절대 틀리면 안 되는 방향). lease 만료 건전성의 명시 전제("fan-out은 호출 후 전 경로 명시 commit")가 깨진 지점이다. → reconcile CLI가 `actual>0`·미commit 시 **lock-free debt 마커**(`orchestration-runaway.json.debt/<id>.json`)를 자동 기록하고, `readCounter`·`reconcileReservation`이 해당 항목을 만료 대상에서 제외한다. 마커가 lock-free여야 하는 이유는 debt를 낳는 유일한 상황이 곧 lock 획득 실패라 순환이기 때문. 마커는 기존 pending을 **고정**할 뿐 카운트를 더하지 않아 이중 계산이 없고, 뒤늦은 reconcile이 commit하며 청소한다. `work.md`는 route가 launch **전** 경계라 HALT로 충분해 debt가 불필요(의도된 비대칭).
- **테스트가 버그를 정답으로 고정하고 있었다.** `reserveWorkers: sequential reserves cannot amplify past the cap`(cap 8 → 누적 11) · `end-to-end: … cannot exceed cap amplification`(cap 8 → 누적 11) · `F2: cost-state absence CANNOT bypass the cap`(cap 8 → 누적 12)이 전부 통과 중이었다. 셋 다 per-dispatch `granted`만 보고 **누적 총량**을 보지 않았다 — 이름이 약속한 불변식을 아무도 assert하지 않았다. 이제 총량을 assert한다.
- **pure oracle을 고친 이유**: read-only 불변식은 *mutate 금지*이지 *공식 고정*이 아니다. preview만 floor 1을 유지하면 발화가 거부될 상황에서 "1개 뜬다"고 보고하는 **false green-light**가 되고, 이는 M2 Codex F1이 `effective_fire`로 막으려던 바로 그 유형이다. 실측으로 preview(`run:false`/`cap-exhausted`) ↔ reserve(`granted:0`/`cap-exhausted`) 일치 확인. preview의 read-only(무-bump·무-write)는 그대로 — 정적/디스크 test 유지 통과.

### Fixed — PR-Codex R1 6라운드 + Implement-Codex R1 7라운드 + PR-Codex R1 5라운드(PR 게이트) 흡수 (전건 ACCEPT_NOW, backlog 이연 0)

4·5·6라운드가 전부 `reserveWorkers` **안팎의** 구멍을 닫는 동안, 진짜 결함은 **그 함수가 불리는 범위**였다. Implement-Codex가 흡수 설계 자체를 CRITICAL로 반려하며 그 층을 열었다.

- **6R F1 — caller가 5라운드의 새 zero-grant 이유를 소비하지 않았다** (HIGH). 5라운드는 `cap-exhausted`를 신설하고 오라클 3층(`orchestration-runaway`→`budget`→`route`)을 전부 고쳤지만 `work.md:253`의 **리터럴 비교**(`= "lock-exhausted"`)는 그대로 뒀다. 결과: cap 도달 시 denial 아티팩트 미작성 → `reserveDenied=false` → task route → `reservationId:null`인 미기록 worker. 4라운드가 닫은 누수가 5라운드가 만든 문으로 되돌아왔다. → 술어를 **구조적·이유-비특정**으로 전환: `run===false ∧ runawayReason != null`. `runawayReason`은 budget 오라클에서 `runawayClamp`가 실제로 돈 경우에만 세팅되므로(skip 기본값 null) 이 조합이 곧 "예약 시도 → granted 0"이며, 세 번째 이유가 생겨도 구멍이 안 열린다. `plan.md`의 동일 리터럴도 같은 술어로 정렬(그쪽은 `FANOUT_RUN=0`이 이미 호출을 막아 메시지 구체성 문제였다).
- **7R F1 — cap이 단일 worker를 한 번도 세지 않았다** (**CRITICAL**). 예약은 `resolveFleet`의 주입 clamp 안에서만 일어나고, `resolveFleet`은 work.md의 4중 가드(`ISOLATE≠0 ∧ PARALLEL≠off ∧ merge-strategy=worktree-merge ∧ partitions`) 뒤에서만 실행된다. 그런데 Step 3.route는 **무조건** 돌며 `task`/`workflow-single`을 반환하고 둘 다 worker를 실제로 spawn한다 — 예약 없이. 즉 **cap은 병렬 fleet만 세어 왔다**. A/B 실측(cap=4, 9회 호출): BEFORE 9개 spawn·`counter.launched`=**0**(카운터가 한 번도 안 움직임) / AFTER 4개 spawn·counter=4. 6라운드 fix-task의 sweep 기준 (c)"예약 미시도 = cap 미소비"는 **정확히 거꾸로**였다(실제로는 기록 없이 cap 소비) — cap 소비를 정하는 건 예약 시도 여부가 아니라 **route**다. → 예약을 **공통 pre-launch 경계(Step 3.route)로 이동**. fleet 예약 부재 ∧ 신규 순수 오라클 `route.js#requiresReservation($ROUTE)` 참이면 `orchestration-runaway.js reserve --n 1`, `granted:0`이면 `ROUTE=inline` 강등(기록 불가능한 launch 금지), 아니면 `--actual 1` 즉시 commit 후 launch. commit 실패는 HALT(route가 pre-launch 경계라 중단해도 un-spawn할 게 없다). `route.test.js`가 ROUTES enum **전수**를 검증해 5→6라운드의 "새 enum 값 + 미갱신 소비처" 실패 형태를 구조적으로 막는다.
- **7R F2 — started 마커는 컨트롤러 사망 시 무의미하다** (HIGH). 6라운드 초안은 pre-Workflow "started" 마커 + 사후 `markDebt`였는데, `readCounter`는 **debt 마커만** 존중하므로 사후 핸들러만 읽는 마커는 정확히 그 핸들러를 놓쳤을 때(=창이 열리는 바로 그 순간) 무효다. → **Workflow 호출 직전에 진짜 debt 마커를 pin**(신규 `mark-debt` CLI). pin 실패 시 **Workflow 미호출**(인라인 Pattern Grounding — fan-out은 GROUND 보강이라 plan 미차단). 창이 사라지고 신규 메커니즘도 불필요하다(5라운드 debt 재사용). Codex 대안 `actual=granted` commit은 **거부** — commit은 `open[]`을 떠나 영구가 되어 실제로 안 떴을 때 되돌릴 수 없다(4라운드가 default 제거로 막은 "영구 유령").
- **debt decay — 7라운드가 도입, PR-Codex R1(5라운드 PR 게이트)이 반려 → 제거** (**HIGH**). 7R F2 pin이 pending을 lease로부터 **영구** 고정하자, 초안은 자기중독을 우려해 `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS`(6h, `cost-state.js#decayIfStale` 미러) 시간축 decay로 마커를 늙혀 pin을 놓게 했다. PR-Codex가 반려: **모든** debt 마커는 fan-out이 Workflow 호출 **직전**에 찍으므로, 컨트롤러 death 후에도 마커가 남아 있다는 것 자체가 그 agent들이 **실제로 떴다는 증거**다. 그 마커를 aging-out하면 `readCounter`가 still-open 예약을 lease-expire해 **실 launch를 차감** → cap **under-count**(operational USD 은퇴 후 유일 backstop이 하필 over-permissive 방향으로 뚫림 — 이 PR이 닫으려던 바로 그 bypass 재개). → `readDebtIds`의 mtime decay 제거 + `parseDebtDecayHours`·`ENV/DEFAULT_DEBT_DECAY_HOURS` 삭제, pin을 5라운드 **영구** 동작으로 복원. 영구 pin이 남기는 자기중독은 **bounded**다(우려처럼 "영구"가 아니다): counter가 session-keyed(`readCounterRaw`가 다른 `CLAUDE_SESSION_ID`에 fresh 반환)라 다음 세션이 리셋하고, dead-controller 사건당 ≤fleetSize(≤4)/`MAX_AGENTS`만 소진 — bounded·self-resetting **liveness** 비용이 safety cap을 절대 우회 안 하는 것의 정당한 대가다. 회귀 test(Codex 권고): fan-out launch → 컨트롤러 death(reconcile 전) → 시간 경과 → cap이 그 agent를 **여전히 카운트** + 다른 session은 fresh.

### Unchanged
- dual-review·receipt chain 무손상 — firing 오라클·auto-chain은 gate 값 조정만. read-only fan-out + workflow-외곽 게이트 invariant · commit/PR 격리 · cross-gate dedupe · receipt anchor 무변경.
- briefing/handoff의 USD 축은 **독립·불변**(`AUTODISABLE_TIERS_DEFAULT`는 각 budget 모듈 로컬 — 소비처 격리).

## [1.22.2] — 2026-07-14

**Workflow-orchestration live-activation — M2 (firing-preview 도구 + 관찰 프로토콜)** — M1이 발화를 구조적으로 반전·배선했으나 실제 LLM-runtime 발화가 **관찰된 적 없던** gap을 닫는 후속 milestone. live `/mccp:work` 완주는 재귀·고비용이라 관찰을 두 축으로 분리: (1) **저비용 firing-preview 도구** — 현재 env·cost-state·runaway 카운터로 "지금 무엇이 발화할지"를 Step 3와 **동일 oracle**을 read-only 재사용해 **LLM 소비 0**으로 판정, (2) **operator-executed live 완주**(prp-implement 밖, 재귀 회피)의 관찰 기록·프로토콜. 핵심 correctness — oracle `run`은 component signal일 뿐 실발화는 `resolveWorkRoute` route + caller-gate 합성 `effective_fire`로 판정해 "oracle run == 발화" false green-light를 구조 차단(ISOLATE=0/partition N=1/runaway degraded → run:true여도 parallel_fires:false).

### Added

- **`orchestration-preview.js`** — 순수 `previewFiring(opts)` + `require.main` CLI(`--plan`/`--prd`/`--json`). Step 3 oracle(`resolveFanout`/`resolveFleet`/`resolveWorkRoute`/`parseMergedVerifyMode`/runaway `readCounter`)을 read-only 조합해 fan-out·병렬·verify·route·runaway 발화 스냅샷 산출. `oracle_run`(원자료)과 `effective_fire`(route 합성)를 분리 출력 + `caller_gates.*_assumed` 투영 라벨. **read-only 불변식** — counter-bump 미import/호출, cost-state·STATE.md 미write.
- **`lib/tests/orchestration-preview.test.js`** (신규 12) — env matrix(cost-failopen 발화 / off·0 opt-out / `COST_FAIL_OPEN=0` fail-closed 복원 / near-cap degraded clamp) + caller-gate matrix(isolate=0·N=1·opt-out에서 `parallel_fires:false`) + preview 서브객체 == 직접 oracle 호출 byte-정합 + read-only 불변식(temp HOME/state에 runaway·cost-state·STATE.md 3파일 시드 후 CLI 실행 → 전부 mtime/내용 불변 + 모듈 counter-bump 정적 부재).
- **`docs/workflow-orchestration/live-activation-observations.md`** — per-cycle 관찰 ledger(표) + live-dogfood 프로토콜(scope-최소 target·**2개 named row 필수**: default 발화 ∧ `MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out·재귀 회피 경계·검증 절차) + 단일 사용자 baseline 신뢰도 caveat.

### Changed

- **`plugin.json`** `1.22.1`→`1.22.2` (단일 milestone patch, §3.7). renderer footer(`html.js`·`markdown.js`) + `i18n-surface.test.js` assert 동기.

## [1.22.1] — 2026-07-14

**Workflow-orchestration live-activation — M1 (발화 조건 반전 + 검증 harness)** — workflow-orchestration PRD가 배선은 완성했으나 실제 LLM-runtime 발화가 관찰된 적 없고 cost-state fail-closed가 dogfood 발화를 구조적으로 막던 gap을 닫는다(후속 live-activation PRD의 첫 milestone). fan-out(`MCCP_PLAN_FANOUT`)·병렬 implement(`MCCP_WORK_IMPLEMENT_PARALLEL`)를 **default 발화**로 반전(단일은 명시적 opt-out)하고, cost-state 부재 시 `COST_STATE_UNKNOWN` fail-closed skip을 **fail-open(green 가정)**으로 뒤집는다. 폭주 방지는 구조적 per-dispatch 상한(fixed fleetSize=4 / `MCCP_WORK_PARALLEL_MAX`) + USD critical/`hard_ceiling` bomb-detector + **cost-state 독립 누적 worker-launch 절대 상한**으로 재정의(notice/warning tier autoDisable 제거 — 운영자 철학상 $50/$80은 폭탄 아님). 실제 LLM 발화 없이 seed→mark→collect→reconcile 배선을 관측하는 저비용 검증 harness(합성 git-worktree e2e) 추가.

### Added

- **`orchestration-runaway.js`** (Codex F2) — cost-state와 **독립적인** catastrophic-runaway 최후 안전판. 순수 `clampForRunaway({requestedN, launchedSoFar, env})`(fail-open 경로 N을 degraded=1로 clamp) + 세션 키 누적 worker-launch 카운터(`readCounter`/`bumpCounter`, `cost-state.js` `wx` O_EXCL lock + atomic tmp+rename mirror) + 절대 env cap `MCCP_ORCHESTRATION_MAX_AGENTS`(default 24, loud fail-open parse). telemetry 부재가 cap을 우회 못 함.
- **`implement-dispatch/route.js`** (Codex F3) — `/mccp:work` Step 3 route 결정(inline/task/workflow-single/workflow-parallel)을 인라인 markdown 트리에서 순수 함수 `resolveWorkRoute`로 승격. work.md bash가 단일 SoT로 호출 → 발화 route가 mechanical 테스트 대상.
- **테스트** — `lib/tests/orchestration-runaway.test.js`(신규 12) + `implement-dispatch/tests/route.test.js`(신규 12, env 조합 전수) + `implement-dispatch/tests/dispatch-wiring-harness.test.js`(신규 3 — 합성 git-worktree seed→mark→collect→reconcile e2e + F1 no-leak + merge/rollback patch smoke, LLM 0회).

### Changed

- **`plan-fanout/budget.js`·`implement-dispatch/budget.js`** — `parseFanoutMode`/`parseParallelMode` default off→**on**(opt-out via `off`/`0`). `resolveFanout`/`resolveFleet`에 `costFailOpen`(default true → `cost-state` null이면 green 가정 run + `COST_FAILOPEN` reason; `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0`이면 기존 `COST_STATE_UNKNOWN` fail-closed 정확 복원) + `hard_ceiling_reached` bomb-detector skip + tier autoDisable를 **critical-only**로 narrow + fail-open 경로 전용 injected `runawayClamp`. merge-strategy·single-partition·budget-cap gate 불변.
- **`commands/work.md`** — Step 3.prep-parallel `PARALLEL` default `:-0`→`:-1`(단일 opt-out 축). Step 3.route를 `resolveWorkRoute` oracle 호출로 승격. `costFailOpen`+runaway counter forward + 발화 로그. **`MCCP_WORK_IMPLEMENT_WORKFLOW` default 미변경**(Codex F1 — opt-out은 `PARALLEL=off/0` 단일 축으로 legacy Task 경로 정확 복원).
- **`commands/plan.md`** — Phase 2.5 fan-out default on + `costFailOpen`+runaway forward + 발화/opt-out 로그.
- **`plugin.json`** `1.22.0 → 1.22.1`(단일 milestone = patch, §3.7) + `renderer/html.js`·`markdown.js` footer `v1.22.1` sync.

## [1.22.0] — 2026-07-12

**Time-based cost decay (`MCCP_COST_STATE_DECAY_HOURS`)** — cost-model-subscription PRD **M3, 최종 milestone → PRD 전체 종료(minor bump)**. "한 번 튄 가상 비용($314.50 sticky)이 5개 자동화를 영구·전역으로 잠그는" 문제의 잔존 근원을 시간 축으로 닫는다. M2가 "신규 추정을 정확하게" 만들었으니 M3는 "오래된 추정이 스스로 사라지게" 만든다. 종량제·구독권 공통으로, 3일 전 다른 프로젝트의 $314가 오늘 작업을 막지 않는다. decay 비활성(`=0`) 시 M2 동작과 판정 byte-identical(회귀 0).

### Added

- **`cost-state.js` Axis 1** — 명시적 `readStateRaw`(raw)/`readState`(decayed)/`readStateOrThrow`(raw, auto-chain 전용) 3-API 분리(Codex F1) + pure `decayIfStale(state, mtimeMs, nowMs, decayMs)` + `parseDecayMs(env)` env SoT(default 6h · `=0` kill switch · fail-open). mtime > decay 창이면 `readState()`가 green view 반환 → tier 소비처(fleet/fanout/briefing/breakpoint)가 **코드 변경 0**으로 decay 획득. `writeStateMerged`는 명시적 write-side decay로 stale floor를 리셋해 monotonic MAX 계승을 끊는다.
- **`state-writer.js` Axis 2 substrate** — `abort_owner`(enum `cost|dispatch|null`)+`cost_abort_at` provenance frontmatter(present-only 직렬화, `dep_check_at` mirror). `dispatch_chain_aborted` 이벤트가 `abort_owner='dispatch'` set + stale cost marker clear(F3 안정적 ownership — `last_event` guard 폐기).
- **`ecc-context-monitor.js` Axis 2** — STATE.md producer가 subscription-aware SET(구독권은 USD가 아니라 `evaluateOverflow` context 축에서만 `chain_aborted` set, F2) + `chain_aborted` set 시 `abort_owner='cost'`+`cost_abort_at` stamp + 신규 **decay-clear**(4중 stable AND) + **legacy sweep**(marker 없는 cost-origin flag). **Codex Impl-R1 흡수** — IF1: legacy sweep가 `NON_COST_ABORT_EVENTS`(`plan_conflict_escalated`/`dispatch_chain_aborted`) denylist로 plan-conflict hard-stop 오clear 방지; IF2: stale bridge context를 signal-unknown으로 처리해 오래된 telemetry의 영구 halt 차단.
- **테스트** — `lib/tests/cost-state.test.js`(신규 18) + `state/tests/state-writer.test.js`(+4) + `hooks/tests/ecc-context-monitor.test.js`(+10, IF1/IF2 포함) + `lib/tests/auto-chain.test.js`(+3, F1 divergence·self-heal·F2 통합).

### Changed

- **`plugin.json`** `1.21.2 → 1.22.0`(PRD 최종 milestone 완료 = minor, §3.7) + `renderer/html.js`·`markdown.js` footer `v1.22.0` sync.
- **`CLAUDE.md`** §4 `MCCP_COST_STATE_DECAY_HOURS` 토글 + §1.4 표 M3 row(cost-model-subscription PRD 완결) + §3.2 STATE.md `abort_owner`/`cost_abort_at` present-only 필드.

### Fixed

- **auto-chain fail-safe divergence는 의도적·문서화·테스트됨** — auto-chain은 `readStateOrThrow`(raw)+`isStale(1h)` stale-abort 유지(mid-chain telemetry 1h+ 낡으면 보수적 pause). sticky 버그(fresh 파일의 hard_ceiling)는 write-side decay가 첫 tool write에 floor를 리셋해 해소하고 >6h gap 후 첫 write가 파일을 fresh·low로 만들어 자기치유(decay 창 6h ≫ auto-chain 1h라 활성 세션 무발화).

## [1.21.2] — 2026-07-10

**Harness-cost accuracy (`harness-cost-<sid>.json` writer)** — cost-model-subscription PRD M2. 부풀려진 가상 비용의 정확도 근원을 두 축으로 닫는다. **Axis A** — 번들 statusline 이 매 렌더마다 harness 실비(`cost.total_cost_usd`)를 per-session 캐시로 흘려보내는 **writer 를 배선**(소비 측 cost-tracker · ecc-context-monitor 는 이미 완비, 생산 측 공백을 채움). **Axis B** — `ecc-context-monitor.js` 의 로컬 `50/80/100` 하드코딩을 `cost-thresholds.js#getHandoffCostThresholds()` 로 통일해 `MCCP_HANDOFF_THRESHOLDS_USD` env override 가 tier · `hard_ceiling` · **STATE.md abort 채널**(`session_end_imminent`/`chain_aborted`) 전부에 도달. writer 미설치 커스텀 statusline 은 transcript-sum fallback 유지 — **회귀 0**.

### Added

- **`plugins/mccp/scripts/lib/harness-cost.js`** — dep-free 공용 계약. private `readHarnessCostRecord` 단일 validator(finite · 음수 · `[0,maxAge]` age 경계, stale·future 모두 reject) 위의 얇은 adapter `readHarnessCost`(number) / `readHarnessCostMeta`({cost_usd, ts}) + best-effort atomic `writeHarnessCost`.
- **`docs/harness-cost-contract.md`** — `harness-cost-<sid>.json` 스키마 + 커스텀 statusline opt-in chaining 스니펫(비강제) + fallback=transcript-sum 명시(OQ3 답변).
- **테스트** — `lib/tests/harness-cost.test.js`(round-trip · stale/future/corrupt/negative · F4 parity · tmp leak) + `hooks/tests/ecc-statusline.test.js`(writer 호출/무호출/격리 · F3 display) + `hooks/tests/ecc-metrics-bridge.test.js`(cost_sample_ts bump-on-change).

### Changed

- **`ecc-statusline.js`** — `renderStatusline`/`extractHarnessCost` 추출 + harness-cost writer 배선(별도 try/catch, 출력 절대 불차단) + **F3** 표시 소스를 live harness cost 우선(부재 시 bridge fallback).
- **`ecc-context-monitor.js`** — **Axis A** harness-preferred cost(`resolveSessionCost`) + **F1** freshness guard(harness ts vs `bridge.cost_sample_ts`, epoch초 동일단위 — 폐기된 `last_timestamp` ISO 비교 대체) + **Axis B/F2** 로컬 상수 제거·전 usage 를 `>=` per-call threshold 로 통일(tier · hardCeiling · STATE.md).
- **`ecc-metrics-bridge.js`** — **F1** cost 값 변경 시에만 numeric `cost_sample_ts`(epoch초) stamp.
- **`cost-tracker.js`** — inline `readHarnessCost` 를 lib import 로 대체(byte-identical dedupe, `os` require 제거).
- Implement-Codex R1: HIGH 1(freshness guard) + MEDIUM 3(comparator · statusline 렌더 · 단일 validator) 전건 구현-시점 흡수 → converged.

## [1.21.1] — 2026-07-10

**구독권 비용 모델 opt-in (`MCCP_SUBSCRIPTION`)** — cost-model-subscription PRD M1. 정액 구독권 사용자를 위해 5개 자동화 소비처(resolveFanout · resolveFleet · shouldSkipBriefing · auto-chain · breakpoint-detector)가 USD cost-state/tier 게이트를 우회하도록 하고, 폭주 방지는 metrics bridge의 `context_remaining_pct` + `tool_count`(context overflow) 축으로 대체한다. flag 미설정 시 5개 소비처 **판정 byte-identical** — 종량제 회귀 0. (원 구현은 1.20.16이었으나 main이 1.21.0(#99)을 선점해 §3.7 forward-reconcile로 1.21.1 상향.)

### Added

- **`plugins/mccp/scripts/lib/subscription.js`** — subscription oracle(pure/dep-free). `isSubscriptionMode`(1|on) + `parseOverflowThresholds`(context 35/25 기본, tool 축 default-off·opt-in) + `evaluateOverflow`(green/warning/critical, 신호 부재 → fail-open green). frozen REASONS.
- **`plugins/mccp/scripts/lib/context-state.js`** — context-current.json 스냅샷(read/write/isStale). latest-wins(non-monotonic) + `context_ts` stamp + **out-of-order older-샘플 reject**(tool_count 우선 — Codex F2, stale-high write가 최신 critical을 은폐하는 경로 차단).
- **테스트** — `lib/tests/subscription.test.js` + `lib/tests/context-state.test.js`(oracle/snapshot 단위) + 5개 소비처 subscription-path 테스트(overflow critical skip · fail-open · 구조 게이트 보존). 전체 스위트 green.

### Changed

- **5개 소비처** — `plan-fanout/budget.js`·`implement-dispatch/budget.js`·`briefing/cost-guard.js`·`auto-chain.js`·`state/breakpoint-detector.js`에 `MCCP_SUBSCRIPTION` 분기(USD 축만 overflow로 대체, 구조 게이트·다른 abort trigger 불변). 전면 **fail-open**(신호 부재 → 진행 — Codex F1 사용자 수용).
- **`hooks/ecc-context-monitor.js`** — L238 cost-write 블록에 격리 try/catch로 context-current.json best-effort stamp(subscription 무관 항상 write — Codex F3 정직화: 판정 byte-identical + 1회 telemetry write, 실패는 hook 진행 무영향).
- **`commands/plan.md`·`commands/work.md`** — resolveFanout/resolveFleet 호출에 `subscriptionMode` + `contextStateRead` 주입.
- **`hooks/session-start.js`** — subscription 활성 시 1줄 관측 배너(stderr, 종량제 무발화).
- **`.claude-plugin/plugin.json`** — `1.21.0 → 1.21.1`(단일 milestone patch, §3.7 — main 1.21.0 선점 반영).
- **`CLAUDE.md`** — §4에 `MCCP_SUBSCRIPTION` + `MCCP_SUBSCRIPTION_OVERFLOW_*` 토글 문서화.

### Notes

- plan-codex R1: Codex verdict=needs-attention(HIGH 2 + MED 1). F1(fail-open 시 비싼 소비처 runaway guard 부재) 사용자 결정으로 수용(문서화된 위험 — fanout `MCCP_PLAN_FANOUT=on` 별도 opt-in + fleet `worktree-merge` gate로 N=1). F2(out-of-order)·F3(byte-identical) plan 흡수. Implement-Codex는 cross-gate dedupe 수렴.
- 신호 신뢰도 + calibrated 2차 임계(tool/turn) + session sticky-critical은 M2 harness-cost 축으로 이연(`.claude/plans/codex-findings-backlog.md`).

## [1.21.0] — 2026-07-09

**workflow-orchestration M4 — 병렬 활성화 (worktree-merge live).** PRD `workflow-orchestration`의 마지막 milestone. M2b/M3가 build+unit-test로 완비하되 cost hard-ceiling으로 미실측이던 **live harness 상관(Workflow worktree↔dispatchId)**을 Task 0 live dogfood로 empirical 입증하고, `merge_strategy` default를 `disable-parallel`→`worktree-merge`로 flip해 N-worker 병렬 implement를 해금한다. PRD 전체 완료 → minor bump. cost guard 3중(PARALLEL=1 opt-in · cost-state fail-closed · tier autoDisable)은 무변경 — default flip은 구조적 merge_strategy gate만 열 뿐 비용/opt-in gate는 유지.

### Added

- **`plugins/mccp/scripts/lib/dispatch-envelope.js` `seedEnvelope(envelopePath, opts)`** — worker-side idempotent envelope seed. Task 0(run wf_1f689994-fb8)가 입증: fresh `isolation:'worktree'` worker는 `.claude/state/dispatches/`가 gitignored라 parent placeholder 미복사 → 부재 시 terminal `mark`가 ENOENT. seed가 부재 시 pending envelope를 atomic 생성(존재 시 no-op — 마킹된 terminal 절대 미clobber)해 collect-worktrees가 worktree를 envelope 파일명으로 correlate하게 한다.
- **`plugins/mccp/scripts/lib/dispatch-cli.js` `seed-envelope` 서브커맨드 + `resolveEnvelopePathForWorktree`** — worker가 first-step으로 자기 worktree에 seed. Codex F2: repo-relative envelope 경로를 CWD가 아니라 worktree 루트(`git rev-parse --show-toplevel`) 기준 resolve + 하위 assert(subdir CWD·`..` escape 방어). `buildImplementWorkerBasePrompt`가 partition worker에게 seed first-step 주입.

### Changed

- **reconcile terminal envelope worktree-read (Task 2)** — `cmdReconcileFleet`이 `--worktree-map` 제공 시 각 worker terminal envelope를 `<worktree>/.claude/state/dispatches/<id>.envelope.json`에서 읽는다(worker가 in-worktree seed→mark하므로 parent placeholder는 stale pending 잔존 → parent read는 오탐 mismatch). map 부재 시 parent fallback(단일/back-compat).
- **merge-apply patches-out rollback hole 폐쇄 (Codex F1)** — `cmdMergeApply`가 apply 성공 후 `patches-out` write 실패 시 이미 적용된 patch를 `rollbackApplied`로 즉시 역적용해 parent를 복원("merge-apply 실패=parent clean" 계약 실장; patch-scoped only, F4 — 광범위 checkout/clean 금지).
- **collectChangedFiles `--untracked-files=all` (live dogfood-surfaced)** — default `--porcelain`가 untracked 신규 디렉토리를 `dir/`로 축약해 file-level partition과 false partition-escape → `-uall`로 개별 파일 열거(worktree-merge collectWorkerDiff와 일치).
- **`plugins/mccp/commands/work.md`** — Step 3.prep-parallel `MCCP_WORK_MERGE_STRATEGY` default `disable-parallel`→`worktree-merge`. gate-parallel reconcile worktree-envelope read 문서화. 활성화 노트로 갱신.
- **`plugins/mccp/scripts/lib/implement-dispatch/budget.js`** — Decision-order 주석을 M4 default flip에 동기(상수 `ENABLING_MERGE_STRATEGY='worktree-merge'` 무변경).
- **`CLAUDE.md` §1.4 + §4 / PRD Delivery Milestones / renderer footer** — v1.21.0 동기. PRD M4 complete + M2/M3 gated 축 종료.

### Tests

- `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` — seed-envelope(생성/no-op/terminal 미clobber/reject) · F2 worktree-root resolve(subdir·escape·absolute passthrough) · worker prompt seed first-step(partition 有/단일 無) · reconcile worktree-read(pending parent → ok, no false mismatch) · merge-apply F1 patches-out 실패 rollback(parent clean) · collectChangedFiles `-uall`(신규 디렉토리 파일 열거). 전체 회귀 그린.

## [1.20.15] — 2026-07-09

**신규 command `/mccp:archive-complete`** — 직전 세션(`v1.20.14`)에서 **수동** 수행한 "완료 PRD/plan을 `archived/`로 이동 + status drift 정정 + 대시보드 재렌더" 흐름을 재사용 가능한 human-gate command로 제품화한다. `/mccp:dashboard-audit`의 레이어 분리(agent 평가 ↔ 결정적 scan/apply)를 미러하되, 비파괴 마커 대신 **파일 이동 + status flip**을 수행한다. 핵심 정확성 기준은 **PRD 전체가 완료(전 milestone complete/dropped)일 때만 그 plan을 archive**하는 dangling-active-PRD 불변식(C2).

### Added

- **`plugins/mccp/scripts/lib/archive-complete/scan.js`** — 결정적 스캐너(read-only, LLM-free). 활성 PRD의 `## Delivery Milestones`를 **원시 행 단위로 전부 열거**해 `rawRowCount === complete + dropped` fail-closed 등식으로 archivable 판정(Codex F1 — 비정규 status 행이 분모서 증발하는 오분류 차단). plan↔PRD 인덱스(`scanPlans` source_prd 매칭) + drift 증거(ledger > receipt > git 우선순위, advisory).
- **`plugins/mccp/scripts/lib/archive-complete/apply.js`** — 원자 archive 트랜잭션(Codex F2). preflight-all(하나라도 실패면 mutation 0) → operation journal(`.claude/state/archive-journal/<id>.json`, git-tracked audit anchor — Codex F3) → status flip(content-hash CAS) + `git mv` → **적용 중 어떤 실패든 전량 rollback**. PRD + 그 모든 활성 plan을 하나의 원자 단위로만 이동(C2 단독 이동 거부). collision: 내용 동일 skip / 상이 `<name>.legacy.md` 보존(데이터 손실 0).
- **`plugins/mccp/commands/archive-complete.md`** — 6-phase human-gate command body(SCAN→EVALUATE→PROPOSE+HUMAN-GATE→APPLY→RENDER+VERIFY→OUTPUT). `${CLAUDE_PLUGIN_ROOT}` 경로(버전 하드코딩 없음).
- **테스트** — `tests/scan.test.js`(11) + `tests/apply.test.js`(10): archivable 판정·C2·비정규 status·drift 증거·git mv 중간 실패 rollback·CAS·idempotent·collision-legacy.

### Changed

- **`CLAUDE.md`** — §3에 `archived/` 아카이브 관례 subsection 신설(C1~C4 불변식 + `milestone-history.js` 하드코딩 스캔 경로 + `/mccp:archive-complete` 포인터).
- **`.claude-plugin/plugin.json`** — `1.20.14 → 1.20.15`(신규 command = patch). 양 footer(html/markdown) `v1.20.15` + `i18n-surface.test.js` assertion 동기.

### Notes

- Implement-Codex는 cross-gate dedupe로 수렴(plan-codex가 F1/F2/F3 3 findings 전부 R1 흡수 — 신규 implement-time 결정 0). 파일 이동 chore라 `mccp-*-codex` 게이트 receipt는 발행하지 않는다(human-gate + git history + operation journal이 review — D3).
- `parseTableRows`/`findSection`은 plan-body.js에서 export되지 않아 scan.js에 self-contained 포트(enumerate.js `scanInProgressRows` 로컬-표-스캔 패턴 미러) — plan-body.js를 건드리지 않아 cross-gate dedupe 무손상.

## [1.20.14] — 2026-07-09

완료 PRD/plan 아카이브 정리 + 아카이브 폴더명 `archived/`로 통일 (housekeeping chore). 활성 `.claude/prds/`·`.claude/plans/`에 완료됐지만 남아 대시보드 활성 스캔에 잡히던 drift를 종결한다. **behavior 변경 0 — 파일 이동 + 폴더 rename + status drift 정정 + 렌더 재검증(derive degraded 0, renderer 회귀 0).**

### Changed

- **아카이브 폴더명 통일 (`complete`/`completed` → `archived`)** — `.claude/prds/complete/` → `.claude/prds/archived/`, `.claude/PRPs/plans/completed/` → `.claude/PRPs/plans/archived/`. `milestone-history.js` 3 경로(archived-PRD 스캔 + plan git-time/summary fallback 2) + 주석 + 테스트 5파일(milestone-history·four-part-rendering·enumerate·deep-research-detect·ultracode-detect) 동기. 레거시 `.claude/plans/archive/`도 통합(내용 상이 중복 1건은 `-legacy` 접미사 보존, 데이터 손실 0).
- **완료 PRD 5건 아카이브** — `audit-remediation-followup`·`work-context-isolation`·`v0-3-4-test-env-hygiene`·`v1-1-0-observability-surface-ii`·`v0-4-0-orchestrator` → `.claude/prds/archived/`. 완료 plan 12건 → `.claude/PRPs/plans/archived/`.
- **status drift 정정** — `v0-3-4-test-env-hygiene`(M1 `pending → complete`, 실제 v0.3.4 ship됨) · `workflow-orchestration`(M2 `in-progress → complete` + M4 `pending` 행 추가, **active 유지**).
- **`v0-4-0-orchestrator` superseded 마커** — MVP 척추(spawn axis B/C + metric axis A)가 v1.1.0 notify+resume / cost USD tier 유지로 실증 기각·대체됨을 상단 명시 + axis H 외 9축 `dropped` 정리.
- **`.claude-plugin/plugin.json`** — `1.20.13 → 1.20.14`. 양 footer(html/markdown) `v1.20.14` + `i18n-surface.test.js` assertion 동기.

### Notes

- `workflow-orchestration` PRD는 active 유지 — derive에 전용 PRD source가 없어 PRD는 활성 plan의 `source_prd`로만 discovery되므로, 그 M1~M3 완료 plan은 `.claude/plans/`에 보존(archive 시 dangling active PRD가 되어 대시보드에서 소실).
- 사전 존재 실패 1건(`verdict-label metric F1` — renderer verdict 어휘)은 본 변경과 무관(clean HEAD `34df7b1`에서도 fail) — 별도 이슈.

## [1.20.13] — 2026-07-08

문서 정합화 (**CLAUDE.md ↔ 코드 drift 종결**, audit-remediation P6). 감사 A(Haiku 광범위)/B(Opus 심화)가 지목한 CLAUDE.md 드리프트 8지점을 실제 동작에 정합화한다 — **behavior 변경 0**. 유일한 코드 touch는 `codex-invoke.js` **주석** classification enum(`parse-error` 누락 보정)이고 나머지는 전부 문서 정정이다. 감사가 1.20.2 기준이라 P2~P5(1.20.5~1.20.11)가 일부 드리프트를 이미 고쳤을 수 있어, 각 지점을 현재 CLAUDE.md에 **재대조(staleness guard)**한 뒤에만 편집했다(B#16 §3.2 advisory-lock은 이미 정확 → verified-noop). cross-gate dedupe로 Implement-Codex 수렴(plan-codex `converged` 승계). 버전은 #92(1.20.8)·#94(1.20.9)·#95(1.20.10)·#93(1.20.11)·#96(1.20.12) 순차 점유로 1.20.13 상향(origin/main #96 M3가 1.20.12 선점 → forward-only reconcile per §3.7).

### Changed

- **`CLAUDE.md`** — 8지점 정정: §3.3을 strict 14값 codex-invoke classification 표(`registry-malformed` 추가 + `tempfail`을 classify.js 계층 별도 note로 이동)로 재구성 · §1.4/§5 derive "7 source" → "9 source"(ledger·worktrees 추가) · §1.3에 v1.3.1 informational allow-path 단서(terminal PR hard-block 유지) · §3.6 락 모델을 `pr-phase.lock`(hash+stdin-pipe) ↔ `quarantine.lock`(raw-token/advisory) 분리 + no-token legacy release **잔여 리스크 정직 서술**("양쪽 공통"·"무해" 단정 제거) · §3.9 design-critique enum full form(`ESCALATE_NEXT_ROUND`/`DIVERGENT_UNRESOLVED`) + 미커밋 fixture 서술 정정 · §3.2 SessionEnd `.end` marker(v1.20.5 fail-loud-open) 문서화 · §1.4 stop-loop을 자동 재시도 아닌 bounded 실패 카운터(`MAX_COUNT=2`)로 정정 · §4 runbook item 5 quarantine=hash 오기재 정정.
- **`plugins/mccp/scripts/lib/codex-invoke.js`** — 주석 header classification enum에 `parse-error` 추가 → 주석 = §3.3 표 = 실제 생산값 **14종** 동일 집합. 로직 무변경(comment-only).
- **`.claude-plugin/plugin.json`** — `1.20.12 → 1.20.13`. 양 footer(html/markdown) `v1.20.13` + `i18n-surface.test.js` assertion 동기.

### Deferred

- quarantine `releaseLock` **no-token legacy 경로 hardening**(제거 / test-gate)을 `.claude/plans/codex-findings-backlog.md`에 이연 (PRD out-of-scope — Codex F2; P6은 문서만 정정).

## [1.20.12] — 2026-07-08

workflow-orchestration **M3** (verify 네이티브화 — worktree-merge substrate + aggregate adversarial-verify, honest-degradation patch). M3은 PRD의 두 축을 닫되 **정직하게 부분 종료**한다: **(A) verify 네이티브화** — 통합 diff를 worker 밖에서 1회 cross-model(Codex) adversarial review하는 `Step 3.verify` 스테이지를 `/mccp:work`에 **필수 pipeline 스테이지**로 장착(PRD Open Question 1(c)의 척추 답). worker 안(per-worker Implement-Codex) + workflow 외곽(/mccp:pr PR-Codex) 사이의 통합 verify 층으로, per-partition 리뷰가 놓치는 cross-cut 회귀(public API·import graph·shared config)를 test보다 깊은 LLM 판정으로 잡는다. **(B) worktree-merge substrate** — worktree→parent collect/apply/patch-scoped rollback lib + dispatch-cli 서브커맨드를 build + unit-test로 완비. **Task 0 spike honest degradation (DD7)**: git 메커니즘(enumerate·diff·apply·reverse-apply·rollback-safety)은 **합성 실측으로 입증**(agent spawn 0)했으나, live harness 상관(Workflow worktree↔dispatchId)은 **cost hard-ceiling($314.50, critical)으로 미실측** → `merge_strategy=disable-parallel` 유지, 병렬은 계속 gated. **핵심(Codex R1 F2/DD6)**: aggregate verify는 **단일·병렬 양 경로** commit 전 발화하므로, 병렬이 gated여도 verify-네이티브화가 **단일 경로에서 실제 runtime 가치**를 갖는다(Axis A ⊥ Axis B). **Codex R1 4H 흡수**: F1(A2 artifact-격리 미비 → Mechanism 1 primary·A2 금지), F2(verify 양-경로 발화), F3(합성 `<slug>-merged` decision → 실제 gate `mccp-implement-verify` produces-only, non-invasive), F4(광범위 checkout/clean rollback → **patch reverse-apply**만, dirty feature branch data-loss 회피). **DD2 cross-model 불변식**: invoker는 여전히 Codex — "adversarial-verify" 패턴은 worker 밖 독립 검증 구조만 차용, same-model skeptic 치환 아님(dual-review 무손상). plugin.json `1.20.11 → 1.20.12`(degraded patch — verify ship + 병렬 gated) + 양 footer(html/markdown) + i18n-surface 테스트 동기. 신규 회귀 0(implement-dispatch oracle 114 + dispatch-cli 47 + receipt merged-verify 11 green).

### Added

- **`scripts/lib/implement-dispatch/verify.js`** — aggregate adversarial-verify 순수 oracle: `buildVerifyFocus`(통합 cross-partition diff → Codex focus 텍스트) + `decideMergedVerify`(codex json → `converged`→pass / `divergent`·`critical`→HALT / `unavailable`×mode / `skipped` block 판정, `codex-bridge.parseVerdict`/`detectCriticalCategory` 재사용) + `parseMergedVerifyMode`(off/warn/enforce, default enforce loud fail-closed).
- **`scripts/lib/implement-dispatch/worktree-merge.js`** — worktree→parent collect+apply+rollback: `buildWorktreeMap`(dispatchId↔worktree 상관, 누락/중복 fail-closed) · `collectWorkerDiff`(tracked ∪ untracked diff) · `assertPathsClean`(pre-apply clean assert, F4) · `applyDisjointDiffs`(all-or-nothing check→apply + patch 기록) · `rollbackApplied`(patch-scoped `git apply -R`, F4 — 사전 dirty·untracked 보존).
- **`scripts/lib/implement-dispatch/tests/{verify,worktree-merge}.test.js`** — 32 신규 oracle 테스트(verify 20 + worktree-merge 12, real-git 통합 rollback-safety 포함).
- **`scripts/receipt/tests/merged-verify-fields.test.js`** — 11 신규(신규 gate round-trip + merged_verify enum/reject + tamper-protection + non-invasive preflight).
- **`scripts/lib/tests/dispatch-cli.test.js`** — M3 서브커맨드 테스트(collect-worktrees / merge-apply dry-run+apply+rollback / F2 escape / pre-apply-dirty HALT / verify-decide 5-verdict / verify-focus) 추가.

### Changed

- **`scripts/lib/dispatch-cli.js`** — 5 신규 서브커맨드: `collect-worktrees`(worktree map emit, missing/ambiguous fail-closed) · `merge-apply`(F2 subset + pre-apply clean assert + patch 기록) · `rollback-apply`(patch reverse-apply) · `verify-focus` · `verify-decide`.
- **`scripts/receipt/{schema,write,aliases,cli}.js`** — 신규 produces-only gate `mccp-implement-verify`(phase=implement, non-invasive — 어떤 command chain에도 미진입) + present-only `meta.merged_verify_verdict`(enum)/`meta.merged_verify_rounds`(int) + `--merged-verify-verdict`/`--merged-verify-rounds` 플래그. `receipt_hash`에 포함(tamper-protected). migration 불필요.
- **`commands/work.md`** — Step 3.verify 공유 스테이지(모든 implement 경로 commit 전 aggregate verify, DD6 단일 경로 발화) + Step 3.gate-parallel의 broad checkout/clean rollback을 patch reverse-apply(F4)로 교체 + collect-worktrees/merge-apply 배선(활성화 계약, 현행 disable-parallel gated). `MCCP_WORK_MERGED_VERIFY` 축 문서화.
- **`.claude-plugin/plugin.json`** — `1.20.11 → 1.20.12`. 양 footer(html/markdown) `v1.20.12` 동기.
- **`CLAUDE.md`** — §1.4 표 1행(M3) + §4 토글(`MCCP_WORK_MERGED_VERIFY`).

## [1.20.11] — 2026-07-08

worktree gitdir tmp resolve (**재발 부채 종결**, 단일 patch). worktree에서 `.git`은 `gitdir:` 포인터 **파일**이라 리터럴 `.git/mccp/tmp`에 `mkdir -p`하면 `ENOTDIR`로 깨진다(§3.8). `pr.md`·`dashboard-audit.md`·`pr-body.js`는 이미 고쳐졌으나 `work.md`·`resume.md`·`plan.md`·`prp-implement.md`에 잔여 리터럴이 남아 CLAUDE.md §3.8 권장 worktree에서 `/mccp:work`·`/mccp:resume`·`/mccp:plan`·`/mccp:prp-implement`가 깨졌다(CHANGELOG:535 기준 "누적 8+ cycle 반복 결함"). 이번에 mechanical 재발 방지 테스트와 함께 종결한다. **Fix Invariant (Codex F1 흡수)**: 모든 fresh Bash 블록은 `$MCCP_TMP`/`$GITDIR`를 블록 시작부에서 재도출하고, tmp로 write/redirect 하기 **전에 같은 블록에서** `mkdir -p`한다 — shell redirect(`2> "$MCCP_TMP/x"`)는 파일은 만들어도 부모 dir은 못 만들어 clean worktree에서 `No such file or directory`로 실패하고, gate skip/dedupe 경로가 앞선 phase의 mkdir을 우회하면 dir 없는 채 진입할 수 있다. cross-gate dedupe로 Implement-Codex 수렴(plan-codex `converged` 승계). 버전은 #92(1.20.8)·#94(1.20.9)·#95(1.20.10) 순차 점유로 1.20.11 상향(origin/main 위로 rebase).

### Changed

- **`commands/work.md`** — Step 0 Classification 블록의 리터럴 `.git/mccp/tmp`(mkdir + `work-classify.stderr` redirect)를 worktree-safe `GITDIR=$(git rev-parse --git-path mccp/tmp)` + in-block `mkdir`으로 이전. Step 3(prep/W/gate)은 v1.20.7에서 이미 `git rev-parse --git-path mccp/tmp`로 마이그레이션됨.
- **`commands/resume.md`** — Phase 0 DETECT 블록 `mkdir -p .git/mccp/tmp` → `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"` + mkdir (pr.md:404 mirror).
- **`commands/plan.md`** — Phase 5.2 Codex 블록 mkdir + `codex-invoke.stderr` redirect를 block-head `MCCP_TMP` 재도출로 이전.
- **`commands/prp-implement.md`** — Phase 2.5.3 Codex 블록 mkdir + `codex-invoke.stderr` redirect를 `GITDIR=$(git rev-parse --git-dir)`(파일 내 Phase 2.5.5b line 445 패턴 mirror)로 이전. **Phase 7 auto-chain 블록**(분리된 fresh shell)은 Fix Invariant대로 자체 `GITDIR` 재도출 + `mkdir -p "$GITDIR/mccp/tmp"`를 `auto-chain.stderr` redirect 직전에 추가.
- **`.claude-plugin/plugin.json`** — `1.20.10 → 1.20.11`. 양 footer(html/markdown) `v1.20.11` 동기.

### Added

- **`scripts/lib/tests/command-tmp-worktree-safe.test.js`** — 2축 재발 방지. 축 A(static): `commands/*.md` 실행 Bash 라인(mkdir/redirect target)에 리터럴 `.git/mccp/tmp` 부재 assert(화이트리스트: pr.md 설명 주석·산문 `<gitdir>` 표기). 축 B(usability, Codex F1): 실제 임시 worktree를 `git worktree add`로 만들고 gitdir-resolved `mkdir -p "$(git rev-parse --git-dir)/mccp/tmp"` 후 redirect 성공을 실행 대조(`.git`가 file인지 assert로 worktree 확증) — 리터럴 부재만으로 못 잡는 "dir 미생성 redirect" 결함을 실증.

## [1.20.10] — 2026-07-08

workflow-orchestration **M2b** (N-worker parallel implement scaffold, 단일 patch). M2a가 놓은 단일 `Workflow agent()` seam을 `parallel(fleet.map(...))`으로 확장하는 **완전한 병렬 스캐폴드**를 세운다 — partition oracle(서로소 file-set 분할·dependency-aware collapse), fleet budget oracle(`resolveFleet` — `resolveFanout` 미러 + merge_strategy 구조 gate), N-way `mergeVerdicts`(per-worker `deriveVerdict` + fail-closed 집계 + `partition-escape` verdict), `dispatch-cli` fleet 서브커맨드(`prepare-fleet` / fleet `emit-workflow-args` / N-way `reconcile`), Workflow `parallel` seam, work.md Step 3 병렬 wiring. **Task 0 spike 실측**: `isolation:'worktree'` 변경은 parent worktree에 자동 전파되지 않고(별도 디렉토리 + 별도 branch + uncommitted) 오케스트레이터에 worktree collect API가 없음 → **merge_strategy=`disable-parallel`** 확정. 병렬 실행은 안전하게 **N=1로 gate off**(default `MCCP_WORK_IMPLEMENT_PARALLEL=0` + `MCCP_WORK_MERGE_STRATEGY=disable-parallel`)되어 M2a 단일-worker 동작이 무변화로 유지된다 — 활성화는 worktree-merge 입증을 전제로 후속 milestone에 이연. **Codex Plan-R1 2H+2M 흡수**: F1(집계가 merge-back 후 실행 → 부분 적용) → verdict-before-merge 순서 불변식(격리 worktree 결과만으로 판정, parent는 clean → 부분 적용 0). F2(prompt-only disjointness) → 실제-diff subset 강제 + 신규 `partition-escape` verdict + dependency-aware collapse. F3(fallback 미배선) → machine-readable `merge_strategy` flag → `resolveFleet` 소비. F4(merged-diff 미검증) → post-merge integrated `node --test` 게이트(단일 merged-diff adversarial review는 M3 이연, backlog). 자체 IPC 부분 폐기(Workflow가 worker liveness 소유 → heartbeat/reclaim/watcher redundant, envelope는 attribution·reconcile 아티팩트로 존속). plugin.json `1.20.9 → 1.20.10`(#94 audit P5가 1.20.9 선점 → M2b가 그 위로 rebase되며 1.20.10으로 상향; #92 P4는 1.20.8) + 양 footer(html/markdown) + i18n-surface 테스트 동기. dual-review 무손상 · 신규 회귀 0(oracle 120 테스트 green).

### Added
- `plugins/mccp/scripts/lib/implement-dispatch/partition.js` — `partitionPlan` 서로소 partition oracle(union-find + shared-output serialize + maxWorkers cap) + `partitionFromPlanText`(plan markdown → partition 파생).
- `plugins/mccp/scripts/lib/implement-dispatch/budget.js` — `resolveFleet` fleet 비용/merge_strategy oracle(`resolveFanout` 미러).
- `plugins/mccp/scripts/lib/implement-dispatch/tests/{partition,budget}.test.js` — 45 신규 oracle 테스트.

### Changed
- `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` — `mergeVerdicts` N-way fail-closed 집계 + `partition-escape` verdict + `checkPartitionEscape`(`deriveVerdict` 불변).
- `plugins/mccp/scripts/lib/dispatch-cli.js` — `prepare-fleet` + fleet-aware `emit-workflow-args` / N-way `reconcile`(실제-diff subset) + partition-scope worker prompt(단일 경로 back-compat).
- `plugins/mccp/scripts/workflows/implement-dispatch.js` — 단일 `agent()` → `parallel(fleet.map(...))` seam + budget pre-guard + `isolation:'worktree'`(단일 경로 불변).
- `plugins/mccp/commands/work.md` — Step 3.prep-parallel / 3.WP / 3.gate-parallel + `MCCP_WORK_IMPLEMENT_PARALLEL` 하위 축(merge_strategy gated).

## [1.20.9] — 2026-07-08

audit-remediation P5 (receipt_hash tamper-detect 실연결, 단일 patch). `write.js`는 receipt 저장 시 `subject_hash`와 `receipt_hash`를 **둘 다** 봉인하지만 `validate-cmd.js`는 `subject_hash`만 재계산·비교하고 `receipt_hash`는 저장만 될 뿐 검증되지 않았다. `subject_hash`는 `SUBJECT_FIELDS`(task_id/phase/gate_id/plan_hash/…)만 커버하므로 서명 후 `findings`·`resolution`·`meta` 변조(특히 P1이 복구한 dual-review 무결성 필드 `resolution.codex_verdict`)가 탐지되지 않던 gap을 닫는다. `validate-cmd.js`에 `receiptHash()` 재계산·비교를 기존 `subject_hash` 블록 그대로 미러링 — write/validate가 동일 `hash.js#receiptHash()`를 호출하므로 `briefing_*`·`ledger_write_skipped`·self carve-out parity가 구조적으로 보장된다. **Codex R1 F1 흡수**: mismatch를 `stale`이 아닌 `blocking(kind='receipt-tamper')`로 분류 — stale은 `preflight.js`의 "regenerate STALE" 복구 가이드를 받아 변조 receipt를 재생성(덮어쓰기)해 tamper 증거를 소실시키므로, 전용 `TAMPER` 라벨 + 조사 지시(재생성 금지) 복구 라인을 받는다. 게이팅 강도는 stale과 동일(hard+soft 차단, off만 bypass). 신규 `kind:'receipt-tamper'`는 `classify.js`가 tempfail만 특수 처리하므로 일반 blocking(exit 2)으로 취급된다. 현존 `.claude/receipts/` 전수 sweep mismatch=0으로 오탐 부재 경험적 확인. dual-review·receipt chain 무손상. plugin.json `1.20.8 → 1.20.9` + 양 footer(html/markdown) + i18n-surface 테스트 동기(surface drift 0). PRD P2/P3/P4 in-progress drift도 complete로 정합(P5 PR fold).

### Added
- `validate-cmd.js` — subject_hash 블록 직후 `receiptHash()` 재계산·비교. mismatch 시 `result.blocking.push({kind:'receipt-tamper'})` + `continue`. `receiptHash` import 추가.
- `validate-cmd.test.js` — tamper 탐지(findings·`resolution.codex_verdict`·`meta.command`) + subject-우선 회귀 + 오탐 방지(briefing/ledger carve-out·grounding restamp) 6 테스트.
- `preflight.test.js` — tamper-only 시 `TAMPER` 라벨 + 조사 라인 surface + "regenerate STALE" 부재 검증.

### Changed
- `preflight.js` — blocking 라벨에 `receipt-tamper` → `TAMPER` (tempfail 미러) + 전용 복구 라인(재생성 금지·조사 지시, Codex R1 F1).
- `validate-cmd.test.js` — 기존 `meta.advisory` 테스트가 subject_hash만 재서명하던 것을 receipt_hash도 재봉인하도록 정정(정당 advisory receipt 시뮬레이션, tamper 오탐 회피).

## [1.20.8] — 2026-07-08

audit-remediation P4 (dispatch·work-isolation 강건화, **재스코프**). 원 P4 plan(1.20.6 base)은 격리 implement 위임의 `pending` collapse를 `cmdMerge`에 F1(pending-split graceful-degrade) + F2(receipt anchoring 검증)로 닫으려 했으나, 병렬 진행된 **#91(v1.20.7 workflow-orchestration M2a)이 같은 서브시스템을 `deriveVerdict`/`cmdReconcile`(3자 reconcile: return ∧ envelope ∧ store)로 재작성하며 원 P4의 핵심을 이미 대체**했다: (1) pending은 `reconcile-mismatch`로 **fail-closed HALT**(의도적 — Step 3.gate double-worker 위험 차단), (2) anchoring은 `deriveVerdict`의 F3 post-hoc store 검증(marker + 3-flag == expectedAnchor → `unanchored` HALT). `cmdMerge`는 work.md가 `cmdReconcile`로 이관하며 dead-path가 됐다. 따라서 P4를 #91 model 위로 재스코프해 **잔여 additive delta만** 착지: (B#6) `prp-implement.md` Phase 2.5.6 receipt-write exit-code 미표면화(exit 12=`DISPATCH_MARKER_MISSING_FIELDS` 은폐)를 loud surface + Phase 3 EXECUTE 진입 전 hard-stop, (B#13) dispatch-worker 3-flag attribution doc를 `deriveVerdict`/Step 3.gate anchor 검증 참조로 갱신. F1 graceful-degrade는 `/mccp:resume` 복구 경로가 이미 커버 + #91의 fail-closed 의도와 정합하지 않아 폐기(F2는 #91 F3와 완전 중복이라 폐기). #91이 `prp-implement.md`를 미변경했으므로 B#6 hunk는 clean 적용. dual-review·receipt chain 무손상. plugin.json `1.20.7 → 1.20.8` + 양 footer(html/markdown) + i18n-surface 테스트 동기(surface drift 0). PRD P4/P5/P6 cascade 1.20.8/1.20.9/1.20.10 정정(#91=1.20.7 점유 반영).

### Added
- `prp-implement.md` Phase 2.5.6 — `WRITE_EXIT=$?` capture + non-zero면 `[MCCP-GATE-STOP]` surface(exit 12 vs 1 보존) + Phase 3 진입 전 exit (B#6). PreToolUse hook-block과 disjoint(hook 차단 시 node 미실행 → guard 무발화).

### Changed
- `prp-implement.md` Phase 2.5.6 — dispatch-worker 3-flag attribution doc block 추가/정정(B#13). 미forward는 이제 controller Step 3.gate `deriveVerdict` F3가 `unanchored` verdict로 HALT하는 mechanical backstop이 받침(구 서술의 `cmdMerge` 참조 → `deriveVerdict`/Step 3.gate로 갱신).

### Superseded (by #91, v1.20.7)
- 원 P4 F1(`cmdMerge` pending-split) — #91 `deriveVerdict` rule (3)이 pending을 fail-closed `reconcile-mismatch`로 처리. graceful-degrade 폐기.
- 원 P4 F2(`cmdMerge` anchoring 검증) — #91 `deriveVerdict` F3 post-hoc store anchor 검증과 완전 중복. 폐기.

## [1.20.7] — 2026-07-07

workflow-orchestration **M2a** (single-worker Workflow 이전, 단일 patch). `/mccp:work` Step 3의 implement 격리 위임 채널을 `Task`에서 `Workflow` primitive의 `agent()`로 **등가 이전**할 수 있게 한다(병렬화 전 — M2b가 `parallel`로 확장할 seam). 핵심은 회수 판정을 **반환값 ∧ envelope ∧ receipt-store 3자 reconciliation**(`deriveVerdict`)으로 통일한 것으로, 기존 envelope-only `merge`를 Workflow·Task **양 경로**에서 대체한다. **Codex Plan-R1 3 HIGH 흡수**(plan-codex 수렴 cross-gate dedupe): F1(Workflow 호출 후 fallback이 경쟁 worker 생성) → pre-invocation 경계 + `started` 표식 후 fail-closed HALT(두 번째 worker 미생성). F2(반환값 단독 SSoT가 envelope 불일치 통과) → 3자 reconciliation hard gate(status·receipt slug 집합·envelope pending 불일치 시 non-ok HALT). F3(attribution de-anchor로 dual-review 무력화) → post-hoc anchor 검증 gate(marker + 3-플래그 == `expectedAnchor` 아니면 `unanchored` HALT). default-off `MCCP_WORK_IMPLEMENT_WORKFLOW` kill switch로 3-state(인라인 / Task-격리 / Workflow-격리); Workflow 미가용은 fail-open으로 Task 경로 유지. dual-review 무손상 — Implement-Codex는 worker 컨텍스트 불변, receipt 3-플래그 anchor, PR cross-gate dedupe 무변경. plugin.json `1.20.6 → 1.20.7` + 양 footer(html/markdown) 동기.

### Added

- **`scripts/lib/implement-dispatch/result-schema.js`** — `IMPLEMENT_RESULT_SCHEMA`(agent StructuredOutput) + `deriveVerdict({result, envelope, receiptStore, expectedAnchor})` pure oracle. verdict ∈ `ok|failed|invariant-violation|reconcile-mismatch|unanchored|result-unreadable`, first-match fail-closed(invariant-first — F1 leak은 반환값 단독으로 최우선 감지, un-maskable). `tests/result-schema.test.js` 22건.
- **`scripts/workflows/implement-dispatch.js`** — 얇은 Workflow 스크립트(`export const meta` 순수 리터럴 + 단일 `agent(workerPrompt, {agentType, schema})` → `{result, dispatchId}`). 샌드박스 `require` 부재로 `IMPLEMENT_RESULT_SCHEMA` self-contained 포트. `parallel`/`isolation` 미사용(M2a 단일).

### Changed

- **`scripts/lib/dispatch-cli.js`** — `buildImplementWorkerBasePrompt`에 structured 반환 계약 추가(envelope mark 병존). 신규 `emit-workflow-args`(prepare 결과 → Workflow `args` + `expectedAnchor` 재-emit) + `reconcile`(통합 F1/F2/F3 게이트, Workflow `--result-file` / Task `--from-envelope` 자동 판별) 서브커맨드. `tests/dispatch-cli.test.js` 회귀 그린 + 신규 케이스(총 29건).
- **`commands/work.md`** — Step 3를 3-state로 재구성(3.prep 공유 / 3.route pre-invocation 경계 / 3.W Workflow 경로 + started 표식 / 3.I Task 경로 / 3.gate 통합 reconcile). 모든 tmp 경로 worktree-safe `git rev-parse --git-path`(§3.9 — `.git/` hardcode 제거). `allowed-tools`에 `Workflow` 추가.
- **`.claude-plugin/plugin.json`** — `1.20.6 → 1.20.7`. PRD Delivery Milestones: M1 `in-progress → complete`(PR #87 머지 stale 정정), M2 `pending → in-progress`.

## [1.20.6] — 2026-07-07

audit-remediation P3 (atomic-lock PID-reuse race, PRD `audit-remediation-followup` milestone 3/5). holder crash 후 OS가 그 PID를 무관한 프로세스에 재사용하면 `tryReclaimStaleLock`의 same-host 분기가 `isPidAlive`만 검사해 재사용 PID를 live holder로 오판 → mtime과 무관하게 NEVER reclaim → lock이 재사용 프로세스 종료까지 stuck(B#2, HIGH). 동일 버그가 **5개 lock 구현에 복제**되어 있었다. same-host 분기에 mtime-freshness를 tiebreaker로 결합: `alive PID + fresh mtime`만 보호하고 `alive PID + stale mtime`은 재사용 imposter로 간주해 reclaim. live holder는 문서화된 heartbeat(§3.6)가 mtime을 fresh하게 유지하므로 계속 보호된다. 이 변경은 R6-F2가 도입한 "same-host+alive → mtime 무관 보호" 계약을 의도적으로 뒤집으며, CLAUDE.md §3.6이 이미 문서화한 `(PID dead) OR (mtime > TTL)` 정책에 코드를 **재정합**시킨다. **Codex Plan-R1 3 finding 흡수**: F1(HIGH) heartbeat 없는 lock에 blanket 적용 시 느린-정상 holder를 imposter로 오인 reclaim 위험 → "Lock heartbeat 분류" 표 + Task 5 GATING으로 heartbeat-tier별 처리(renderer/trigger는 holder≪lease 입증 + live+fresh→protect 회귀로 criterion ii 적용, 제외 0건). F2(HIGH) caller pre-gate(pr-phase-guard `!isPidAlive` + cmdDetectStale `same-host-live-pid` early-return)가 tiebreaker 우회 → 필수 제거·위임(goal/ultracode cmdDetectStale 동형 전수 조정). F3(MEDIUM) heartbeat 독립성 → Task 5 분류가 per-lock file:line 근거로 gating. plugin.json `1.20.5 → 1.20.6` + 양 footer(html/markdown) + i18n-surface 테스트 동기(surface drift 0). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0) — codex_verdict 미stamp라 PR-Codex가 실제 diff 재검토.

### Fixed
- **B#2** atomic-lock PID-reuse race — `pr-phase-lock`/`quarantine`/`goal-phase-lock`/`ultracode-phase-lock`/`renderer/trigger` 5개 lock의 same-host reclaim 분기에 `&& !mtimeStale` tiebreaker 결합(`alive PID + stale mtime` = PID-reuse imposter → reclaim, `alive PID + fresh mtime` = live holder → protect).
- **B#2 caller** `pr-phase-guard.js` `sameHost && !isPidAlive` pre-gate 제거 → `tryReclaimStaleLock` 위임(imposter를 hook 경로에서 reclaim). `pr-phase-lock`/`goal`/`ultracode` `cmdDetectStale`의 `same-host-live-pid` early-return을 alive+mtime 조합(`same-host-live-pid-fresh` protect / `same-host-stale-imposter` reclaim)으로 교체.

### Changed
- lock 주석 블록 5곳을 새 tiebreaker 정책(§3.6 정합)으로 정정. `dispatch-controller`(3×TTL 완화책 기보유)·`session-ledger`(자체 PID-reuse guard)는 이미 안전해 스코프 제외.
- 회귀 테스트 5개 lock 파일 + `pr-phase-guard`에 `alive+fresh→protect` / `alive+stale→reclaim(imposter)` / `dead→reclaim` / `cross-host→mtime-only` 계약 커버(R6-F2 test (a) 계약 갱신 포함).

## [1.20.5] — 2026-07-06

audit-remediation P2 (session-continuity silent-failure, PRD `audit-remediation-followup` milestone 1/5). hook 레이어가 SessionEnd `.end` marker를 조용히 누락하던 root cause를 **fail-loud-open**으로 닫는다. `session-end-trace.js`가 hook-trace 모듈 로드 실패 시 marker 없이 return하던 결함(B#4, 30+ 세션 누락의 근본원인)을 hook-trace 독립 `writeDegradedEndMarker`(fs 직접 write + sessionId path-token self-검증)로 보장하고, `markSessionEndResilient`가 main/runSync 양 경로에서 폴백 + loud stderr로 관측화(B#5). `session-end-marker.js` 중첩 catch도 wholesale 실패 시 degraded marker 시도. `session-end.js`(Stop per-turn)가 idle 대화 세션 lease를 `renewLease`로 heartbeat해 `LEASE_LIVE_MS(10분)` false crash 방지(B#10). `loop-counter.js`/`state-writer.js` `tryAcquire`의 fd 누수를 try/finally로 차단(B#17). CLAUDE.md §3.2 state-lock "atomic"→"advisory" 문서 정정(B#16). **Codex Implement-R1 2 finding 흡수**: F1(HIGH) Stop heartbeat가 `process.cwd()` 대신 event.cwd/session_id 사용(multi-worktree no-op 방지). F2(MEDIUM) degraded marker가 `<sid>.lease`도 release해 evictLRU 24h stuck 방지. plugin.json `1.20.4 → 1.20.5` + 양 footer(html/markdown) 동기. 게이트: Implement-Codex cross-gate dedupe(plan-codex D1-D5 수렴, 새 implement-time 결정 0) — codex_verdict 미stamp라 PR-Codex가 실제 diff 재검토.

### Added
- `session-end-trace.js` — `writeDegradedEndMarker(repoRoot, sessionId)` (hook-trace 독립 `.end` marker + lease release, fail-open) + `markSessionEndResilient(repoRoot, sessionId, ht)` (ht 폴백 + loud stderr) export.

### Fixed
- **B#4** SessionEnd marker silent-failure — hook-trace 로드 실패 시 degraded marker 보장 (`.end` 존재로 crash-alert 억제).
- **B#5** 실패 은폐 — `session-end-trace`/`session-end-marker`가 degraded 경로를 loud stderr로 표면화 (generic `run-with-flags` runner는 fail-open 계약 보존).
- **B#10** idle 대화 세션 false crash — `session-end.js` Stop per-turn `renewLease` heartbeat (event.cwd/session_id).
- **B#17** `loop-counter.js`/`state-writer.js` `tryAcquire` fd 누수 — write/close try/finally.

### Changed
- **B#16** CLAUDE.md §3.2 — STATE.md state-lock "atomic lock" → "advisory lock (fail-soft ~1s, last-writer-wins)" 문서 정정.

## [1.20.4] — 2026-07-05

workflow-orchestration M1 (plan fan-out MVP, 단일 patch). `/mccp:plan`의 GROUND(Pattern Grounding)를 **read-only 다관점 병렬 fan-out**으로 강화한다 — architect/security/test/explorer 4관점을 **전용 read-only agent**(`fanout-*`, tools: Read/Grep/Glob)로 `Workflow` primitive `agent()`에 병렬 spawn → pure 스크립트가 synthesize → plan body에 `## Multi-Perspective Fan-out` 섹션 주입. write/edit/bash **도구 부재**로 파일 변형·receipt write가 구조적으로 불가 → 기존 Codex dual-review·receipt chain은 무손상이며(fan-out 결과는 `plan_hash`에 포함돼 review됨), PRD "receipt attribution" Open Question은 M1에서 발생하지 않아 M2로 자연 이연. **Codex Plan-R1 3 finding 흡수**: F1(HIGH) read-only 미강제(`security-reviewer`/`tdd-guide`가 write-capable) → 전용 read-only agent 도구 부재로 mechanical 강제. F2(HIGH) budget hard ceiling 미강제(`budget`은 read-only라 설정 불가) → 정직 재서술: fleetSize 고정+`effort:'low'` 구조적 상한 + `budget.remaining()` 사전 skip + cost-state 없으면 skip(고비용 fail-closed) + `shouldSkipForBudget` smoke. F3(MEDIUM) command-body가 opt-in 아님 → `MCCP_PLAN_FANOUT` default off 명시 opt-in + CLAUDE.md 별도 문서화. 비용: default-off + cost-tier autoDisable(notice+) + fleetSize 4 고정. Workflow 샌드박스에 `require` 부재 → workflow 스크립트는 oracle의 self-contained 포트(oracle 3종은 tested reference + `budget.resolveFanout`은 caller-side 게이트로 실사용). plugin.json `1.20.2 → 1.20.4` + 양 footer(html/markdown) 동기(surface drift 0). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0).

### Added

- **`scripts/lib/plan-fanout/{perspectives,budget,synthesize}.js`** — pure/dep-free oracle 3종. perspectives(4 read-only agent 카탈로그 + `PERSPECTIVE_SCHEMA` + `buildPerspectivePrompt`), budget(`parseFanoutMode` default-off + `resolveFanout` mode×PRD×cost-tier 결정트리 + `shouldSkipForBudget` 예산 predicate, briefing/cost-guard mirror), synthesize(관점 결과 → severity-ranked `## Multi-Perspective Fan-out` 마크다운, 부분/전부-null fallback sentinel). 각 `tests/*.test.js` 총 31건.
- **`scripts/workflows/plan-fanout.js`** — Workflow 스크립트(`export const meta` 순수 리터럴 + budget 사전 가드 + `parallel` fan-out + synthesize). 샌드박스 `require` 부재로 oracle의 self-contained 포트(catalog/prompt/schema/synthesize).
- **`agents/fanout-{architect,security,test,explorer}.md`** — 4 전용 read-only agent(`tools: [Read, Grep, Glob]`, Prompt Defense Baseline mirror). write/edit/bash 부재 = read-only mechanical 강제(Codex F1).

### Changed

- **`commands/plan.md`** — Pattern Grounding 뒤 `## Phase 2.5 — MULTI-PERSPECTIVE FAN-OUT` 추가(resolveFanout run/skip 오라클 → Workflow 호출 지시 → markdown 주입 or 인라인 fallback, fail-open).
- **`.claude-plugin/plugin.json`** — `1.20.2 → 1.20.4`.
- **`scripts/lib/renderer/{html,markdown}.js`** — footer version `v1.20.2 → v1.20.4` 동기(§3.7 surface drift 0).
- **`CLAUDE.md`** — §1.4 표 1행(plan fan-out) + §4 `MCCP_PLAN_FANOUT`/`MCCP_PLAN_FANOUT_BUDGET`/`MCCP_PLAN_FANOUT_AUTODISABLE_TIER` 토글.
- **`.claude/prds/workflow-orchestration.prd.md`** — Delivery Milestones M1 `pending → in-progress` + Plan cell(`/mccp:plan`이 생성 시 기록).

## [1.20.3] — 2026-07-05

P1 — Codex dual-review 무결성 복구 (cross-gate dedupe false-skip, 단일 patch). cross-gate dedupe가 PR-step Codex를 skip할지 결정할 때 실제 Codex verdict가 아니라 receipt-write 시 **항상 `true`로 default되는 `resolution.converged`**를 검사하던 결함을 닫는다. plan/implement Codex가 divergent(non-critical) 판정을 내려도 양쪽 receipt에 `converged=true`가 기록되어 PR-Codex가 조용히 skip되고 dual-review invariant가 무력화되던 경로였다. **설계 결정 Option B(fail-closed)**: `converged`를 재사용하지 않고 신규 필드 `resolution.codex_verdict`(enum `converged|divergent|critical|unavailable|skipped`)를 추가한다 — `converged`("작성자가 findings 처리를 확정")와 "Codex가 approve했다"의 의미를 분리(B#11). dedupe skip 조건은 이제 `residual empty` **AND** plan-codex `codex_verdict==='converged'` **AND** implement-codex `codex_verdict==='converged'`; 어느 하나라도 미충족(구 receipt의 필드 부재 포함)이면 fail-closed로 skip 안 함(= PR-Codex 실행). 무테스트였던 `evaluateForDedupe`에 회귀 테스트 6건 신설. **Codex Plan-R1 2 HIGH 흡수**: F1 stale `CODEX_DEDUPE_AT_PR` env 우회(`pr.md` Phase 2.5.2 진입 시 hard-reset + 현재 `skip_safe===true`에서만 재-export) · F2 design-critique `$VERDICT` 변수 재사용 위험(command body가 `$CODEX_VERDICT` **전용 변수**로 도출, 재사용 금지). receipt_hash 봉인: `codex_verdict`는 `resolution`에 들어가 subject_hash(정체성) 불변 + receipt_hash 자동 봉인, 구 receipt는 필드 부재로 bit-identical. plugin.json `1.20.2 → 1.20.3` + 양 footer(html/markdown) + i18n 스냅샷 테스트 동기.

### Added

- **`scripts/receipt/tests/dedupe.test.js`** — `evaluateForDedupe` 회귀 6건(무테스트 critical 경로): `codexConverged` fail-closed(legacy `converged=true`가 verdict 부재 시 converged 아님) · 양쪽 converged + residual 없음 → skip_safe=true · 한쪽 divergent → false · 한쪽 codex_verdict 부재 → false(fail-closed) · plan receipt 부재 → false · residual 존재 → false. `buildReceipt`+`writeReceipt`로 write→read→dedupe 전체 경로 실증.
- **`scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js`** — `codex_outcome → codex_verdict` 매핑 테스트(invoked→converged, disabled/skipped/deduped→skipped, unknown→forward 없음).

### Changed

- **`scripts/receipt/schema.js`** — `resolution.codex_verdict` optional enum 추가(present-only, 부재 허용). `CODEX_VERDICT_VALUES` export.
- **`scripts/receipt/write.js`** — `--codex-verdict` 인자 수용 → resolution에 반영(미전달 시 필드 omit → fail-closed). receipt_hash 봉인 경로 유지.
- **`scripts/receipt/dedupe.js`** — `evaluateForDedupe` convergence 검사를 `codex_verdict==='converged'` 기반 fail-closed로 변경(`codexConverged` helper 신설). convergence 블록이 raw `codex_verdict`도 노출.
- **`scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `deriveCodexFlags`가 `codex_outcome`→`--codex-verdict` forward(PR-codex receipt audit 완결성).
- **`scripts/receipt/cli.js`** — `write` help에 `--codex-verdict` 노출.
- **`commands/plan.md`** + **`commands/prp-implement.md`** — Codex invoke 뒤 `$CODEX_VERDICT` 전용 변수 도출(codex-bridge.parseVerdict, disabled→skipped/advisory→unavailable) + receipt-write에 `--codex-verdict` forward(design-critique `$RECEIPT_VERDICT`와 분리).
- **`commands/pr.md`** — Phase 2.5.2 진입 시 stale `CODEX_DEDUPE_AT_PR` hard-reset(unset) + 현재 `skip_safe===true`에서만 재-export(Codex R1 F1). convergence 설명을 codex_verdict 기준으로 갱신.
- **`.claude-plugin/plugin.json`** — `1.20.2 → 1.20.3`.
- **`scripts/lib/renderer/{html,markdown}.js`** + **`tests/i18n-surface.test.js`** — footer version `v1.20.2 → v1.20.3` 동기(surface drift 0).

## [1.20.2] — 2026-07-04

work-context-isolation M1 (implement 스텝 격리 위임, 단일 patch). `/mccp:work` Step 3의 인라인 `Skill(mccp:prp-implement)` 호출을 **격리된 단일 worker `Agent` 위임**으로 교체한다 — worker가 파일 탐색·edit·validate 루프·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고, 메인(controller) 세션은 envelope 요약(변경 파일·receipt path·verdict)만 회수해 메인 피크 컨텍스트를 얇게 유지한다(implement 스텝의 최대 컨텍스트 누적원 격리). 메커니즘은 신규 발명이 아니라 dispatch-controller substrate(v1.2.0-m1 — `prepareDispatch`/`mergeEnvelopes`/envelope schema/3-flag attribution)를 single-worker로 재사용. Task 0 spike로 self-contained worker prompt를 실증(subagent가 nested `Skill(mccp:prp-implement)`에 의존하지 않고 자기 Bash로 게이트/receipt/envelope 계약을 구동 — 위임 shape `prepare→Agent→merge` 불변). **Codex Plan-R1 3 finding 흡수**: F1(HIGH) worker의 Phase 7 auto-chain이 격리 안에서 commit/PR → 되돌릴 수 없는 external state change → worker prompt commit/PR 금지 guardrail + merge가 `mccp-pr-codex` receipt 유입 시 `invariant-violation` HALT. F2(HIGH) 동기 단일 worker가 15분 초과 시 다른 validate-cmd가 envelope stale-reclaim → 성공 FS + 실패 envelope 짝남 → `skipHeartbeat:true`로 heartbeat 미생성(reclaim 대상 제외, orphan 없음). F3(MEDIUM) 절대 envelope path를 `--ipc-envelope-path`로 forward 시 receipt schema(`ENVELOPE_PATH_RE`) fail-closed → repo-relative `ipcEnvelopePath` 별도 emit + receipt write→validate round-trip 테스트. `MCCP_WORK_ISOLATE_IMPLEMENT=0` kill switch(인라인 fallback) + prepare 실패 시 자동 fallback. standalone `/mccp:prp-implement`엔 미적용(격리 locus는 work.md 오케스트레이터 한정). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0). plugin.json `1.20.1 → 1.20.2` patch bump + 양 footer(html/markdown) + i18n 스냅샷 테스트 동기(version drift 0).

### Added

- **`scripts/lib/dispatch-cli.js`** — dispatch-controller lib의 thin CLI wrapper. `prepare-single`(1-worker `prepareDispatch` + self-contained implement worker prompt, 절대 `envelopePath`(로컬 read) + repo-relative `ipcEnvelopePath`(receipt flag) 별도 emit, `skipHeartbeat:true`) · `merge`(terminal envelope read + `mergeEnvelopes([env])` → `{verdict, receiptsAdded, findings, failedWorkers, invariantViolations}`, F1 `mccp-pr-codex` receipt 유입 감지) · `mark`(worker-side envelope 전이 — `dispatch-envelope.markStatus` thin passthrough).
- **`scripts/lib/tests/dispatch-cli.test.js`** — 18건: parseFlags 미러, F3 repo-relative ipc path의 `ENVELOPE_PATH_RE` 정합 + 절대경로 거부, prepare-single dry-run/live, F2 no-heartbeat→reclaimStale 무반응, mark/merge verdict enum, F1 invariant-violation, F3 receipt write→validate round-trip(git 샌드박스 + `MCCP_DISPATCH_CONTEXT=1`, repo-relative accept / absolute fail-closed).

### Changed

- **`commands/work.md`** — Step 3 재작성(인라인 Skill → prepare-single→Task→merge 격리 위임) + frontmatter `allowed-tools`에 `Task` 추가 + `MCCP_WORK_ISOLATE_IMPLEMENT` kill switch + `next-step` HALT preflight 보존 + merge `verdict != ok`(특히 `invariant-violation`) HARD halt Forbidden 항목.
- **`.claude-plugin/plugin.json`** — `1.20.1 → 1.20.2`.
- **`scripts/lib/renderer/{html,markdown}.js`** + **`tests/i18n-surface.test.js`** — footer version `v1.20.1 → v1.20.2` 동기(surface drift 0).
- **`.gitignore`** — `.claude/state/dispatches/`(envelope IPC working-tree 상태) 제외 추가.
- **`CLAUDE.md`** — §1.4 게이트 표 work implement isolation 1행 + §4 `MCCP_WORK_ISOLATE_IMPLEMENT` 토글.

## [1.20.1] — 2026-07-02

dashboard-audit enumerate scope·정렬 근본 결함 수정 (단일 patch). `stale-audit/enumerate.js` 의 두 결함을 닫는다: (1) 정렬 `kindRank[kind] || 9` 가 milestone rank `0` 을 falsy 단락으로 `9` 로 뒤집어 in-progress 마일스톤(가장 stale 한 은퇴 후보)을 리스트 맨 뒤로 밀던 버그 → nullish `?? 9` 로 rank 0 보존, (2) enumerate scope 가 `derive/sources/plans.js` 미표시 디렉토리(`.claude/PRPs/plans/completed/`)를 superset 으로 포함해 대시보드에 뜨지 않는 무효 항목을 audit 대상 앞쪽에 채우던 scope drift → derive `PLAN_DIRS`(SSoT) 를 그대로 재사용해 `enumerate == derive scope` 로 정합. 두 결함이 겹쳐 audit 이 "대시보드에 실제로 뜨는 항목"을 올바른 우선순위로 노출하지 못했다(증상: 위험 해결 마크가 대시보드에 반영 안 됨 — completed/ 오탐 소스). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0). plugin.json `1.20.0 → 1.20.1` patch bump + 양 footer(html/markdown) + i18n 스냅샷 테스트 동기(version drift 0).

### Fixed

- **`scripts/lib/stale-audit/enumerate.js`** — 정렬 comparator `kindRank` lookup 을 `|| 9` → `?? 9` (양변). milestone(rank 0)이 unknown-kind fallback `9` 로 뒤집히지 않고 맨 앞 유지. enumerate scope 를 `require('../../derive/sources/plans').PLAN_DIRS` 로 단순화 — completed/ 아카이브 concat 제거(derive 미표시 → 마킹 무효). 주석을 "audit 대상 = 대시보드 표시 항목(derive scope SSoT)" 로 정정.

### Added

- **`scripts/lib/stale-audit/tests/enumerate.test.js`** — 회귀 2건: (a) in-progress 마일스톤이 risk/oq 보다 앞(정렬 nullish), (b) `.claude/PRPs/plans/completed/` fixture 가 enumerate 에 안 잡힘(scope 정합).

## [1.20.0] — 2026-07-01

dashboard-readability M3 (PRD 마지막 milestone → minor) — 판정 어휘 사용자 친화화. 대시보드 전 섹션에 흩어진 dual-review 판정 라벨을 사용자 친화 어휘로 일관 치환한다: `수렴→통과`, `진행→진행 중`, `divergent`/`미수렴→보류`. HIGH 리스크(사용자 노출 site 일부 누락)를 막기 위해 세 어휘를 단일 소스 모듈(`parsers/verdict-label.js`, `VERDICT` frozen 맵)로 뽑아 5개 렌더 파일(`sections/pipeline.js` · `sections/audit-timeline.js` · `sections/status-grid.js` · `parsers/drawer-detail.js` · `parsers/next-action.js`)이 이를 소비하게 하고, 렌더 출력(`r.md`/visible `r.html`)의 잔여 `수렴`/`미수렴`/`divergent` 0 을 강제하는 metric 테스트를 추가한다. 아이콘(✓/◐/⚠)·톤(low/med/high)·CSS class·decision-state enum(`converged`/`blocked`)은 불변(코드값 변경 없음, PRD Design Direction — 텍스트 라벨 스왑만). `next-action.js` 는 plan-frontier description 의 모순 어휘(`plan 게이트 수렴 진행 중`)도 `plan 게이트 진행 중`으로 정정. **Codex R1 2 finding 흡수**: F1(HIGH, ACCEPT_NOW) — metric 이 `<script>` 전부 strip 하면 사용자-클릭 드로어 데이터(`<script type="application/json" id="drawer-data">`)의 stale 어휘가 grep 전에 제거돼 false-negative → Task 8 재설계로 흡수(application/json 보존 + `#drawer-data` JSON 파싱해 receipt/worktree verdict 필드 직접 단언 + 드로어 detail fixture). F2(MEDIUM, DEFER_TO_BACKLOG) — renderer-only audit 이 비-대시보드 emitter(`state/fix-task.js:63`·`hooks/stop-review-loop.js:357` 의 `Codex divergent`) 누락 → PRD scope=대시보드(renderer) 명시 한정 + backlog 이월. 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, 새 implement-time 결정 0) · design silent-skip(produced diff 가 렌더러 `.js` 소스 = control-plane, 렌더 출력은 gitignore). plugin.json `1.19.2 → 1.20.0` minor bump + 양 footer + 스냅샷/metric 테스트 동기(version drift 0).

### Added

- **`scripts/lib/renderer/parsers/verdict-label.js`** — 판정 어휘 SSoT. `VERDICT = Object.freeze({ PASS:'통과', IN_PROGRESS:'진행 중', HOLD:'보류' })` + 내부 enum(`converged`/`active`/`divergent`/`blocked`)→라벨 매핑 헤더 주석. 5개 렌더 파일이 유일 소비처.
- **`scripts/lib/renderer/tests/verdict-label.test.js`** — (a) VERDICT 값 단위 + (b) `buildReceiptDetail`/`buildWorktreeDetail` verdict 필드 직접 단언(false-negative 차단) + (c) 통제 model `renderStatus` metric(`r.md` 구 어휘 0 + 신 어휘 present) + (d) F1 — `r.html` style/실행 script strip 후 `#drawer-data` 보존 + JSON 파싱해 receipt/worktree verdict 필드 새 어휘 단언.

### Changed

- **`scripts/lib/renderer/sections/pipeline.js`** — `NODE_MARK.done`/`converged-frontier` label → `VERDICT.PASS`, `.active` → `VERDICT.IN_PROGRESS`, `STAGE_CONVERGED`(계획/구현/PR 통과) + 게이트 통과 fallback 을 `VERDICT` 참조로. foot-stat `진행`(완료/차단 병렬 count 라벨)은 판정 어휘 아님 → 불변.
- **`scripts/lib/renderer/sections/audit-timeline.js`** — conv 3분기(blocked→`VERDICT.HOLD`, converged→`VERDICT.PASS R{n}`, else→`VERDICT.IN_PROGRESS R{n}`) + `mdMark`(⚠ 보류) + sr-only(보류). `convText`→`buildReceiptDetail` 전달로 드로어 `판정` 행 자동 정합.
- **`scripts/lib/renderer/parsers/drawer-detail.js`** — `buildReceiptDetail` 기본 conv + `buildWorktreeDetail` 게이트 행 `(미수렴)/(수렴)` → `(보류)/(통과)` 를 `VERDICT` 참조로.
- **`scripts/lib/renderer/parsers/next-action.js`** — blocked prose/description(`Codex 미수렴` → `Codex 보류`) + plan-frontier description 모순 어휘 제거(`plan 게이트 수렴 진행 중` → `plan 게이트 진행 중`).
- **`scripts/lib/renderer/sections/status-grid.js`** — 차단 셀 툴팁 `미수렴` → `보류`(`VERDICT.HOLD`).
- **`scripts/lib/renderer/html.js`** — emit 되는 `<style>` CSS 주석 `게이트 수렴했으나` → `게이트 통과했으나`(full-HTML grep 오염 제거) + footer `v1.19.2 → v1.20.0`.
- **`scripts/lib/renderer/markdown.js`** — derived 줄 footer `v1.19.2 → v1.20.0` 동기.
- **`scripts/lib/renderer/tests/{pipeline,timeline-chart,i18n-surface,drawer,markdown-equivalence}.test.js`** — 렌더 라벨 단언 새 어휘로 갱신(`구현/계획 수렴`→`통과`, `수렴 R1`→`통과 R1`, `진행 R1`→`진행 중 R1`, `divergent`→`보류`, footer 버전 4곳). briefing_summary/요약 receipt 데이터 문자열은 유지(라벨 아님).
- **`plugins/mccp/.claude-plugin/plugin.json`** — `version` `1.19.2` → `1.20.0`(§3.7 PRD 마지막 milestone minor bump).

## [1.19.2] — 2026-06-30

dashboard-readability M2 — 위험·질문 리스트 평탄화 + 출처/시각 메타. 위험·질문 패널을 PRD 그룹 chrome(`<details class="prd-group">`) 없이 **전체 평탄 `<ul class="stack-list">`** 로 렌더해, 사용자가 켠 정렬(위험도순·시간순)이 그룹 경계에 가리지 않게 한다. 그룹용 "모두 펼치기/접기" 토글을 제거하고, 각 항목 **상단**에 출처 plan 문서명(작은 회색 `.meta-cue`/`.mono`) + 출처 plan 의 최근 활동 시각(사람이 읽기 쉬운 형식, >60일은 절대일자)을 표시한다. 필터(PRD/plan)·정렬·탭(미해결/해결됨/보관됨) 축은 전부 보존 — `data-prd`/`data-plan`/`data-sev`/`data-ord` 속성 유지, `groupByPrd` 는 filterOptions 수집 전용으로만 잔존. **Codex R1 2 finding 흡수**: F1(HIGH) — flat 렌더를 `groupByPrd` 버킷 순서에서 flatten 하면 earlier-PRD low-sev 가 later-PRD CRITICAL 앞에 와 전역 severity 순서가 깨짐 → 이미 `bySev` 정렬된 `active`/`resolved`/`historical` 배열에서 *직접* 방출 + `prdKeyFor` per-item lookup. F2(MED) — 공유 `formatRelativeTime` 절대일자화가 무관 시각 표면을 변동 → opt-in `{absoluteAfterDays}` 파라미터로 default byte-identical(기존 caller blast radius 0) + threaded `now` 결정성. 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴) · design silent-skip(produced diff 가 렌더러 `.js` 소스 = control-plane, 렌더 출력은 gitignore). plugin.json `1.19.1 → 1.19.2` patch bump + 양 footer + 스냅샷 테스트 동기(version drift 0).

### Added

- **`scripts/lib/renderer/parsers/prd-group.js`** — `prdKeyFor(item, planPrd)` + `prdMetaFor(item, planPrd)` 단일-item export(`groupByPrd` 의 per-item 분기 로직 추출, DRY). flat 렌더가 각 항목 `data-prd` 부여 + filterOptions 수집에 재사용(Codex F1).
- **`scripts/lib/renderer/parsers/plan-body.js`** — `planActivity` Map(canonicalPlanPath → lastActivityMs, **전 plan**) 빌드 + `parsePlanBody` return 추가(현 `lastActivityMs` 는 in-progress staleness 에만 쓰고 버려짐). `planPrd` loop 동형.
- **`scripts/lib/renderer/tests/risks-source-time.test.js`** — 위험 항목 출처 라벨 + 시각 + flat 구조(no `prd-group`) + **cross-PRD 정렬 보존**(Codex F1, html·md 양쪽) 단언.

### Changed

- **`scripts/lib/renderer/format-utils.js`** — `formatRelativeTime(isoOrDate, now, opts)` opt-in `opts.absoluteAfterDays` bin(같은 연도 `M월 D일`, 다른 연도 `YYYY년 M월 D일`). opts 미전달 시 `N일 전` 경로 byte-identical(blast radius 0).
- **`scripts/lib/renderer/sections/risks.js` · `open-questions.js`** — 그룹 chrome 제거 → 항상 flat `<ul>`(html·md). 항목 상단 출처+시각 meta-cue(OQ `metaCueParts` 동형). `opts` 인자 수용(now 결정성). `groupByPrd` 는 filterOptions 전용.
- **`scripts/lib/renderer/index.js`** — `renderRisks`/`renderOpenQuestions` 호출에 `opts` 전달(now thread).
- **`scripts/lib/renderer/client/explore.js`** — "모두 펼치기/접기" 토글 블록 + `.prd-group` 의존 dead 머신(`refreshGroups`/`ex-first-visible`/`prd-count` 갱신) 제거. 정렬은 단일 `.stack-list` 전체 적용. 탭 카운트/빈상태/정렬/검색/세션 바 보존.
- **`scripts/lib/renderer/html.js`** — emit-gate dead `hasPrdGroups`(now-always-false) 제거(`.li-item`/explore-bar/session-bar 축이 gate 유지). `.prd-group`/`.prd-sum`/`.prd-label`/`.prd-count`/`.prd-toggle`/`.ex-first-visible` CSS dead rule 제거. footer `v1.19.1 → v1.19.2`.
- **`scripts/lib/renderer/markdown.js`** — derived 줄 footer `v1.19.1 → v1.19.2` 동기.
- **`plugins/mccp/.claude-plugin/plugin.json`** — `version` `1.19.1` → `1.19.2`(§3.7 milestone PR patch bump).

## [1.19.1] — 2026-06-30

dashboard-readability M1 — codex adversarial review timeout 근거 확정 + 문서 정정. codex-invoke 기본 timeout 이 "2분"이라는 의심을 코드 대조로 종결: 실제 `DEFAULT_TIMEOUT_MS = 900_000`(15분, `codex-invoke.js:54` + 근거 주석 47–53)이고 프로덕션 기본/call-site 어디에도 120s/2분 값은 없다(유일한 `120000` 매칭은 `codex-invoke.test.js:367` parseCliArgs flag-보존 픽스처 — 기본값 아님). 따라서 **codex timeout 동작 코드 변경 0**. 실제와 어긋난 표면은 `CLAUDE.md` §3.3 fail-closed classification 표의 `timeout` 행("90s 초과")뿐 → 코드(900s/15분)와 일치하도록 한 줄 정정. render-lock "90s"(`CLAUDE.md` 126/654)·lock-reclaim "90s" mtime 은 codex-timeout 과 무관하므로 보존. §3.7 milestone PR 관행에 따라 `plugin.json` `1.19.0 → 1.19.1` patch bump + 양 footer + 스냅샷 테스트 동기(version drift 0). 게이트: Implement-Codex cross-gate dedupe(plan-codex 수렴, doc-only 변경) · design silent-skip(rendered UI surface 부재).

### Changed

- **`CLAUDE.md` §3.3** — fail-closed classification 표 `timeout` 행 원인 셀 `90s 초과` → `900s(15분) 초과`. 코드 상수 `DEFAULT_TIMEOUT_MS = 900_000` 과 일치. 다른 셀/행 불변.
- **`plugins/mccp/.claude-plugin/plugin.json`** — `version` `1.19.0` → `1.19.1` (§3.7 milestone PR patch bump).
- **footer 동기** — `renderer/html.js`(page-foot) + `renderer/markdown.js`(derived 줄) `v1.19.0` → `v1.19.1`. `renderer/tests/i18n-surface.test.js` footer 스냅샷 테스트 동반 갱신.

## [1.19.0] — 2026-06-30

dashboard-interactivity M4 — 대시보드 액션 버튼(obsolete 닫힌 루프, **안 F mode-gated**). PRD 마지막 milestone → 닫힌 루프 완성 → minor. 드로어 위험/질문을 **"제외(obsolete)"** 버튼으로 직접 처리해 소스 `.md` 에 비파괴 해결 마커를 기록하고 렌더가 collapse 하는 act-loop 을 추가한다. 단 서버를 영구 writer 로 만들지 않는다 — POST 라우트는 기본 **미존재**이고 `/mccp:dashboard --write` 로 띄운 프로세스 수명 동안만 활성(평상시 read-only 불변). (1) **item-id SSoT**(`stale-audit/item-id.js`) — ref→opaque 16자 id(sha256 of kind+source+anchor+norm(text)), 렌더러(embed)와 서버(re-enumerate)가 공유. source separator 정규화(win32 backslash ↔ enumerate forward-slash 합치) + anchor 는 oq=lineNumber·risk=ordinal(렌더러가 risk lineNumber 부재 → 양측 공유 parse-order ordinal). browser 는 경로 미수신 — 서버가 re-enumerate 로 id→ref 역매핑. (2) **렌더러**(`drawer-detail.js`) — plan-출처 미해결 risk/oq 드로어 detail 에 `resolveId` 부여(STATE.md OQ·resolved·집계 항목 제외), DRAWER_SCRIPT 가 `hidden` 버튼 방출(기본 cache 무동작; write-mode `data-mccp-write` 로 노출). 중립 톤 버튼(P2: red/accent 회피). (3) **서버**(`dashboard-server.js`) — `--write` 플래그 + 프로세스 nonce + POST `/__mccp_resolve`(write-mode only) + serve-time `resolve-action.js`+nonce 주입(cache byte-pristine). **F2 mode-aware identity** — PID/identity `writeEnabled` 비트 + reuse 모드 일치 강제(default 가 writer 재사용/writer 가 read-only 재사용 차단). (4) **POST 핸들러 검증 체인**(fail-closed) — **F1 Host allowlist**(loopback only, 비-loopback → / · POST 모두 reject = DNS-rebinding 차단) + **F1 Origin/Referer**(구성 origin 기준, req.host 미신뢰) + nonce + body cap(8KiB) + reason strict(≥2 token) + re-enumerate id→ref + `.claude/**/*.md` containment + apply.js 위임. **F3 엄격 결과** — `applied==1 & 0 error/abort/skip` 만 success(no-exception summary 의 skipped/aborted/errored 를 거짓 성공으로 안 봄). (5) **클라이언트**(`renderer/client/resolve-action.js`) — write-mode 주입 시 버튼 노출 + reason prompt + 확인 + nonce 동봉 fetch + a11y live-region. (6) **F4 단일 render-after-write** — POST 성공 후 `triggerRender(debounce off)` + cache mtime advance 검증(invisible durable write 차단). 신규 write 엔진/reload 경로 발명 0 — apply.js(CAS/lock) · SSE · render trigger 재사용. **Codex plan-gate 4 ACCEPT_NOW 흡수**(F1 Host-gating/DNS-rebinding · F2 PID reuse mode-aware · F3 apply summary 엄격 · F4 단일 render API) + id content-only 전환 REJECT_YAGNI(ordinal anchor 가 duplicate-text 안전가드). 게이트: Implement-Codex cross-gate dedupe(plan+implement 수렴) · 14 보안 invariant + item-id 8 테스트 green. plugin.json `1.18.21 → 1.19.0` + 양 footer + i18n-surface.test.js 동기.

## [1.18.22] — 2026-06-29

design-grounding — impeccable 디자인 방향을 produced diff에 mechanical하게 강제(advisory → mechanical, [[feedback-impeccable-full-delegation]] 해석 A). 기존 `prp-implement`의 critique loop(Phase 2.5.5b)은 EXECUTE *이전*에 plan/방향만 보고 produced diff는 절대 보지 못한다. "신규 LLM 호출 0" 제약상 critique을 post-EXECUTE 재실행할 수 없으므로, **방향 캡처 → EXECUTE 소비 → 결정적(LLM-free) grounding lint**의 3-step으로 그 gap을 닫는다. critique의 divergent-block(§3.9)은 그대로 두고 그 위에 **별도 locus**의 post-produce mechanical 게이트를 얹는다(중복 아님). main #75(interactivity M3)가 같은 `prp-implement.md`에 advisory `Phase 3.6 DESIGN FINISH`를 추가했으므로, 본 mechanical 게이트는 그 **뒤**의 `Phase 3.7 DESIGN GROUNDING VERIFY`로 배치 — polish가 코드를 편집한 *최종* diff를 grounding이 lint. Codex Implement-R1 4 findings 흡수: **F1**(HIGH) — H17(nested-card)은 added-line 버킷에서 DOM open-tag stack 없이 enforce 불가 + `class=` 매처가 JSX `className=` miss → blocking 서브셋을 `GROUNDING_RULE_IDS=['H15']`(line-local-safe)로 좁히고 H17은 renderer full-HTML lint이 계속 소유. **F2**(HIGH) — worktree dirty 시 baseline diff가 EXECUTE delta가 아님 → capture 시점 pre-EXECUTE rendered 버킷 스냅샷 후 verify에서 per-bucket line-set 차감. **F3**(MED) — write.js가 fresh skeleton overwrite라 plain re-write가 `design_critique_*` drop → `restampGroundingVerdict` field-preserving helper(read existing → verdict만 mutate → 양 hash 재계산). **F4**(MED) — capture 기대됐으나 read 실패 시 enforce가 no-op로 강등 → `decideGrounding({readFailed})`가 enforce에서 `inconclusive` block + atomic artifact write. 추가로 bare `.md` rendered 포함이 command-doc(`####` 다수)에 H15 오발화하는 plan 잠재결함 발견 → rendered md는 `.claude/cache/*.md`만 scope. 모든 artifact 경로는 `git rev-parse --git-path`(worktree-safe, F1) — `.git/` hardcode 0. verdict enum 5종(`grounded`/`anchor_clean`/`inconclusive`/`violations`/`skipped`). 신규 LLM 호출 0. plugin.json `1.18.21 → 1.18.22`(main #75와 병렬 cycle로 1.18.21 선점 → forward reconcile, §3.7) + 양 footer.

### Added

- **`scripts/lib/design-grounding.js`** — 신규 순수 lib(LLM-free): `parseGroundingMode`(off/warn/enforce, default enforce) · `extractRenderedSurfaceFromDiff`(unified diff added line → css/html/md 버킷, generic `.md` 제외) · `captureDirection`(atomic temp+rename, pre-EXECUTE 버킷 스냅샷) · `readDirection`(null fail-open) · `lintProducedDiff`(delta 차감 후 `runRules(GROUNDING_RULES)` + signal-consistency) · `decideGrounding`(5-verdict enum + `readFailed` inconclusive). output-constraints `runRules`/`GROUNDING_RULES` + impeccable-routing `extractDiffSignals` 재사용.
- **`scripts/lib/tests/design-grounding.test.js`** — 25 test(parseMode/extract/subtract/capture-read round-trip/atomic/fail-open/lint/decide 5-verdict/end-to-end).
- **`scripts/receipt/tests/design-grounding-fields.test.js`** — 9 test(captured/verdict round-trip + present-only legacy + restamp field-preservation F3 + unknown additive meta 보존).
- **receipt meta** `design_grounding_captured`(gate-time bool) + `design_grounding_verdict`(post-EXECUTE enum) — present-only, migration 불필요. `cli.js restamp-grounding` verb.

### Changed

- **`scripts/lib/renderer/output-constraints.js`** — 룰 반복을 `runRules(input, rules)`로 추출 + `runOutputConstraints`는 위임(behavior-preserving). `GROUNDING_RULE_IDS=['H15']` + `GROUNDING_RULES` export(H17 제외 — F1). 기존 83 test 무회귀 + 동등성 단언 3 추가.
- **`scripts/receipt/{schema,write,cli}.js`** — grounding 2-field present-only validation + skeleton + parse + `restampGroundingVerdict`(read existing → verdict만 mutate → subject/receipt hash 재계산 → validate → write, F3). verdict는 receiptHash carve-out 안 함(tamper-protected).
- **`commands/prp-implement.md`** — Phase 2.5.5c(trigger 시 capture + `--design-grounding-captured` forward) · Phase 3 per-task 시작에 Design Grounding Constraints consume 블록 · 신규 **Phase 3.7 DESIGN GROUNDING VERIFY**(main #75의 advisory Phase 3.6 DESIGN FINISH 뒤; baseline+tracked+untracked produced-diff, lint+decide, enforce block→fix-task+bounded retry, pass→restamp) · Phase 5 REPORT grounding verdict surface. consume/verify/restamp + 2.5.6 forward 게이트 조건은 비영속 `DESIGN_GROUNDING_CAPTURED` shell flag가 아니라 **capture 아티팩트(restamp는 result JSON) 존재 + `$ARGUMENTS` 재파생 slug로 self-derive**(shell-state 독립, separate Bash invocation에서 mechanical 게이트가 silent no-op 되지 않도록, [[feedback-loud-fail-open]]).
- **`skills/frontend-design-direction/SKILL.md`** — Output Constraints에 produced-diff H15 grounding lint 명문화.
- **`scripts/lib/renderer/{html,markdown}.js`** + `i18n-surface.test.js` — footer `v1.18.21 → v1.18.22` 동기화.
- **`CLAUDE.md`** — §3.9 하단 "Produced-diff grounding lint" sub-section(3-step 계약 + scope + verdict enum + shell-state-독립 게이트 조건) + §4 토글 catalogue에 `MCCP_DESIGN_GROUNDING=off|warn|enforce`(default enforce, fail-closed) 추가.

## [1.18.21] — 2026-06-29

dashboard-interactivity M3 — impeccable 검증 워크플로 강화(렌더러가 아닌 **세 게이트 명령 본문 `.md`** 대상). grounding 결과 pr.md(2.5.1)는 2026-06-03 Sprint 3(`29ded48`)부터 이미 `critique`+`audit` 양쪽을 호출 중이라, 실제 gap 은 (1) code-review.md 가 critique 단독, (2) prp-implement 에 layout 선행은 있으나 clarify·distill "마무리" 부재, (3) audit 가 advisory 임이 본문에 framing 안 됨이었다. (1) **code-review.md 2.5.2** — `\|1\|1\|no\|` 행을 `critique`+`audit` 동시 호출(pr.md:310 미러)로, reuse-first 행은 양쪽 findings 재사용, audit advisory(code-reviewer gate lenient — critique retry loop §3.9 만 divergent blocking) 명시. (2) **prp-implement.md** — 2.5.5b stage-aware routing 에 pre/post 타이밍 framing(layout 은 pre-implementation 선행 invoke / clarify·distill·polish 은 produced code 미존재로 이 pass 미invoke / audit advisory / critique 단독 blocking) + **신규 Phase 3.6 DESIGN FINISH (simplify + polish)** — Phase 3 EXECUTE 이후 produced diff 대상 `clarify`+`distill`+`polish` 각 1회 invoke(advisory→REPORT). `polish` 는 순서상 마지막 = **구현 최종 검증**(이전엔 implement 라우팅 테이블 부재 + pr 는 review-only 라 적용 불가 = 어디서도 발화 못 하던 gap 을 닫음). routing oracle(`impeccable-routing.js`)·critique loop·receipt write 불변 — clarify/distill/polish 는 finish 단계에서만 invoke(2.5.5b 미invoke → 중복 0). (3) **pr.md 2.5.1** — audit 가 advisory(review-only — PR body `## Design Review` surface, 게이트 미차단; Phase 1.6 critique chain-check 만 blocking)임을 1줄 명시(`29ded48` since, code-review.md 와 framing 동형, 기능 변경 0). **Codex F1(HIGH)** — 원안은 clarify·distill 을 routing 테이블 callForm 승격(recommend→invoke)으로 처리하려 했으나 routing 은 Phase 3 EXECUTE *이전* 게이트(line 173)라 produced code 미존재 시 no-op. 흡수: routing 승격 폐기 + 신규 Phase 3.6 post-EXECUTE finish 단계가 produced diff 대상 invoke. polish 는 plan-Codex review *이후* 사용자 지시로 Phase 3.6 에 추가(동일 decision-set, dedupe envelope 보존). receipt 397 / impeccable-routing 27(oracle 불변) / renderer 639 PASS, 0 회귀. 게이트: Implement-Codex cross-gate dedupe(plan+implement 수렴) · impeccable silent-skip(`no-signal`, pre-impl UI surface 부재) · security 미트리거 · a11y skip(`rendering_surface=false`). plugin.json `1.18.20 → 1.18.21` + 양 footer + i18n-surface.test.js 단언 동기.

## [1.18.20] — 2026-06-28

dashboard-interactivity M2 — 개요 진행 중 마일스톤 패널 + 드로어 위험/질문 네비. 개요(`route-overview`)가 hero + widget-grid 만 보여주고 worktree 별 진행 정보는 활동·기록 route 의 멀티세션 표에만 있던 gap 을, derive `worktrees` source(이미 worktree 별 `milestone_hint`/`active`/`current_gate`/`last_activity` 산출)를 **재스캔 없이** 재사용해 닫는다. (1) **개요 패널** — `renderActiveMilestones`(html.js) 가 worktree 별 진행 마일스톤을 컴팩트 리스트로 노출. 상태는 `dot`(색 채널) + statusLabel 텍스트(비색 채널) **이중 인코딩**(색 단독 의미 금지, Sam 페르소나) + 게이트 + 상대시각 + 마일스톤 title(2줄 clamp, 전문은 드로어). `OVERVIEW_CAP=3` 상한 + 초과분은 활동·기록 route foot 링크(silent cap 금지 — total/shown 보존). (2) **overview projection** — `renderMultiSession` 이 in-progress worktree projection(`result.overview`)을 추가 방출. 3중 eligibility gate: `active`(14일 freshness) AND (`milestone_hint` OR `current_gate`) AND NOT just-shipped(`mccp-pr-codex` 수렴 = 마일스톤 *완료*). 단일 healthy worktree early-return 을 projection 계산 **뒤로 이동**(healthy-single 도 eligible 마일스톤이 있으면 개요 패널은 방출, 표 패널만 hidden — Codex F2 MEDIUM 흡수). (3) **드로어 네비 칩** — `.d-nav` + DRAWER_SCRIPT `navFilter` 로 마일스톤 드로어에서 위험/질문 route 이동 + 해당 PRD 필터 자동 적용. `groupByPrd` 검증 prdKey 에만 부여(죽은 버튼 0). near-monochrome 칩(중립 토큰만, 강조색은 `:focus-visible`). 드로어 키는 `ms:ov` 네임스페이스(표 `wt:` 와 분리 — H18 중복-id 회피). (4) **plain-text 동등** — markdown.js 가 색 채널 없는 STATUS.md 에 icon(◐) + statusLabel 을 함께 실어 상태를 비색 채널로 보존. **Codex F1(HIGH)** — `worktreeStatusKind !== 'idle'` 단독은 stale STATE.md / 이미 ship 된 마일스톤을 "진행중"으로 오판정(PRD "거짓 진행중" Risk 재현). `active` freshness gate + just-shipped 제외로 worktrees source 가 이미 제공하는 freshness + closure 신호를 채택. 전부 read-only 렌더 변경(신규 스캔·서버 mutation·correlation 재설계 0). renderer 639 PASS, 0 회귀. 게이트: critique 34/40 CONVERGED · audit 19/20 Excellent · PR-Codex R1 0 actionable(`lock_exit_ok` + `mutations=[]`) · security 미트리거(순수 renderer, escapeHtml) · a11y skip(`rendering_surface=false`). plugin.json `1.18.19 → 1.18.20` + 양 footer. PR #74(squash `1978a25`).

### Added

- **`scripts/lib/renderer/html.js`** — `renderActiveMilestones` 개요 패널(worktree 별 dot + statusLabel 이중 인코딩, `OVERVIEW_CAP=3` + foot 링크, 2줄 clamp title) + `.am-*` CSS(full-width border-top hairline, side-stripe 아님) + `.d-nav`/`.d-nav-btn` 드로어 네비 칩 CSS + DRAWER_SCRIPT `navFilter`(route 이동 + PRD 필터 dispatch).
- **`scripts/lib/renderer/markdown.js`** — `## 대시보드` 에 진행 중 마일스톤 plain-text 동등본(icon + statusLabel 비색 채널 보존, em-dash 없음 H10/H16).
- **`scripts/lib/renderer/tests/dashboard-overview.test.js`** (신규) + **`multi-session.test.js`**·**`i18n-surface.test.js`** — overview projection / 3중 eligibility gate / 네비 칩 prdKey 검증 / plain-text 동등 / graceful hide 커버.

### Changed

- **`scripts/lib/renderer/sections/multi-session.js`** — `renderMultiSession` 이 overview projection(`result.overview`) + `ms:ov` 드로어 detail 추가 방출. eligibility 3중 gate + healthy-single early-return 을 projection 뒤로 이동(Codex F2). `prdKeyFromHint`(milestone_hint 의 `.claude/prds/*.prd.md` 경로 → prdSlug, 위험/질문 data-prd 와 정확 매칭).
- **`scripts/lib/renderer/index.js`** — `renderMultiSession` 에 `planBody` 전달(네비 prdKey 를 실제 위험/질문 그룹과 대조 검증).
- **`html.js`**/**`markdown.js`** 멀티세션 표 패널 gating 을 `!!multiSession` → `multiSession.html`/`multiSession.md` 존재로 교체(개요는 `multiSession.overview` 독립 소비). 양 footer `v1.18.19 → v1.18.20`. **`plugin.json`** `1.18.19 → 1.18.20`(patch — 단일 milestone, §3.7).

## [1.18.19] — 2026-06-27

dashboard-interactivity M1.2 — 드로어 prose 렌더 시각 다듬기 + 리스트 강조 혼란 제거. M1이 깐 block-level prose 렌더(`renderProseBlockHtml`) 위에서 세 시각 결함을 닫는다: (1) **heading 위계** — `##` 가 `<p class="d-h"><strong>` 평면 강등돼 본문과 위계가 약하던 문제를, 내부 `<strong>` 제거 + styled `.d-h`(weight 650 / `--ink` / margin)로 교체. 차별화 축은 size 가 아니라 weight·color·margin 이며 `font-size: 0.8rem`(≤ `.d-sec h3`)로 묶어 prose 헤딩이 섹션 라벨보다 커지는 위계 역전을 차단(Critique F1). literal h4+ 0(H15 무발화). (2) **문단 soft break** — 단일 줄바꿈이 공백으로 합쳐져 의도된 줄 구조(완화 단계·OQ 하위 라인)가 사라지던 문제를, per-line `renderInline` 후 `<br>` join 으로 보존. md 경로(`renderProseBlockMd`)는 `\n` 유지 → HTML `<br>` ≡ md `\n` 평문 동등. (3) **리스트 강조 중립화** — 드로어 밖 위험/질문 리스트의 `**bold**` 가 흰(`--ink`) vs 회(`--ink-2`) 대비로 '확인/미확인' 상태 토글로 오인되던 문제를, `.li-q strong` 을 본문 동색(`--ink-2`/weight 600)으로 중립화하고 loud 강조 렌더는 드로어(`.d-prose strong` 신규)로 집중. **Codex F-C1(HIGH)**: soft break 가 inline 마커를 orphan 하면 literal/entity 마커가 잔존(H16 누출)하는데, 단순 parity 검사는 double-backtick code span·markdown link straddle 을 miss → **render-then-validate gate** 로 교체. 후보 `<br>` 출력을 H16 카탈로그 5종(bold `**`/`__`, single backtick, entity backtick, md-link)으로 스캔해 잔존 0 이면 채택, 아니면 known-good space-join baseline 으로 fallback — PROSE_TOKEN 문법 전체 커버로 raw 마커 누출 구조적 0. 전부 read-only 렌더/CSS 변경(신규 저장소·서버 mutation·마커 cap 확장 0). renderer 전체 스위트 green + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.18 → 1.18.19` + 양 footer.

### Changed

- **`scripts/lib/renderer/format-utils.js`** — `renderProseBlockHtml` heading 분기에서 내부 `<strong>` 제거(`.d-h` 가 CSS 로 weight 보유, 이중 인코딩 해소) + 문단 분기를 per-line `renderInline` + `<br>` join 으로 교체. 신규 module-private `hasResidualMarker`(H16 카탈로그 5종 + `<code>`/`<pre>`·Python dunder carve-out)로 render-then-validate gate 구현 — 마커 straddle 시 space-join fallback(Codex F-C1).
- **`scripts/lib/renderer/html.js`** — `.d-prose p.d-h` styled heading 위계(font-size 0.8rem ≤ `.d-sec h3`, weight 650, `--ink`, margin) + `.d-prose strong` loud(`--ink`) 신규 + `.li-q strong` 중립화(`--ink`→`--ink-2`, weight 650→600). footer `v1.18.18 → v1.18.19`.
- **`scripts/lib/renderer/tests/format-utils.test.js`** — heading 단언을 styled `.d-h`(no `<strong>`)로 갱신 + soft-join 을 `<br>` 기대로 갱신 + 신규 4종(balanced multi-line `<br>` 채택 / bold·double-backtick·md-link straddle fallback) 단언.
- **`markdown.js`** footer `v1.18.18 → v1.18.19`. **`plugin.json`** `1.18.18 → 1.18.19` (patch — 단일 milestone, §3.7).

## [1.18.18] — 2026-06-27

dashboard-interactivity M1 — 드로어 prose inline → block-level 렌더(`renderProseBlockHtml`) + plan summary 전문. 우측 상세 드로어가 plan summary·완화책을 단일 join 줄이 아니라 구조적 prose(문단·리스트·fenced code·blockquote·GFM table)로 표시. `extractPlanSummary` 전문 + render budget(`MAX_BLOCKS` cap — 단일 섹션의 DOM 폭주 방지, Codex F1 흡수) + resolved 위험 해결 사유/시각 row. escape-then-render SSoT 보존(모든 텍스트 경로가 `renderInline`/`esc` 로 종단 — raw passthrough 0, malformed 구조는 inline `<p>` 로 fail-open degrade). plugin.json `1.18.17 → 1.18.18` + 양 footer. (CHANGELOG row 는 본 M1.2 cycle 에서 소급 기록 — M1 commit 누락 gap 닫음.)

## [1.18.17] — 2026-06-26

dashboard-data-exploration M3 — 검색 wiring + 멀티세션 잔여축(PRD ③의 마지막 마일스톤). 세 표면을 닫는다: (1) **형태만 있던 사이드바 검색**을 실제 `<form role="search">` + `<input type="search">`로 wiring — 문서 전역 `.li-item`을 헤더/요약(`.li-main`) 텍스트로 **cross-route 동시 좁힘**(150ms debounce, 단축키 0·kbd "F" 제거), 매칭 페이지를 nav-link 뱃지 + 전역 `aria-live` live-region("전체 N개 일치 · 위험 8 · 질문 2")으로 surface. (2) 검색(`_hs`)과 M2 explore-bar 필터(`_hf`)를 **AND 합성** — 한 `.li-item`의 가시성 = `!(_hf || _hs)`, 두 컨트롤러가 각자 reason expando 만 set 하고 공유 `recompute`가 `hidden`을 합성(독립 필터 AND 표준 패턴, 경쟁 0). (3) **멀티세션 잔여축** — `#route-activity` 멀티세션 테이블에 진행상태·worktree 필터 + 진행순 정렬 바를 full 구현(행 `data-status`/`data-worktree`/`data-progress-rank`(blocked3>degraded2>active1>idle0)/`data-activity-ord`). 작업범위순 정렬은 PRD 명시대로 보류('PRD 기준 진행도' 재기획 전까지 미노출). JS-off 시 검색 입력·컨트롤 숨김 + 전체 항목·행 손실 없이 가시(PE 불변), STATUS.md 평문 동등. **Codex Plan-F1(MEDIUM)**: 검색 `<form>`은 `type="search"`라도 Enter 시 native submit → 검색 컨트롤러가 `submit` → `e.preventDefault()` 바인딩 + `action`/`method` 미지정으로 route·필터·검색 상태 손실 차단. **Codex Plan-F2(MEDIUM)**: M2 `explore.js:65` `if (!EX || !bars.length) return`이 `.explore-bar` 부재 시 검색 wiring 을 막던 갭 → guard 를 `if (!EX) return`으로 낮추고 검색을 bars 와 독립 실행. **Codex Implement-IF1(MEDIUM)**: `data-js="on"`을 EX 확인 *뒤*로 이동 — `EXPLORE_SORT_JS` 누락 시 `.js-only` 컨트롤(검색 폼 포함)이 보이지만 inert 가 되는 dead-UI + Enter-navigate 회귀 차단. **Codex Implement-IF2(MEDIUM)**: 세션 바가 `.explore-bar.js-only` 재사용 → M2 `wireBar` 루프가 이중 바인딩(행 컨트롤러 경쟁 + 무관 `.li-item` 카운트 + 세션 sort 를 무효 `severity`로 reset)하던 갭 → `:not([data-explore-scope="session"])`로 소유권 분리. pure `textMatch`(NFC·대소문자·빈=전체) + `compareItems` progress mode + `matchFilter` status/worktree 축을 UMD 모듈에 누적(M2 표면 무변경). renderer 590 PASS(신규 explore-search 12 + explore-sort 8 추가) + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.16 → 1.18.17` + 양 footer.

### Added

- **`scripts/lib/renderer/tests/explore-search.test.js`** (신규, 12 test) — 검색 `<form>`/`<input type=search>` 마크업·`.js-only`·`role=search`·aria·kbd 제거 + live-region + `.nav-search-count` 슬롯 + 멀티세션 바(`data-explore-scope=session`) + 행 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` + emit gate 확장(검색 타겟만 있어도 explore `<script>` emit) + no-JS degrade + H16 `data-worktree` carve-out + H19 network 0 + **F1**(폼 action 부재 + submit→preventDefault) + **F2**(guard 비-`bars.length` 종속) + **IF1**(data-js EX 뒤 set) + **IF2**(세션 바 소유권 분리).

### Changed

- **`scripts/lib/renderer/parsers/explore-sort.js`** — `compareItems`에 `progress` mode(`data-progress-rank` desc + `data-activity-ord` asc tie-break) + `matchFilter`에 `status`/`worktree` 축(M2 prd/plan 위 AND 누적) + 신규 순수 `textMatch(haystack, needle)`(NFC normalize·lowercase·빈 needle=전체). UMD 유지, M2 표면 불변.
- **`scripts/lib/renderer/client/explore.js`** — 가시성 reason 모델(`_hf`/`_hs` expando + 공유 `recompute`) 로 M2 `apply()` 리팩터(검색 빈 값이면 M2 동일 동작) + **검색 컨트롤러**(전역 `.li-item` 순회 → `.li-main` 텍스트 매칭 → nav 뱃지 + live-region + route별 빈 상태) + **멀티세션 바 컨트롤러**(`<tr>` status/worktree 필터 + 진행순 `<tbody>` 재배열). IF1(data-js EX guard 뒤) + IF2(M2 바 `:not(session)`, 세션 바 `[session]` 소유권 분리). DOM-only(H19 clean).
- **`scripts/lib/renderer/sections/multi-session.js`** — `<tr>`에 `data-status`/`data-worktree`(안정 키)/`data-progress-rank`(KIND_META `rank` SSoT)/`data-activity-ord`(recency index) 부여 + 섹션 반환에 `filterOptions: { statuses, worktrees }`(present-only·결정적 순서) 노출. md 무변경.
- **`scripts/lib/renderer/html.js`** — 사이드바 `.search` div → `<form class="search js-only" role="search">` + `<input type="search">`(kbd "F" 제거) + 전역 sr-only live-region + nav-link `.nav-search-count` 슬롯. `buildSessionBar({options})`(buildExploreBar chrome 재사용 — 진행상태/worktree select + 진행순 정렬) + 멀티세션 패널 head 통합 + emit gate 를 `hasSearchTargets || hasPrdGroups || exploreBarRendered || sessionBarRendered`로 확장. 검색/세션 바 CSS(neutral). 필터 option label `plainLabel`(inline code/bold 마커 strip — `<option>` text 의 `&#96;` entity-backtick H16 차단). footer `v1.18.16 → v1.18.17`.
- **`scripts/lib/renderer/parsers/plan-body.js`** — `extractPrdLabel`이 PRD H1 inline code/bold 마커를 strip(prd-group `<summary>` label 의 entity-backtick H16 차단 — 실데이터 plan H1 의 `` `id` `` 포함 시). 라벨은 display-only(prdKey 는 path 파생 — 매칭 무영향).
- **output-constraints.js H16** — attribute strip carve-out 두 사이트에 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` 추가(`data-worktree` 브랜치명 `_` paired-underscore false-positive 차단). H19 는 확장 explore.js + explore-sort.js 자동 cover.
- **`markdown.js`** footer `v1.18.16 → v1.18.17`. **`plugin.json`** `1.18.16 → 1.18.17` (patch — PRD ③의 마지막 마일스톤, §3.7).

## [1.18.16] — 2026-06-26

dashboard-data-exploration M2 — 필터 + 정렬. M1이 깐 PE 토대(`data-prd` + `[data-js="on"]` reveal hook + `client/explore.js`) 위에서, 위험·질문 라우트에 **필터(PRD축·plan축, AND 조합)** + **정렬(위험도순·시간순)** 컨트롤 바를 추가한다. 컨트롤은 `.js-only`라 JS 비활성 시 사라지고 전체 항목이 손실 없이 보인다(PE 불변). 사용자 결정으로 진행상태/worktree 필터·진행순/작업범위순 정렬은 M2 제외(전자는 멀티세션 표면 후속, 후자는 미기획). pure 필터/정렬 로직(`compareItems`/`matchFilter`)을 **UMD 모듈(`parsers/explore-sort.js`)** 로 분리 — node 단위 테스트와 browser inline 엔진이 single-source 공유(drift 0). **Codex F1(HIGH)**: `data-ord`(시간순 키)를 severity 정렬 *이전* 원본 parse chronology(`_chronoIndex`/`_mergedIndex`)에서 파생 — render 방출 순으로 주면 "시간순"이 severity 순서를 인코딩해 정렬이 무효가 되는 버그를 차단. **Codex F2(HIGH)**: inline script emit gate를 `.prd-group` OR `.explore-bar`로 확장 — flat fallback 섹션(단일 그룹 → `.prd-group` 부재)에서도 컨트롤 wiring 동작. **Codex F3**: 한 `.li-item` 집합당 활성 컨트롤러 1개. **배치는 impeccable critique + 사용자 확정으로 panel-header 통합 단일 canonical** — 각 컨트롤 바가 자기 위험·질문 패널의 `panel-head`(제목·count 줄) 우측에 통합돼 컨트롤이 제어 대상 리스트 바로 위에 산다(scope=배치 일치). 초기 *전역 사이드바 배치* 는 scope↔placement 불일치(5 route 중 2개만 제어 + inert chrome), 위험·질문 옵션 결합으로 인한 cross-route 빈 상태, nav 무게감, 키보드 탭순서가 필터를 페이지 nav 보다 먼저 통과하는 비용으로 폐기 — dual-path 토글(`MCCP_EXPLORE_CONTROL_PLACEMENT`)도 함께 제거. 각 패널 바는 자기 route 옵션만 소비(옵션 결합 0). 컨트롤은 neutral 토큰만(강조색 예산 0, focus-visible outline 제외) + native `<select>`/`<button>`(키보드 기본) + `aria-live="polite"` 결과 수 + 빈 상태 메시지. 정렬 scope는 `.stack-list` 단위(그룹 경계 보존). **필터 polish 2건**: (1) 빈 상태·결과 수를 라우트 전역이 아닌 **활성 탭 패널 scope**로 한정(비활성 탭 매칭이 활성 탭의 빈 상태를 가리던 문제) + `.tab-radio` change 리스너로 탭 전환 동기화; (2) 특정 PRD 필터 시 첫 그룹이 `hidden`돼도 `.prd-group:first-of-type`(DOM 기준)이 숨은 그룹에 남아 둘째 가시 그룹에 stray hairline 이 생기던 문제를, 엔진이 **부모별 첫 가시 그룹**에 `ex-first-visible` 클래스를 부여해 보정. renderer 569 PASS(신규 explore-sort 9 + explore-controls 12) + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.15 → 1.18.16` + 양 footer.

### Added

- **`scripts/lib/renderer/parsers/explore-sort.js`** (신규) — 필터/정렬 pure 로직 단일 진실. `compareItems(a, b, mode)`(severity desc + ord tie-break / time asc / 잘못된 mode fail-open) + `matchFilter(desc, filters)`(PRD ∧ plan AND, sentinel 동등 매칭, 빈 필터=전체). UMD 가드(node `module.exports` + browser `window.__mccpExplore`) — 부수효과 0 · DOM 미접근 · network primitive 0(H19 clean).
- **`scripts/lib/renderer/tests/explore-sort.test.js`** (신규, 9 test) — 정렬 안정성·tie-break·문자열 강제·fail-open + AND 필터·sentinel·빈 필터·UMD 노출.
- **`scripts/lib/renderer/tests/explore-controls.test.js`** (신규, 10 test) — 컨트롤 바 마크업·`data-*` 속성·aria·`.js-only` + **panel-head 통합**(위험·질문 각 패널 head 에 바 1개씩 · 사이드바 바 부재 · scope=route) + no-JS degrade + H16/H19 clean + **F1 chronology≠severity** + **F2 flat 섹션 explore emit**.

### Changed

- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — `.li-item`에 `data-plan`(plan 필터 안정 키 — canonical plan path, STATE.md OQ는 `__global__` sentinel) · `data-sev`(RANK 0~4 정렬 키) · `data-ord`(**severity 정렬 이전** 원본 parse chronology, Codex F1) 추가. 섹션 반환에 `filterOptions: { prds:[{key,label}], plans:[{key,label,prdKey}] }`(중복 제거·결정적 순서) 노출 — html.js 컨트롤 빌더가 소비.
- **`scripts/lib/renderer/client/explore.js`** — M2 필터/정렬 엔진 추가(M1 토글 보존). 각 `.explore-bar`의 select/reset wiring → `window.__mccpExplore`로 `.li-item` 가시성(`hidden`) 토글 + 그룹 내(`.stack-list`) 재정렬 + `.prd-count` 갱신 + 빈 상태 + **결과 수는 패널 탭(미해결/완화/해결)의 `.tab-count` 를 갱신**(미해결 18→8, `updateTabCounts`) + `.explore-count`(`.sr-only`) live-region 으로 스크린리더 announce. 단일 컨트롤러 불변(scope=route `closest('.route')` — 패널 head 통합이라 자기 route 항목만 제어, F3). DOM-only(H19 clean).
- **`scripts/lib/renderer/html.js`** — `buildExploreBar({scope,options})` 컨트롤 바 빌더(`.explore-bar.js-only` — `.ex-filters`(PRD·plan) + 정렬 + 초기화, option label 은 `normalizeProse` 통과해 PRD H1 em-dash 가 H10 위반 안 되게). **`renderPanel` 에 `opts.tools` 추가 — 바를 위험·질문 패널 `panel-head`(→ `panel-head-tools`) 우측에 통합** + 결과 수(`.explore-count`)를 제목 옆 status zone 에 emit, 각 패널이 자기 route `filterOptions` 만 소비(옵션 결합 0). 전역 사이드바 배치 + `MCCP_EXPLORE_CONTROL_PLACEMENT`/`parseExplorePlacement`/`globalExploreOptions` dual-path 제거. `EXPLORE_SORT_JS` 모듈-로드 inline(EXPLORE_JS *앞*). emit gate를 `.prd-group` OR `.explore-bar`로 확장(F2). **컨트롤 형태 UI/UX(GitHub·Linear·Vercel 레퍼런스)**: `.ex-select` PRD·plan 폭 고정(`12rem` — 패널 간 일관성) + focus `outline-offset:1px`+gap `0.5rem`(인접 침범 방지) + 필터군↔정렬 분리 + **한 줄 고정(`flex-wrap:nowrap` — 2-tier 방지)** + **초기화 항상 노출** + **결과 수는 패널 탭 `.tab-count` 갱신**(별도 텍스트 0, `.explore-count` 는 `.sr-only` live-region). footer `v1.18.15 → v1.18.16`.
- **output-constraints.js H10·H16** — attribute strip carve-out에 `data-plan` + `value` 추가. M1 `data-prd` 선례 — `__global__`/`__unknown__` sentinel이 select `<option value>` + `data-plan`에서 bold-underscore false-positive를 내나 렌더 prose 아님(attribute value는 markdown 미렌더). H19는 확장 explore.js + 신규 explore-sort.js를 자동 스캔(추가 변경 없이 cover).
- **`markdown.js`** footer `v1.18.15 → v1.18.16`. **`plugin.json`** `1.18.15 → 1.18.16` (patch — PRD ③의 단일 M2, §3.7).

## [1.18.15] — 2026-06-26

dashboard-data-exploration M1 — PRD-수준 그룹핑 + Progressive-Enhancement 토대. 대시보드의 고-volume 항목 리스트(위험·미해결 질문)를 소속 PRD별 접힘 그룹(`<details class="prd-group">`)으로 묶어, 여러 PRD가 동시 진행될 때 "어느 PRD의 위험/질문인가"를 한눈에 분리한다. 그룹은 native `<details>`로 렌더되어 **JS 없이도 완전 동작**(graceful degrade 구조적 보장) — 항목마다 `data-prd` 속성 + `<html data-js="on">` 마커를 박아 M2(필터/정렬)·M3(검색)이 소비할 PE 토대를 깐다. PRD provenance 키는 **canonical plan path**(basename 아님 — archive/worktree 동명 plan 충돌 회피, Codex F2), `data-prd`는 **prdPath 파생 prdKey**(라벨 slug 아님 — 동일 H1 라벨 두 PRD 분리, Codex F2). source 미상/STATE.md는 "프로젝트 전역"(`__global__`), 매핑 실패는 "출처 미상"(`__unknown__`) 버킷 — 항목 절대 누락 0(fail-open). 단일 PRD/그룹이면 기존 flat 동작 보존(구분할 PRD 없음 → 그룹 chrome 생략), 2+ 그룹일 때만 그룹 disclosure + md 그룹 헤더 + explore.js 토글 노출. DESIGN.md "JS 0" invariant를 **routing-한정 + 데이터 탐색 PE 허용**으로 개정 + stale "3 route" → 실제 5 route 정정. **신규 H19**(Codex F1 — HIGH): inline `<script>` 본문의 런타임 network primitive(fetch/XHR/WebSocket/EventSource/sendBeacon/remote import/외부 URL 리터럴) 검출 — H13(외부 src)이 못 막는 raw-mode 데이터 유출 경로를 mechanical 차단(`application/json` 데이터 스크립트는 제외). 그룹 chrome은 neutral 토큰만(강조색 예산 0). 그룹핑은 위험의 **미해결·해결됨·보관됨** 세 탭과 질문의 **미해결·해결됨** 두 탭 전부에 동형 적용 — 미해결(primary)은 그룹별 top-3 캡, 해결됨·보관됨(secondary)은 외곽 collapse 뒤 전 항목 평문(삼중 중첩 회피). **단일 그룹 표출 규칙**: 단일 그룹이라도 **실제 PRD 소속이면 헤더 표시**(어느 PRD인지 정보 가치 — 한 PRD에만 미해결 질문이 몰려도 그룹 라벨이 보임), `프로젝트 전역`/`출처 미상` 단독 fallback만 flat(disambiguation 정보 없는 chrome 노이즈 회피). renderer 548 PASS(신규 prd-grouping 14) + design-lint H1-H19 clean, 0 회귀. plugin.json `1.18.14 → 1.18.15` + 양 footer.

### Added

- **`scripts/lib/renderer/parsers/prd-group.js`** (신규) — `groupByPrd(items, planPrd)` 순수 그룹핑 헬퍼(부수효과 0, dep-free) + `canonicalPlanPath`(plan-body 와 공유) + `prdSlug`. 결정적 그룹 순서(prdKey 사전순, `__global__`·`__unknown__` 끝) + fail-open 단일 그룹(null planPrd/빈 입력).
- **`scripts/lib/renderer/client/explore.js`** (신규) — PE 토대 client 스크립트(DOM-only, network primitive 0 — H19 1차 검증 대상). `<html data-js="on">` 마커(M2/M3 control reveal hook) + 2+ PRD 그룹 클러스터당 "모두 펼치기/접기" 토글. html.js 가 jQuery 패턴 미러로 모듈-로드 read+inline(외부 src 0 — H13).
- **`scripts/lib/renderer/tests/prd-grouping.test.js`** (신규, 14 test) — groupByPrd 순서/버킷/fail-open + 충돌 케이스(동명 basename·동일 H1 라벨·source_prd 부재·STATE.md OQ) + multi-PRD html `.prd-group`+`data-prd` + STATUS.md 그룹 라벨 평문 동등 + no-JS degrade + H19 drift/carve-out + **미해결·해결됨·보관됨 전 탭 그룹핑**(위험·질문 동형, secondary 평문 도달성) + **단일 실제 PRD 헤더 표시 / 단일 fallback flat** 분기.
- **output-constraints.js H19** — inline `<script>` 본문 network-primitive 가드(Codex F1). `runOutputConstraints`가 이미 받는 composed html 에 자연 확장, H13(외부 src)과 직교.

### Changed

- **`scripts/lib/renderer/parsers/plan-body.js`** — `parsePlanBody` 반환에 `planPrd: Map(canonicalPlanPath → { prdPath, prdLabel, prdKey })` 추가. `extractPrdLabel`(PRD H1, 표시 전용) + `derivePrdKey`(prdPath 파생 안정 식별자) 헬퍼.
- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — 미해결·해결됨·보관됨(위험)·미해결·해결됨(질문) **모든 탭 패널**을 PRD별 `<details class="prd-group">` 그룹으로(각 `.li-item`에 `data-prd` — secondary 탭 항목도 동일 부여). 단일 그룹은 **실제 PRD면 헤더 표시**(`shouldShowGroups` — prdKey가 `__global__`/`__unknown__` sentinel 이 아니면 단일이라도 그룹 chrome), fallback 단독만 flat. 패널 빌더(`panelInnerHtml`/`mdFromRendered`)를 세 버킷이 공유 — 미해결은 그룹별 top-3 캡(primary 압축), 해결됨·보관됨은 캡 없이 전 항목 평문(secondary 외곽 collapse 뒤 삼중 중첩 회피·no-JS 도달성).
- **`scripts/lib/renderer/html.js`** — `client/explore.js` 모듈-로드 inline + `.prd-group` 존재 시 `<script>` emit. `.prd-group`/`.prd-sum`/`.prd-count`/`.prd-toggle` neutral-token CSS + `[data-js="on"]` reveal hook. footer `v1.18.14 → v1.18.15`.
- **output-constraints.js H10·H16** — `data-prd` 머신 속성을 attribute strip 에 추가(`__global__`/`__unknown__` sentinel 이 bold-underscore 처럼 보이나 렌더 prose 아님 — 기존 title/alt/aria-label carve-out 동일 원칙).
- **`markdown.js`** footer `v1.18.14 → v1.18.15`. **`DESIGN.md`/`docs/v1.3.0-observability/DESIGN.md`** — JS-0 invariant routing-한정 개정 + Progressive Enhancement 절 + stale route 수(3→5) 정정.
- **`plugin.json`** `1.18.14 → 1.18.15` (patch — PRD ③의 단일 M1, §3.7).

## [1.18.14] — 2026-06-26

dashboard-multi-session M2 — 멀티세션 대시보드 섹션(UI consumer). M1이 ship한 derive `model.sources.worktrees`(live cross-worktree 진행 모델)를 소비하는 신규 전용 렌더 섹션 `sections/multi-session.js`를 추가해, 그동안 데이터 레이어만 있고 소비자가 없던 worktree 진행을 대시보드에 노출한다. worktree당 1행(진행 요약 + 차단 강조 + self 마커) + 행 클릭 시 우측 드로어 상세(`wt:` kind) + STATUS.md plain-text 동등본. 기존 `active-sessions.js`(세션 존재 축, v1.4.0)는 무손상 — 신규 섹션은 진행 축으로 병치한다. **Graceful hide(분리 규칙)**: scan off → null, healthy 단일 worktree → null(공통 경로 조용), 그러나 **0-item degraded scan**(Codex Plan-F1) **또는 단일 degraded/blocked self**(Codex Impl-F1)는 loud 노출 — verdict generic collapse가 actionable 진단을 잃지 않게 섹션이 직접 scrubbed error/차단 사유를 보존(loud-fail-open). **상태 kind**(blocked > degraded > active > idle)는 기존 `.s-*` 색 cascade 재사용(신규 CSS 색 클래스 0) + 색은 상태 셀 span에만 + 색+아이콘+텍스트 3중(WCAG non-color severity). 차단=red(≤1 강조), degraded=amber로 분리. **드로어 detail-id는 ordinal-우선**(`wt:<ordinal>:<path>`, Codex Impl-F3) — masked path(`<outside-repo:basename>`) collapse에도 충돌 0·leak 0. per-worktree scrubbed `item.error`를 진행셀/드로어/STATUS.md에 노출(Codex Impl-F2). Codex Implement-R1 3 finding(Impl-F1/F2/F3 모두 MEDIUM·ACCEPT_NOW·R1 흡수). multi-session 18 신규 + drawer 4 신규 test, renderer 526 + derive 114 PASS, design-lint clean(H4 side-stripe 회피 — self는 비-색 bg tint만), 0 회귀. **Local-review hardening**: 진행 셀 `plainSummary`(truncate가 raw 마커 페어를 분리해 `**`가 HTML 누출되던 H16 위반 차단 — bold/code 서식은 드로어 detail full prose에서 보존) + self worktree `.` dangling dot 제거(cwd-relative path → 마커만 표기) + 상태·활동 컬럼 `nowrap`(좁은 컬럼 공백 줄바꿈 방지·영역 확보). plugin.json `1.18.13 → 1.18.14`(main #66 truthfulness M8이 1.18.13 선점 → §3.7 forward-reconcile) + 양 footer. PRD M2 row → complete.

### Added

- **`scripts/lib/renderer/sections/multi-session.js`** (신규) — `renderMultiSession(model, formatUtils, options)` — worktree당 1행 테이블 + `worktreeStatusKind` oracle(blocked>degraded>active>idle, `.s-*` 재사용) + self 마커 + 4-way graceful hide + per-worktree error surface + STATUS.md md(테이블 + per-worktree 인라인 detail).
- **`scripts/lib/renderer/tests/multi-session.test.js`** (신규, 15 test) — graceful hide(scan off / healthy single) / 2+ 테이블 / self / 차단 강조 / degraded 행 보존 / 드로어 detail / escape / masked path verbatim / md↔html 동등 / Plan-F1(0-item degraded notice) / Impl-F1(unhealthy single 렌더) / Impl-F2(scrubbed error surface) / Impl-F3(동일 basename ordinal 충돌 0).

### Changed

- **`scripts/lib/renderer/parsers/drawer-detail.js`** — `detailId` `wt` case(ordinal-우선 안정 키, Impl-F3) + `buildWorktreeDetail(item, formatUtils, opts)` 빌더(경로/브랜치/HEAD/게이트/receipts/활동/차단 사유/오류 row + 진행 section, Impl-F2 error 보존).
- **`scripts/lib/renderer/{index,markdown,html}.js`** — `multiSession` 섹션 3-point 배선(`sections` 배열 9번째 append + 양쪽 destructure + 활동 route 패널 맨 앞 span2 + 앵커 + `DRAWER_SCRIPT` KIND map `wt:'worktree'` + drawerMap 집계 + `panelIcon` `ic-branch` + `.multi-session tr.self` 비-색 bg tint).
- **`scripts/lib/renderer/tests/drawer.test.js`** — `wt:` ordinal-keyed detailId 가드 + `buildWorktreeDetail` 빌더 + KIND map 라벨 + 멀티세션 drawerMap 합류 회귀(4 신규).
- **`docs/v1.3.0-observability/dashboard-surface.md`** §2.6 — 멀티세션 섹션 read-side 소비 계약(소스·graceful-hide·상태 kind·드로어 `wt:` kind).
- **`plugins/mccp/.claude-plugin/plugin.json`** — `1.18.13 → 1.18.14` + `html.js`/`markdown.js` footer `v1.18.14` 동기화 (main #66이 1.18.13 선점 → §3.7 forward-reconcile).

## [1.18.12] — 2026-06-25

dashboard-multi-session M1 — Worktree 진행 스캐너(데이터 레이어). 작업이 대부분 git worktree에서 병렬로 일어나는데 대시보드는 자신이 실행된 단일 worktree 시야에 갇혀 다른 worktree의 진행(마일스톤·게이트·차단)을 보지 못하던 사각지대를, `git worktree list --porcelain` 열거 → 각 worktree의 **working-tree** `.claude/`(STATE.md + receipts)를 직접 read하는 신규 derive count-source `worktrees`로 닫는다(gitignore-agnostic — 미커밋 진행까지 실시간). read-only · LLM-free · dep-free · loud fail-open. M2(UI 섹션)는 본 source를 소비할 뿐 M1은 데이터 레이어만. **spawn-free 계약 보존**: derive()는 perf budget상 spawn-free라 git 호출을 host-version `allowGit` 선례를 mirror한 opt-in gate 뒤에 둠 — bare derive(validate/run/perf-budget)는 OFF(scanned:false, spawn 0), render caller(`cli.js render` + `renderer/trigger.js`)만 `worktreeScan:true` opt-in. **Codex F1**(기능 영구 invisible 차단 — render 경로 배선) + **F2**(실패 error 문자열의 sibling/parent outside-root 절대경로 leak 차단 — `mask.scrubAbsPaths`) + **F3**(`readState` emptyState-swallow로 corrupt STATE가 absent 위장 → diagnostic `existsSync`+`parseStateMd`로 missing↔unparseable 구분, degraded 행 보존) 3 finding을 plan에서 흡수(cross-gate dedupe). `MCCP_MULTI_SESSION_SCAN=1|0`(force/kill) · `MCCP_WORKTREE_SCAN_CAP`(default 20, no silent cap) · `MCCP_WORKTREE_ACTIVE_DAYS`(default 14) 토글. MODEL_VERSION 'v1' 불변(additive). **Local-review hardening**: cap truncation이 self worktree(멀티세션 뷰의 anchor 행)를 떨어뜨리지 않도록 self-retention swap 추가 + `scrubAbsPaths` privacy regex의 6 엣지(posix-abs / win-drive / UNC / error-embedded / URL-preserved / relative-fragment-preserved)를 직접 단위 테스트로 격리. worktrees-source 20 신규 + mask scrubAbsPaths 6 신규 + schema-drift worktrees guard 추가, derive 114 + renderer 503 PASS, perf-budget/no-new-deps 무수정 green, 0 회귀. plugin.json `1.18.11 → 1.18.12` + 양 footer. PRD M1 row → complete.

### Added

- **`scripts/derive/sources/worktrees.js`** (신규) — `scanWorktrees`(gate + spawn facade) + `parseWorktreePorcelain`(순수 파서) + `deriveWorktreeProgress`(diagnostic STATE read + receipt 투영) + `isSelfWorktree`/`normalizeWorktreePath`(win32 8.3 short-name 확장 위해 `fs.realpathSync.native` 우선).
- **`scripts/derive/mask.js`** — `scrubAbsPaths(str, repoRoot)` export 신규(문자열 내 outside-root 절대경로/드라이브/UNC를 `<outside-repo:basename>`로 치환, URL/상대경로 fragment 보존) + `applyPathMask`에 worktrees items[].path/self_path 마스킹 + error/warning scrub.
- **`scripts/derive/tests/worktrees-source.test.js`** (신규, 20 test) — 파서 fixture / gate off no-op / gate on items / self-match / fail-open degrade / cap·truncated / **cap truncation self-retention(review M2)** / 마스킹 / outside-root leak 부재(F2) / corrupt STATE 행 보존(F3) / render 경로 opt-in vs bare off(F1).
- **`docs/v1.3.0-observability/schema-surface.md`** §13 — worktrees source의 read-side schema surface(필드·gate·fail-open·authority·scrub) 문서화.

### Changed

- **`scripts/derive/index.js`** — `SOURCE_SCANNERS`에 `worktrees: (root, opts) => scanWorktrees(root, opts)` 등록(opts threaded).
- **`scripts/derive/model.js`** — `emptyModel().sources.worktrees` count-source 선언 + `validateShape` `required`/`countSources`에 추가 + MODEL_VERSION 주석 additive 줄.
- **`scripts/derive/cli.js`** (`cmdRender`) + **`scripts/lib/renderer/trigger.js`** — render 진입점이 `derive(..., { worktreeScan: true })` opt-in 전달(Codex F1). `cmdRun`/bare derive는 off 유지.
- **`scripts/derive/tests/schema-drift.test.js`** — worktrees count-source drift guard 추가(ledger mirror).
- **`scripts/derive/tests/mask.test.js`** — `scrubAbsPaths` 직접 단위 테스트 6 추가(review M3 — privacy regex 엣지를 applyPathMask end-to-end에서 분리).
- **`scripts/derive/sources/worktrees.js`** (`scanWorktrees`) — cap truncation 전 self worktree를 retained slice에 보장하는 swap(review M2 — anchor 행 drop 방지, cap≥2에서 is_main 순서 보존).
- **`scripts/lib/renderer/html.js`** + **`scripts/lib/renderer/markdown.js`** — footer v1.18.12.
- **`.claude/prds/dashboard-multi-session.prd.md`** — M1 row → complete.

## [1.18.11] — 2026-06-25

dashboard-truthfulness M7 — 다음-행동 진실성 + 잘림 제거. 대시보드의 핵심 기능(다음 진행사항 추천)이 hollow `/mccp:resume`(handoff 없으면 noop인 복구 메타-명령)를 echo하고 Hero 설명이 문장 중간에서 `…` 잘리던 결함을, 다음-행동을 in-progress 마일스톤의 실제 게이트 frontier에서 derive하고 잘림을 제거해 닫는다. 콘솔 셸 계약(oklch 토큰·드로어·비-색 마커·카드 비중첩) 불변 — 신규 시각 시스템·색 토큰 0. **④ 다음-행동 frontier-primary(Codex R1 F1)**: `next-action.js` `resolveNextAction` 재정렬 — in-progress plan의 decision-state frontier(첫 non-done 노드: impl→`/mccp:prp-implement <planPath>`, pr→`/mccp:pr`)를 STATE.md echo보다 **먼저** 평가. STATE.md substantive 명령은 freshness-gated fallback(plan-path 인자가 현재 in-progress와 일치할 때만) — 다른 cycle을 가리키는 stale 명령이 frontier를 가리지 못한다. `HOLLOW_COMMANDS`(resume/trace/receipt-*) 필터. **genuine handoff only(Codex R1 F3)**: `/mccp:resume`는 STATE.md `last_event==='handoff_spawn'`(resume dispatcher가 honor하는 신호)일 때만 추천 — `resume_state==='in-flight'` 단독은 비추천. **① ledger-aware decision-state(Codex R1 F2)**: `decision-state.js` `buildDecisionState`에 freshness-guarded ledger 승격(`ledgerCloseFresh`) — 완료-ledger가 decision_id+plan_basename+plan_file_hash로 PROVABLY 매칭될 때만 converged-frontier→done 승격(bundled-PR 마일스톤 정직 ✓표기). same-slug 편집·partial ledger over-claim 차단(heavy coverage는 backlog defer). **⑤ 잘림 제거**: `intent-extractor.js` 첫 완결 문장(mid-word `…` 없이 종결부호까지, run-on만 단어 경계 soft-cut) → Hero subtext가 220자 hard-cut 대신 완결 문장. `html.js` `.verdict-sub` line-clamp 4→6(generous safety net) + `.hw-list li` nowrap/ellipsis → 2줄 wrap(긴 마일스톤명 전체 노출). 사용자 "그만 잘라"(완전성 > 시각 밀도, 2026-06-25). Codex Plan-Codex R1(2 HIGH+1 MEDIUM — frontier-primary 재정렬·ledger freshness-guard·handoff predicate 정렬로 흡수) + Implement-Codex cross-gate dedupe. design-critique CONVERGED. renderer 499(decision-state 11 + next-action 재작성 16 신규) + derive 87 PASS, 0 회귀. plugin.json `1.18.10 → 1.18.11` + 양 footer. PRD M6 row → complete, M7 row(in-progress) 추가.

### Changed

- **`scripts/lib/renderer/parsers/next-action.js`** — frontier-primary 재정렬 + `HOLLOW_COMMANDS` 필터 + `frontierCommand`/`stateCommandFresh` + handoff_spawn-only resume. source enum: `resume-state`/`gate-frontier`/`in-progress-plan`/`state-fresh`/`in-progress-plan-stale`/`prose`/`idle`.
- **`scripts/lib/renderer/parsers/decision-state.js`** — `buildDecisionState`/`deriveDecisionState`에 ledgerItems/planHashes opts + `ledgerCloseFresh`(strict decision+basename+hash) freshness-guarded 승격.
- **`scripts/lib/renderer/parsers/plan-hashes.js`** (신규) — `planHashesFromModel` Map<decisionId, currentPlanHash> (plan-body.js mirror, fail-open).
- **`scripts/lib/renderer/parsers/intent-extractor.js`** — `firstSentence`/`shapeIntent` + `complete` 모드(첫 완결 문장, mid-word `…` 없음).
- **`scripts/lib/renderer/verdict.js`** — Hero subtext intent `{ maxLen: 220 }` → `{ complete: true }`.
- **`scripts/lib/renderer/sections/{pipeline,status-grid}.js`** — `deriveDecisionState`에 ledger/planHashes 전달 + status-grid에 `decisionState`/`hasHandoffSignal` ctx 주입 + nextStep cell handoff_spawn 정렬.
- **`scripts/lib/renderer/html.js`** — `.verdict-sub` line-clamp 6 + `.hw-list li` 2줄 wrap + footer v1.18.11.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.11.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M6 row → complete, M7 row(in-progress) 추가.

## [1.18.10] — 2026-06-25

dashboard-truthfulness M6 — Vercel 카드 재구성 + Hero/파이프라인 진실성(branch 커밋 `97eb796`의 CHANGELOG backfill). 위젯 4종(진행중/차단/이월/위험)을 hero-panel 밖 Vercel식 2컬럼 개별 카드 + 아래-화살표 확장으로 분해(비중첩 H17). Hero h1을 마일스톤명 + 요약 subtext로(verbose Summary 잘림 1차 해소) + next-action "무엇을 하는지" 설명. impl 게이트 수렴≠완료 진실성 — `converged-frontier` 신규 상태(receipt-only supersession): downstream 게이트 receipt 존재 또는 terminal pr-codex converged일 때만 done-green, 그 외 최신 converged 비-terminal frontier는 "게이트 수렴·다음 대기". 라벨 정합(미해결 위험·게이트 파이프라인·미해결 질문·개요로 → 위험·파이프라인·질문·대시보드로) + 마일스톤 lifecycle 토글을 위험·질문과 동일 buildTabs로 통일. 콘솔 셸·route 식별자 불변. plugin.json `1.18.9 → 1.18.10` + 양 footer.

## [1.18.9] — 2026-06-25

dashboard-truthfulness M5b — 표현/Hero 의미론 정합(데이터 의미론 #1·#3·#4·#5·#6·#7). M5a(#2 진행중 진실성)에 이어 사용자 육안 검토로 드러난 나머지 표현 결함을 닫는다. 콘솔 셸 계약(oklch 토큰·드로어·비-색 마커·카드 비중첩, PR #57~#63) 불변 — 신규 시각 시스템·신규 색 토큰 0. **위험/차단 정합(#3+#7)**: rail '미해결 위험'을 backlog HIGH/CRIT(이전 소스)에서 **위험 섹션과 동일 소스**(plan body risks active=미마커)로 통일 → rail(45)==섹션(45)==nav 뱃지(45) 정합. backlog HIGH/CRIT은 '**이월 finding**'(deferred) 셀로 분리 명명. '차단' 셀에 의미 툴팁("Codex 검토 N건 미수렴 · 사람 개입 필요", 0건은 "검토 충돌 없음" empty-state). 위험 섹션 자체의 historical-risk lifecycle scope는 M6 backlog 이월(Codex F4). **Hero 재설계(#4)**: `verdict.js` 우선순위 재정렬 — fresh in-progress plan을 backlog-deferred보다 앞으로(Hero h1="현재 작업: {intent/slug}", backlog는 '이월 finding' 셀로만 노출=숨김 아닌 이동). 요약체 cap(72 codepoint, 잘림은 드로어/route 위임). **verdict 라벨 분화(#1)**: `HERO_STATUS` neutral(in-progress 진행 톤)='진행 중' / muted(idle)='대기' 분리(이전 둘 다 '대기'). **hero-version 줄 제거(#5)**: hero 표면 version 줄(html `.hero-version` + md `versionMd`) 제거 — footer page-foot가 이미 version 노출(중복 제거). version 객체는 return shape에 유지(F2 reproducible). **더보기→route 전체보기 링크(#6)**: 위험/질문/타임라인 섹션을 전용 route(`#route-risks`/`#route-questions`/`#route-activity`)에서 **full mode**로 렌더(캡 없이 전체 항목, 더보기 `<details>` 제거) → overflow 항목이 target route HTML에 실존(도달성, Codex F2). overview hero 위험 위젯은 top-3 + "전체 보기 (+N)" route 링크. md는 top-N + `<details>` 접힘 유지(plain-text 도달성). Codex Plan-Codex(3 HIGH) + Implement-Codex(2 HIGH) cross-gate dedupe(decision-set이 M5a에서 수렴, M5b 신규 implement-time 결정 0). 585 test PASS(20개 디자인 변경 회귀 갱신), 0 기능 회귀. plugin.json `1.18.8 → 1.18.9` + 양 footer. PRD M5 row → complete(진행중=0 truthful end-state).

### Changed

- **`scripts/lib/renderer/sections/status-grid.js`** — 미해결 위험 = plan body risks active(severity 내림차순 top-N) / 이월 finding 셀(backlog HIGH/CRIT 분리) / 차단 셀 툴팁 / versionMd 제거. 5 cells(진행중/차단/이월/위험/다음).
- **`scripts/lib/renderer/verdict.js`** — fresh in-progress 우선 재정렬(Hero h1 "현재 작업") + `capIntent`(72 codepoint cap, 한글 안전).
- **`scripts/lib/renderer/html.js`** — `HERO_STATUS` neutral='진행 중'/muted='대기' 분화 / heroWidget 4종(차단 툴팁+empty-state, 위험 route 링크) / hero-version 줄·CSS 제거 / hero-widgets 2x2 그리드 + `.hw-more`/`.hw-overflow` CSS / footer v1.18.9.
- **`scripts/lib/renderer/sections/{risks,open-questions,audit-timeline}.js`** — route full mode(html 전체 항목, 더보기 `<details>` 제거; md `<details>` 유지).
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.9.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M5 row in-progress → complete.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — §2.5 데이터 의미론 정합 문서화.

## [1.18.8] — 2026-06-25

dashboard-truthfulness M5a — 진행중 진실성(데이터 의미론 #2). 대시보드 "진행 중" 카운트가 현실과 어긋나던 결함을 닫는다(M5 전체 7결함 중 #2를 M5a로 분리 ship, 표현/Hero Task 2~7은 M5b 후속 — 비용·세션 범위, 사용자 결정). **근본 원인 2층**: (1) `parseDeliveryMilestones`가 Plan 셀에서 `(...)` 마크다운 링크만 추출 → **backtick bare-path PRD**(dashboard-truthfulness 등)의 모든 마일스톤을 in-progress 집계에서 누락(현재 작업 비표시) — `extractPlanPath` 재사용으로 Complete/Lifecycle 파서와 일관화. (2) 다수 옛 cycle PRD의 stale `in-progress` 마커 노출. **코드 3축**: 완료 자동감지 `isMilestoneClosed`(terminal receipt converged + exact decision_id + **plan_hash freshness** OR completion-ledger converged; generic/legacy/stale/모호 매핑 fail-closed — Codex Implement-F1: receipt에 is_stale 플래그 없음, freshness 신호는 plan_hash) + plan-body.js override 레이어 + 활동기반 신선도 가드(`MCCP_DASHBOARD_STALE_DAYS` 기본 14). **데이터 정리** 8 PRD row(v0.3.5/v0.4.0 axis H/v1.4.2-m1·m2/v0.3.6/v1.0.1-axis-k-m2/serve-refresh/console-redesign-m4 → complete + dashboard-truthfulness M4→complete·M5 추가). git-commit-time이 bulk commit 오염 + STATE.md task_fingerprint(cycle-prefix 없음)로 cycle/activity 가드 모두 무력 → 데이터 정리가 유일 신뢰 메커니즘. **결과 진행 중 = 1건(M5)**. Codex Plan-Codex(3 HIGH: OR 완료감지/route 도달성/PRD double in-progress) + Implement-Codex(2 HIGH: plan_hash 상관/PRD 데이터) 흡수. 신규 `completion-detect.test.js` 15케이스(F1 negative e/f/g/h) + 585 test PASS(renderer 466 + derive/stale-audit 105 + 14 기존), 0 회귀. plugin.json `1.18.7 → 1.18.8` + 양 footer. M5b는 `1.18.9` 예정.

### Changed

- **`scripts/lib/renderer/parsers/plan-body.js`** — `parseDeliveryMilestones` backtick bare-path 추출(extractPlanPath 재사용) + parsePlanBody 완료 override(plan_hash-fresh terminal receipt OR ledger) + 활동기반 신선도 가드(`MCCP_DASHBOARD_STALE_DAYS`).
- **`scripts/lib/renderer/parsers/decision-state.js`** — `isMilestoneClosed` helper(terminal-gate/exact decision/plan_hash freshness OR ledger, fail-closed). `TERMINAL_GATES` export.
- **`scripts/lib/renderer/sections/status-grid.js`** — in-progress 카운트 fresh only(stale 제외·muted 별도 표기). footer v1.18.8.
- **`.claude/prds/*.prd.md`** (8 PRD) — stale in-progress → complete 데이터 정리.

### Added

- **`scripts/lib/renderer/tests/completion-detect.test.js`** — 15 케이스(isMilestoneClosed F1 negative + parseDeliveryMilestones bare-path + parsePlanBody override/staleness).

## [1.18.7] — 2026-06-25

dashboard-truthfulness M4 — 메인 표현 정리(타임라인 더보기 · 위험/질문 복사 대칭). 데이터는 M1~M3에서 이미 truthful — M4는 메인 흐름의 *표현* 비대칭/잡음 셋을 닫는다. (1) **타임라인 더보기** — `audit-timeline.js`가 상위 20행만 렌더하고 나머지는 `+N older` muted 각주로만 노출(접근 불가)이던 것을, risks/OQ의 `top-N + <details class="more">+N 더보기` 패턴을 타임라인에 적용 — 상위 `TIMELINE_EXPANDED`(8) expanded `<ol>` + 나머지(cap 내)를 접힘으로 *접근 가능*하게. Codex R1 F1 흡수: `isLast`는 전체 capped 시퀀스 기준 단일 계산(글로벌 마지막 행만 connector 생략, 마지막 expanded 행은 collapsed 남으면 connector 유지) + 각주(archived/older/mask/gap/was_stale)를 두 `<ol>` 밖 별도 `<ul class="audit-notes">` valid-list 컨테이너로 이동. detailMap은 접힘 무관 모든 렌더 행 적재(H18 trigger==detail). (2) **OQ 메인 = 복사 버튼만** — `open-questions.js`의 verbose `inline-prompt`(`<code>{전체 명령}` + 버튼)를 경량 `li-action`(복사 버튼만)으로 교체. 전체 명령 텍스트는 드로어 `detail.action` + STATUS.md `renderDetailMd`에 불변 보존. (3) **위험 메인 복사 버튼 추가** — `risks.js`가 이미 빌드한 `ap`(drawer action용)를 메인 `li-action` 복사 버튼으로도 노출 → 위험/질문 메인 affordance 대칭(severity → 본문 → meta-cue → 복사 버튼). 복사 버튼 클릭이 드로어를 열지 않는 것은 기존 `.copy-btn` 제외 가드(`html.js` DRAWER_SCRIPT)가 이미 커버 — 신규 코드 0, 테스트로 고정. 신규 시각 시스템·신규 색 토큰 0(콘솔 셸 계약 PR #57~#63 불변), 복사 인프라(`data-copy`/`#ic-copy`/`COPY_SCRIPT`/드로어 가드) 전부 재사용. impeccable critique CONVERGED(4 Output Constraints 충족 — 복사 버튼 neutral `.copy-btn` 토큰 재사용·강조색 0, 더보기가 Constraint 4 직접 충족). plugin.json `1.18.6 → 1.18.7` patch bump(Codex R1 F2 — PRD 미완 상태 minor 시기상조; PRD 완전 종료 시 minor 정리는 별도 hot-fix) + 양 footer. PRD M3 row stale-status 정리(in-progress → complete, #63 ship 반영). 565 test PASS(renderer 460 + derive 87 + stale-audit 18), 0 회귀. H16 advisory는 truncated `relatedOpenQuestion` cue의 기존 cross-section 부채(base 동일, M4 신규 마커 0). **시각-검토 후속 진실성 2건**(사용자 피드백 2026-06-25): (a) 게이트 파이프라인이 PR 미생성(pr 노드 receipt 없음)인데도 "PR 검토 중"을 표기하던 거짓 신호를, active stage 의 node status 가 `missing`(미시작)이면 "PR 대기"/"구현 대기", `active`(in-progress receipt)면 "PR 검토 중"/"구현 중"으로 구분(`pipeline.js#statusOf`). (b) 타임라인 decision_id 가 `tail(…,24)`로 공유 prefix 를 잘라 "lness-m4-…"처럼 단어 중간이 깨지던 것을 full id + `title` 툴팁 + CSS ellipsis(prefix 유지, `.pipe-id` 동형)로 정정(`audit-timeline.js` + `.audit-dec`).

### Changed

- **`scripts/lib/renderer/sections/audit-timeline.js`** — `TIMELINE_EXPANDED=8` 더보기 분할(상위 N expanded `<ol>` + 나머지 `<details class="more">+N 더보기` 접힘). 각주를 `<ul class="audit-notes">` 별도 컨테이너로 이동(Codex R1 F1). `renderRow`가 target 배열(expanded|collapsed)로 push, isLast/ordinal 글로벌 시퀀스 기준. `TIMELINE_EXPANDED` export. (시각-검토) decision_id full 표시 + `title`(tail 중간잘림 제거).
- **`scripts/lib/renderer/sections/pipeline.js`** — (시각-검토) `statusOf` 가 active stage node status 로 대기(missing)/진행(active) 구분 — "PR 검토 중" 거짓 신호 제거.
- **`scripts/lib/renderer/sections/open-questions.js`** — 메인 `inline-prompt`(`<code>` + 버튼) → `li-action`(복사 버튼만). 전체 명령은 드로어/STATUS.md에 불변 보존.
- **`scripts/lib/renderer/sections/risks.js`** — 메인 `li-action` 복사 버튼 추가(OQ와 동일 markup·aria-label, `ap.fullText` 재사용).
- **`scripts/lib/renderer/html.js`** — `.inline-prompt` CSS → `.li-action`(우측 정렬·neutral, `.copy-btn` 토큰 재사용). `.audit-notes` 컨테이너 CSS(muted 톤). footer v1.18.7.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.7.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — 타임라인 더보기 + 위험/질문 복사 대칭 surface 문서화.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M3 row in-progress → complete(stale-status 정리, Codex R1 F2).

### Tests

- `audit-timeline-snapshot.test.js` — 더보기(top-N + `<details>`) + boundary connector(글로벌 마지막만 connector 생략) + 각주 순서(collapsed 뒤 `<ul class="audit-notes">`) + cap 초과 `+N older` 공존 + detailMap 전 행 적재.
- `four-part-rendering.test.js` / `a11y-aria-labels.test.js` / `section-fidelity.test.js` — OQ 메인=복사 버튼만(`<code>` 미노출) + 위험 메인 복사 버튼(대칭, 고정 aria-label) + anatomy `inline-prompt → li-action`.
- `drawer.test.js` — 복사 버튼 클릭 ≠ 드로어 open 가드(markup-level, 신규 코드 0).
- `markdown-equivalence.test.js` — 타임라인 더보기 html↔md 정보 동등(접힘 행 양쪽 보존).
- `output-constraints.test.js` — M4 surface(더보기·li-action·audit-notes) design-lint clean(신규 위반 0).

## [1.18.6] — 2026-06-25

dashboard-truthfulness M3-b — 위험·질문 진실성 *표현*(탭·전용 nav·뱃지). M3-a(해결 마커 + 결정적 render)가 *데이터*를 truthful하게 만들었으나 *표현*이 여전히 오해를 유발했다(사용자 피드백 2026-06-25): 위험 패널의 트레일링 "해결됨 243건" 큰 숫자가 메인 흐름에서 "위험 250개" 착시, OQ 패널의 "해결됨 30건"이 ~40 미해결 착시. M3-b는 그 표현 gap을 닫는다. (1) **active/완화됨 CSS-only 탭** — `parsers/tabs.js` 순수 빌더(hidden radio + flex `order` + 인접 `:checked + label + panel` 형제 선택자, JS 0). 위험/OQ 패널의 트레일링 `해결됨 N건 <details>`를 폐기하고 `미해결`(default-checked) · `완화됨`/`해결됨` 탭으로 분리 — 큰 resolved 숫자는 탭 label의 neutral 뱃지에만 노출(메인 흐름 제거). resolved 0이면 탭 없이 미해결 직접 노출. (2) **전용 route 분리** — 단일 `route-attention`(위험·질문)을 `route-risks` + `route-questions`로 split + 좌측 nav를 `위험`(ic-alert) + `미해결 질문`(ic-help) 2 entry로 + 각 nav-link에 active count 뱃지(neutral, 0이면 미표시). CSS :target routing/topbar-title/active-state 규칙 + tb-title 동반 갱신. (3) **정중한 empty state** — `발견된 위험이 없습니다.` / `미해결 질문이 없습니다.`. (4) **apply.js lock fail-closed**(Codex M3-b F4) — `withFileLock` lock 획득 실패 시 fail-open(경고 후 진행)이던 것을 fail-closed(편집 폐기·aborted 반환)로 — lost-update 1차 방어가 lock 보유, content-hash CAS는 2차. STATUS.md plain-text 동등은 탭 → `완화됨/해결됨 N건` 접힘 매핑(drawer-detail SSoT 불변). impeccable critique CONVERGED(4 Output Constraints 충족, 신규 강조색 0, raw marker 누출 0; 정식 a11y는 PR 단계 a11y-architect). code-review 후속(비블로킹): `enumerate.js` loud-fail-open 완성(stderr만 떴고 구조적 `degraded`/`warnings` 신호는 죽어있던 것 — read/parse 실패가 `warnings[]`에도 누적되도록 `pushWarn` wiring) + CHANGELOG versioning note stale 버전(`1.17.0 → 1.18.6`) 정정. plugin.json `1.18.5 → 1.18.6` patch bump + 양 footer. 557 test PASS(renderer 452 + derive 87 + stale-audit 18), 0 회귀.

### Added

- **`scripts/lib/renderer/parsers/tabs.js`** — CSS-only 탭 빌더(순수 함수, JS 의존 0). `buildTabs(spec, formatUtils)` — radio+label+panel triple, default-checked, neutral count 뱃지, escapeHtml/escapeAttr, fail-open(빈 탭 → `''`). risks/open-questions 단일 SSoT 공유.
- **테스트** — `tabs.test.js` 신규(triple 구조·default-checked·count 뱃지·escape·fail-open) + `apply.test.js` lock 선점 fail-closed 회귀(write 0 + aborted).

### Changed

- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — 트레일링 `해결됨 N건 <details>` → active/완화됨(해결됨) 탭(`buildTabs`). resolved 큰 숫자는 탭 label 뱃지에만. empty state 정중화. `activeCount` 반환(nav 뱃지 입력). md는 plain-text `완화됨/해결됨 N건` 접힘 동등.
- **`scripts/lib/renderer/html.js`** — `route-attention` → `route-risks` + `route-questions` 분리. nav-rail `위험·질문` 단일 → `위험` + `미해결 질문` 2 entry + neutral count 뱃지. `.tabs`/`.tab`/`.tab-panel`/`.tab-radio`/`.tab-count` CSS(강조색 0, flat). CSS :target routing/topbar-title 동반 갱신. footer v1.18.6.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.6.
- **`scripts/lib/stale-audit/apply.js`** — `withFileLock` fail-closed(Codex M3-b F4) + `lockMaxRetries` 테스트 seam.
- **`scripts/lib/stale-audit/enumerate.js`** — loud-fail-open 완성(code-review M1): `warn()`가 stderr만 쓰고 `warnings[]`/`degraded`는 죽어있던 half-wiring을 `pushWarn(warnings, msg)`로 닫음 — read/parse 실패가 구조적 `degraded=true` 신호로도 surface. `enumeratePlan`/`enumeratePrd`에 `warnings` sink thread. `enumerate.test.js` read-실패 회귀 1건 추가.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — active/resolved 탭 + 전용 route + 섹션 뱃지 문서화.

## [1.18.5] — 2026-06-25

dashboard-truthfulness M3 — 위험·질문 은퇴 + 마일스톤 lifecycle (평가 기반 소스 최신화). M3의 본질을 *render-side 추정 은퇴*에서 **평가 기반 소스 최신화(해결 마커)**로 재설계한다(사용자 결정 2026-06-24). 세 부분: (1) **비파괴 해결 마커 컨벤션 + 결정적 render** — 위험/OQ 라인 끝(trailing)에 `<!--mccp:resolved reason="…" at="…"-->` 마커를 달면 render가 메인에서 빼고 "해결됨 N건" 접힘으로만 노출(되돌리기 가능). resolved 신호는 **마커뿐** — bare `[x]` 체크박스나 milestone status 추정은 은퇴 안 함(Codex 재설계 F1, "explicit row-level closed marker"). 마커는 **셀 split 이전 라인 단위로 추출·제거**해 표 phantom 셀 0 + reason의 `|`/`"`/`-->` escape(Codex 재설계 F2). 컨벤션을 *문서화*하는 plan 본문(prose 안 backtick 마커 언급)이 거짓 은퇴되지 않도록 reader는 trailing 마커만 인정. (2) **`/mccp:dashboard-audit` 재사용 명령** — agent가 active(미마커) 항목을 현재 구조와 대조해 `live|resolved|obsolete` 평가(증거 인용 필수, 불확실 시 live 보수), 제안 테이블 human-gate 승인 후 결정적 applier가 소스 `.md`에 마커 삽입. applier는 per-file lock + content-hash compare-and-swap(rename 직전 재-read, 불일치 abort) + 파일당 1 트랜잭션 batch + idempotent + 편집 후 재-parse 무손상 검증(Codex 재설계 F3 lost-update 방지). 평가(추론)는 명령에만, render는 결정적 마커 reader — derive/render의 read-only·LLM-free·결정성 불변. (3) **마일스톤 lifecycle** — `VALID_STATUSES`에 `dropped` 추가 + pending/dropped를 마일스톤 패널 default-off `<details>` 토글(비-색 ◌ 예정 / ⊘ 폐기 이중표기)로 노출 + audit가 stale in-progress 마일스톤 status 최신화("진행중=실제"). lifecycle 파싱은 완료-기록 early-return 앞(Codex 재설계 F3 — lifecycle-only PRD도 렌더). plugin.json `1.18.4 → 1.18.5` patch bump + 양 footer 동기화. 548 test PASS(renderer 446 + derive 87 + stale-audit 15), 0 회귀.

### Added

- **`scripts/lib/renderer/parsers/resolution-marker.js`** — 순수 마커 컨벤션. `RESOLVED_TRAILING_RE`(trailing-anchored) + `isResolved`/`extractMeta`/`stripLineMarker`(셀 split 이전 전처리) + `stripMarker`(display) + `escapeMarkerReason`(`|`/`"`/`-->` 제거) + `buildMarker`. fail-open.
- **`scripts/lib/renderer/parsers/resolution-classify.js`** — `annotateResolution(planBody)` risk/OQ resolved flag 정규화·전파 seam(마커 기준만, 추정 0). index.js dedupe 직후 wiring.
- **`scripts/lib/stale-audit/{enumerate,apply,index,locate}.js`** — 결정적 stale-audit lib. enumerate(active 항목 + 안정 ref) + apply(비파괴 마커 삽입, F3 lock + hash CAS + batch + 재-parse 검증 + 오매칭 skip) + locate(enumerate↔apply 라인 위치 정합) + facade.
- **`commands/dashboard-audit.md`** — `/mccp:dashboard-audit` 재사용 명령(enumerate → evaluate(agent, 증거) → propose+human-gate → apply → render).
- **테스트** — resolution-marker(trailing/메타-케이스/escape) + resolution-classify(전파·fail-open) + milestone-lifecycle(토글·완료0·비-색 마커) + stale-audit enumerate/apply(F3 hash-mismatch abort·batch·idempotency·재-parse·오매칭).

### Changed

- **`scripts/lib/renderer/parsers/plan-body.js`** — `parseTableRows` withMeta(행끝 마커 셀 split 이전 strip) + `parseOpenQuestions`/`parseRisks` resolved flag(마커만) + `VALID_STATUSES`에 `dropped` + `parseDeliveryMilestonesLifecycle` 신설(pending/dropped, 링크 무요구). 기존 반환 키 불변(additive).
- **`scripts/lib/renderer/index.js`** — dedupe 직후 `annotateResolution` wiring(try/catch fail-open).
- **`scripts/lib/renderer/sections/{risks,open-questions}.js`** — active(미해결) 메인 + resolved 트레일링 `<details>`("해결됨 N건") 분할. 드로어 detail 유지(H18 trigger==key 카운트 보존). 마커 display 누출 0(stripMarker). STATE.md OQ는 항상 active.
- **`scripts/lib/renderer/sections/milestone-history.js`** — lifecycle(pending/dropped) 수집을 완료-기록 early-return 앞으로 + default-off 토글 렌더(비-색 ◌/⊘). 완료0·lifecycle-only PRD도 렌더(Codex F3).
- **`scripts/lib/renderer/html.js`** — `.ms-life-mark`/`.ms-lifecycle` 비-색 텍스트 마커 CSS(신규 색 토큰 0). footer v1.18.5.
- **`scripts/lib/renderer/markdown.js`** — footer v1.18.5.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — 해결 마커 컨벤션 + audit 명령 surface + lifecycle 토글 문서화.
- **`.claude/prds/dashboard-truthfulness.prd.md`** — M2 complete + M3 in-progress + Plan cell + MVP/메트릭 문구를 "평가 기반 소스 최신화(해결 마커)"로 갱신(ledger-스냅샷-은퇴 → 마커-기반-은퇴 재설계 반영).

## [1.18.4] — 2026-06-24

dashboard-truthfulness M2 — 개요 → '대시보드' 재구성 + 호스트 버전 / 위젯 / 다음 command. 콘솔 셸의 첫 route(`#route-overview`)를 카운트-only hero에서 **호스트 프로젝트의 현재 상태를 명시하는 '대시보드'**로 재구성한다. (1) 라우트/네비/탭/STATUS.md 섹션을 '개요'→'대시보드'로 재명명(route id·`data-route` 식별자 불변, 표시 텍스트만). (2) 버전을 플러그인 self-version이 아닌 **호스트 프로젝트 신호**(host meta→CHANGELOG→git tag→최신 plan cycle→미상 사다리)에서 derive — provenance를 snapshot 안에 박기 위해 **derive 레이어 additive `model.host_version` 필드**로 stamp하고 렌더러는 snapshot만 소비(Codex R1 F2). derive 는 spawn-free 계약 유지를 위해 git-tag rung을 `allowGit:false`로 skip(rung 자체는 injection으로 보존). (3) 진행중·차단·위험을 카운트가 아닌 **항목 이름**으로 나열(top-3 + `+N 더보기` 접힘). (4) '다음 행동'을 STATE.md `Next Step`에서 추출한 실행가능 `/mccp:*` **full command line**(인자 포함, 필수-인자 검증, 미충족 시 prose-only — Codex R1 F1) + 복사 버튼으로. 렌더 데이터 조립은 `status-grid.js` 한 곳에 집중하고 html/markdown 컴포저는 산출 cell만 읽는다 — STATUS.md plain-text 동등본 불변. Codex Plan-Codex R1 3 findings absorbed: F1(next-action full command line + `REQUIRES_ARG` 검증 + in-progress 폴백 resolved path), F2(host-version derive 레이어 이동 → snapshot provenance 재현 가능, MODEL_VERSION 'v1' 불변), F3(host meta first + CHANGELOG source-라벨 폴백 + plan-cycle framing + `source` 항상 노출). plugin.json `1.18.3 → 1.18.4` patch bump + 양 footer 동기화.

### Added

- **`scripts/derive/host-version.js`** — `resolveHostVersion` 5단 폴백 사다리(host meta → CHANGELOG → git-tag(opt-in) → plan-cycle → 미상), loud fail-open, dep-free. derive 시점 stamp → `model.host_version` snapshot.
- **`scripts/lib/renderer/parsers/next-action.js`** — `resolveNextAction` STATE.md `Next Step` blob → full command line(인자 포함) + `REQUIRES_ARG` 검증 + resume/in-progress 추론 폴백. 순수 함수(model-only).
- **테스트** — host-version(폴백 사다리 각 단 + meta↔CHANGELOG disagreement + spawn-free 계약) + next-action(full command/필수-인자/폴백/마커 정리) + dashboard-overview(named-widget 이름 노출·top-N·접힘 + version snapshot + next-action + STATUS.md 동등본) + schema-drift host_version 가드.

### Changed

- **`scripts/derive/{index,model}.js`** — `model.host_version` additive top-level 필드 wire(derive 조립 + emptyModel + validateShape present-only). MODEL_VERSION 'v1' 불변.
- **`scripts/lib/renderer/sections/status-grid.js`** — dashboard 데이터 조립 일원화: count cell에 named `items` + `version`(host_version snapshot 소비) + `nextAction`(STATE.md) 산출. `md`/`html`/`cells` 키 불변(기존 소비자 호환).
- **`scripts/lib/renderer/html.js`** — '개요'→'대시보드' 재명명(route 식별자 불변) + `renderHeroPanel`을 host-version 줄 + named-widget(top-3 + 접힘) + STATE.md next-action 복사로 재구성(axis-legend 대체) + hero-widget CSS(신규 색 토큰 0). footer v1.18.4. copy-btn label fix — '복사'를 `.cb-label` span으로 감싸 copied 시 `::after`가 append('복사 복사됨') 아닌 replace('복사됨')하도록 수정(drawer 동적 버튼 포함).
- **`scripts/lib/renderer/markdown.js`** — `## 현황`→`## 대시보드`(anchor 포함) + grid.md가 version·named-widget·next-action plain-text 동등 노출. footer v1.18.4.
- **`docs/v1.3.0-observability/{dashboard-surface,schema-surface}.md`** — 대시보드 재구성 surface(§2.1) + `model.host_version` additive 스키마(§12) 문서화.

## [1.18.3] — 2026-06-24

dashboard-truthfulness M1 — 완료 이력 영속화 레지스터 (**foundation — 데이터 레이어 primitive**). `/mccp:pr` 게이트 수렴(pr-codex receipt write) 직후, **git-tracked로 의도된** one-file-per-entry 디렉토리(`.claude/state/completion-ledger/<id>.json`)에 완료 요약 1건을 append하는 epilogue + derive `ledger` source + `milestone-history.js`의 durable fallback(live receipt → ledger → git time → "날짜 미상")을 깔아둔다. receipt는 gitignore + worktree-local이라 merge + `git worktree remove` 후 사라지지만(post-merge amnesia), 레지스터 디렉토리는 git-tracked라 **commit된 엔트리는 worktree 제거 후에도 살아남고** milestone-history가 이를 durable history로 읽는다. **알려진 한계(M1 범위 밖, 후속 milestone)**: 엔트리 write는 `/mccp:prp-commit` **이후**의 `/mccp:pr` epilogue에서 일어나므로 worktree에 *미커밋* 상태로 남는다 — 엔트리를 같은 PR 흐름 안에서 git에 commit하는 **commit-wiring이 아직 없어**, 단일-milestone-ship 후 즉시 cleanup하는 §3.8 표준 흐름에서는 엔트리가 아직 영속화되지 않는다. 본 M1은 write/read/schema primitive까지를 닫고, end-to-end post-merge 생존(commit-wiring)은 후속 axis로 분리한다. **데이터 레이어 전용** — UI/렌더 마크업 무변경(렌더러는 레지스터를 읽기만). Codex Plan-Codex R1 3 findings absorbed: F1(dirty/detached 시 clean-tree gate로 안전 skip + `meta.ledger_write_skipped` 진단 stamp — 재현 불가 commit_sha 방지), F2(단일 배열 대신 one-file-per-entry → distinct 파일명으로 cross-worktree merge 충돌 0, session-ledger 패턴 완전 미러), F3(레지스터 항목 존재가 authoritative 완료 신호 — receipt meta는 diagnostic-only, 소비자는 meta flag가 아닌 항목을 읽음). `receipt_hash` carve-out 계승(briefing 선례) — ledger stamp가 tamper-detect digest 무력화 안 함. plugin.json `1.18.2 → 1.18.3` patch bump + 양 footer 동기화.

### Added

- **`scripts/lib/completion-ledger/store.js`** — one-file-per-entry 저장소(lock+atomic+strict validate, F2) + `isLedgerAppendSafe` clean-tree git-safety gate(F1, allowlist: completion-ledger/STATE.md/cache/receipts).
- **`scripts/lib/completion-ledger/index.js`** — `triggerLedgerAppend` facade(gate-gating + verdict/version 해석 + diagnostic skip stamp, briefing facade 미러, loud fail-open).
- **`scripts/derive/sources/ledger.js`** — `scanLedger` count-source(read-only surface) + `derive/index.js`·`model.js` 등록(additive, MODEL_VERSION v1 불변).
- **receipt schema** `meta.ledger_write_skipped`(present-only boolean, F3 diagnostic) + `hash.js` carve-out.
- **`scripts/lib/renderer/parsers/plan-body.js`** `extractRisksAndOpenQuestions` — ship-time Risks/OQ 스냅샷(M3 은퇴 매칭 입력).
- **테스트** — completion-ledger store(19)/facade + derive ledger-source + hash-ledger-exclusion carve-out + milestone-history headline 회귀(merge+worktree 제거 시뮬) + plan-body 스냅샷 + schema-drift ledger 가드.

### Changed

- **`scripts/receipt/write.js`** — epilogue에 ledger append 와이어(briefing 다음, render-trigger 이전; lazy-require + outer try `(allow)`).
- **`scripts/lib/renderer/sections/milestone-history.js`** — `pickLedgerEntry` durable fallback(live receipt → ledger → git time → 날짜 미상).
- **`docs/v1.3.0-observability/schema-surface.md`** — §11 completion ledger source + `meta.ledger_write_skipped` present-only 행.

## [1.17.0] — 2026-06-23

dashboard 콘솔 셸 + self-contained 타이포 (M3 후속) — [1.16.0]의 다크 콘솔 위에 **좌측 사이드바 앱 셸**을 얹어 멀티페이지 콘솔을 완성한다. **사이드바**(244px sticky): 프로젝트 스위처 + 검색 affordance(현재 `aria-hidden` 시각 placeholder) + 아이콘 page nav(`.nav-link` active = 배경·굵기·아이콘 복합 신호) + 차단 `.pin-alert`. **topbar**(52px sticky): 브레드크럼 + 중앙 page-title(`:has()` 토글) + freshness dot, stale 시 하단 hairline 앰버 전환. nav 레일·상단 status-strip은 폐기하고 status 4축은 개요 hero 인라인 메타로만 유지. **타이포**: vendored `PretendardVariable.woff2`(2.0MB, OFL-1.1)를 base64-inline `@font-face`로 self-contained 임베드 — 외부 fetch 0(`data:` URI는 네트워크 surface 아님 → H13 외부-fetch invariant 통과), woff2 누락 시 system 스택 graceful degrade. **DESIGN.md**: `/impeccable document`로 frontmatter(토큰) + 디자인 시스템 서술 포맷 재작성, `html.js` OKLCH_DARK/LIGHT 토큰과 1:1 정합. **H13 재정의**(docs/v1.3.0-observability/DESIGN.md): font-family banlist → 외부-fetch invariant(로컬 family-name 참조 + vendored data: URI 임베드 허용). lint carve-out(H3 셸 클래스 superset)·H2 content-max(≤1080px) 셸 디자인 정합. 데이터 소스·derive·receipt 스키마 불변(read-side 시각 레이어만). plugin.json `1.16.0 → 1.17.0` minor bump.

## [1.16.0] — 2026-06-23

dashboard 레이아웃 재설계 (M3) — `status.html`을 디자인 스킬 없이 만들어진 평면적 단일컬럼에서 **다크 파이프라인 콘솔**로 재설계한다(impeccable shape→craft 워크플로, 사용자가 미학 방향 신규 탐색 + H-invariant 자유 수정에 confirm). **레이아웃**: 좌측 섹션 nav 레일(작동 plain anchor) + 우측 목적 있는 비중첩 카드 2D(Vercel 대시보드 베이스 — card-in-card 금지가 깔끔함의 규율). **theme**: 다크 default(차분 dev 다크, low-chroma), light는 `prefers-color-scheme: light` opt-in. **정보 위계 3단계**: verdict 배너(primary) → header status 4축 ribbon(status) → 카드(detail), heading ≤3. **반응형**: 구조적 collapse — ≤720px에서 nav 레일이 가로 스크롤 인덱스로, 카드 단일 컬럼 stack, 가로 테이블 `overflow-x:auto`(product.md: 구조 변경이지 fluid 타이포 아님). 컴포넌트 클래스(`.pipe-*`/`.tl-*`/`.oq-item`/`.severity-tag`/`.s-*`/`.milestone-*`)는 섹션 모듈 contract라 보존 — 변경은 토큰·컨테이너·카드·반응형으로 한정. 데이터 소스·derive·receipt 스키마 불변(read-side 시각 레이어만). PRODUCT.md anti-refs 준수(hero-metric/AI-cream/Bloomberg 형광 다크 회피). **H-invariant 개정**: H1(light→다크 default + light opt-in), H2(720px 단일컬럼 → `--content-max` ≤820 콘텐츠 폭), H3(무카드 → 목적 있는 카드 carve-out), 신규 **H17(카드 중첩 금지 — DOM-aware stack scan, 임의 block 태그 `card` token nesting 검출)**. H4/H6/H7(side-stripe·hero-metric·glassmorphism 금지) 유지. Codex Plan-Codex needs-attention 3 finding R1 absorbed: F1(테스트 일괄 갱신이 회귀 마스킹 → Task 7 2-bucket 분리: behavior 동결 + design 변경허용), F2(H17이 `<section class="card">`만 잡아 좁음 → DOM/CSS-aware 확장), F3(M3가 inert M4 affordance 노출 → nav는 작동 anchor만, drawer/active/터미널-prompt 동작은 M4). M4(우측 Drawer 상세 + nav active-추적 + Tailwind `설명|터미널` prompt)는 본 콘솔 셸 위에 후속. renderer 323(+11: 반응형 6, H17 5) + derive 68 = 391 test PASS, 0 regression. plugin.json `1.15.0 → 1.16.0` minor bump.
stage-aware impeccable command routing (M3) — 두 축으로 PRD를 닫음. **Axis A (System 명령 wiring)**: impeccable System 군의 `document`(DESIGN.md 생성)·`extract`(재사용 토큰/컴포넌트 추출)를 routing 카탈로그에 `system` stage + recommend-only base로 추가 — 모든 게이트·모드에서 recommend(heavyweight 생성 명령은 deliberate operator step). `craft`/`live`/`init`/`detect`/`hooks`는 out-of-scope 유지. **Axis B (a11y-architect auto-invoke)**: PR 게이트의 a11y 처리를 "count만 세고 버리는" routing-only에서 실제 `mccp:a11y-architect` Task() auto-invoke로 전환. 트리거는 PR diff의 rendered design surface 존재(`rendering_surface`)이며 Codex finding 유무가 아님 — a11y-architect가 diff를 직접 WCAG 2.2 관점에서 review하고 결과는 PR body `## Accessibility Review` 섹션에 inject. review-only 불변식은 **a11y 전용 pr-phase lock window** + mutations finalizer로 mechanical 보증(편집 시 hard-stop). kill switch `MCCP_A11Y_AUTO_INVOKE=0`. Codex Plan-Codex R1 3 findings absorbed: F1(a11y 트리거가 design-scope preamble로 starve → finding 기반에서 `rendering_surface` 기반으로 전환), F2(codex-runner가 이미 lock exit하므로 전용 a11y-review lock window 신규 획득), F3(`finalize-receipt.js#deriveCodexFlags`에 `--a11y-auto-invoked` forward + `write_flags_used` 노출). plugin.json `1.13.0 → 1.16.0` — main(1.15.0, PR #53)과 forward-only reconcile per CLAUDE.md §3.7.

### Added

- **`scripts/lib/impeccable-routing.js`** — `SYSTEM_COMMANDS = Object.freeze(['document', 'extract'])` + `STAGE_ROUTING.implement`·`.pr`·`PLAN_GUIDE`에 system stage recommend-only entry + export.
- **receipt schema** `meta.a11y_auto_invoked`(present-only boolean) — a11y-architect가 PR 게이트에서 실제 auto-invoke됐는지 audit.
- **테스트** — impeccable-routing(System 명령 게이트×모드 recommend + SYSTEM_COMMANDS frozen), codex-result-filter(a11yFindings 배열 동치/identity/empty/EMPTY_RESULT), impeccable-routing-fields(a11y_auto_invoked round-trip/present-only/non-boolean reject/legacy), finalize-receipt(--a11y-auto-invoked forward).

### Changed

- **`scripts/lib/codex-result-filter.js`** — `filterDesignFindings` 반환에 `a11yFindings` 배열(보조 입력) 추가, `a11yRoutedCount === a11yFindings.length` 동치 보증. 4개 반환 경로 + `EMPTY_RESULT` 동기화.
- **`scripts/lib/pr-phase-helpers/codex-runner.js`** — emit에 `a11y_findings`(보조 입력) + `rendering_surface`(PR diff UI ext 존재, 모든 codexOutcome에서 계산) surface. `computeRenderingSurface(base, cwd)` 헬퍼(UI/cache regex).
- **`scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `deriveCodexFlags`가 `a11y_auto_invoked===true` 시 `--a11y-auto-invoked` forward.
- **`scripts/receipt/schema.js` · `write.js`** — `a11y_auto_invoked` present-only validator + skeleton default(false) + `--a11y-auto-invoked` arg 배선.
- **`commands/pr.md`** — Phase 2.5.6c(a11y-architect review-only auto-invoke, 전용 lock window, mutations hard-stop) + Phase 4 `## Accessibility Review` inject.
- **`commands/prp-implement.md`** — routing 표에 System stage(document/extract recommend) note + a11y는 PR 게이트 전용 명시.

### M1 + M2 (bundled in PR #55 — originally tagged 1.13.0 on-branch; reconciled to 1.16.0 at merge since main independently shipped 1.13.0/1.14.0/1.15.0)

stage-aware impeccable command routing (M1) — 디자인 게이트가 impeccable의 `critique` 단일 호출에 갇혀 있던 것을, 디자인 라이프사이클 단계(discovery→refine→evaluate→harden→polish)에 impeccable 명령을 매핑하는 순수 routing oracle로 확장. 핵심 6개 명령(shape/layout/typeset/audit/harden/polish + 기존 critique) + 모드 토글(auto/hybrid/recommend, default auto) + receipt audit 2필드. 게이트 배치: plan/plan-prd는 `## Design Routing Guide` recommend-only 기록, prp-implement은 실제 stage-aware 라우팅(shape background-best-effort + layout/typeset refine + audit evaluate), pr은 polish/audit/harden recommend-only(review-only invariant). `craft`(기능 chain)·`live`(실시간 브라우저)는 비대화형 게이트와 부적합으로 제외. Codex Plan-Codex R1 4 findings absorbed: F1(`designIntentActive` 입력으로 audited MCCP_DESIGN_INTENT_REASON escape hatch 보존), F2(critique은 routing 일반 명령으로 흡수하지 않고 기존 `decideCritique` retry loop + `design_critique_verdict` divergent blocking 유지), F3(`impeccable_commands_routed`를 structured `{command, call_form, status}` outcome 배열로 — 실패/unknown-skill을 정직히 기록, loud fail-open), F4(`renderingSurface` selector로 control-plane-only signal의 refine/discovery fan-out 차단; auto 기본값은 사용자 product 결정으로 유지, cost-tier auto-downgrade+SLO는 M2 defer). plugin.json `1.12.0 → 1.13.0` minor bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/impeccable-routing.js`** — stage-aware routing oracle. 순수·무의존. `STAGE_ROUTING` gate→command 테이블 + `parseRoutingMode(env)` + `routeCommands({gate, mode, designSignal, designIntentActive, renderingSurface})`. 모드 변환은 downgrade-only(recommend base는 invoke로 승격 안 됨 → pr gate review-only 보존). F1/F4 absorption 입력 포함.
- **`scripts/lib/tests/impeccable-routing.test.js`** — 12 test (모드 변환, 게이트별 매핑, F1 designIntentActive trigger, F4 renderingSurface degrade, pr review-only, plan guide-only).
- **`scripts/receipt/tests/impeccable-routing-fields.test.js`** — 5 test (mode+structured 배열 라운드트립, present-only legacy, invalid mode/enum/malformed reject).

### Changed

- **`scripts/receipt/schema.js`** — `impeccable_routing_mode`(enum auto|hybrid|recommend|null) + `impeccable_commands_routed`(structured `{command, call_form, status}` 배열|null) present-only 검증 + 기본값 2필드. legacy receipt 무변경 통과.
- **`scripts/receipt/write.js`** — `--impeccable-routing-mode` + `--impeccable-commands-routed-file`(JSON 배열 채널, mirror findings-file) arg→meta 매핑.
- **`scripts/receipt/cli.js`** — write usage 줄에 신규 2 플래그 표기.
- **`commands/prp-implement.md`** — design gate에 stage-aware routing 단계(critique loop 앞단, critique 제외) + receipt forward.
- **`commands/plan.md` · `commands/plan-prd.md`** — `## Design Routing Guide` recommend-only 기록(plan은 `--impeccable-routing-mode` forward).
- **`commands/pr.md`** — Phase 1.6에 polish/audit/harden recommend-only stderr 줄(invoke 없음).

### M2 — Extended Refine/Simplify 카탈로그 + content 선별 휴리스틱

M1의 routing oracle에 Extended 카탈로그 10개(animate/colorize/bolder/quieter/overdrive/delight refine · adapt/distill/clarify simplify · optimize/onboard harden)를 추가하고, auto 모드 fan-out 비용을 **content 기반 positive-presence 선별**로 제어. content-detectable 명령(animate←motion, colorize←color, typeset←typography, adapt←responsive)은 `extractDiffSignals`가 diff에서 해당 signal을 positive로 잡았을 때만 auto invoke; 못 잡으면 recommend 강등. mood/direction 명령(bolder/quieter/overdrive/delight)은 diff 감지 불가 → recommend-only base, 4중 AND audited intent(`MCCP_IMPECCABLE_INTENT_COMMANDS`)에서만 invoke 승격. Codex 2-round(Plan F1/F2/F3 + Implement [0]/[1]) absorbed: Plan-F1(signal 추출이 untracked 새 UI 파일 포함 + zero-signal fail-open omission, all-false forward 금지), Plan-F2(정규식이 Tailwind utility/CSS-in-JS camelCase 커버), Plan-F3(mood intent 승격 경로), Implement-[0](detector/renderingSurface/extractDiffSignals 일관 tracked+untracked 파일셋 + greenfield trigger gap 문서화), Implement-[1](routeCommands 반환 schema 안정화 — 내부 `signal` 메타데이터 strip). Receipt schema 무변경(`command` open string). plugin.json bump은 PR merge 시 main(1.15.0)과 forward-only reconcile.

- **`scripts/lib/impeccable-routing.js`** — `STAGE_ROUTING` 확장(implement 14 / pr 5 / plan·prd guide 18) + `MOOD_COMMANDS`/`SIGNAL_KINDS` + `extractDiffSignals(text)`(pure regex classifier) + `selectByDiffSignals(commands, diffSignals)`(positive-presence narrow) + `parseIntentCommands(env)` + `routeCommands`에 `diffSignals`/`intentCommands` 입력 + 반환 schema 안정화.
- **`scripts/lib/tests/impeccable-routing.test.js`** — 13 신규 case(content 선별, mood recommend-only + 4중 AND 승격/비-승격, simplify 단계, backward-compat fail-open, extractDiffSignals CSS/Tailwind/CSS-in-JS fixtures, schema 안정성). 총 25 test PASS.
- **`commands/prp-implement.md`** — routing 블록을 tracked+untracked rendered-surface 단일 셋 기반으로 재작성(RENDERING_SURFACE + extractDiffSignals 일관 도출 + zero-signal fail-open omission) + intentCommands forward + greenfield trigger gap 문서화.
- **`commands/plan.md`** — `## Design Routing Guide` 예시 표에 simplify 단계 + 확장 refine/harden 행 추가(실제 rows는 routeCommands 동적 생성).

## [1.15.0] — 2026-06-23

dashboard 마일스톤 기록 정확성 + 용어 통일 (M2 잔여) — "마일스톤 기록" 섹션의 두 결함을 닫는다. **용어**: 섹션 제목·앵커를 "이정표"→"마일스톤"으로 통일(markdown.js 앵커+heading, html.js h2 — id `milestone-history`는 영어라 불변). **정확성**: 완료 마일스톤 10건이 전부 "날짜 미상"으로 표시되던 근본 원인 4개를 수정 — (A) `derive/sources/plans.js`의 Source PRD 추출이 마크다운-링크만 매칭해 평문/백틱 경로 PRD discovery 누락(`SOURCE_PRD_PLAIN_RE` + `extractSourcePrd`), (B) `parseDeliveryMilestonesComplete`가 Plan 셀 첫 괄호 `(report: …)`를 잡아 plan 대신 report basename 추출(`extractPlanPath` — `.plan.md` 우선), (C) receipt가 working-tree 전용(gitignored)이라 과거 사이클 ship receipt 부재 → `pickShipReceipt` null → completedAt=null(git commit 시점 fallback `resolveGitCommitTime`). 결과: 마일스톤 섹션 날짜 미상 10→0, dashboard 자기 M1 표시 복원. Codex Plan-Codex R1 2 HIGH absorbed: F1(평문 source_prd가 렌더러 plan-dir 기준 resolve로 이중 경로 → `resolvePrdRef` dual-path 해석 + wrapper strip), F2(git fallback basename 재구성이 `.claude/PRPs/plans/completed/` archived plan 미발견 → directory-preserving planPath + completed/ archive basename 최종 후보). Implement-Codex cross-gate dedupe. 모두 read-side 렌더링·상관 로직 — receipt/derive 스키마 불변. renderer 312 + derive 68 = 380 test PASS. plugin.json `1.14.0 → 1.15.0` minor bump per CLAUDE.md §3.7. PRD M3~M6(레이아웃·길찾기·필터·스타일)는 impeccable shape→craft→audit 워크플로로 진행 예정(PRD Design Direction 명문화).

## [1.14.0] — 2026-06-22

dashboard 활동 로그 step-chart (M2) — 진행 현황 대시보드(`status.html`)의 audit-timeline 섹션을 평범한 `<ul>` 텍스트 로그에서 **시간순 세로 step-chart rail**로 변환. 각 receipt가 세로 connector 위 상태 노드 마커(✓ 수렴 / ◐ 진행)로 표시돼 활동 흐름을 형태·색으로 즉시 스캔할 수 있다(GitHub Actions job-run timeline 미학). **데이터 로직(snapshot read, MAX_ROWS caps, 정렬, footnote, briefing, md 출력)은 일절 변경 없이 시각 레이어만 재구성** — 회귀 위험 최소화. 세로 connector는 `.tl-rail::before` background 라인(`border-left` 미사용 → H4 회피), 노드 마커 `.tl-node`만 원형 pill(H3 carve-out 추가). design critique 1 finding absorbed: emphasis 반전 — 20행 timeline에서 converged(흔한 상태)는 quiet(`.tl-done` muted), pending(예외/개입 후보)만 loud(`.s-stale`), accent는 노드에 미사용 → viewport당 accent ≤ 1 보존(M1 pipeline의 converged=accent와 의도적 divergence, cardinality 차이). Codex Plan-Codex R1 1 HIGH + 1 MEDIUM absorbed: F1(STATE.md `chain_aborted`/`session_end_imminent` true 잔재가 in-progress chain short-circuit → state-writer reconcile), F2(`<span class="tl-body">`가 flow content `<blockquote>` wrap = non-conforming HTML → `<div>` 전환 + containment 구조 검증 test). Implement-Codex cross-gate dedupe. plugin.json `1.13.0 → 1.14.0` minor bump per CLAUDE.md §3.7. (M3 GitHub Actions 전체 비주얼 리프레시는 후속 cycle.)

### Added

- **`scripts/lib/renderer/tests/timeline-chart.test.js`** — 8 test (rail wrapper / converged-quiet·pending-loud 노드 매핑 / briefing blockquote containment(Codex F2) / md 동치 / escape / footnote tl-note 비-step).

### Changed

- **`scripts/lib/renderer/sections/audit-timeline.js`** — `renderRow` HTML을 step-chart 구조(`<li class="tl-step">` + `.tl-node` 마커 + `<div class="tl-body">`)로 재구성, wrapper `<ol class="timeline tl-rail">`, footnote li → `.tl-note`. 2-상태 노드 map(NODE_TL). 데이터 로직·md 출력 불변.
- **`scripts/lib/renderer/html.js`** — `.tl-rail`/`.tl-step`/`.tl-node`/`.tl-body`/`.tl-note` CSS(세로 connector `::before` background 라인, 노드 pill, emphasis 반전 색). `PIPELINE_SCRIPT`에 `.tl-step` hover/focus enhancement 추가(vendored jQuery 재사용, 외부 src 0).
- **`scripts/lib/renderer/output-constraints.js`** — `H3_CARVEOUT`에 `tl-node` 추가(노드 마커 한정 carve-out). H4는 background 라인이라 carve-out 불필요.
- **`docs/v1.3.0-observability/DESIGN.md`** — H3 carve-out 행에 `tl-node` + v1.14.0 활동 step-chart design intent 절(세로 rail / emphasis 반전 / 항목 수 상한 근거).
- **`scripts/lib/renderer/tests/{output-constraints,render-integration,audit-timeline-snapshot}.test.js`** — tl-node carve-out narrow 검증 + timeline rail 합성 HTML 포함 + footnote class 회귀 갱신.

## [1.13.0] — 2026-06-22

dashboard 게이트 파이프라인 chart (M1) — 진행 현황 대시보드(`status.html`)에 receipt를 `decision_id`별로 묶어 게이트 진행(plan-codex → implement-codex → pr-codex)을 보여주는 가로 파이프라인 스테퍼 신규 섹션 추가. 기존엔 게이트 스테이지 수렴 상태가 audit-timeline 텍스트 로그에만 흩어져 있어 "이 decision이 지금 어느 단계인가"를 한눈에 못 봤다. 신규 `pipeline.js`가 verdict 다음에 decision별 노드 흐름(✓ 수렴 / ◐ 진행 / ○ 대기)을 렌더한다. 미학 리드는 GitHub Actions 절제(중립 base + 상태색, 신규 강조색 0, 기존 OKLCH 토큰 재사용). baseline은 inline SVG/CSS(JS 없이도 상태 표시) — 외부 script URL 0(self-contained 유지). Codex Plan-Codex R1 2 HIGH + 1 MEDIUM absorbed: F1(canonical 정규화 — `gate_id`∥`gate`, `mccp-*` 만 매핑, `(decision,gate)`별 최신 receipt로 retry false→true 수렴 반영), F2(CDN third-party JS trust-boundary 침범 → vendored-inline 전환으로 raw 데이터 exfiltration 차단), F3(status-aware collapse — 미수렴 decision은 절대 collapse 안 함, `attention→active→complete` 정렬, top-3 + 상태별 카운트). design critique 2 rounds converged. Implement-Codex cross-gate dedupe. plugin.json `1.12.0 → 1.13.0` minor bump per CLAUDE.md §3.7. (M2 활동 로그 step chart / M3 GitHub Actions 전체 리프레시는 후속 cycle.)

### Added

- **`scripts/lib/renderer/sections/pipeline.js`** — 게이트 스테이지 파이프라인 섹션. canonical gate 정규화 + `(decision,gate)`별 최신 선택 + status-aware collapse + 색+아이콘+sr-only 병행(a11y) + 전체 escape. baseline 마크업(JS 무관).
- **`scripts/lib/renderer/tests/pipeline.test.js`** — 10 test (정규화/retry 수렴/collapse/escape/a11y 등).

### Changed

- **`scripts/lib/renderer/html.js`** — `<section id="pipeline">` 조립 + `.pipe-*` CSS(pipe-node pill / pipe-edge 수평 라인, border-left 미사용).
- **`scripts/lib/renderer/index.js`** — `renderPipeline` safeSection wire (grid 다음).
- **`scripts/lib/renderer/markdown.js`** — `## 게이트 파이프라인` 섹션 + anchor (텍스트 표현).
- **`scripts/lib/renderer/output-constraints.js`** — H3 carve-out에 `pipe-node` 추가.
- **`scripts/lib/renderer/tests/four-part-rendering.test.js`** — sections positional fixture 8요소로 갱신.
- **`PRODUCT.md`** / **`DESIGN.md`** — `/impeccable init` 셋업(PRODUCT.md 원칙 6 + 루트 DESIGN.md 신규).
- **`commands/pr.md`** — worktree-safe tmp dir 수정. `/mccp:pr` Phase 2.5.3가 `codex-result.json`/stderr를 literal `.git/mccp/tmp`에 쓰던 탓에 worktree에서 `.git`이 gitdir 포인터 *파일*일 때 `mkdir: Not a directory`로 깨지던 결함 차단 — `MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"`로 진짜 gitdir resolve (누적 8+ cycle 반복 결함). 설명 prose의 `.git/mccp/tmp/` 참조도 `<gitdir>/mccp/tmp/`로 정정.
## [1.12.1] — 2026-06-22

detector probeAvailability 재설계 — 세 built-in 기능 detector(`deep-research-detect.js`/`ultracode-detect.js`/`goal-detect.js`)의 `probeAvailability()`가 `~/.claude/commands/*.md`·`~/.claude/skills/*/` filesystem을 probe하던 구조적 오류를 제거했다. built-in slash command는 user-level command/skill 파일을 남기지 않으므로 이 probe는 기능 활성 여부를 영원히 관측할 수 없었다. 공식 문서로 확정한 실제 활성화 신호로 교체: deep-research/ultracode는 동적 워크플로우 신호(`disableWorkflows`/`enableWorkflows`/env `CLAUDE_CODE_DISABLE_WORKFLOWS`)를 공유하고, goal은 별개 축인 hooks 신호(`disableAllHooks`/`allowManagedHooksOnly`)로 판정한다. 신규 공용 헬퍼 `settings-signal.js`가 managed+user+project 3-level 머지(우선순위 project > user > managed)를 수행한다. Codex Plan-Codex R1 absorbed: F1 HIGH(enterprise managed 정책 fail-open → managed 경로 OS별 읽기 추가 + managed present-but-unreadable 시 `unknown` 강등), F3 MEDIUM(goal/workflows 비대칭 근거 → 각 기능의 공식 활성화 모델 차이 본문화), F2 MEDIUM(런타임 게이트 버전/trust 체크 → backlog DEFER). Implement-Codex cross-gate dedupe. plugin.json `1.12.0 → 1.12.1` patch bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/settings-signal.js`** — 3-level settings 머지 공용 헬퍼. `readMergedSettings`(managed+user+project, fail-loud parse via settings-writer) + `workflowsEnabled(opts)` tristate + `hooksGoalEnabled(opts)` tristate(F1+F3 absorption — managed 포함, 미확인 시 unknown) + `MANAGED_SETTINGS_PATHS` OS 상수.
- **`scripts/lib/tests/settings-signal.test.js`** — 17 test (머지 우선순위 4 + workflows tristate 6 + hooks tristate 6 + OS path 1).

### Changed

- **`scripts/lib/deep-research-detect.js`** / **`ultracode-detect.js`** — `probeAvailability`가 filesystem probe 대신 `settings-signal.workflowsEnabled()` 위임. env override(`MCCP_DEEP_RESEARCH_SKILL`/`MCCP_ULTRACODE_FEATURE`) 최우선 유지. 옵션 시그니처 `{projectRoot,userPath,projectPath,managedPath}` 주입 가능.
- **`scripts/lib/goal-detect.js`** — `probeAvailability`가 `settings-signal.hooksGoalEnabled()` 위임. goal은 default-on이라 hook-disable 신호 부재 = 활성. env override(`MCCP_GOAL_FEATURE`) 최우선 유지.
- **3 detect 테스트 파일** — filesystem probe 케이스(S1d/S8c/S8d/S9 등)를 settings 신호 케이스로 교체.

## [1.12.0] — 2026-06-22

dashboard serve + refresh commands — `.claude/cache/status.html` 대시보드를 localhost로 띄우는 `/mccp:dashboard`와 캐시를 다시 굽는 `/mccp:dashboard-refresh` 추가. 기존엔 `derive/cli.js render` 수동 실행 + 파일 직접 열기 + 자주 stale한 캐시라는 3단 마찰이 있었다. `/mccp:dashboard`는 띄우기 직전 자동 render → dep-free Node `http` 서버를 `127.0.0.1`에 bind → 브라우저 자동 오픈 → `.claude/cache/` watch로 status 변경 시 SSE live-reload. 캐시 `status.html`은 byte-pristine 유지(reload `<script>`는 서빙 시점 on-the-fly 주입). Codex Plan-Codex R1 2 findings absorbed: F1(PID 파일을 repo/cache scope — `{pid,host,port,started_at,repoRoot,statusPath}` 기록 + same-host·live-PID·repoRoot·statusPath 4중 일치 시만 재사용 → worktree 간 stale PID로 다른 checkout 서버 URL 반환 차단), F2(포트 +1 silent fall-forward 제거 → 우리 서버면 identity probe로 재사용, foreign이면 loud 충돌 + `--port` 요구 → bookmark 안정성 보존). Implement-Codex cross-gate dedupe. plugin.json `1.11.0 → 1.12.0` minor bump per CLAUDE.md §3.7.

### Added

- **`scripts/lib/dashboard-server.js`** — dep-free localhost 대시보드 서버. 고정 라우트(`/` reload 주입 + `/__mccp_reload` SSE + `/__mccp_identity` JSON, 그 외 404 — `req.url`→파일 매핑 없어 path-traversal surface 0). `startServer`/`createServer`/`injectReloadScript`/`isReusablePid` 등 export. fs.watch + watchFile 폴백 live-reload, 브라우저 오픈/watch는 loud fail-open.
- **`commands/dashboard.md`** — `/mccp:dashboard` (render → background 서버 → URL/PID/stop 보고).
- **`commands/dashboard-refresh.md`** — `/mccp:dashboard-refresh` (`derive/cli.js render` wrap, 서버 무관).
- **`scripts/lib/tests/dashboard-server.test.js`** — 13 test (reload 주입, 라우트, identity JSON, SSE, 404, missing-status 안내, PID roundtrip + repo scope, isReusablePid 3중 AND, 127.0.0.1 bind, our-server 재사용).

## [1.11.0] — 2026-06-22

v1.4.2 dashboard overhaul — Milestone 3 ship (a11y WCAG 2.2 AA + 잔여 OQ 명문화). PRD §M3 두 축을 단일 PR로 정리. (a) semantic landmark + skip-link (clip-based sr-only / focus-visible explicit) + footer role=contentinfo + main id=tabindex=-1 + status-strip 1 tab stop(group label dynamic 4축 aria-label, cell non-focusable + icon aria-hidden) + severity-tag aria-label "위험도: 한글" + copy-btn aria-label "다음 액션 복사" + WCAG AA contrast lint(OKLCH → sRGB → luminance dep-0 oracle) + severity color-only 금지 lint, (b) PRD §Open Questions OQ-a~g 7건을 M1/M2 채택 default로 본문화. Codex Plan-Codex R1 4 findings(F4 status-cell unreachable / F5 severity drift / F6 contrast oracle / F7 skip-link clip-based) + impeccable critique F1/F2/F3 모두 plan body absorbed → Implement-Codex cross-gate dedupe. plugin.json `1.10.0 → 1.11.0` minor bump per CLAUDE.md §3.7 (M3 milestone ship → minor).

### Added

- **`parsers/severity-meta.js`** — single source severity 메타데이터. 5 enum × 4 필드 (`visible` English / `srLabel` 한글 / `icon` emoji / `className` s-prefix) + `severityMeta(sev)` lookup + `severityTagHtml(sev, escapeHtml)` 통일 render helper. mixed-language drift 차단(F5 absorption).
- **`parsers/oklch-contrast.js`** — W3C CSS Color Module Level 4 §16.4 정합 dep-0 변환기. `oklchToOklab` → `oklabToLinearSrgb` → `linearSrgbTosRgb` → `sRGBtoLuminance` → `contrastRatio` 5-stage pipeline. `contrastRatioOKLCH(fg, bg)` convenience export. independent oracle로 false-pass 차단(F6 absorption).
- **`tests/oklch-conformance.test.js`** — 11 test. 변환 단계별 ε ≤ 0.005 tolerance + gamma boundary + 21:1 black/white reference + bg-light/bg-dark luminance bounds.
- **`tests/a11y-contrast.test.js`** — 8 production case strict `>=` (ε 없음). light + dark × {ink ≥ 7, muted ≥ 4.5, accent ≥ 3 large, blocked ≥ 4.5}. token L 조정 권장 fail message.
- **`tests/a11y-landmarks.test.js`** — 9 test. main/footer landmark + skip-link sr-only/focus-visible + clip-based pattern + offscreen -9999px 폐기 invariant + h1 단일 + raw alert role.
- **`tests/a11y-aria-labels.test.js`** — 9 test. severity-meta 5 enum 4 필드 + 한글 fallback("미상") + severityTagHtml 통합 invariant(aria-label 한글 + visible 영어 + icon hidden) + status-strip group tabindex/aria-label/현황 4축 prefix + 심각도 legacy mixed-language 0건.
- **`tests/a11y-severity-non-color.test.js`** — 5 test. severity-tag 추출(중첩 span 인식) + 4 sev × 2 surface(OQ/Risks) 모두 icon AND text 동시 보유 invariant.
- **html.js CSS** — `.sr-only` (clip-path inset 50%) + `.skip-link:focus-visible` (fixed top/left, accent bg, z-index 11) + `details summary:focus-visible` + `.status-strip:focus-visible` + severity-tag `font-weight: 600` (색 약시 보조) + `main:focus { outline: none }`.
- **html.js markup** — `<a class="skip-link sr-only" href="#main">본문 바로가기</a>` after `<body>` + `<main id="main" tabindex="-1">` + `<footer role="contentinfo">` + `<code lang="en">.claude/</code>` + status-strip `tabindex="0"` + dynamic aria-label `현황 4축: <label1> <value1> · <label2> <value2> · …` + cell `<span class="icon" aria-hidden="true">`.

### Changed

- **`sections/open-questions.js`** — `severityTagHtml` import (severity-tag 본문 단축). copy-btn에 `aria-label="다음 액션 복사"` 추가(한글 전용 고정).
- **`sections/risks.js`** — 동일 — `severityTagHtml` + copy-btn `aria-label="다음 액션 복사"`. SEVERITY_ICON local map 제거.
- **`sections/milestone-history.js`** — `<time datetime="<ISO>">` semantic 시간 wrap (날짜 미상은 fallback).
- **html.js LAYOUT** — `header .status-strip .cell:focus-visible` 룰 제거(cell non-focusable). `header .status-strip:focus-visible` 신규 룰로 교체.
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** §Open Questions OQ-a~g 7건에 "**결정 (v1.4.2-M3)**: …" sub-bullet append (M1/M2 채택 default 본문화). §Risks "design direction anchor 4 위반" 행 mitigation column에 M3 lint 4종 mechanize 추가. §Design Direction Acceptance criteria 5 a11y 항목 `[x]` 체크. M3 row in-progress → complete.
- **plugin.json version bump** `1.10.0 → 1.11.0`.

### Deviations from plan

- **status-grid.js 변경 0건** — plan §Files to Change에 status-grid.js UPDATE가 명시되었으나, status-grid의 `html` 출력은 dashboard 어디에도 surface되지 않음(html.js는 `grid.cells`만, markdown.js는 `grid.md`만 사용). 실제 strip은 html.js의 `renderStripCell`이 담당하며 본 PR에서 같은 파일이 이미 a11y 적용 받음. status-grid.js 수정은 dead code 변경이라 skip.
- **aria-label line count vs occurrence count** — plan validation `grep -c 'aria-label' .claude/cache/status.html` ≥ 7은 line-count 가정. compact HTML(한 줄에 다수 aria-label)에서 line count = 3으로 보이나 실제 occurrence는 5건(strip 1 + 위험도 2 + 다음 액션 복사 2). 정성 invariant는 모두 통과.
- **design-gate H3/H4 carve-out (main merge resolution)** — main에서 merge한 v1.3.0 design-gate `output-constraints.js` H3(card-less) + H4(stripe-less) absolute-ban rule이 v1.4.2 4-part OQ/Risks 컴포넌트(severity-tag pill + action-prompt code chip + meta-cue stripe + skip-link + copy-btn + raw-alert banner) design intent와 정면 충돌. selector-aware carve-out으로 해결 — `findSelectorContext()` helper + `H3_CARVEOUT`/`H4_CARVEOUT` regex(severity-tag/action-prompt/skip-link/copy-btn/s-secret/[role="alert"] + blockquote/meta-cue) 적용. carve-out selector 매칭 hit는 ignore, 일반 layout chrome의 카드/스트라이프는 여전히 absolute-ban. DESIGN.md H3/H4 row에 carve-out 명문화. 281/281 test PASS.

## [1.10.0] — 2026-06-21

v1.4.2 dashboard overhaul — Milestone 2 ship (content + actionability). PRD §M2 5축을 단일 PR로 정리. (3) jargon expand — static whitelist 기반 `<abbr title>` / markdown parenthetical. (4) cross-section dedupe — OQ ↔ Risks 의미 overlap에 `> 동일 OQ 참조` cue. (5) milestone history — PRD complete row + `mccp-pr-codex` receipt cross-ref로 새 section `<section id="milestone-history">`. (6) intent extraction — plan/PRD `## Hypothesis`/`## Summary` 1줄을 verdict suffix + status-grid `next` tooltip에 부착. (9) actionability — OQ/Risks 4-part component (severity tag + item text + `> 왜:` meta-cue + action prompt code + `[복사]` button). plugin.json `1.9.0 → 1.10.0` minor bump per CLAUDE.md §3.7 (M2 milestone ship → minor).

### Added

- **`parsers/jargon-dictionary.js`** — 37-entry static whitelist (gate name / env var / command / concept / file path 식별자). `expandJargon(text, opts) → { text, expansions }` pure function + `renderJargonHtml` (escapeHtml 적용 후 `<abbr title>` wrap) + `renderJargonMarkdown` (parenthetical). longer-key-first sort + first-occurrence-only invariant via `opts.seen` Set. span overlap guard로 `/mccp:plan-prd` 안 `/mccp:plan` 이중 expand 방지. 6 fixture test.
- **`parsers/intent-extractor.js`** — `extractIntent(body)` + `extractIntentFromPath(absPath, opts)` pure functions. PRD body 우선순위 `## Hypothesis → ## Problem → ## Summary` 첫 non-empty line. 60자 cap + `…` suffix. fsRead 주입 가능. 5 fixture test.
- **`parsers/action-prompt.js`** — `buildActionPrompt(item, kind)` severity-routed static template. CRITICAL/HIGH → `/codex:rescue`, MEDIUM → `/mccp:plan`, LOW/UNKNOWN → `/mccp:plan-prd`. risk kind는 `리스크 완화: <risk> — 제안 mitigation: <mit>` arg 합성. quote escape + 200자 cap. 8 fixture test.
- **`parsers/cross-section-dedupe.js`** — F3 absorption. token Dice coefficient + threshold 0.30 (plan spec Jaccard 0.45는 size-imbalance에 약함 — Dice가 더 robust). marker regex `\*\*[A-Za-z0-9_.\- ]+\*\*` (dot variant 포함). 한국어 postposition strip(`이/가/을/를/은/는/의/도/로/와/과/에` + `으로/에서/하면/하는` 등). risk+mitigation 결합 tokenize. Risks row에 `relatedOpenQuestion` + `_dedupeScore` mutation, OQ는 변경 없음. 7 fixture test (real PRD OQ-a/Risk-1, OQ-f/Risk-2 absorption fixture 포함).
- **`sections/milestone-history.js`** — `renderMilestoneHistory(model, formatUtils, planBody, opts)`. PRD `## Delivery Milestones` complete row + `mccp-pr-codex` receipt cross-ref. F2 absorption — `r.gate_id || r.gate` 양쪽 호환(derive normalize 출력은 `gate`). 5 expanded + `<details>` collapse. dedup by planBasename + completedAt desc sort. 날짜 미상 fallback.
- **4-part component** in `sections/open-questions.js` + `sections/risks.js` — severity tag (🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / ⚪ LOW) + item text(jargon expand 적용) + `<blockquote class="meta-cue">왜:` + `<div class="action-prompt"><code>...</code><button class="copy-btn" data-copy>...` + (Risks only) `<aside class="related-oq">동일 OQ 참조: ...`. 3 expanded + `<details>` collapse. F1 absorption — `data-copy`은 `escapeHtml`만 (escapeAttr URL-encode 회피로 slash command 복사 가능).
- **`parsers/plan-body.js`** line-aware `parseOpenQuestions` — 시그니처 `string[]` → `Array<{text, lineNumber, headingPath, oqHeadingLineNumber}>`. heading stack 유지로 OQ item이 어느 heading 아래 있었는지 추적. `parseDeliveryMilestonesComplete(prdBody) → Array<{name, planBasename}>` helper export.
- **Copy button JS** in `html.js` — inline event delegation 한 줄. `navigator.clipboard.writeText` + `data-copied="1"` 1.5s 토글 + `::after content: '✓복사됨'`.
- **Intent surface** — `verdict.js` step 9/10 verdict text suffix `next: <slug> — <intent>`. `sections/status-grid.js` next cell `<code title="<intent>">` tooltip. extractor exception swallow → fail-open.
- **CSS** — `.severity-tag` + `.oq-item` / `.risk-item` dashed-border separator + `.meta-cue` blockquote + `.action-prompt` flex-wrap(F2 absorption — 200+ char prompt 안전 wrap + button overflow 방지) + `.copy-btn` focus-visible 2px outline + `.related-oq` aside + `.milestone-history` list-none + WCAG AA `abbr` + `details summary` color(F1 absorption).
- **5 new test files**: `jargon-dictionary.test.js` (6) + `intent-extractor.test.js` (5) + `action-prompt.test.js` (8) + `cross-section-dedupe.test.js` (7) + `four-part-rendering.test.js` (10 — F1/F2 absorption fixture 포함).

### Changed

- **`renderer/index.js`** — milestone-history section wire-up + cross-section dedupe call. sections 배열 6→7 element. opts pass-through 확장 (status-grid + verdict + milestone-history 모두 fsRead/cwd 주입 가능).
- **`renderer/markdown.js`** — `## 이정표 기록` section + 4-part sub-list 변환 + anchor 추가.
- **`renderer/html.js`** — `<section id="milestone-history">` + COPY_SCRIPT inline + 11 신규 CSS 룰.
- **`renderer/verdict.js`** — `computeIntentForNextPlan` 추가, step 9/10 intent suffix.
- **`renderer/sections/status-grid.js`** — next cell intent tooltip + cells schema에 `intent` 필드.
- **`renderer/sections/open-questions.js`** — 4-part 재작성 (raw bullet list → severity-routed component).
- **`renderer/sections/risks.js`** — 4-part 재작성 (table → list).
- **`tests/sections.test.js`** — 4 test 4-part 형식 정합 update (옛 `+N more` / `no risks surface` → `+N 더보기` / `미해결 위험 없음`).
- **`tests/plan-body-parser.test.js`** — `parseOpenQuestions` metadata 객체 형식 검증.
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** Delivery Milestones row 2: Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m2.plan.md](...)`.
- **plugin.json version bump** `1.9.0 → 1.10.0`.

### Deviations from plan

- `parsers/cross-section-dedupe.js` — plan spec의 Jaccard 0.45 threshold가 실제 v1.4.2 PRD OQ-a/Risk-1, OQ-f/Risk-2 데이터에서 size-imbalance(짧은 risk text vs 긴 OQ text)로 매칭 실패. Dice coefficient + threshold 0.30 + risk+mitigation 결합 tokenize로 변경. F3 absorption 의도(real PRD overlap catch)는 그대로 충족. `JACCARD_THRESHOLD` export는 backwards-compat 별칭으로 유지.

## [1.9.0] — 2026-06-21

v1.4.2 dashboard overhaul — Milestone 1 ship (layout / i18n / staleness / 시각 위계). PRD §M1 4축(staleness guard + i18n surface label + status hoist + UX 시각 위계)을 단일 PR로 정리. M2(content + actionability)는 별도 milestone으로 분리. plugin.json `1.8.0 → 1.9.0` minor bump per CLAUDE.md §3.7 (M1 milestone ship → minor; v1.4.0-m3 PR #49가 main에서 1.7.0→1.8.0을 이미 차지했으므로 rebase 후 한 칸 위로 조정).

### Added

- **`computePlanStaleness(plan, model)` + `extractCyclePrefix(slug)`** in `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` — pure helpers. STATE.md `task_fingerprint`의 cycle prefix(`v\d+-\d+-\d+`)와 plan basename cycle prefix를 매칭해 `'fresh' | 'stale' | 'unknown'` 산출. mtime 의도적 제외(worktree rebase noise). `parsePlanBody` 반환에 `planStaleness: Map<basename, 'fresh'|'stale'|'unknown'>` 추가 — in-progress plan에만 entry 보장.
- **Staleness-aware verdict** in `plugins/mccp/scripts/lib/renderer/verdict.js` — step 9 (backlog + in-progress) + step 10 (in-progress only) 분기 추가. 모든 in-progress plan이 stale이면 tone `amber` + text `다음 미정 (stale)` / `다음 미정 (in-progress plan stale)`. `unknown` 또는 entry 부재는 보수적으로 fresh 처리(backwards-compat).
- **`formatPlanLabel(basename)`** in `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` — cycle prefix 추출 + 본문 단축(`'v1-4-2-dashboard-overhaul-m1' → 'v1.4.2 · dashboard overhaul m1'`). 30자 초과 시 ellipsis. stale plan 시 `<span class="stale-label">` 분기로 `<code>` 부적합(스크린 리더 monospace 오독) 회피 — impeccable F2 absorption.
- **Sticky header strip hoist** in `plugins/mccp/scripts/lib/renderer/html.js` — `<header>` 안에 brand(`mccp 상태`) + status-strip(4 cell role="group") + meta(`마지막 갱신 · stale-suffix`) 통합. `<section id="status">` main 본문 제거. accent invariant CSS — `.status-strip .cell:first-of-type`만 `var(--accent)` 적용. `body[data-stale="1"]` 토글로 stale suffix surface.
- **3 new test files**: `tests/staleness-guard.test.js` (10 fixtures — extractCyclePrefix + computePlanStaleness 4가지 시나리오 + parsePlanBody integration + computeVerdict 4 분기) + `tests/i18n-surface.test.js` (10 — html/md Korean h2 presence + English anti-pattern absence + 헤더 brand + footer + v1.9.0 version) + `tests/header-hoist.test.js` (11 — header DOM hoist + 4 cells + 본문에서 section#status 제거 + sticky CSS + accent invariant + stale fixture data-stale attr + span.stale-label 분기).

### Changed

- **i18n surface labels** — section `<h2>` 한글화 (`타임라인` / `미해결 질문` / `위험` / `워커` / `최근 활동`). HTML 본문에서 verdict section의 `<h2>`는 제거하고 `<h1 class="verdict">` 단독으로 surface(헤딩 depth 1→2 jump 회피 + header strip "현황"과의 redundant naming 차단 — impeccable F1 absorption). footer 한글화(`v1.4.2 · <code>.claude/</code> 통합 derive`). markdown.js는 STATUS.md `## 현황` anchor 보존(F3 absorption — M4 trigger의 generic invariant + 외부 text consumer 호환).
- **plugin.json version bump** `1.8.0 → 1.9.0`.
- **`.claude/state/STATE.md` task_fingerprint** `v1-3-0-cycle-close-ready → v1-4-2-dashboard-overhaul` (`state-writer.js` API) — bootstrap chicken-egg 해소. staleness rule이 ship된 시점에 본 plan이 fresh로 판정되려면 fingerprint update가 동일 PR에 들어가야 함(Codex F1 absorption — 4-file atomic bundle).
- **`.claude/prds/v1-4-2-dashboard-overhaul.prd.md`** Delivery Milestones row 1: Status `pending → in-progress` + Plan cell `[v1-4-2-dashboard-overhaul-m1.plan.md](../plans/v1-4-2-dashboard-overhaul-m1.plan.md)`. Row 2(M2)는 그대로.

## [1.8.1] — 2026-06-21

v1.4.x patch — privacy + invariant polish on top of M3 ship. PRD §85(cross-repo contamination risk) + §87(invariant 강화) + §69(M1 session-ledger primitive) + §43(M2 metric — branch name이 STATE.md/logging inject 경로) audit가 검출한 axis 2개를 single PR로 처리. plugin.json `1.8.0 → 1.8.1` patch bump per CLAUDE.md §3.7. No schema/api break.

### Added

- **`session-ledger.js#isValidGitBranch(name)`** — git ref-format rule helper. Total function (`null → true`, non-string → false, never throws). 10 reject rules: length 1-255, leading-dot, double-dot, whitespace, control-char (0x00-0x1F + 0x7F), `@{`, consecutive `/`, trailing `/`, `.lock` suffix, `~^:?*[`.
- **`session-ledger.js#liftLegacyBranch(ledger, sourcePath)`** — read-side branch lift (Codex R1 F1 + R2 F1 absorption). In-memory only — wonky `git_branch` → `null` 강등 + module-level `WARNED_LEGACY_BRANCH_PATHS` Set memo로 per-process per-sourcePath 1회 stderr WARN cap (R2 F3 absorption). 호출 site 4개: `readLedger`, `listLedgers`, `updateLedgerHeartbeat`, `finalizeLedger` 모두 `read → lift → validate` 순서 invariant.
- **`derive/sources/receipts.js` `cwd` field emit** — receipts source가 `meta.cwd`를 surface (v0.2.x-era receipts 없는 키는 `pick()` undefined 처리, additive-only). derive/mask.js receipts cwd mask key와 짝이 활성화됨.
- **`derive/mask.js#safeTrailingSegment(input)` + `isOutsideRoot(input, repoRoot)`** — platform-independent helper 2개 (Codex R2 F2 absorption). 양쪽 slash kind 양쪽 normalize → 마지막 non-empty segment → drive-prefix / empty / `.` / `..` / separator-containing → `_` 대체. POSIX host에서 Windows-drive/UNC 입력도 leak-free.
- **`maskPath()` outside-root placeholder** — `<outside-repo:basename>` 변환. Sibling worktree / parent dir / cross-drive / UNC / restored receipts from other repos 모두 raw segment leak 0.
- **세션-ledger 11개 + mask 7개 새 test** — 5 write-side negative + 1 write-side positive + 1 helper-total + 2 read-side lift + 1 WARN cardinality + 6 maskPath case + 1 outside-root no-separator-leak invariant.

### Changed

- **`session-ledger.js#validate()`** — `git_branch !== null` 블록 안에 `isValidGitBranch` strict rule 추가. createLedger 경로(write-side)만 strict reject. v2 schema version은 유지 (backward-compat — 기존 valid v2 ledger 모두 통과).
- **`session-ledger.js` read paths** — `readLedger`/`listLedgers`/`updateLedgerHeartbeat`/`finalizeLedger` 4개 모두 JSON parse → liftV1 → **liftLegacyBranch** → validate 순서. invalid v2 ledger silent drop 방지 (Codex R2 F1 absorption — discovery surface 보존).
- **`derive/mask.js#maskPath()`** — 기존 `path.relative(root, p)`이 `..` 시작 시 absolute leak하던 결함 차단. `isOutsideRoot()` 3축 detection (Windows-drive cross-drive / UNC / POSIX `path.isAbsolute` + relative `..`) → `<outside-repo:safeTrailingSegment>` placeholder.
- **plugin.json version bump** `1.8.0 → 1.8.1`.

## [1.8.0] — 2026-06-20

v1.4.0 multi-session — Milestone 3 ship (friction zero). M2(PR #46, `33600ac`)가 cross-session discovery 완성한 위에 (1) self/other 시각 구분, (2) friction-telemetry append-only sidecar primitive, (3) full-cycle 2-worktree dogfood protocol을 얹어 PRD §M3 metric("한 cycle 내 2~5 worktree 병렬 cycle을 reconciliation 질문 없이 완주") 달성. plugin.json `1.7.0 → 1.8.0` minor bump per CLAUDE.md §3.7.

### Added

- **`derive/sources/state.js#item.self_session_id` + `item.self_resolution`** (contracted additive-only surface) — env → cwd-match → null deterministic resolution chain. `self_resolution` 4 enum(`resolved` / `resolved-by-cwd` / `env-missing` / `unresolved`) **항상 emit** — Codex Implement R1 F3 absorption (silent null fallback forbidden). Schema-surface §10 등록. resolution chain helper `resolveSelfSessionId(ledgers, options)`도 export.
- **`renderer/sections/active-sessions.js` self/other 시각 구분** — `self_session_id` 매칭 row의 첫 칼럼이 `**this worktree** \`<id>\``(md) / `<tr class="self"><td><strong>this worktree</strong> <code>…</code></td>`(html)로 시각 구분. set이 아니거나 매칭 0건이면 M2 ship 동작 그대로(graceful degrade).
- **`plugins/mccp/scripts/lib/friction-telemetry.js`** — append-only sidecar primitive. `recordBannerInjected({sessionId, projectBranch, cwd?})` 단일 public API. `<repo>/.claude/state/m3-friction-events.jsonl` 1줄 JSONL append. **No in-band cap** — Codex Implement R1 F1 absorption(concurrent SessionStart에서 read-modify-write rewrite가 telemetry event loss를 일으켰던 axis 제거). worktree `.git` file/directory 양쪽 인식. Loud fail-open(stderr WARN + ALLOW + never throw).
- **6 friction-telemetry test cases** — round-trip / no-repo WARN / concurrent 2-process loss-0 regression / CRLF+LF mix / appendFileSync EACCES no-throw / worktree `.git` file detection.
- **7 derive state-source test cases** — `resolveSelfSessionId` 4 enum × 5 case + `collectActiveSessionLedgers` env surface + `scanState` STATE.md absent + env set surface.
- **3 renderer self-marker test cases** — null/match-one/stale-no-match.
- **`docs/v1.4.0-multi-session/m3-friction-metric.md`** — single-purpose explainer. §1 sidecar schema, §2 user-side friction taxonomy 4 카테고리, §3 cycle-end aggregation, §4 dogfood pass criteria 5건, §5 retention deferral.

### Changed

- **`session-start.js`** — `summarizeOtherActiveLedgers`가 실제 banner를 push한 경우에만 `frictionTelemetry.recordBannerInjected` 호출. M2 ship된 banner inject 로직 자체는 무변경. try/catch 외피 + stderr WARN으로 telemetry 실패가 hook을 throw시키지 않도록 보장.
- **`docs/v1.3.0-observability/schema-surface.md`** — §10 신설 "Self session identity surface (v1.4.0-m3)" 2 field + 4 enum + resolution chain documented. additive-only invariant 유지.
- **`docs/v1.4.0-multi-session/state-md-narrowing.md`** — §3 끝에 v1.4.0-m3 self/other 식별 1 단락 추가. STATE.md frontmatter는 여전히 untouched.
- **`.claude/plans/codex-findings-backlog.md`** — row 2(2026-06-19 MEDIUM F4 heartbeat) Finding 칼럼에 `**ABSORBED in v1.4.0-m2 (PR #46)**` 마킹 추가(audit trail 보존). row 3(2026-06-20 LOW F1 sidecar offline retention) 신규 append — v1.5.x cycle 또는 quarterly review 후보.
- **`.gitignore`** — `.claude/state/m3-friction-events.jsonl` 1줄 추가. measurement는 worktree-local.
- **plugin.json version bump** `1.7.0 → 1.8.0`.

## [1.7.0] — 2026-06-19

v1.4.0 multi-session — Milestone 2 ship (cross-session discovery). M1(PR #43, `c071a54`)이 ship한 session-ledger primitive 위에 (1) heartbeat schema v2, (2) SessionStart discovery surface, (3) STATUS.md `## Active Sessions` 섹션 3축을 얹어 PRD §M2 metric("새 worktree 시작 후 첫 5턴 안에 manual reconciliation 질문 0회") 달성. plugin.json `1.6.0 → 1.7.0` minor bump per CLAUDE.md §3.7.

### Added

- **`last_seen_at` (v2 schema)** in `plugins/mccp/scripts/state/session-ledger.js` — ISO8601, required for v2. `createLedger`가 `created_at`으로 anchor, `updateLedgerHeartbeat`가 매 갱신마다 `nowIso()`로 progress. v1 ledger 발견 시 read-only in-memory lift(`liftV1`), 다음 heartbeat/finalize 시점에 disk 파일이 자연스럽게 v2로 rewrite.
- **`updateLedgerHeartbeat({sessionId, projectContext, scopeOverride?, timestamp?})`** — scope-aware, atomic, lock-protected last_seen_at refresh. **hybrid all-or-nothing invariant** (Codex Implement R1 F1 absorption): scope=hybrid 양쪽 path 중 일부만 update 성공하면 `ok=false` + errors에 실패 path 기록. missing-ledger는 `ok=true, noop=true` (idempotent).
- **`listLedgers` host-aware tri-state active filter** (Codex Implement R1 F1+F2 absorption) — hybrid dedupe는 newest `last_seen_at` wins(stale v1이 fresh v2를 가리지 않음). active 분류: cross-host는 heartbeat freshness만으로 판정, same-host는 `(pidIsLive AND fresh heartbeat)` 양쪽 필요. PID alive 단독 + stale heartbeat = PID-reuse 의심 → inactive. 24h fallback TTL은 v2에서 **제거**(false-immortal source).
- **`summarizeOtherActiveLedgers` in `plugins/mccp/scripts/hooks/session-start.js`** — SessionStart 첫 system-reminder에 `Other active mccp sessions in this project:` 블록 inject. 모든 field cap + 1024-char per-block hard budget(Codex Implement R1 F3 absorption — 8000-char SessionStart cap의 13% 이내). `cwd`는 `derive/mask.js#applyPathMask` 재사용으로 username/머신 경로 normalize.
- **`plugins/mccp/scripts/lib/renderer/sections/active-sessions.js`** — M3 renderer에 `## Active Sessions` 섹션 추가. 5-column 표(세션 / 브랜치 / 위치 / 호스트 / 시작). 0건이면 graceful hide. `escapeHtml` 사용으로 angle-bracket payload self-injection 차단.
- **17 new test cases**: `session-ledger.test.js` (4 schema v2 + 6 heartbeat + 6 tri-state + 2 finalize ordering + 1 invariant) + `active-sessions.test.js` (3 render + 1 escape + 1 formatAge boundary).

### Changed

- **`session-start.js`** — `createLedger` 직후 `updateLedgerHeartbeat` 호출로 resume/clear/compact 재시작 시점 last_seen_at re-anchor. discovery banner는 `summarizeActiveInstincts` push 직후 위치.
- **`session-end.js`** — `finalizeLedger` 직전에 `updateLedgerHeartbeat` 1회 호출. ended_at > last_seen_at > created_at 순서 보장(crash-vs-clean 종료 구분 가능). `finalizeLedger` 자체도 endedAt < last_seen_at일 때 +1ms로 자동 보정.
- **`docs/v1.4.0-multi-session/session-ledger-schema.md`** — v1 → v2 schema doc bump. §2에 `last_seen_at` row + §3 Public API에 `updateLedgerHeartbeat`/`pidIsLive`/`liftV1` symbol + `DEFAULT_HEARTBEAT_TTL_MS` (5분, 24h fallback removed) + tri-state filter 본문화. §6 "Deferred to M2" → "M2 Done · M3 Deferred" 재분류.
- **`renderer/index.js` + `markdown.js` + `html.js`** — 6번째 section(`active-sessions`) wire-up. anchors 목록 + section composer destructure 모두 갱신. 기존 5 section 동작 회귀 0.
- **plugin.json version bump** `1.6.0 → 1.7.0`.

## [Unreleased] — v1.4.0 automation modernization axis C (M3)

v1.4.0 PRD `automation-modernization` Milestone 3 ship — Anthropic native `/goal` completion-condition loop integration via cooperative guide pattern. M1+M2+M3 누적으로 PRD M4 (integration template doc) 별도 milestone 불필요 결정 → row status `dropped`. plugin.json version bump은 PR ship 시점 main HEAD 기준으로 결정 (CLAUDE.md §3.7) — 본 entry는 `[Unreleased]`로 두고 PR squash 시 `[X.Y.Z] — YYYY-MM-DD` 로 갱신.

### Added

- **`/mccp:milestone-close <milestone-id-or-prd-path>`** — 신규 slash command. Anthropic native `/goal` loop를 cooperative guide 패턴으로 wrapping해 milestone 종료 acceptance를 mccp receipt chain 안에 anchor한다. Phase 0 PREFLIGHT(working-tree + cost-tier) → Phase 1 DETECT(`goal-detect.js`) → Phase 2 LOCK ENTER + COOPERATIVE GUIDE → Phase 3 WAIT(grammar) → Phase 4 LOCK EXIT + closure-doc write + plan-body provenance stamp → Phase 5 (option B, 신규 gate 없음).
- **`plugins/mccp/scripts/lib/goal-detect.js`** + tests — mode-aware probe (mode=`milestone-close`). PRD `Delivery Milestones` table row parsing + 휴리스틱 (Status=in-progress AND Plan cell filled AND plan file exists). `fs.realpathSync` 기반 symlink path-traversal guard (S2 security absorption). env override `MCCP_GOAL_FEATURE={available|missing|unknown}`. 15 test scenarios + 1 symlink skip (Windows).
- **`plugins/mccp/scripts/lib/goal-phase-lock.js`** + tests — multi-turn isolation lock CLI. lock file `.claude/state/goal-phase.lock`, sidecar token `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` (mode 0o600 per S1 security absorption). lease default 90s (vs M2's 60s — multi-turn `/goal` loop tolerance). ultracode-phase-lock v0.2.8 hardened 1:1 mirror (token authority split + host-aware tri-state reclaim + H2 sidecar mkdir-before-lock + F8 symlink containment). `milestone_id` + `owner_session_id` lock body fields. 17 test scenarios (lifecycle + race + tri-state reclaim + multi-turn heartbeat sim + sidecar mode + sidecar mkdir EACCES) + 1 Windows skip.
- **`plugins/mccp/scripts/hooks/goal-phase-guard.js`** + tests — PreToolUse hook. lock 활성 중 default-deny on mccp write tools + Bash mutating commands + mccp:* Skill invocations (incl. `mccp:milestone-close`). F2 fail-CLOSED on malformed lock. **F3 STRICT non-owner policy (M3 absorption)**: `event.session_id ≠ lock.owner_session_id` 시 read-only ALLOW만 (Read/Grep/Glob/ToolSearch + git read-only Bash + lock lifecycle Bash), 단 Edit/Write/MultiEdit/NotebookEdit/Skill mccp:* 는 session 무관 항상 DENY (closure-doc anchor invariant 보존). F4 MultiEdit deny matrix 포함. S3 Bash policy는 fail-closed whitelist-only. 31 test scenarios.
- **`.claude/milestone-closures/`** — git-tracked closure document 디렉토리. 4-section spec (`## Milestone` / `## Acceptance Condition` / `## Goal Loop Result` / `## Provenance`). 본 디렉토리 파일은 직접 편집 금지 — `/mccp:milestone-close` 출력물. mutation 시 다음 `/mccp:pr` validate에서 plan_hash mismatch로 detect.
- **`docs/automation-modernization/integration-template.md`** §3 layer 4 axis C 셀 + §5 matrix axis C 셀 (option B 채택) + §6 anti-pattern (Stop-hook leakage during multi-turn native loop) + §9 M3 reference (placeholder → reference 전환) + §10 audit checklist 2개 추가 (Stop-hook isolation + Multi-turn lock lease sizing). Status mark `M1+M2-validated → M1+M2+M3-validated`. PRD Open Q §3 결정 stamp.

### Changed

- **`plugins/mccp/scripts/hooks/stop-review-loop.js`** — ~20-line inline freshness validation 추가 (Codex impl-codex R1 F2 absorption — presence-only check는 stale/forged lock에 trivially bypassable). 추가 위치: `modeFromEnv` + `repoRoot` resolve 후, `gitDiffEmpty` 호출 직전. Tri-state freshness = host + pid + mtime < 90s lease (§3.6 host-aware reclaim policy mirror). suppress 시 `[mccp:stop-review-loop] suppressed: goal-phase lock active` stderr + pass-through allow. 기존 함수/decision tree 무변경, backward-compat 보장 (기존 13 시나리오 회귀 0 + 신규 4 시나리오 추가). `os` import 추가.
- **`plugins/mccp/hooks/hooks.json`** — PreToolUse 배열에 `mccp:goal-phase-guard:pre` entry 추가 (matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|Skill`, pr-phase-guard + ultracode-phase-guard와 병렬 등록). Stop 배열 무변경 (stop-review-loop.js 본문 수정으로 처리).
- **`.claude/prds/v1-4-0-automation-modernization.prd.md`** — M2 row Status `in-progress → complete` (PR #42 ship 후 stale 정리), M3 row Status `pending → in-progress` + Plan cell 연결, M4 row Status `pending → dropped` (M1+M2+M3 누적으로 충족 결정, 2026-06-19). Open Questions 3개 모두 결정 stamp.
- **`.claude/milestone-closures/README.md`** — closure document spec + git-tracked invariant 명시.

### Security absorptions (security-reviewer R1)

- **S1 CRITICAL**: sidecar token file mode 0o600 mechanically enforced by `fs.openSync(sp, 'w', 0o600)` in `goal-phase-lock.js#cmdEnter`. POSIX test `fs.statSync(sidecarPath).mode & 0o777 === 0o600` verified.
- **S2 HIGH**: `goal-detect.js#validatePathSafety` uses `fs.realpathSync` for both repoRoot AND target before `path.relative` containment check — symlink-pointing-outside-repo rejected with `reason=path-traversal`. Test covers symlink scenario (POSIX, skipped on Windows).
- **S3 HIGH**: `goal-phase-guard.js` Bash policy is fail-closed whitelist-only — every command segment must match `BASH_ALLOW_PATTERNS`, else DENY. `bash -c "node ..."` wrappers, mixed slashes, env-var expansion all fall through to default-deny.
- **S4 MEDIUM (doc)**: Stop hook short-circuit fail-open invariant explicit — `JSON.parse` 실패(0-byte 포함) → catch → fall-through to existing decision tree (forged-empty lock = normal-stop, not suppress).
- **S5 MEDIUM (best-effort)**: closure-doc write applies `derive/mask.js#applySecretMask` to `Goal Loop Result` section before write (5-regex catalogue reuse: sk-key, aws-key, private-key-block + bearer, password-eq). README spec forbids raw paste.
- **S6 MEDIUM (doc)**: H2 sidecar mkdir-before-lock invariant — `mkdirSync(path.dirname(sp))` MUST be invoked BEFORE `openSync(p, 'wx')` so mkdir failure (EACCES/ENOSPC/race) doesn't orphan a lock without provable ownership channel. Test covers EACCES mock → exit 19 + lock not created.

## [1.9.0] — 2026-06-22

v1.3.0 design-gate M3 follow-up — H15(heading depth ≤ 3) + H16(unrendered markdown literal) mechanical lint rules. Parent M3 plan(`v1-3-0-design-gate-m3-output-constraints.plan.md`)의 partial Axis C deferral 약속을 닫는다. RULES length 14 → 16. PR #45 stacked ship 모드 (M3 lint + M3 follow-up 단일 PR로 묶음). plugin.json `1.7.0 → 1.9.0` (Codex Implement-Codex R1 F1 absorption — main이 v1.4.x cycle로 1.8.1까지 진행, race 회피로 1.8.0 skip 1.9.0 직행).

### Added

- **DESIGN.md H15 spec** — Heading depth ≤ 3. h1(verdict) + h2(section) + h3(sub-section) 허용, h4+ 금지. PRD §Design Direction line 149 "(a) 정보 위계 3단계" mirror. Lint: HTML body `<h([4-9])` 카운트 == 0 AND markdown은 backtick + tilde 양쪽 fenced-code-block strip 후 CommonMark ATX `^ {0,3}#{4,6}\s` 카운트 == 0.
- **DESIGN.md H16 spec** — NO unrendered markdown literal in HTML body. 6 패턴 catalog: bold-asterisk, bold-underscore (dunder strip), inline-backtick raw, entity-encoded backtick/asterisk/underscore (leading-zero + uppercase + named entity variant 모두), md-link, MD0xx lint code. carve-out: `<code>`/`<pre>`/HTML attribute + Python dunder 15종 whitelist(`__init__`/`__name__`/`__main__`/`__file__`/`__doc__`/`__str__`/`__repr__`/`__call__`/`__enter__`/`__exit__`/`__all__`/`__slots__`/`__dict__`/`__iter__`/`__len__`).
- **`plugins/mccp/scripts/lib/renderer/output-constraints.js` H15 + H16 rules** — RULES array에 push. severity `invariant` / `absolute-ban`. Codex Implement-Codex R1 4 finding absorption: F1 version skip-to-1.9.0, F2 tilde fence strip, F3 dunder 10→15 expansion, F4 entity variants permissive.
- **`output-constraints.test.js` 22 test 추가** — H15 6건(pass+html-fail+md-fail+indented-fail+backtick-fenced-pass+tilde-fenced-pass) + H16 16건(pass+5 fail pattern+carve-out+raw backtick+entity decimal+hex+leading-zero+upper-hex+named+entity-asterisk pair+3 dunder pass+expanded dunder pass+non-dunder fail+pre carve-out). 총 68/68 pass. (plan target 47, R1 absorption으로 expansion)
- **`design-invariants.test.js` drift fixture** — H15+H16 violation 강제 검출 sanity. 16-rule end-to-end는 `design_constraint_violations === []` assertion으로 자동 회귀 0.

### Changed

- **`output-constraints.js` 헤더 주석** — "H1-H14" → "H1-H16", "all 14 rules" → "all 16 rules".
- **`DESIGN.md` line 54-55** — "H1–H14 are the mechanical lint target" → "H1–H16 ... all 16 grep-based checks".
- **plugin.json version bump** `1.7.0 → 1.9.0` — minor jump skipping 1.8.x to avoid race with main(1.8.1, v1.4.x cycle parallel merge). PR #45 squash + rebase 시 conflict resolve 단순화.

### Codex Implement-Codex R1 absorption

4 finding (HIGH×1 + MEDIUM×3) 모두 R1 ACCEPT_NOW + plan body + implementation 양쪽 fully resolved (R2 미escalate, `MCCP_GATE_ROUND_CAP=1`):

- **F1 (HIGH)** Planned version bump 1.8.0 already behind main 1.8.1 → non-monotonic release risk. Task 8 override: 1.9.0 직접 bump.
- **F2 (MEDIUM)** H15 fence strip은 triple-backtick만 → tilde + 긴 backtick fence false-positive. Task 3 override: 두 fence 종류 모두 strip + tilde fence pass test 추가.
- **F3 (MEDIUM)** H16 dunder whitelist 10종 너무 좁음 — repo skill docs에 `__all__`/`__slots__`/`__dict__` 다수 존재. Task 4 override: 15종으로 확장 + expanded dunder pass test 추가.
- **F4 (MEDIUM)** H16 entity coverage 좁음 — `&#96;`/`&#x60;` exact만, `&#096;`/`&#X60;`/`&grave;` + entity-encoded `*`/`_` bypass. Task 4 override: 3 entity variant 모두 cover (leading-zero + upper-hex + named entity) + paired entity-asterisk/underscore + 4 test 추가.

### Acceptance summary

- ✓ RULES.length 16 + H15/H16 ID 정합
- ✓ output-constraints.test.js 68/68 pass
- ✓ design-invariants.test.js 5/5 pass (포함 drift fixture)
- ✓ DESIGN.md spec rows 추가 + "H1–H16" 갱신
- △ Task 7 m3-redux dry-run: H10 14건 + H16 16건 advisory by-design. H16 entity-backtick 15건은 `format-utils.js#escapeHtml`(M3 plan Codex R1 F4 XSS 방어)이 backtick → `&#96;` escape하는 의도된 동작 + markdown inline code(`` ` ``)가 `<code>` wrap 없이 escape만 됨. H10이 user content em-dash로 advisory by-design인 것과 동형. **Follow-up axis**: markdown inline code → `<code>` wrap (별도 plan).

## [1.6.2] — 2026-06-20

v1.3.0 design-gate enforcement M2 ship — SKILL first-step + critique retry loop. M1이 silent-skip을 *관측*만 했던 axis를 M2가 *positive enforcement*로 닫음: design surface plan/implement/PRD는 (1) `frontend-design-direction` SKILL의 새 `## Output Constraints` 섹션을 Phase 진입 즉시 Read, (2) impeccable critique을 bounded retry loop(`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default 2)으로 돌리고, (3) PR step은 critique invoke 자체 제거 + chain-check만 (prior receipt verdict='divergent' 발견 시 BLOCK). 4 Codex Plan-Codex R1 HIGH finding 모두 plan body에 fully absorbed (F1 3-axis trigger / F2 oracle UNKNOWN=fail / F3 PR-scope chain-check / F4 pre-ship dogfood gate). plugin.json `1.6.1 → 1.6.2` patch bump per CLAUDE.md §3.7.

### Added

- **`plugins/mccp/scripts/lib/design-critique-decide.js`** — Pure-function oracle. `SEVERITY_ALIASES` + `normalizeSeverity` (lowercase / `P0` / `P1` / `blocker` / missing → fail-closed UNKNOWN) + `parseRetryCap` (env-driven, range 0-3, default 2) + `decideCritique({findings,round,cap}) → 'CONVERGED'|'ESCALATE_NEXT_ROUND'|'DIVERGENT_UNRESOLVED'`. dep-free. Codex R1 F2 absorption — `findings=null` → DIVERGENT (caller 책임).
- **`plugins/mccp/scripts/lib/tests/design-critique-decide.test.js`** — 9 fixture (기본 6 + F2 absorption 3: lowercase normalize / missing+null+P1 alias / parse-fail fail-closed).
- **`plugins/mccp/scripts/receipt/tests/validate-cmd-design-critique.test.js`** — 5 fixture A-E covering chain-check + audited escape + legacy compat (회귀 0).
- **`plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js`** — 6 fixture pre-ship dogfood (M2 acceptance gate). `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` 양 시나리오 + receipt rounds/verdict stamp + chain-check BLOCKs PR + fixture file presence (F4 absorption).
- **`.claude/cache/test-fixture-status.html`** — 합성 design-surface fixture (1줄). 좁은 whitelist (axis b)가 positive로 인식하는 synthetic artifact.
- **`plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 섹션** — 4 rule (정보 위계 3단계 / 강조색 화면당 1개 / raw markdown marker 금지 / 한 화면 항목 수 상한). critique loop fail/M3 lint mechanical 검증의 anchor.
- **Receipt schema 4 신규 meta field** (additive — schema_version 유지): `design_critique_rounds: int|null` + `design_critique_verdict: 'converged'|'divergent'|'skipped'|null` + `design_intent_reason: string|null` + `pr_design_chain_skip_reason: string|null`. 두 reason field는 strict reason validator (M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` 룰 mirror).
- **Receipt CLI 4 신규 플래그**: `--design-critique-rounds <N>` / `--design-critique-verdict <enum>` / `--design-intent-reason <text>` / `--pr-design-chain-skip-reason <text>`.
- **CLAUDE.md §3.9** — "디자인 surface 변경 시 SKILL first-step + critique retry loop" 신설. 3-axis trigger + 4 출력 제약 + bounded retry + PR scope chain-check + 자기-적용 dogfood 명시. §4 cheat sheet에 4 env 토글 추가.

### Changed

- **`plugins/mccp/scripts/lib/impeccable-detect.js`** — `DESIGN_SURFACE_PATHS`에 design-gate control-plane 3 path 추가 (좁은 확장, F1 absorption): `impeccable-detect.js` / `design-critique-decide.js` / `skills/frontend-design-direction/`. `commands/*.md` 전체는 overshoot 회피로 제외. detector 자기-적용 의무 + 본 plan 자기-재현 차단.
- **`plugins/mccp/scripts/receipt/validate-cmd.js`** — (a) lenient surface: plan/implement gate에서 `design_critique_verdict='divergent'`이면 `warnings[].push(kind='design_critique_divergent')`. (b) chain-check (F3 absorption): terminal `mccp:pr` / `mccp:prp-pr` validate 시 prior receipt verdict 검증, divergent 발견 시 `blocking[].push(kind='design_critique_chain_divergent')`. `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape (strict reason validator) 활성 시 advisory mode (warning으로 강등).
- **`plugins/mccp/commands/plan.md`** — Phase 5.0 입구에 3-axis trigger preflight (`SKILL_AVAIL` × `SIGNAL` × `DESIGN_INTENT_ACTIVE`) + SKILL Read 강제 stderr signal. Phase 5.0 SIGNAL=1 분기를 retry loop으로 확장 (`decideCritique` + Edit 명시 섹션만 + cap 도달 시 DIVERGENT). 5.6 receipt-write에 4 신규 flag forward.
- **`plugins/mccp/commands/prp-implement.md`** — Phase 2.5.5b에 plan.md와 동일한 3-axis trigger + retry loop mirror. Edit target은 plan body 대신 산출 code/diff. cap 도달 시 fix-task.md append + receipt verdict stamp (downstream PR chain-check BLOCK).
- **`plugins/mccp/commands/plan-prd.md`** — Phase 4.0에 동일 3-axis trigger + critique loop wire (PRD body 재생성). plan-prd는 receipt 미작성이므로 verdict는 observational, 다운스트림 `/mccp:plan`이 derived plan에서 verdict 전파.
- **`plugins/mccp/commands/pr.md`** — Phase 1.6 신설: design-critique chain-check preflight 명시. PR scope는 critique retry loop **비활성** (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 무시) + chain-check이 prior receipt verdict 검증. divergent 발견 시 STOP exit 1 (gh 호출 전, receipt 미작성). audited escape `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` 활성 시 advisory mode. 2.5.7 receipt-write에 `--pr-design-chain-skip-reason` forward.
- **`plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js`** — `--pr-design-chain-skip-reason` flag forward.
- **plugin.json version bump** `1.6.1 → 1.6.2` — patch jump per CLAUDE.md §3.7 (M2 단독 ship, M3 별도 cycle).

### Codex Plan-Codex R1 absorption

4 HIGH finding 모두 plan body에 fully resolved (R2 미escalate, `MCCP_GATE_ROUND_CAP=1`):

- **F1** (SKILL first-step still depends on detector false-negative) → 3-axis trigger (detector / 좁은 whitelist / audited override) + impeccable-detect.js DESIGN_SURFACE_PATHS 3 path 확장.
- **F2** (decideCritique uppercase exact match silently CONVERGED) → SEVERITY_ALIASES + normalizeSeverity + UNKNOWN=fail-closed + 9 fixture 회귀.
- **F3** (PR-scope verdict=divergent warning-only) → PR scope critique invoke 제거 + chain-check 강제 + `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape.
- **F4** (Task 10 retroactive-confirm gap) → pre-ship gate로 승격, 합성 fixture + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` e2e test.

## [1.6.0] — 2026-06-19

v1.3.0 observability surface II — Milestone 6 ship (cycle close). Generic interface validation — derive + snapshot + renderer가 mccp 외 repo에서 graceful한지 4 fixture로 검증하고, "어떤 source가 optional이며 어떤 fallback이 보장되는가" contract을 본문화. M5 PR #41(`d12e82d`) 직후 cycle close. plugin.json `1.5.0 → 1.6.0` minor bump per CLAUDE.md §3.7 milestone-PR checklist. 새 기능 / 새 schema field 없음.

### Added

- **`plugins/mccp/scripts/derive/tests/generic-interface.test.js`** — 4 fixture × derive smoke. Fixture A (empty repo, 2-branch strict vs default), B (mccp-owned STATE.md only), B-foreign (외부 STATE.md frontmatter graceful reset), C (non-mccp gate_id `foo-gate`/`bar-gate` receipts with mccp-extension fields absent), D (degraded foreign repo: malformed JSON + unsupported STATE frontmatter + envelope `additionalProperties:false` 위반 + POSIX symlink with meta-derived sentinel strings). Codex Plan-Codex R1 F3+F4 absorption.
- **`plugins/mccp/scripts/lib/snapshot/tests/snapshot-generic.test.js`** — Fixture B/C/idempotence/retention 4 case. 외부 cwd에서 snapshot writer가 throw 없이 동작 + `briefing_*` null projection + 30-day eviction + same-UTC-day idempotent.
- **`plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js`** — Fixture A/B/C/D 4 case × `renderStatus` → 6-section invariant + verdict 결정 + audit-timeline `gate_id` raw label fallback.
- **`docs/v1.3.0-observability/generic-interface.md`** — generic interface contract spec. §1 Optional sources, §2 mccp-extension fields (5 카테고리 13 field, 외부 repo에서 null projection), §3 Non-mccp gate names, §4 What is NOT generic (path shape / STATE schema ownership / degraded-surface-is-graceful / parseability minimum). Codex R1 F3 absorption — degraded surface가 contract의 일부.
- **`.claude/plans/notes/v1-3-0-m6-audit.md`** — 5 axis × {fixture / contract / patch} deterministic audit matrix. axis 1 security sub-axis 1건 patch (receipt file-level symlink guard) + 나머지 4 axes는 fixture/contract column으로 결정.
- **5번째 case in `plugins/mccp/scripts/receipt/tests/store-readreceipt-symlink.test.js`** — safe gate dir + symlinked `<decision>.json` → `UNSAFE_RECEIPT_FILE` throw 검증. POSIX 전용 (Windows admin 권한 필요로 skip).

### Changed

- **`plugins/mccp/scripts/receipt/store.js`** — `readReceipt` 가 file-level `isPlainFile` guard 통과 후에만 `fs.readFileSync`. envelopes.js:14-19 패턴 미러. 코드 리뷰에서 발견된 axis 1 security sub-axis 패치 — gate-dir level guard (v0.2.8 Task 2.6.5a/b)는 이미 있었지만 file level은 없었고, generic-interface §4.3의 "no external dereference" 보장이 receipts 측에서 미강제였음. Fixture D의 sentinel JSON을 `meta.created_at` + `meta.command` + `decision_id`까지 포함하도록 강화하여 진짜 invariant assertion으로 전환. **security-reviewer absorption (HIGH × 2)**: (1) `Error.message`에서 filesystem path 제거 — derive model 직렬화 시 directory enumeration leak 방지. path은 `err.path` field에 보존. (2) `existsSync → lstat → readFileSync` 3-syscall TOCTOU race를 `existsSync → lstat → open(O_NOFOLLOW) → fstat → read from fd → close` atomic 패턴으로 close. POSIX는 `O_NOFOLLOW`로 mid-syscall symlink swap reject + Windows는 정적 `isPlainFile` + `isSafeGateDir` 가 primary defense.
- **`docs/v1.3.0-observability/generic-interface.md`** §4.3 — symlink dereference 보장 cite를 envelopes (`isPlainFile`) + receipts (`isPlainFile`+`isSafeGateDir` 2축) 양축으로 정밀화. 원본은 envelopes의 guard만 인용하여 generalization gap 존재.
- **`docs/v1.3.0-observability/schema-surface.md`** — §9 cross-link to `generic-interface.md` 추가. read-side schema surface는 변경 없음.
- **PRD M6 row** `pending → in-progress` (PR merge 시 `complete`로 자동 전환, M5 PR #41 패턴 동일).
- **plugin.json version bump** `1.5.0 → 1.6.0` — minor jump per CLAUDE.md §3.7.

## [1.5.0] — 2026-06-19

v1.3.0 observability surface II — Milestone 5 ship (PR #41, squash `d12e82d`). Daily snapshot + 30-day audit timeline + Codex R1 absorption. M4가 plugin.json bump을 누락한 결과 (1.4.1 그대로 유지) 본 entry가 ship trail 백필로 추가됨 (v1.6.0 PR가 동시 백필 처리).

### Added

- **`plugins/mccp/scripts/lib/snapshot/index.js`** — daily snapshot writer. `.claude/cache/snapshots/YYYY-MM-DD.json` (`snapshot-v1` schema) + 30-day retention with Codex R1 F3 skew guards (future-dated files NOT evicted + cutoff > last-render aborts retention). always-mask invariant — `model.masked=false` 인 경우에도 snapshot payload는 masked. `gate_id + decision_id + receipt_hash` 3축 dedup identity (F2 absorption) — re-issued receipt(briefing restamp / dedupe attribution) 는 distinct event로 분리.
- **`receipt_hash` surface in `plugins/mccp/scripts/derive/sources/receipts.js`** — M5 dedup identity의 read-side anchor. v0.2.x-era receipt는 `null` projection.
- **30-day audit timeline read path** in `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` — snapshot history를 timeline section에 surface. snapshot 미존재 시 `최근 7일 활동 없음` graceful fallback.
- **`docs/v1.3.0-observability/snapshot-schema.md`** — canonical `snapshot-v1` JSON shape + filename-anchored retention + write-eligibility vs retention split (F4 absorption).

### Changed

- **plugin.json version bump** `1.4.1 → 1.5.0` — minor jump per CLAUDE.md §3.7. M4 PR #39 (refresh trigger + privacy guard)가 plugin.json bump을 누락한 결과, M5 bump이 M4 + M5 두 milestone을 동시 surface.
- **`docs/v1.3.0-observability/schema-surface.md`** §8 추가 — snapshot schema cross-link.
- **PRD M5 row** `in-progress → complete`.

## [1.4.0] — 2026-06-18

Minor bump on top of v1.3.1. Cycle close for the v1.3.0 observability surface II line — v1.3.0-m3 (STATUS.md + HTML renderer) ships as the final milestone, and the version jump signals the open follow-up axes (H1/M1/M2/M3/L1-4 from the M1 audit trail) consolidate into the v1.4.x patch cycle that follows. ship: PR #37, squash `9c7336b`.

### Added

- **`plugins/mccp/scripts/lib/renderer/*`** — derive model + M2 briefing fields → `.claude/cache/STATUS.md` + `status.html`. 6-section deterministic verdict(11-step priority chain) + briefing surface + worker fanout graceful hide. Codex R1 absorbed 4 findings (F1 M3-local `parsers/plan-body.js` so M1 surface stays immutable; F2 outer `safeFallback` outer-catch so `renderStatus` never throws; F3 verdict step 7.5 controller_active fallback for envelope-missing case; F4 `escapeHtml`/`escapeAttr` + 4 payload test) + impeccable P1/P2/P3 absorbed. Pure function of derive model, no new runtime deps.
- **`docs/v1.3.0-observability/dashboard-surface.md`** — canonical spec for the M3 dashboard surface (6-section structure + verdict priority chain + status triple + graceful-hide rules + fail-open invariant + HTML injection boundary). `docs/v1.3.0-observability/schema-surface.md §7` cross-links here as the authoritative M3 anchor.
- **`derive/cli.js render`** subcommand — `node plugins/mccp/scripts/derive/cli.js render` writes `.claude/cache/STATUS.md` + `.claude/cache/status.html`. M4 (refresh triggers) and M5 (snapshots) own scheduling; M3 owns the surface only.
- **PRD M3 row** flipped from `in-progress` → `complete` in `.claude/prds/v1-3-0-observability-surface-ii.prd.md`.

### Changed

- **plugin.json version bump** `1.3.1 → 1.4.0` — minor jump per the Last Decision recorded in the v1.3.0 cycle memory. The v1.3.x hotfix patch line closes with PR #36, and the v1.4.x cycle absorbs the follow-up axes (H1 `origin_url` mask + M1 `scanPlans.invalid_count` + M2 backlog↔plan basename match + M3 `derive/index.js` catch-block degraded flag + L1-L4 audit items). CLAUDE.md §3.7 milestone PR mandatory checklist enforced.
- **CLAUDE.md** auto-gate table updated with the M3 row + §5 entry 7 added for `plugins/mccp/scripts/lib/renderer/index.js`.

## [1.4.1] — 2026-06-19

axis A of the v1.4.0 automation-modernization cycle — cooperative integration of Anthropic native `/deep-research` into `/mccp:plan-prd` Phase 2.5 without re-implementing the native feature, with mechanical chain-of-custody anchor riding on the existing `plan_hash`. plugin.json bump `1.4.0 → 1.4.1` per CLAUDE.md §3.7 milestone-PR checklist (rebased onto v1.4.0 baseline from M3 PR #37).

### Added

- **`plugins/mccp/scripts/lib/deep-research-detect.js`** — mode-aware detection probe. Tristate availability (`available | missing | unknown`, default `unknown` to prevent phantom guidance) with env override `MCCP_DEEP_RESEARCH_SKILL`. AND-gated research_signal heuristic: evidence-gap signal (`Assumption — needs validation via` marker OR empty `## Evidence` section) **AND** research-trigger keyword (`spec`, `standard`, `research`, `표준`, `외부`, `리서치`). First-class `--stdin` entry for pre-disk PRD body. Path-traversal guard mirrors `impeccable-detect.js`.
- **`plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`** — 24 tests covering tristate env override × default branches, false-positive fixture (current evidence-rich PRD), Assumption marker / empty Evidence signal paths, `--stdin` parser path, mode-mismatch (M1 is `prd`-only), env vs filesystem precedence, and AND-gate enforcement.
- **`docs/automation-modernization/integration-template.md`** — pattern doc explicitly marked `M1-experimental`. Custody anchor option matrix (a/b/c/d) deliberately leaves axis-specific decisions open; M1 chooses option (b) (body inject + plan-body provenance hash), but M2/M3 are free to pick different options. Anti-pattern §6 calls out "first-axis lock-in" as a structural risk.
- **Phase 2.5 EXTERNAL_RESEARCH** in `plugins/mccp/commands/plan-prd.md` — cooperative guide prompt fires only on `availability=available + research_signal=true`. Dedicated response grammar `paste:<content>` / `skip-research:<reason>` / `failed-research:<reason>`, explicitly separated from Phase 0 `skip` / `you decide` tokens.
- **§4.0b external research inject** in `plugins/mccp/commands/plan-prd.md` — writes `## References` section into PRD body via node-based regex replace-in-place (idempotent across re-runs of `/mccp:plan-prd` on the same PRD), with `<!-- Auto-injected from /deep-research at <ISO> -->` marker. `failed-research:` response writes an audit-trail body, not a zero-info placeholder. User-pasted content flows through `process.argv` so `$(...)` / backticks / quotes in deep-research output are inert (no shell expansion).
- **`## External Research Provenance` stamping** in `plugins/mccp/commands/plan.md` Phase 4.5 — chain-of-custody mechanical anchor. When the plan input is a `.prd.md` and the PRD has a `## References` section, `/mccp:plan` sha256-digests the References content and appends `## External Research Provenance` to the plan body. The plan body itself is hash-anchored by `plan-codex` receipt's `plan_hash`, so any later PRD `## References` mutation will mismatch on the next `/mccp:plan` validate. Idempotent — re-runs replace the prior provenance section in place.

### Changed

- **plugin.json version bump** `1.4.0 → 1.4.1` — patch bump on top of the v1.4.0 baseline shipped by M3 PR #37. axis A is the first patch of the v1.4.x cycle. ship: PR #38, squash `e7fc8de`, 2026-06-19.

### Code-review absorbed (pre-PR self-review)

- **Idempotent `## References` inject** (was MEDIUM M-1) — `plan-prd.md` Phase 4.0b switched from `cat <<EOF >> "$PRD_PATH"` (append-only) to a node regex replace-in-place. Mirrors plan.md Phase 4.5's provenance pattern, so the CHANGELOG / integration-template idempotency claim now matches the implementation.
- **`<original /mccp:plan input>` placeholder** (was MEDIUM M-2) — `plan.md` Phase 4.5 switched from `PRD_PATH="$1"` (bash positional arg, never populated for slash-command-body interpretation) to the `<placeholder>` convention used throughout the rest of the command body. Without this fix Phase 4.5 silently no-op'd because the case match always fell through to `*) PRD_PATH="" ;;`.

### Out of scope (explicit deferrals)

- New receipt fields for external research (option c in custody matrix). Deferred to M2/M3 re-evaluation. Receipt schema is invariant for this milestone.
- `/deep-research` invocation by mccp itself. CLAUDE.md §1.4 Principle (`mccp는 native 기능을 재구현하지 않는다`) is preserved — invocation stays in user turns.
- PRD Open Question §3 (`integration template doc은 M4 별도 milestone으로 할 것인가?`). Deliberately not decided in M1; revisited at v1.4.0 cycle close after M2/M3 ship.

## [1.3.1] — Unreleased

Patch cycle on top of v1.3.0-m1 — informational receipt-prompt hook + Phase 0 auto-recovery. Targets the recurring 4-step hand-recovery whenever a previous session crashes mid-/mccp:plan and leaves the receipt unwritten.

### Changed

- **`receipt-prompt.js` partition logic.** When `commandName ∈ {mccp:plan, mccp:prp-implement, mccp:resume}` AND `result.missing.length>0 && stale.length===0 && blocking.length===0 && open_critical.length===0`, the hook now emits structured `additionalContext` per `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js` and ALLOWs the prompt. Stale, blocking, and open_critical results stay hard-block (R2-F1 integrity invariant preserved). Terminal/mutating commands (`mccp:pr`, `mccp:code-review`) stay hard-block regardless (R2-F2 absorption).
- **Five validate-call callsites** (`plan.md:380`, `prp-implement.md:295`, `pr.md:539`, `code-review.md:128`, `resume.md:199`) now forward `--decision ${DECISION_SLUG} --plan <plan path>` explicitly. The CLI's silent fallback to `decisionId='default'` was the mechanical root cause of the recurring v0.2.8 generic-receipt quarantine misfire (STATE.md `Open Questions` line 49, three milestones running).
- **`MCCP_RECEIPT_GATE_MODE`** kept as a legacy advanced-debug toggle; the new default behavior supersedes its `hard` setting for the recoverable subset. Removal deferred one soak cycle (v1.4.x).

### Added

- **`plugins/mccp/scripts/hooks/lib/receipt-context-schema.js`** — single source of truth for the informational `mccp_receipt_gate` payload shape. Pure data, no I/O. Exports `RECOVERABLE_ALLOW_LIST`, `isRecoverable`, `computeMustNotProceed`, `buildAdditionalContext`.
- **Phase 0 auto-recovery body** in `plan.md` + `prp-implement.md`. Reads the injected `mccp_receipt_gate` context, asserts the missing-only invariant + auto-CRITICAL absence + plan body completeness, writes the missing receipt(s), re-runs `validate-cmd` with the explicit slug/plan, and proceeds. Any failure stops the response. `code-review.md` is NOT given this body (R2-F2 absorption).
- **`plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js`** — static guard scanning every `plugins/mccp/commands/*.md` bash fence. Fails CI if any `validate --command` call is missing `--decision` or `--plan` (R2-F3 absorption). Mechanical regression for Task 1.
- **`plugins/mccp/scripts/hooks/tests/receipt-context-schema.test.js`** — 11 unit tests on the schema lib.
- **`plugins/mccp/scripts/hooks/tests/receipt-prompt-informational.test.js`** — 5 spawn-based hook tests covering: recoverable+missing → ALLOW+context, terminal /mccp:pr → BLOCK, terminal /mccp:code-review → BLOCK, recoverable+stale → BLOCK, `MCCP_RECEIPT_GATE_MODE=hard` does not regress informational path.

### Out of scope (explicit deferrals)

- Atomic finalizer state machine (Codex MED 0.88) — prevents *occurrence*; this patch prevents *recurrence*. Separate milestone.
- Receipt JSON → derive-from-plan/git replacement — Codex HIGH 0.93 REJECT preserved.
- Recovery for stale/blocking/open_critical paths — by design, requires human triage.

## [1.2.0-m1] — Unreleased

Orchestrator cycle Stage 2 Milestone 1 (project tag: `v1.2.0-m1`) — foundation IPC for multi-worker fanout. Pilot (M2) + lifecycle hardening (M3) deferred to backlog continuation.

### Added

- **dispatch-envelope schema (Draft-07)** at `plugins/mccp/scripts/lib/dispatch-envelope.js` with explicit `worker_exit_status` enum (`pending` nonterminal + `ok`/`failure`/`timeout`/`crashed` terminal) — Codex F2 absorption from Implement-Codex review made the nonterminal state schema-valid before the controller writes the placeholder. Envelope location pinned to `<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json` (next to `STATE.md`; lifecycle clarity wins over receipt-chain integration).
- **dispatch-controller** (`plugins/mccp/scripts/lib/dispatch-controller.js`) — `prepareDispatch({workers, controllerSessionId, parentCwd})` writes placeholder envelopes + heartbeats and returns worker prompts; `mergeEnvelopes([envelope1, …])` is a pure aggregator. The controller never calls `Agent` itself (lib code can't); the caller (slash-command body) invokes Agent in parallel and feeds back the collected envelopes.
- **dispatch-watcher** (`plugins/mccp/scripts/lib/dispatch-watcher.js`) — hybrid `fs.watch` (Monitor) + `setInterval` polling. Polling is binding (cross-platform), `fs.watch` is opportunistic latency reducer. `MCCP_ORCHESTRATOR_POLL_MS` env override (default 500ms).
- **worktree-sync** (`plugins/mccp/scripts/lib/worktree-sync.js`) — atomic worktree → parent envelope move with EXDEV cross-device fallback. `cleanupWorktree({keep|remove})`.
- **Receipt schema 4 new optional `meta.*` fields** (`controller_context_marker_present`, `dispatched_by_controller_session_id`, `worker_dispatch_id`, `ipc_envelope_path`) with marker-gated all-or-nothing invariant — `marker=true → require all 3`, `marker=false → forbid all 3`. Codex Adversarial Review F2 absorption: a partial state would have allowed silent total attribution loss. Existing v0.2.x receipts (marker=undefined + 3 fields=undefined) pass validation unchanged (backward compat).
- **`mccp-receipt write` CLI flags** — `--dispatched-by-controller-session`, `--worker-dispatch-id`, `--ipc-envelope-path`. Marker detection via `MCCP_DISPATCH_CONTEXT=1` env OR the supplied envelope path existing on disk; fail-closed exit 12 (`DISPATCH_MARKER_MISSING_FIELDS`) when marker is detected but flags are missing.
- **validate-cmd envelope integrity check** (Codex F3 absorption) — when a receipt carries `meta.ipc_envelope_path`, the validator loads the envelope and asserts `envelope.dispatch_id === receipt.meta.worker_dispatch_id` AND `envelope.receipts_added ⊇ ['<gate_id>/<decision_id>']`. Mismatch surfaces as `blocking[].kind="envelope-mismatch"`.
- **`v1.2.0-dispatch-fields` migration** (`plugins/mccp/scripts/migrations/v1.2.0-dispatch-fields.js`) — additive (no-op for existing receipts); writes marker `.claude/receipts/.migrations/v1.2.0-dispatch-fields.json` with `noop=true` + `state=complete`.
- **STATE.md 3 new events + 2 patch fields** — `dispatch_started`, `dispatch_envelope_received`, `dispatch_chain_aborted` events survive the unknown-downgrade branch; `controller_session_id` (UUID, conditional emit) + `active_dispatch_count` (int, conditional emit).
- **Heartbeat + `reclaimStale`** (Codex F4 absorption) — `prepareDispatch` writes `<uuid>.heartbeat` per worker; caller is responsible for in-loop mtime refresh (lib can't run forever). `reclaimStale({envelopeDir, ttlMs=300000})` applies a host-aware tri-state policy mirroring `pr-phase-lock.js`: same-host + pid-alive = never reclaim, same-host + pid-dead = reclaim, cross-host = mtime-only with TTL. `validate-cmd.js` boot calls reclaim opportunistically (fail-open).
- **Full-cycle smoke** (`plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js`, Codex F1 absorption) — 4-row regression for caller↔controller contract: both-ok / 1-failure / 1-timeout / 1-malformed envelope. No real Agent calls; fixture-driven only. PR ship gate.
- **Docs trio** at `docs/v1.2.0-orchestrator/` — `architecture.md`, `envelope-schema.md`, `operator-runbook.md`.

### Deferred to backlog (M2/M3)

- M2 pilot vertical (`/mccp:code-review` PR mode fanout, `MCCP_ORCHESTRATOR_PILOT` flag) — needs measurement of wall-time + finding count + dual-review overlap ratio over a soak period.
- M3 case 6 (stale envelope GC, 24h TTL) — deferred until M2 dogfood signals how often stale envelopes accumulate.
- Real Agent E2E test (M2 pilot).
- Receipt → controller chain auto re-link (Stage 3+).
- `session-spawner.js` removal (deprecation cycle, Stage 2 M2 or Stage 3).
- Windows native inotify analog (`ReadDirectoryChangesW`) — polling fallback covers correctness; latency improvement in M2 watcher hardening.

## [1.1.0] — Unreleased

Orchestrator cycle Stage 1 (v1.1.0-s1).

### Fixed

- `receipt-prompt` hook의 review-mode bypass 가드가 canonical `'mccp:code-review'` 이름만 literal 매칭하던 결함을 수정. catalog가 광고하는 `/mccp:review-pr ↔ /mccp:code-review` alias 관계를 enforcement layer도 인지하도록 `REVIEW_BYPASS_COMMANDS` Set으로 normalize. `--standalone`과 Local Review Mode 두 bypass 분기 모두 alias 호출에서 정상 동작. 사용자 증상은 `/mccp:review-pr 27 --standalone`이 phantom `mccp-pr-codex` MISSING block을 일으키고 decision-slug가 branch fallback(`v1-1-0-orchestrator-s1`)으로 떨어지던 것 — surface/enforcement desync (axis L과 같은 *symmetry* 결함 카테고리). PR #27 receipt 검증 중 발견. (`plugins/mccp/scripts/hooks/receipt-prompt.js`, regression+alias 양 케이스 테스트 `receipt-prompt-alias-bypass.test.js` 추가)

## [1.0.1] — Unreleased

First patch cycle after v1.0.0 ship. Cherry-picks axis K from the W-VERDICT §7 roadmap (C3 — cross-platform `pr-phase.lock` hardening — M1 only; M2 reproduction matrix deferred to a separate plan), extends with axis K2 to close a parallel receipt-gate false-negative discovered during axis K1 dogfood (`/mccp:pr` MISSING receipt despite the chain already converged on disk), and lands axis P — hook layer tidy (A/C/D/E축) plus a hard-cut rename of all user-facing `ECC_*` env vars to `MCCP_*` so that mccp users running an additional ECC plugin install can configure each plugin independently.

### Breaking — `ECC_*` env var hard-cut rename (axis P)

mccp no longer reads any `ECC_*` env var for its own hooks. Backward-compat aliases are **not** provided — an alias is the exact source of cross-plugin collision this rename exists to eliminate. ECC origin (`ECC_ROOT`) and the install-tree-internal `ECC_DISABLED_MCPS` remain unchanged (install tree is out-of-scope of axis P; a separate cleanup axis will revisit it).

| Old (removed) | New | Surface |
|---|---|---|
| `ECC_HOOK_PROFILE` | `MCCP_HOOK_PROFILE` | hook profile selection |
| `ECC_DISABLED_HOOKS` | `MCCP_DISABLED_HOOKS` | per-hook kill switch |
| `ECC_SKIP_OBSERVE` | `MCCP_SKIP_OBSERVE` | observer recursion gate |
| `ECC_GATEGUARD` | `MCCP_GATEGUARD` | GateGuard fact-force opt-out |
| `ECC_HOOK_ID` | `MCCP_HOOK_ID` | runner→child hook id inject |
| `ECC_PLUGIN_ROOT` | `MCCP_PLUGIN_ROOT` | plugin root resolution (CLAUDE_PLUGIN_ROOT fallback) |
| `ECC_HOOK_INPUT_TRUNCATED` | `MCCP_HOOK_INPUT_TRUNCATED` | upstream stdin truncation flag |
| `ECC_HOOK_INPUT_MAX_BYTES` | `MCCP_HOOK_INPUT_MAX_BYTES` | per-hook stdin cap |
| `ECC_OBSERVE_RUNNER_TIMEOUT_MS` | `MCCP_OBSERVE_RUNNER_TIMEOUT_MS` | observe-runner child timeout |
| `ECC_SESSION_ID` | `MCCP_SESSION_ID` | explicit session id override |
| `ECC_SESSION_RETENTION_DAYS` | `MCCP_SESSION_RETENTION_DAYS` | session record retention |
| `ECC_SESSION_START_CONTEXT` | `MCCP_SESSION_START_CONTEXT` | SessionStart context inject toggle |
| `ECC_SESSION_START_MAX_CHARS` | `MCCP_SESSION_START_MAX_CHARS` | SessionStart context cap |
| `ECC_SESSION_RECORDING_DIR` | `MCCP_SESSION_RECORDING_DIR` | canonical-session recording dir |
| `ECC_QUALITY_GATE_FIX` | `MCCP_QUALITY_GATE_FIX` | quality-gate auto-fix mode |
| `ECC_QUALITY_GATE_STRICT` | `MCCP_QUALITY_GATE_STRICT` | quality-gate strict mode |
| `ECC_GOVERNANCE_CAPTURE` | `MCCP_GOVERNANCE_CAPTURE` | governance capture toggle (now off by default at the hooks.json layer too — axis C) |
| `ECC_CONTEXT_MONITOR_COST_WARNINGS` | `MCCP_CONTEXT_MONITOR_COST_WARNINGS` | cost warning surface |
| `ECC_CONTEXT_MONITOR_COST_MODE` | `MCCP_CONTEXT_MONITOR_COST_MODE` | cost message tone control |
| `ECC_MCP_HEALTH_STATE_PATH` | `MCCP_MCP_HEALTH_STATE_PATH` | mcp-health state file path |
| `ECC_MCP_CONFIG_PATH` | `MCCP_MCP_CONFIG_PATH` | MCP config path override |
| `ECC_MCP_RECONNECT_COMMAND` | `MCCP_MCP_RECONNECT_COMMAND` | mcp-health reconnect command |
| `ECC_MCP_HEALTH_FAIL_OPEN` | `MCCP_MCP_HEALTH_FAIL_OPEN` | mcp-health fail-open mode |
| `ECC_GH_SHIM` | `MCCP_GH_SHIM` | gh CLI shim path |

Preserved (axis P does **not** rename):

- `ECC_ROOT` — points at the ECC origin marketplace. User-set, mccp does not own.
- `ECC_DISABLED_MCPS` — read only by `plugins/mccp/scripts/lib/install/apply.js` (install tree). Install tree is out-of-scope of axis P and is tracked as a separate cleanup axis.
- `ECC_OBSERVER_*` (in `plugins/mccp/skills/continuous-learning-v2/agents/observer-loop.sh`) — owned by the v2 skill; will move with the skill's mccp-native migration.
- `configure-ecc` skill name + `'ecc'` install-time namespace constant — install tree identity, intentional.

Migration: replace any `ECC_X=...` line in your `.claude/settings.json`, `.claude/settings.local.json`, or shell profile with `MCCP_X=...`. There is no automatic alias.

### Removed (axis P)

- `plugins/mccp/scripts/hooks/pre-write-doc-warn.js` — pure shim; `hooks.json` calls `doc-file-warning.js` directly already.
- `plugins/mccp/scripts/hooks/auto-tmux-dev.js` — Windows no-op + only caller (`bash-hook-dispatcher.js PRE_BASH_HOOKS`) also removed.
- `plugins/mccp/scripts/hooks/insaits-security-wrapper.js` + `insaits-security-monitor.py` — InsAIts company-internal policy hook, not relevant in personal mccp install.
- `plugins/mccp/scripts/hooks/post-bash-pr-created.js` — `/mccp:pr` gate already owns the single PR-creation path.
- `hooks.json` registrations removed (scripts kept for v2 reference / standalone use): `pre|post:observe:continuous-learning` (v1 deprecated, v2 lives as a separate skill), `pre|post:governance-capture` (opt-in default off → every tool call paid 2 no-op spawns), `post:session-activity-tracker` (metrics unified through `mccp-metrics-bridge`), `post:edit:design-quality-check` (mccp is a backend CLI plugin; frontend drift warning is always a false positive), `post:edit:console-warn` (Stop's `check-console-log` covers the same surface in batch), `pre:edit-write:suggest-compact` (same role as `strategic-compact` skill), `mccp:stop:auto-handoff` (cost notify reclassified as noise per the `feedback-cost-not-stop-signal` rule).
- `mccp-context-monitor.js` (renamed from `ecc-context-monitor.js`) is retained as a script but its `hooks.json` Stop registration is unaffected — only the cost-warning surface is governed by `MCCP_CONTEXT_MONITOR_COST_WARNINGS`.

### Changed (axis P)

- `plugins/mccp/scripts/hooks/bootstrap.js` (new) — single entry point that resolves `CLAUDE_PLUGIN_ROOT` once (env → standard plugin paths → cache directory walk) and delegates to `plugin-hook-bootstrap.js`. Replaces ~30 inline `node -e "..."` bootstraps in `hooks.json`. Total `hooks.json` command character count reduced from ~36k to ~3.6k (**~90% reduction**); the file remains valid JSON.
- `pre|post:mcp-health-check` `matcher` narrowed from `"*"` (every tool) to `"^mcp__"` (MCP tool invocations only).
- `gateguard-fact-force.js` scope limited to repo-critical paths (`scripts/lib/**`, `commands/**`, `hooks/**`). Generic file edits (docs, ad-hoc scripts, plans) no longer trigger the fact-force gate.
- `quality-gate.js` reduced to syntax-only fast-fail (`node --check` / `gofmt -l` / `python -c "ast.parse(...)"`) per edit. Full lint/typecheck/formatter rewrite continues to run from Stop hooks where it can be batched per session. Per-edit budget target: <500 ms.

### Fixed

- **axis K1** — `pr-phase-guard` hook now reclaims orphan locks left by crashed PR helpers (same-host + dead PID), eliminating Linux/macOS self-trap when `/mccp:pr` is re-invoked after a helper crash. The hook reuses `pr-phase-lock.js`'s host-aware tri-state policy (`isPidAlive` + `tryReclaimStaleLock`), so live PIDs are never disturbed (`NEVER reclaim` invariant). Cross-host orphan locks fall through to the existing block path. Silent recovery is prevented by a state-file marker (`<root>/.claude/state/pr-phase-lock-stale-reclaimed.json`) that `finalize-receipt.js` consumes on the next PR cycle, stamping `meta.pr_phase_lock_stale_reclaimed_at_hook=true` on the receipt. See [docs/v0.2-state-schema.md §4.5](docs/v0.2-state-schema.md) for the marker contract.
- **axis K2** — `deriveDecisionId` (`scripts/receipt/decision.js`) now augments a valid BRANCH_BASED_COMMAND slug with the matching plan-codex receipt slug when the branch slug is a strict prefix of exactly one existing plan receipt. Closes the false-negative where `/mccp:pr` on branch `v1.0.1-axis-k` derived slug `v1-0-1-axis-k` while `/mccp:plan` had written its receipt under `v1-0-1-axis-k-pr-phase-guard-pid-alive` — receipt-gate reported MISSING even though the chain was converged on disk. Ambiguous (2+) or zero prefix-matches fall through unchanged (regression-safe). v0.3.6 Task 5 fallback chain still wires for invalid-branch-slug cases.

### Added

- `meta.pr_phase_lock_stale_reclaimed_at_hook` — additive optional boolean field on receipt schema; default `false`. Existing receipts pass schema validation unchanged (no migration script required).
- `--pr-phase-lock-stale-reclaimed-at-hook` flag on `node plugins/mccp/scripts/receipt/cli.js write` — forwarded by `finalize-receipt.js` when a stale-reclaim marker is consumed.
- `findReceiptSlugByBranchPrefix(branchSlug, cwd)` exported helper on `scripts/receipt/decision.js` — used by axis K2 augmentation; skips `.legacy` / `.bak` sidecars to avoid historical receipt pollution.
- Test axes 11.1–11.5 (PID liveness fixtures incl. Windows escape-path preservation) + 12.1–12.4 (marker shape, idempotency, finalize-receipt round-trip, corrupt-marker handling) in `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` — 9 new tests, 0 regressions on existing axes 1–10.
- 7 axis K2 tests in `scripts/receipt/tests/decision.test.js` (single-prefix augment, exact-match no-augment, ambiguous-multi no-augment, no-match / absent-dir no-augment, legacy/bak sidecars ignored, integration via `deriveDecisionId('mccp:pr',...)`, PLAN_PATH_COMMANDS invariant — only BRANCH_BASED commands are augmented). 0 regressions on existing 42 decision tests.

### Verified

- **axis K M2** — Linux + macOS cross-platform reproduction passing via GitHub Actions matrix (`.github/workflows/axis-k-m2-cross-platform.yml` × `ubuntu-latest` + `macos-latest`). Deterministic fixture (`axis-k-m2-reproduce.mjs`) exercises the real `pr-phase-lock` module's `tryReclaimStaleLock` + `isPidAlive` on each runner, asserting same-host + dead-PID orphan locks are reclaimed with canonical 5-key marker (`reclaimed_at` / `former_run_id` / `former_pid` / `former_host` / `reason`). Windows PowerShell escape path regression-free — `hooks.json` PreToolUse matchers contain no `PowerShell` substring (statically asserted by `axis-k-m2-windows-regression.mjs` on both Linux + macOS runners). F11 sealed-channel `lockBody` schema unchanged — `pr-phase-lock-f11.test.js` 15/15 PASS on both OS. W11 rubric audit row 4d recovered from `Type E (5) + NS=5` to `Type ≤C (≤3) + NS ≤2` per `.claude/audit/v1.0.1-axis-k-m2-rubric.md` re-measurement; W-VERDICT §2 BLOCKING tally 1 → 0 (single-row STOP_RELEASE source closed).

## [1.0.0] — 2026-06-15

First W-VERDICT-gated release. Ship recommendation derived from synthesis of 11 worktree dogfood audits ([W-VERDICT §7 Cherry-pick Roadmap](.claude/audit/v1.0.0-release-verification-verdict.md#7-cherry-pick-roadmap-pre-tag-vs-post-tag)) classified as **CONDITIONAL** with two pre-tag requirements (C1 + C2). Both shipped; C3 (cross-platform `pr-phase.lock` hardening) deferred to v1.0.x axis K.

### Pre-tag conditions met (C1 + C2)

- **C1** — PR [#20](https://github.com/idenn207/mccp/pull/20) `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` (commit `e892d27`). Absorbs W11 audit 11j+11k MEDIUM → LOW; partially resolves W4 4a (receipt write read-first failure hint absence).
- **C2** — PR [#21](https://github.com/idenn207/mccp/pull/21) `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` (commit `8d6504c`). Resolves W10 F-W10-1 doc-vs-code drift by demoting CLAUDE.md §4 "live" label to "LLM-observed" (W-VERDICT §6 axis M).

### Severity tally (post-C1+C2)

| Tier | Pre-W-VERDICT | Post-ship | Δ |
|---|---|---|---|
| BLOCKING | 1 | 1 | 0 (env-conditional; Linux/macOS true-BLOCKING deferred to v1.0.x axis K) |
| HIGH | 8 | **7** | **−1** (C2 axis M demote) |
| MEDIUM | 13 | 12 | −1 (C1 11j/11k MED → LOW) |
| LOW | 12 | 14 | +2 (C1 absorption) |
| PASS / INFO / NTH | 60+ | 60+ | — |

### Known Issues (release notes — non-blocking on Windows)

- **W4 4d** `pr-phase.lock` self-trap on `/mccp:pr` re-entry. Windows workaround: invoke `node plugins/mccp/scripts/lib/pr-phase-lock.js detect-stale` via PowerShell tool (outside `pr-phase-guard.js` PreToolUse hook scope). Linux/macOS escalate via process kill + new session. Permanent fix: v1.0.x axis K (`pid_alive` validation + auto-release).
- **W4 4a** Receipt write read-first failure surface. Manual `rm <receipt>` + write re-run. C1 patch resolves the `writeBlockReason()` recovery surface; full symmetry across all classifications is v1.0.x axis L.
- **W7 docs/v0.2-*** prefix (`docs/v0.2-architecture.md`, `docs/v0.2-state-schema.md`) gives a stale first impression post-tag. v1.0.x axis N housekeeping (rename + content sync).
- **W6 STATE.md frontmatter** regression (`task_fingerprint` synthetic patch + `last_event` precedence drift). Observability-only — dual-reviewer chain does not consume STATE.md frontmatter (grep-verified).
- **W1 F-W1-1** `/mccp:work` classification metadata leakage. `.claude/audit/*` and similar metadata trigger full-chain when user intent is trivial. Workaround: explicit `--trivial` override.

### Ship history (chronological)

| PR | Commit | Title | Surface |
|---|---|---|---|
| [#20](https://github.com/idenn207/mccp/pull/20) | `e892d27` | `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` | C1 — W11 11j+11k MEDIUM → LOW |
| [#21](https://github.com/idenn207/mccp/pull/21) | `8d6504c` | `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` | C2 — W10 F-W10-1 HIGH demote (HIGH 8→7) |

### Supporting artifacts

- [.claude/audit/v1.0.0-release-verification-verdict.md](.claude/audit/v1.0.0-release-verification-verdict.md) — synthesis verdict
- [.claude/audit/v1.0.0-*.md](.claude/audit/) — 11 individual worktree audit ledgers (baseline, codex-backoff, impeccable, receipts, handoff, state-continuity, docs-sync, dual-reviewer, goal-loop, env-matrix, fallback-ux)
- [.claude/plans/v1-0-0-release-verification.plan.md](.claude/plans/v1-0-0-release-verification.plan.md) — verification plan + acceptance rules
- [.claude/plans/v1-0-0-preflight-recovery-surface.plan.md](.claude/plans/v1-0-0-preflight-recovery-surface.plan.md) — C1 patch plan

### Post-merge manual step

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

The CHANGELOG entry above commits as part of the release notes PR; the annotated tag is created manually post-merge.

---

*Prior ship history (v0.2.x – v0.4.0) lives in commit history and PRs (`git log --grep "v0\\."`). v1.0.0 marks the first release-verification-gated milestone where a synthesized verdict (`.claude/audit/v1.0.0-release-verification-verdict.md`) and a documented Cherry-pick Roadmap gated the tag decision.*
