# Implementation Report: 패널 승인 품질 감사 (diverse-agent-review #11)

**Plan**: `.claude/plans/diverse-agent-review-m11.plan.md` (봉인 `sha256:43e59143…`, 미편집)
**게이트 산출물**: `.claude/notes/diverse-agent-review-m11.md`
**판정 문서**: `docs/diverse-agent-review/approval-quality-audit.md`
**Version**: `1.33.1 → 1.33.2` (patch — PRD 내 단일 milestone)

## Summary

승인 레코드 dossier 결속 오라클 `approval-audit.js`(read-only · LLM-free · standalone)를
만들고, 그 출력 위에서 **#8이 확정한 converged 5건의 승인 품질을 판정해 동결**했다.
게이트 배선은 한 바이트도 바꾸지 않았다(UI6 — Validation 8이 기계 확인).

**답은 "미탐 없음"이 아니다.** 감사 가능한 4건 전부에서 미탐이 나왔고(11건), 유형이
무작위가 아니다 — `Files to Change` 누락 3 · plan 내부 모순 3 · **저장소에 대한 낡은 사실 2
(같은 오류가 두 패널을 각각 통과)** · 명세 공백 2 · 성립하지 않는 Validation 1.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 10 | 10 (신규 4 · 갱신 6) |
| 감사 커버리지 | 4/5 예측 | **4/5** (일치) |
| cross-model 채널 | 구조적 공집합 예측 | **구조적 공집합** (일치) |
| `corpus.js` 변경 | 0줄 | **0줄** (Validation 4가 출력 diff 0 확인) |
| 미탐 판정 | 미예측 (도구가 판정하지 않으므로) | **4/4 레코드에서 발견, 11건** |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 승인 dossier 결속 오라클 + CLI | Complete | 1,105줄. 계획 5축에 **3축 추가**(아래 D1) |
| 2 | 회귀 test | Complete | 632줄 · **24건**(계획 12항목 → 24 test). 수정 전 실패 실측 기록 |
| 3 | dossier 동결 + 판정 문서 | Complete | 351줄 · 9절 |
| 4 | PRD 갱신 | Complete | #11 `complete` · Evidence M11 문단(A1~A9) · Open Questions 2건 갱신 · 표 하단 note · Status 줄 |
| 5 | 미흡수 finding 이연 | Complete | **3행** append (backlog 793행 파싱 정상, invalid 0) |
| 6 | milestone 보고서 | Complete | 이 문서 |
| 7 | version 4면 동기 | Complete | **1.33.2**로 재계산 확정 (아래 D4) |

## Validation Results

| # | 검증 | 결과 |
|---|---|---|
| 1 | 도구 완주 + coverage 항등식 | **Pass** — `state=degraded` · `approved=5 auditable=4 unauditable=1` · `5 === 4+1` |
| 2 | 회귀 test | **Pass** — 24/24 |
| 3 | plan-review suite 전체 (UI5 무손상) | **Pass** — **349 pass / 0 fail** (1 skipped) |
| 4 | `corpus.js` 출력 회귀 0 | **Pass** — `origin/main` 버전과 `--json` diff 공집합 |
| 5 | version 4면 동기 | **Pass** — `i18n-surface.test.js` 10/10 |
| 6 | 이 plan에 대한 L1 | **3 violations — 예상된 사후 산물** (아래 참조) |
| 7 | 삭제 파일 0건 | **Pass** — `origin/main...HEAD` 빈 출력 + 워킹트리 삭제 0 |
| 8 | 게이트 배선 diff 공집합 | **Pass** — plan 열거 7파일 + M8 확대분(`plan-review/` 전체 · `receipt/schema.js`) 전부 빈 출력 |
| 9 | ship receipt diff 공집합 (§3.12) | **Pass** — 빈 출력 |

### Validation 6이 붉은 이유 (은폐하지 않고 적는다)

