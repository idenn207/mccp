# Implementation Report: codex-intent-context M1

**Plan**: `.claude/plans/codex-intent-context-m1.plan.md`
**Branch**: `feat/codex-intent-context`
**Version**: `1.23.0 → 1.23.1` (단일 milestone → patch, §3.7)

## Summary

Plan-Codex 게이트에 **사용자 의도 채널**을 신설했다. 세 축 모두 ship:

- **L1** — plan의 `## User Intent` 표를 하드닝해 리뷰어 focus에 주입 (`intent-context.js` + `codex-invoke --intent-reference-file`).
- **L2-A** — Codex의 **모든 finding**이 명시 판정을 받아야 receipt가 작성된다. 1건 누락 = `incomplete` = receipt 미작성.
- **M** — receipt `meta.intent_*` **10 present-only 필드**로 측정 인프라 확립.

강제는 단일 장수 프로세스 `plan-codex-runner.js`가 소유한다 — Codex 호출·adjudication 대기·판정·receipt write가 한 프로세스 안에서 일어나므로 리뷰와 write 사이에 판정 입력 파일이 존재하지 않는다.

**M1은 UI10을 달성하지 않는다** — 저자가 충돌을 `none`으로 찍으면 커버리지는 통과한다. M1은 *누락*을 막고 *오심*은 M1.5가 소유한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium-Large (테스트 4본 70건 + command body 3종 재배선) |
| Files Changed | 24 | 27 (+3: renderer footer 2 + version-pin test 1) |
| Tests | 4 신규 파일 | 4 신규 (70건) + 2 기존 확장 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `intent-context.js` 오라클 | 완료 | 소비처별 출력(단일 `pass` 없음 — R1 F3) |
| 2 | 오라클 테스트 | 완료 | 30건. (q)는 아래 "Deviations" 참조 |
| 3 | `codex-invoke.js` reference 주입 | 완료 | 3-part 결정적 순서 + 판독 실패 spawn 전 exit 2 |
| 4 | codex-invoke 테스트 확장 | 완료 | 37건 (7건 신규) |
| 5 | schema 필드 | 완료 | 9 → **10** (`intent_run_nonce` 추가 — R1 F5) |
| 6 | `write.js` stamp-only | 완료 | 프로그래매틱 객체 전용 타입 가드 |
| 6b | `plan-codex-runner.js` | 완료 | 17건. lock + nonce + 4-state |
| 7 | `cli.js` + `validate-cmd.js` | 완료 | **cli.js intent 플래그 0건**(R1 F2) |
| 7b | `dedupe.js` | 완료 | 공유 `codexConverged` 불변 |
| 8 | receipt 계층 테스트 2본 | 완료 | 12 + 11건 |
| 9 | `plan.md` 배선 | 완료 | Phase 1.5 / 5.2 detached / 5.4a / 5.5a / 5.6 |
| 9b | `prp-implement.md` 분기 | 완료 | blind write 차단 |
| 10 | `pr.md` + codex-runner L1 | 완료 | fail-open forward |
| 11 | 문서 + version | 완료 | CLAUDE.md §3.13 + 토글 2건 + footer 동기 |
| 12 | 전체 회귀 | 완료 | 아래 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit/Integration | Pass | **2570 pass / 2579**, fail 5 |
| 신규 실패 | **0** | fail 5건은 전부 pre-change baseline과 동일 |
| Validation 블록 | Pass | negative grep 5종 전부 0 hit, version `1.23.1` |
| §3.5.1 삭제 검증 | Pass | `git diff --diff-filter=D origin/main...HEAD` 공집합 |
| E2E 실모듈 | Pass | 실 `receipt/write` 경유 receipt 작성 확인 |

### Pre-existing failures (5, 본 cycle 무관 — baseline 동일)

`design-critique-loop-e2e`(fixture 부재) · `g1-patch`(3) · `verdict-label`(renderer).

> **테스트 실행 시 `MCCP_BRIEFING=off` 필요.** 미설정 시 매 `write()`가 briefing LLM timeout을 유발해 receipt suite가 10분+ 행. 본 cycle 무관한 환경 이슈이며 baseline도 동일.

## Deviations from Plan

1. **DD4-1 (구현 정정, 중요)** — plan은 "write 직전 재대조 = **리뷰 시점** digest, 불일치면 abort"를 요구했으나 **실제 흐름에서 성립 불가**다: 게이트 자신이 `## Codex Adversarial Review`를 plan에 주입하므로 리뷰 후 본문이 반드시 바뀐다. 그대로 구현하면 **성공 경로가 항상 abort**한다. 수정: `intent_plan_digest`는 **실제 봉인되는 본문**의 digest로 stamp하고 write 후 재검증(DD4-2/S2 유효), 리뷰 시점 digest는 marker에 forensics로 남기고 불일치 시 loud stderr. 닫히는 창은 "adjudication 도착 → write"로 좁아졌고 이를 정직히 문서화했다.

