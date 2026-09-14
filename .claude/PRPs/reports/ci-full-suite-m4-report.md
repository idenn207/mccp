# Implementation Report: ci-full-suite M4 — enforcement-live-closure

**Plan**: `.claude/plans/ci-full-suite-m4.plan.md` (남겨 둠 — 아카이브는 `/mccp:archive-complete` 소관)
**Branch**: `c3-ci-full-suite` · **Date**: 2026-09-08 · **축 D 완주**: 2026-09-11

## Summary

M4 는 "게이트에 차단력을 붙이고 그것을 실증한다" 였다. 2026-09-08 사이클이 로컬 축(코드
결함 둘 · OQ3 판정·기록 · 격리 6건 재판정)을 수행했고, **2026-09-11 운영자 승인으로 축 D
원격 왕복을 완주했다** — 버리는 PR #193 에서 절단 A·B를 각각 1회 적용·관측·복원하고
`gate.json` tracked 사본 2건을 확보했다. 축 C 만 권한 부재(`admin:false`)로 명시 미충족.

**라이브 산출물: 축 D-A ✓ · 축 D-B ✓ · OQ3 ✓ · 격리 재판정 ✓ · 축 C ✗(명시 미충족 — Acceptance 7 정규 경로). `## Validation` 전체 통과(`VALIDATION REACHED END`).**

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (코드 2파일 · test 2파일 · 문서 5파일 + 증거 2건) |
| Tasks | 7 | 5 수행(1·2·3·5·7) · 1 기록(4) · 1 미수행(6 — 권한, 수행 주체 `idenn207`) |
| Files Changed | 14 | 13 + 병합(main 유입) + de-flake 1건 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 절단 B 대상 가드를 코드로 | **완료** | 5 사유 코드(계획의 4 + security-reviewer S1 이 요구한 `quarantine_list_unreadable`). 거부는 `git rm` **앞에서** throw(S2) |
| 2 | 판독 채널 + 비교 규칙 | **완료** | world-readable 채널 · `{protected, contexts}` · 4-way 판별자 · 포함 검사 · `declared_unresolved` · `HISTORICAL_GATE_NAMES` · JSON 파싱(S6) |
| 3 | 축 D CI red 실증 | **완료 (2026-09-11)** | PR #193 · 절단 A run `34556517175`(`stage:1`·`suite_red`) · B run `34566171941`(`stage:2`·`deleted_without_allowance`) · `stage` 상이로 판별력 성립 · 사본 tracked · green 기준선 run `34556317904` |
| 4 | OQ3 baseline dispatch | **완료(기록)** | 측정은 계획 단계에 이미 수행(run `34195014409`). DD8 행을 artifact 에서 **재도출** → `matrix` · "결정됨 · 시행 미완" |
| 5 | 격리 6건 재판정 | **완료** | `Q\L=0 · Q∩L=6 · L\Q=0`. 사유 6건 갱신, 상한·floor 무편집 |
| 6 | branch protection 설정 | **미수행** | `madsci207` `admin:false` — 수행 주체는 `idenn207` · `axis-c: unmet` + 사유 기록 |
| 7 | PRD·문서 정정 | **완료** | PRD 5블록 + M4 status `complete` 전이 · `m3-enforcement.md` §7 · runbook · `m4-live-closure.md` · backlog H1~H11 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static / 단위 test | **Pass** | 4파일 **109 pass · 0 fail** (`wiring-cut` 32 · `ci-required-checks` 14) — main 병합 후에도 동일 |
| 전수 측정 | **Pass** | `ok:true` · `attribution:complete` · `failing:[]` · `per_file 397 == files_total 397`(main 병합으로 391→403 tracked, 격리 6 제외) · `redaction_ok:true` |
| 게이트 | **Pass** | `gate.js` **exit 0** · 98.5112% (397/403) · `unexplained:[]` |
| 버전 가드 | **Pass** | `version-declaration-guard --base origin/main` exit 0 (merge-base 1.34.4) |
| **`## Validation` 전체** | **Pass (2026-09-11)** | **`VALIDATION REACHED END`** — 축 D run 결속·`gate.json` 대조·OQ3 오라클(`ORACLE OK`)·축 C unmet 분기·PRD·backlog 전분 통과 |