`C3_CREATE_EXISTS` 3건 — `approval-audit.js` · `plan-review-approval-audit.test.js` ·
`approval-quality-audit.md`가 "CREATE 대상인데 이미 존재한다". **L1은 구현 전 검사이고 이
실행은 구현 후**이므로 이는 결함이 아니라 순서의 산물이다. 구현 전 실행에서는 이 3건이
없었다(plan 게이트의 L1이 `converged`였고 그 레코드가 그렇게 적는다). 사후 L1을 초록으로
만들려면 plan의 `Files to Change`를 CREATE→UPDATE로 고쳐야 하는데, 그것은 봉인된 plan을
편집하는 것이라 하지 않는다.

### Design Grounding

**N/A (no design trigger).** Phase 2.5.5c 캡처가 일어나지 않았으므로(진입 시점
`design_signal=false`) Phase 3.7은 완전한 no-op이다.

### Design Finish (Phase 3.6)

EXECUTE 후 detector를 재도출하면 `design_signal=true`로 뒤집힌다 — `signal_files`가
`renderer/html.js` · `renderer/markdown.js`이고 **둘 다 버전 리터럴 1개씩만** 바뀌었다.
경로 부분 문자열 매칭의 오탐이며 plan의 `## Design Critique`가 이미 같은 관측을 기록했다.
트리거가 성립하므로 오라클에 `phase:"finish"`를 물었고, `renderingSurface=false`라 5개
명령이 전부 `recommend`로 강등됐다 — control-plane 전용 diff의 정직한 답이다. 결과를
receipt에 restamp했다(`impeccable_commands_routed` 5행, 첫 시도 성공).

| Command | call_form | status |
|---|---|---|
| clarify · distill · harden · optimize · polish | `recommend` | `recommended` |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/approval-audit.js` | CREATED | +1,105 |
| `plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js` | CREATED | +632 |
| `docs/diverse-agent-review/approval-quality-audit.md` | CREATED | +351 |
| `.claude/notes/diverse-agent-review-m11.md` | CREATED | +160 |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATED | +26 / -3 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +3 rows |
| `CHANGELOG.md` | UPDATED | +64 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | +1 / -1 |

plan의 `Files to Change` 10행과 **1:1 일치**한다. 계획 밖 파일 0건 — 단
`.claude/notes/diverse-agent-review-m11.md`는 plan 표에 없으나 이는 게이트 산출물의 표준
위치이고 plan 본문을 봉인 유지하기 위한 필수 귀결이다(§4.1 D3이 지목한 것과 같은 부류이므로
정직하게 여기 적는다).

## Deviations from Plan

### D1 — 도구 축이 5개에서 8개로 늘었다 (전부 리뷰 흡수)

plan Task 1은 `anchor` · `hash_chain` · `proof_backing` · `lenses` · `channels` ·
`candidates`를 규정했다. 실제 구현은 셋을 더 낸다.

| 추가 축 | 출처 | 왜 |
|---|---|---|
| `quorum_check` | Implement-Codex R1 F2 + plan L2 architect/HIGH | `corpus.js`가 `converged`로 분류했다는 이유만으로 표본에 넣으면 **자기 측정이 부인하는 승인**(`quorum.passed=false`)이 남는다. 재계산이 아니라 추가 관문 |
| `durability` | plan L2 invariant **CRITICAL ×2** | 두 지적의 전제("`.claude/reviews/`가 worktree-only")가 실측상 거짓이다. **주장 대신 측정**으로 닫았다 — `untracked=0` |
| `channel_summary.can_ground_absence` | plan L2 architect/HIGH | "채널이 상시 같은 상태면 정보를 나르지 않는다"는 지적의 실질을 출력 필드로 만들었다. Acceptance의 "보았고 없었다 vs 볼 수 있는 채널이 비어 있었다" 구분이 산문 주장이 아니게 된다 |

### D2 — ship receipt 귀속을 slug가 아니라 **해시**로 바꿨다

plan Task 1 (2b)는 `.claude/receipts/mccp-pr-codex/<slug>.json`을 읽으라고 적었다. 그대로
하면 **다른 plan의 receipt가 증인이 된다** — 이 코퍼스에 실재하는 함정이다(§부수 관측 1).
전 ship receipt를 `plan_hash`로 색인해 레코드의 `reviewed_plan_hash`와 일치하는 것만
증인으로 인정하고, slug 주소 receipt의 존재 여부는 **진단으로만** 싣는다.

### D3 — `## Codex Implementation Review`를 plan이 아니라 notes에 썼다