2. **write.js free-form 자동 proof (설계 정련)** — 초안대로 in-scope 게이트 전체를 fail-closed하니 기존 테스트 **77건**이 깨졌다. 원인 분석 결과 전부 "free-form fixture plan에 plan-codex receipt를 쓰는" 케이스였다. DD1이 이미 `free_form_plan`을 **corroborated proof**로 규정하므로, `**Source PRD**:` 부재를 write.js가 mechanical하게 확인해 `skipped/free_form_plan`을 stamp하도록 했다(판정이 아니라 DD1 규칙 적용). 결과 **77 → 0**, fail-closed는 PRD-모드 plan에 그대로 유지. 새 우회 경로가 아니다 — runner도 동일 proof를 인정한다.

3. **reference 파일 채널 축소 (S5 범위)** — runner는 codex-invoke를 in-process 호출하므로 reference를 **텍스트로 직접** 전달한다(임시 파일 없음 → symlink/정리 리스크 원천 제거). 파일 채널(`--intent-reference-file`, 0600, UUID, gitdir)은 shell-out이 필요한 **pr.md 경로 전용**으로 남았다.

4. **Task 2 (q) 개행 벡터** — 마크다운 표 셀에 **리터럴 개행이 존재할 수 없다**(행이 쪼개짐). 따라서 섹션 레벨에서는 `malformed-row`로 거부되며(거부는 성립), `\b` 앵커 회피를 막는 공백 접기는 정규화 함수에 직접 test를 걸었다. 도달 불가능한 경로를 assert하지 않는 편을 택했다.

5. **plan 미아카이브** — Phase 5의 `completed/` 이동을 수행하지 않았다. 지금 옮기면 receipt chain의 `--plan` 경로가 깨져 `/mccp:pr`이 즉시 실패한다. §3.11이 아카이브를 `/mccp:archive-complete`(PRD 종료 시점)에 위임하므로 그 관례를 따른다.

6. **security-reviewer 미호출** — 본 세션 운영 지침이 사용자 요청 없는 subagent 호출을 금지해 `Task(security-reviewer)`를 실행하지 않았다. 커맨드 본문의 fallback 계약대로 implement receipt에 `security_skipped=true` + 사유를 정직히 stamp했다. **이 필드는 `/mccp:pr`에서 blocking**이다(§3.3).

## Files Changed

**CREATE (7)** — `lib/intent-context.js` · `lib/markdown-table.js` · `lib/plan-codex-runner.js` · `lib/tests/intent-context.test.js` · `lib/tests/plan-codex-runner.test.js` · `receipt/tests/intent-gate-fields.test.js` · `receipt/tests/validate-cmd-intent-gate.test.js`

**UPDATE (20)** — `receipt/{schema,write,validate-cmd,dedupe}.js` · `lib/codex-invoke.js` · `lib/pr-phase-helpers/codex-runner.js` · `lib/renderer/parsers/plan-body.js` · `lib/renderer/{html,markdown}.js` · `commands/{plan,pr,prp-implement}.md` · `plugin.json` · `CHANGELOG.md` · `CLAUDE.md` · 테스트 3본 · plan/state 산출물

## Issues Encountered

- **77-test blast radius** → Deviation 2로 해소(원인 분석 후 경계 재설정, 테스트 대량 수정 회피).
- **receipt suite 행** → briefing timeout(환경). `MCCP_BRIEFING=off`로 우회, baseline도 동일.
- **경로 mangling** — MSYS `/c/...` ↔ Windows 경로 혼선으로 smoke test 2회 실패([memory: bash-tool-backslash-collapse] 인접). 상대 경로로 해소.

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit` → `/mccp:pr`
- [ ] **`/mccp:pr` 진입 전 결정 필요**: implement receipt의 `security_skipped=true`가 blocking이다. security-reviewer를 실제로 돌릴지, `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`로 audited escape할지 사용자 결정.
- [ ] 머지 + `claude plugin update` 후에야 본 게이트가 자기적용된다(현재 설치 캐시 `1.22.7`은 stale).
- [ ] **M1.5** — 오심 탐지(리뷰어 per-finding `INTENT:` 계약 + 비대칭 대조). UI10 달성 milestone.