Design Grounding: **N/A** — design trigger 미발화(`design_signal=0`, rendered surface 0건).

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `scripts/test-suite/wiring-cut.js` | UPDATE | 대상 가드 · 5 사유 닫힌 열거 · `parseSelfTestTargets` export · `--workflow` seam · `--pick-delete` |
| `scripts/tests/wiring-cut.test.js` | UPDATE | 분기 8 추가 (24 → 32) |
| `scripts/ci-required-checks.js` | UPDATE | 판독 채널 · 반환 계약 · 판별자 · 포함 검사 · `declared_unresolved` |
| `scripts/tests/ci-required-checks.test.js` | UPDATE | 순수층 5 fixture 재작성 + spawn seam 5 (7 → 14) |
| `.github/test-suite-exclusions.json` | UPDATE | 6건 `reason` 재측정 근거로 갱신 |
| `.github/workflows/test-suite-baseline.yml` | UPDATE | 트리거 주석 정정(`pull_request` → `workflow_dispatch` 단독) |
| `docs/ci-full-suite/m4-live-closure.md` | CREATE | 라이브 산출물 색인 + 기계 판독 필드 |
| `docs/ci-full-suite/baseline-34195014409-summary.json` | (신규 tracked) | OQ3 축약 증거 |
| `docs/ci-full-suite/m3-enforcement.md` | UPDATE | §7 표 3·4행 |
| `docs/ci-full-suite/branch-protection-runbook.md` | UPDATE | 수행 계정 · `enforce_admins` 재고 · 판독 채널 · 사유 표 5행 |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | 판독 채널 · dispatch 이력 · OQ3 판정 · Metrics 3·4 · M4 행 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | H1~H10(9행) + Codex F1·F2 + security S3 |
| `docs/ci-full-suite/axis-d-a-gate.json` | CREATE | 절단 A run `34556517175` `gate.json` tracked 사본(artifact와 byte-동일) |
| `docs/ci-full-suite/axis-d-b-gate.json` | CREATE | 절단 B run `34566171941` `gate.json` tracked 사본(artifact와 byte-동일) |
| `plugins/mccp/scripts/lib/tests/review-verdict-corpus-hash.test.js` | UPDATE | main 유입 flaky de-flake(clone 1줄, 의도 불변) |
| `.claude/plans/ci-full-suite-m4.plan.md` | UPDATE | Codex Implementation Review · Security Reviewer · 이탈 2건 |

## Deviations from Plan

1. **Task 3 (축 D) 수행 시점 이동** — 2026-09-08 에는 운영자 판정으로 유예(외부 가시 작업),
   **2026-09-11 운영자 승인("지금 수행")으로 완주**. 유예·승인 이력 모두 `m4-live-closure.md` §1·2 에 보존.
   Task 6 은 여전히 미수행(권한 부재, `axis-c: unmet` 기록).
2. **PRD M4 status `complete` 전이는 2026-09-08 에 보류됐다가 2026-09-11 해제** — 축 D 충족 후
   남는 미충족은 축 C 하나뿐이고 그것은 Acceptance 7 의 정규 종착(명시 미충족)이라 반올림이
   아니다. 정정 서술은 PRD M4 행 + `m4-live-closure.md` §7.
3. **origin/main 병합 (2026-09-11)** — main 이 `orchestrator-step-wiring` 등으로 앞서가 PR #193 이
   `mergeStateStatus:DIRTY` 로 `pull_request` workflow 미발화. 충돌은 bookkeeping 3파일(backlog 양측
   보존 · STATE/fix-task ours)이었고 §3.5.1 삭제 검증 통과(삭제 0건). 병합으로 tracked test
   391→403, 게이트 재검증 green(98.5112%).
4. **main 유입 flaky test 1건 de-flake** — `review-verdict-corpus-hash.test.js` 의 briefing
   carve-out 단언이 `makeSkeleton` 의 ms 단위 `created_at` 때문에 비결정 적색(3/20 재현, 부하 시
   악화 — `debt-inventory.json` 이 이미 "전체 스위트 flaky"로 재고화한 항목). green 기준선이
   필요한 음성 통제의 전제라 clone 1줄로 수정(의도 불변 — briefing 만 달라야 한다). 20회
   스트레스 0 fail.
5. **`m4-live-closure.md` 기계 필드를 오라클 표면에 정합** — 오라클이 읽는 키(`oq3-dd8-row` ·
   `oq3-windows-only-red` · `oq3-enforcement-owner` · `quarantine-{released,residual,novel}` ·
   `axis-d-{a,b}-run` · `axis-d-pr`)가 문서에 없거나 다른 이름(`dd8-row`)이었다. 전부
   실측값으로 추가/교체 — 오라클이 각 값을 artifact 에서 독립 재도출해 대조하므로 문서 주장은
   증거가 아니다.
6. **사유 코드가 4 → 5** — security-reviewer S1(HIGH)이 rule (b) 입력 판독 실패에 코드가
   없음을 지적. `quarantine_list_unreadable` 추가.
7. **`[MCCP-GATE-STOP]` 미발행 (2.5.5)** — HIGH 2건을 §3.14 대로 그 자리에서 흡수. 사유는
   plan 의 `### 게이트 이탈` 절.
8. **2.5.7 read-back validate exit 2 에도 Phase 3 진입 (2026-09-08)** — 사유는 `mccp-plan-codex`
   부재 하나뿐(missing-only)이고 `MCCP_RECEIPT_GATE_MODE=soft` 가 그것을 허용한다. plan 의
   `### 게이트 이탈 2`. (plan receipt 는 2026-09-11 divergent 로 작성됐다.)

### 2026-09-14 — implement gate 재실행 (receipt stale 복구)

