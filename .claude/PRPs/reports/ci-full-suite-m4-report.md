# Implementation Report: ci-full-suite M4 — enforcement-live-closure

**Plan**: `.claude/plans/ci-full-suite-m4.plan.md` (남겨 둠 — 아카이브는 `/mccp:archive-complete` 소관)
**Branch**: `c3-ci-full-suite` · **Date**: 2026-09-08

## Summary

M4 는 "게이트에 차단력을 붙이고 그것을 실증한다" 였다. **이번 사이클은 그 중 로컬 축만
수행했다** — 운영자 판정으로 축 D(원격 왕복)를 이 사이클 범위에서 뺐고, 축 C 는 권한 부재로
애초에 실행 불가였다. 수행한 것은 (a) 축 D·C 를 각각 막고 있던 **코드 결함 둘**을 닫고,
(b) 이미 측정된 OQ3 을 판정·기록하고, (c) 그 측정으로 격리 6건을 재판정한 것이다.

**라이브 산출물 5 중 1 충족 · 4 미충족.** 반올림하지 않았다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (코드 2파일 · test 2파일 · 문서 5파일) |
| Tasks | 7 | 4 수행(1·2·5·7) · 1 부분(4 — 측정은 계획 단계에 이미 완료, 기록만) · 2 미수행(3·6) |
| Files Changed | 14 | 10 (축 D 산출물 2건 CREATE 는 미수행) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 절단 B 대상 가드를 코드로 | **완료** | 5 사유 코드(계획의 4 + security-reviewer S1 이 요구한 `quarantine_list_unreadable`). 거부는 `git rm` **앞에서** throw(S2) |
| 2 | 판독 채널 + 비교 규칙 | **완료** | world-readable 채널 · `{protected, contexts}` · 4-way 판별자 · 포함 검사 · `declared_unresolved` · `HISTORICAL_GATE_NAMES` · JSON 파싱(S6) |
| 3 | 축 D CI red 실증 | **미수행** | 운영자 판정 — 외부 저장소에 대한 공개 작업이라 이 사이클 범위 밖 |
| 4 | OQ3 baseline dispatch | **완료(기록)** | 측정은 계획 단계에 이미 수행(run `34195014409`). DD8 행을 artifact 에서 **재도출** → `matrix` · "결정됨 · 시행 미완" |
| 5 | 격리 6건 재판정 | **완료** | `Q\L=0 · Q∩L=6 · L\Q=0`. 사유 6건 갱신, 상한·floor 무편집 |
| 6 | branch protection 설정 | **미수행** | `madsci207` `admin:false` — 수행 주체는 `idenn207` |
| 7 | PRD·문서 정정 | **완료** | PRD 5블록 · `m3-enforcement.md` §7 · runbook · `m4-live-closure.md` 신규 · backlog H1~H10 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static / 단위 test | **Pass** | 4파일 **109 pass · 0 fail** (`wiring-cut` 32 · `ci-required-checks` 14) |
| 전수 측정 | **Pass** | `ok:true` · `attribution:complete` · `failing:[]` · `per_file 385 == files_total` · `redaction_ok:true` |
| 게이트 | **Pass** | `gate.js` **exit 0** · 98.4655% (385/391) · `unexplained:[]` |
| 버전 가드 | **Pass** | `version-declaration-guard --base origin/main` exit 0 |
| **`## Validation` 전체** | **미통과** | 두 정지점 — PRD status(`in-progress`) · `axis-d-a-run` 부재. 상세는 `m4-live-closure.md` §7 |

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
| `.claude/plans/ci-full-suite-m4.plan.md` | UPDATE | Codex Implementation Review · Security Reviewer · 이탈 2건 |

## Deviations from Plan

1. **Task 3·6 미수행** — 사용자 판정(로컬 우선) · 권한 부재. 둘 다 `m4-live-closure.md` 에
   `unmet` + 사유로 기록.
2. **PRD M4 status 를 `complete` 로 올리지 않았다** — `## Validation` 이 요구하지만 계획 본문의
   반올림 금지가 우선한다. `m4-live-closure.md` §7 정지점 A.
3. **사유 코드가 4 → 5** — security-reviewer S1(HIGH)이 rule (b) 입력 판독 실패에 코드가
   없음을 지적. `quarantine_list_unreadable` 추가.
4. **`[MCCP-GATE-STOP]` 미발행 (2.5.5)** — HIGH 2건을 §3.14 대로 그 자리에서 흡수. 사유는
   plan 의 `### 게이트 이탈` 절.
5. **2.5.7 read-back validate exit 2 에도 Phase 3 진입** — 사유는 `mccp-plan-codex` 부재
   하나뿐(missing-only)이고 `MCCP_RECEIPT_GATE_MODE=soft` 가 그것을 허용한다. plan 의
   `### 게이트 이탈 2`.

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

- [ ] 축 D — `chore/axis-d-negative-control` 원격 왕복 (선행 코드 결함은 닫혔다)
- [ ] 축 C — `idenn207` 이 runbook §2b 수행 + `enforce_admins` 값과 근거 기록
- [ ] backlog `ci-full-suite:H5` — baseline SHA-pin 패리티 (OQ3 `matrix` 시행의 선행조건)
- [ ] `/mccp:pr` — PR-Codex 는 반드시 발화한다(dedupe 닫힘)