plan 본문 편집은 `plan_hash`를 바꿔 상위 `mccp-plan-codex` receipt를 stale로 만든다.
M8·M4 선례와 동일 해소. **이것은 §4.1 D1이 미탐으로 분류한 바로 그 구조 결함이며, 이
사이클도 그것을 피해 갔다** — 즉 M11은 자기가 감사한 결함을 자기도 겪었다.

### D4 — version target을 `1.33.2`로 재계산 (plan의 잠정치와 동일)

plan은 착수 시점 실측으로 잠정 `1.33.2`를 적고 "확정이 아니다"라고 못박았다. 재계산 결과
`origin/main`이 `1.33.1`, 미머지 sibling이 `1.33.4`(env-contract-integrity)·`1.34.0`(msw M9)
이므로 `1.33.2`가 비어 있어 잠정치가 그대로 유효하다. **`/mccp:pr` 진입 직전 한 번 더
재계산해야 한다**(§3.7 — 충돌 창은 머지·PR 사이에도 열려 있다).

### D5 — Validation 4를 `/tmp`가 아니라 scratchpad에서 돌렸다

plan Validation 4는 `/tmp/corpus-before.json`을 쓰는데 이 환경은 win32다. plan 본문 수정이
아니라 **실행 시 경로 대체**로 처리했다(같은 지적이 plan L2 test/MEDIUM에 있고 §3.14대로
원장에 남아 있다).

### D6 — plan-conflict detector의 `conflict:true`를 **오탐으로 판정**하고 escalate하지 않았다

커맨드 본문이 지시한 대로 detector를 돌리면 `conflict=true` · `signal=file-expansion` ·
"8 unplanned"가 나온다. **escalate하지 않은 근거는 판단이 아니라 재실행이다.**

8건의 정체를 확인하면 전부 구현 산출이 아니다 — `.claude/state/STATE.md` ·
`.claude/state/findings/*.jsonl` · `.claude/state/fix-task-applied.md`(state-writer/hook) ·
`.claude/reviews/plan-review-*.md` 2건(`record.js`) · `.claude/notes/…-m11.md`(게이트 산출물,
D3) · plan 파일 자신. 이것들은 **관례상 어떤 plan의 `Files to Change`에도 없다**(실측: 표본
6개 plan 중 5개가 `.claude/state/` 행 0개).

게이트·훅이 쓴 경로를 제외하고 **같은 오라클을 재실행하면 `conflict=false`**이고, 남은
집합은 plan의 `Files to Change` 10행과 **1:1 일치**한다. 즉 실제 file-expansion은 0건이다.

이는 santa-adjudication M1 보고서 deviation 2가 도달한 것과 같은 결론의 재현이다. 다만
그때의 원인(백틱 미제거)과 **다른 축**이다 — 이번 실측에서 백틱 파싱은 정상이었고, 원인은
detector에 넘기는 **입력 범위**다. 백틱 축은 원장에 7회 등재돼 있으므로 재append하지 않고
(§3.14 — 같은 결함을 두 줄로 세면 빈도를 과대 진술한다) **입력 범위 축만 1행 추가**했다.

### D7 — plan을 아카이브하지 않았다

§3.11 C2 — PRD가 여전히 `in-progress`(pending 6건)이므로 지금 옮기면 PRD가 활성 표면에서
소실된다. `scan.js`도 `archivable:false`를 낸다(기계 확인).