`/mccp:pr` Phase 1.6 preflight 가 `mccp-implement-codex/ci-full-suite-m4`(2026-09-08) 를 **stale** 로
보고했다 — receipt plan hash `4572fc…` ≠ 현재 `31e8cb…`. plan 은 09-11 재개정·재게이트됐고
(plan receipt 가 현재 hash 와 일치) implement receipt 만 옛 plan 을 가리켰다. 이대로 PR-Codex 를
돌리면 ship receipt 봉인 뒤 2.5.8/2.5.9 에서 HALT 되므로 운영자 선택으로 `/mccp:prp-implement` 를
재실행했다. origin/main 은 이미 병합돼 있어(behind 0, 삭제 0) 충돌 해소는 필요 없었다.

- **Implement-Codex**: `classification=round-cap-reached` (원장 1/1, spawn 0) → `codex_verdict=divergent`.
  미해소 finding(F1·F2·S3)은 전부 09-08 backlog 행에 이미 있다. 재실행 NOTE 1행만 추가.
- **plan 본문 무편집 (2.5.4 이탈)** — `## Codex Implementation Review` 를 plan 에 갱신하면
  plan hash 에 섹션 carve-out 이 없어(`plugins/mccp/scripts/receipt/hash.js:203-210`) 09-11
  plan receipt 가 대신 stale 이 된다. 기존 섹션(09-08 R1)이 2.5.6 Step A 를 만족하므로 그대로 두고
  기록은 이 절에 남긴다.
- **security-reviewer 미재호출 (2.5.5 이탈)** — 이 decision 의 implement gate 에서 이미 1회
  수행됐고(S1·S2 흡수), 09-08 이후 코드 변화는 LOW 흡수 커밋 `fca5f1c`(branch 인코딩 ·
  `--workflow` 인자 가드) 뿐이다. §3.16 에 따라 라운드를 늘리지 않고, PR diff 전체는 `/mccp:pr`
  2.5.5 가 다시 본다.
- **impeccable**: `skill_available=true · design_signal=false` → silent-skip(`no-signal`). routing ·
  critique · grounding 전부 미발화.
- **plan-conflict detector `conflict:true` (file-expansion, 7건) — escalation 미수행.** 7건 중
  6건이 게이트 산출물(plan · review · report · STATE · findings shard · fix-task-applied)이고 이것은
  backlog 에 이미 있는 오발화 축이다(`codex-findings-backlog.md:644` · `:933`). 게이트 산출물을 뺀
  15파일로 재측정하면 `conflict:false` 이고, 남는 계획 밖 구현 파일은 위 4번의 de-flake test
  1건(임계 ≥2 미만)이다. `chain_aborted` 는 세우지 않았다.
- **Validation**: plan `## Validation` 블록을 추출해 그대로 실행, exit 0 — test 111/111 ·
  `gate PASSED` 98.51% · `ORACLE OK` · 축 C unmet 기록 · version guard 통과 · `VALIDATION REACHED END`.
- **동시 세션 관측** — 재실행 중 이 worktree 에 다른 세션의 미커밋 편집이 생겼다(PRD M5 행 +1,
  untracked `ci-full-suite-m5.plan.md`, 11:26~11:27 KST). 이 사이클은 그 파일들을 커밋하지 않는다.

## Issues Encountered

**게이트가 이 사이클 안에서 한 번 발화했다.** Task 5 에서 `leadtime` 격리 사유에 드라이브
문자 형태 리터럴을 적었더니 `redact.js` 의 `win-drive-abs` 규칙이 그것을 잡아 green 스위트가
stage 3 `redaction` 으로 차단됐다(`at: $.exclusions[3].reason`). 격리 사유 문자열이
measurement JSON 에 그대로 실린다는 것을 그 발화가 가르쳤다. 문구 교체로 `redaction_ok:true`
복귀. **결함이 아니라 게이트가 의도대로 동작한 사례**다.

## Tests Written

| Test File | 추가 | 커버 영역 |
|---|---|---|
| `scripts/tests/wiring-cut.test.js` | 8 분기 | 5 사유 코드 · 순서 불변식(거부 후 tracked 유지) · 파서 개명 내성 · 열거 폐쇄성 · 선택기 결정성 |
| `scripts/tests/ci-required-checks.test.js` | 5 재작성 + 5 신규 | 포함 검사 · `unrelated` · `renamed_gate` 판별력 · 3분화 + `undefined` fail-closed · 빈 `declared` · `gh` 스텁 spawn seam(엔드포인트 · 파싱 · absent↔unreadable 분기 · throw 전파 · PATH 복원) |

## Next Steps

- [x] 축 D — 원격 왕복 완주 (2026-09-11 · PR #193 · red 2건 + green 기준선 2건)
- [ ] 축 C — `idenn207` 이 runbook §2b 수행 + `enforce_admins` 값과 근거 기록
- [ ] backlog `ci-full-suite:H5` — baseline SHA-pin 패리티 (OQ3 `matrix` 시행의 선행조건)
- [ ] `/mccp:pr` — PR-Codex 는 반드시 발화한다(dedupe 닫힘)