## Issues Encountered

### 구현 중 발견한 실결함 2건 — **둘 다 test가 수정 전에 잡았다**

1. **state ladder가 부재와 고장을 혼동했다.** 승인 레코드가 있었는데 전부 거부된 경우
   `admitted.length===0`이 `blind`로 떨어졌다. `blind`의 뜻은 "코퍼스에 승인이 없었다"이고
   그 판정은 이미 조기 반환됐으므로, 여기서의 빈 `admitted`는 부재가 아니라 **고장**이다.
   test 항목 6이 `blind` ≠ `degraded`로 잡았다. **이 도구가 막으려는 오독(부재를 관측으로
   읽기)을 도구 자신이 저지르고 있었다.**
2. **경로 검증 전에 역슬래시를 정규화했다.** `String(plan_path).replace(/\\/g,'/')`가
   `a\b.md`를 `a/b.md`로 바꿔 정본 validator의 역슬래시 거부를 **통째로 무력화**했다.
   test 항목 9가 `plan_path_rejected` 대신 `unrecoverable`을 관측해 잡았다. 검증은 원본
   문자열에 대해 해야 하고, 정규화는 검증 통과 뒤에나 의미가 있다. 정상 코퍼스는 하나도
   잃지 않았다(`corpus.js`가 이미 forward slash를 낸다 — 수정 후 라이브 재실행으로 확인).

### 픽스처 결함 2건 (test가 도구가 아니라 자기 자신을 재고 있었다)

- 초판 `shipReceipt()`가 손으로 지은 `receipt_hash: 'sha256:fixture'`를 썼다. `receiptIntegrityOk`가
  전부 거부해 7건이 `receipt_corrupt`로 떨어졌다 — **test가 도구의 판정이 아니라 자기
  픽스처의 부실을 재고 있었다.** `schema.makeSkeleton` + 실제 `subjectHash`/`receiptHash`로
  진짜 유효한 receipt를 만들도록 고쳤다.
- 초판 `PLAN_BODY`에 status 토큰이 없어 구조 해시와 raw 해시가 **같은 값**을 냈다. DN6 회귀가
  아무것도 지키지 못하는 상태였고 항목 4b가 그것을 붉게 잡았다. 표에 `complete`/`pending`을
  넣어 두 체제가 실제로 갈리게 했다.

### 수정 전 실패 실측 (plan Task 2 요구 — 주장이 아니라 관측)

초판 24건 중 **11건이 붉었다**. 그중 2건은 위 실결함(항목 6·9), 2건은 픽스처 결함(4b 및
receipt 계열 7건), 나머지는 그 파급이다. plan L2 `test/HIGH`가 "수정 전 실패를 반증할 수
없다"고 지적한 축을 이 관측이 닫는다 — 붙여넣은 실패 출력이 근거다.

### 선재 red (M11이 만들지 않았고 고치지 않는다)

- `codex-invoke.test.js` 9건 — `MCCP_CODEX_DISABLED` 정책 + 봉인 축의 부채. STATE.md가
  이미 기록한 별도 축이며 이 변경과 무관하다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js` | **24** | blind · 구조적 공집합 vs 부재 · DN6 해시 체제(+수정 전 실패 고정) · `unauditable` 격리 · 상한 소진 구분 · degraded · Refutation 파싱 · **판정 필드 부재(DN2)** · 경로 탈출 11종 + 읽기 0회 단언 · 정상 2형태 통과 · coverage 항등식 · `proof_backing`→degraded · `recorded_at` 5종 · `parseIsoStrict` · quorum 모순 4종 · slug 귀속 · attribution · durability · 보고서 슬라이싱 · throw 부재 |

## 부수 관측 (plan Task 6 요구)

### 1. 아카이브 이동이 승인 앵커를 거짓 불일치로 만든다 (DN6 실측 확인)

`planAwareMarkdownHash`는 **경로로 해시 함수를 고르고**(`hash.js:174`) `isPlanPath`는
`.claude/plans/*.plan.md`에만 참이다(`hash.js:169`). 승인 5건 중 **3건**의 plan이 이후
`.claude/PRPs/plans/archived/`로 이동했으므로, 현재 경로로 해시하면 셋 다 불일치하고 감사는
"본문이 바뀌었다"는 거짓 결론에 도달한다. 도구는 **기록된 경로**가 체제를 고르고 내용은
실제 위치에서 오도록 분리했고(문자열을 받는 `hashContentAs`), test 항목 4·4b가 이를 고정한다.

**같은 함정이 slug 축에서도 재현됐다** — `impeccable-detection-contract-m6` 레코드의 파일명
slug(`impeccable-detection-contract`)로 receipt를 찾으면 **존재하지만** 그
`plan_hash`(`sha256:c7d1d27d…`)는 그 레코드의 `reviewed_plan_hash`(`sha256:887fc89d…`)와
다르고 **다른 plan의 봉인**이다. plan DN10이 그 레코드를 "리뷰 해시와 ship 해시가 다르다"고
적은 것은 이 잘못된 결속의 산물이며, 정직한 서술은 `no_ship_receipt`다. 문서 §6이 이 정정을
소유한다.

### 2. `.claude/receipts/mccp-plan-codex/` 부재가 §3.12 내구성 계약에 대해 말하는 것

승인의 `review_proof`(quorum 구조·perspectives·dispatch_evidence)는 **plan-gate receipt에만**
실린다. 그 디렉토리는 worktree-only라 감사 대상 5건 분이 하나도 남아 있지 않다 — 현재 그
디렉토리에 있는 두 파일은 이 milestone 자신의 게이트가 방금 쓴 `diverse-agent-review-m11.json`과
`r3-no-axis.json`뿐이다.

**결과**: fan-out `security/HIGH`가 요구한 `isReviewProofStructurallyValid` 호출은 **인자를
구성할 수 없다**(DN9). 남은 앵커는 셋이고(레코드의 `reviewed_plan_hash` · 레코드의 quorum
블록 · ship receipt의 `plan_hash`) 도구는 그 셋만 검증한다.

**§3.12에 대해 말하는 것**: 그 계약은 ship receipt를 git-tracked로 만들어 "감사 대조 corpus"를
보존한다. 그러나 **승인의 근거(proof)는 그 corpus에 없다.** ship receipt는 *무엇이 배송됐는가*를
봉인하고 plan-gate receipt는 *왜 승인됐는가*를 봉인하는데, 후자만 소멸한다. M11이 `proof_backing`
축을 만든 이유가 이것이고, 그것이 낼 수 있는 최선은 **해시 한 값의 교차 확인**이다 — 전사
전체의 무결성 증명이 아니다. 이 gap을 닫으려면 plan-gate receipt를 tracked로 올리거나
`review_proof`를 레코드에 함께 적어야 하고, 둘 다 배선 변경이라 이 milestone 범위 밖이다.

### 3. 이 브랜치는 `origin/main`보다 12 커밋 뒤에 있다 (§3.5.1 사전 경고)

`git diff origin/main -- .`(2점)로 보면 9개 파일이 "삭제"로 보이는데, 이는 main이 분기 이후
추가한 `review-loop-trust` 계열 산출물이다(ship receipt 1건 포함). **이 브랜치가 지운 것이
아니다** — 3점 diff(`origin/main...HEAD`)는 빈 출력이다. 다만 §3.5.1이 실측 사고로 기록한
것이 정확히 이 상황이므로, **base 머지 직후 `git diff --diff-filter=D --name-only origin/main...HEAD`를
다시 확인**해야 한다. 특히 `.claude/receipts/mccp-pr-codex/review-loop-trust.json`은
git-tracked ship receipt라 소실되면 §3.12 감사 corpus가 깎인다.

## Acceptance 대조 (문구 조정 없이)

| Acceptance 항목 | 판정 |
|---|---|
| All tasks complete | **충족** — 7/7 |
| Validation passes | **충족(6번 제외)** — 1·2·3·4·5·7·8·9 통과. 6번은 구현 후 실행이라 `C3_CREATE_EXISTS` 3건(사후 산물, 위 설명) |
| Patterns mirrored, not reinvented | **충족** — `evidence-audit.js` state 사다리 · `corpus.js` 도구 형태·헤더 규약 · `quorum.js` 인자 주입 오라클 · `hash.js` 경로→체제 · `goal-detect.js` realpath 봉쇄. 정본 validator 2종은 **재사용**(재구현 0) |
| 게이트/경로 1회 완주 + 산출물 확인 (state≠blind, approved≥5) | **충족** — 문서 §1에 `--json` 출력 축자 동결. `state=degraded`(≠blind) · `coverage.approved=5` |
| 미탐 판정이 전부 G1·G2·G3에 대고 이뤄졌고 `candidates` 행을 출처와 함께 인용 | **충족** — 문서 §4의 4개 표가 관문별 열을 갖고 각 행이 보고서 절을 축자 인용 |
| `pr_codex`가 `structurally_empty`로 보고되고 그 0이 미탐 카운터에 기여하지 않음을 test가 고정 | **충족** — test 항목 2·3 |
| `unauditable`이 커버리지에서 분리되고 "결함 없음"으로 세어지지 않음 | **충족** — `coverage.unauditable=1`, 문서 §2가 먼저 적음 |
| `coverage` 3키 + 항등식이 실제 출력에서 성립 | **충족** — Validation 1이 기계 확인 |
| `proof_backing`이 레코드마다 보고되고 비-`corroborated`면 `degraded` | **충족** — 1건 `no_ship_receipt` → `state=degraded` |
| `plan_path`가 fs에 닿기 전 검증 · 탈출 입력 읽기 0회를 test가 단언 | **충족** — test 항목 9(11종 + io 스텁 접촉 0회) |
| false-approve **비율**이 어디에도 없음 | **충족** — 도구·문서·PRD 전부. test 항목 8이 판정 필드 부재를 고정 |
| 문서가 PRD 질문에 실제로 답하고, `no_miss_found`면 채널 지도로 구분 | **충족(강한 형태)** — 전건 `no_miss_found`가 **아니라** 4/4에서 미탐이 나왔으므로 그 분기가 발동하지 않았다. 그럼에도 문서 §3이 채널 지도를 싣고 `pr_codex`가 근거가 될 수 없음을 명시한다 |
| `state`가 `ok`이거나, `degraded`면 무엇이 degrade시켰는지 문서가 지목·판정 | **충족** — 문서 §7이 원인 1건을 지목하고 그것이 감사 결과 자체임을 적음 |
| 미탐 발견 시 처방이 범위 밖임을 문서가 명시 | **충족** — 문서 §5 말미 + PRD 표 하단 note |
| 게이트 배선 diff 공집합 | **충족** — Validation 8 (+M8 확대분) |
| ship receipt diff 공집합 | **충족** — Validation 9 |
| 삭제 파일 0건 | **충족** — Validation 7 (단 위 부수 관측 3 참조) |
| 기본 quorum 값·severity 게이트 무변경 | **충족** — `plan-review/` 전체 diff 공집합이 포함 |
| version 4면 동기 + `i18n-surface` green | **충족** — 10/10 |

**미충족 0건.** 6번 Validation은 미충족이 아니라 실행 순서의 산물이므로 위에 그대로 적었다.

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] **base 머지 시 §3.5.1 삭제 검증 재실행** (부수 관측 3)
- [ ] `/mccp:pr` — 진입 직전 §3.7 version 재계산 의무
