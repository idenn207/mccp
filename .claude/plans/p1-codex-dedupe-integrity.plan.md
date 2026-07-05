# Plan: P1 — Codex dual-review 무결성 복구 (cross-gate dedupe false-skip)

**Source**: 감사 리포트 A(Haiku 광범위) + B(Opus 심화) 통합 · scratchpad/audit-remediation-plan.md P1
**Branch**: v1-20-3-codex-dedupe-integrity · **Version**: 1.20.2 → 1.20.3 (patch)
**Complexity**: Medium

## Summary

cross-gate dedupe가 PR-step Codex를 skip할지 결정할 때, 실제 Codex verdict이 아니라 receipt write 시 **항상 `true`로 default되는 `resolution.converged`**를 검사한다. plan/implement Codex가 divergent(non-critical) 판정을 내려도 양쪽 receipt에 `converged=true`가 기록되어 PR-Codex가 조용히 skip되고, mccp 핵심 가치인 dual-review invariant가 무력화된다. 실제 verdict를 receipt에 persist하고 dedupe가 그 값을 fail-closed로 검사하게 만든 뒤, 무테스트였던 `evaluateForDedupe`에 회귀 테스트를 붙인다.

## Root Cause (grounded, worktree 실측)

| 지점 | 코드 | 문제 |
|---|---|---|
| `receipt/write.js:122-129` | `defaultResolution={converged:true,...}`; `resolution=readJsonIfPresent(args['resolution-file'], defaultResolution)` | `--resolution-file` 미전달이 기본 경로 → 항상 converged=true |
| `commands/plan.md` Phase 5.6 / `commands/prp-implement.md` Phase 2.5.6 | receipt-write 호출에 `--resolution-file`/verdict 미전달 | 실제 Codex verdict가 receipt에 안 실림 |
| `lib/codex-bridge.js:98-109` | `parseVerdict()` → converged/divergent/unavailable | 파싱은 되나 receipt로 흐르지 않음 |
| `receipt/dedupe.js:399-424` | `evaluateForDedupe`가 `resolution.converged`(항상 true) 신뢰 | false-skip 성립 |
| `receipt/tests/dedupe.test.js` | `evaluateForDedupe` import 안 함 | critical 경로 무테스트 → 버그 미검출 |

## 설계 결정 — Option B (신규 `codex_verdict`, fail-closed)

`resolution.converged`를 재사용하지 않고 **신규 필드 `resolution.codex_verdict`**(enum: `converged|divergent|critical|unavailable|skipped`)를 추가한다. 이유:
- `converged`의 기존 의미는 "작성자가 findings 처리를 확정(accept/reject)했다"이지 "Codex가 approve했다"가 아니다(B#11 semantic 지적). 두 의미를 분리한다.
- `design_critique_verdict` 선례와 동형 → 예측 가능.
- **fail-closed 하위호환**: `codex_verdict` 부재(구 receipt) → dedupe는 "skip 불가"로 판정 → PR-Codex 실행(안전 기본). dual-review가 더 자주 도는 방향(보수적)이라 안전.

dedupe skip 조건(수정 후): `residual empty` **AND** plan-codex `codex_verdict==='converged'` **AND** implement-codex `codex_verdict==='converged'`. 어느 하나라도 미충족 → skip 안 함.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Verdict 필드 선례 | `receipt/schema.js` `design_critique_verdict` | present-only optional enum 필드 추가 방식 |
| Flag forward | `lib/pr-phase-helpers/finalize-receipt.js` `deriveCodexFlags` | codex-result → `--codex-*` flag forward 패턴 |
| receipt_hash 재봉인 | v1.18.22 `cli.js restamp-grounding` (design_grounding) | 필드 추가 시 hash 무결성 보존 |
| CLI 인자 파싱 | `receipt/write.js` `args['...']` | `--codex-verdict` 수용 |
| 테스트 | `receipt/tests/dedupe.test.js` | node --test, tmp repo + mock receipt |

## Files to Change

| File | Action | Why |
|---|---|---|
| `receipt/schema.js` | UPDATE | resolution에 optional `codex_verdict` enum 추가 (validate 허용) |
| `receipt/write.js` | UPDATE | `--codex-verdict` 인자 수용 → resolution에 반영. receipt_hash 봉인 경로 유지 |
| `receipt/dedupe.js` | UPDATE | `evaluateForDedupe` convergence 검사를 `codex_verdict==='converged'` 기반으로 (fail-closed, 부재 시 skip 불가) |
| `lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | codex-result.json verdict → `--codex-verdict` forward (implement/pr 경로) |
| `commands/plan.md` | UPDATE | Phase 5.6에서 파싱된 verdict를 `--codex-verdict`로 전달 |
| `commands/prp-implement.md` | UPDATE | Phase 2.5.6 동일 |
| `commands/pr.md` | UPDATE | Phase 2.5.2 stale `CODEX_DEDUPE_AT_PR` 하드닝 (Codex R1 F1) |
| `receipt/tests/dedupe.test.js` | UPDATE | `evaluateForDedupe` 회귀 테스트 (양쪽 converged / 한쪽 divergent / 부재 / residual 존재) |
| `.claude-plugin/plugin.json` | UPDATE | 1.20.2 → 1.20.3 |
| `lib/renderer/html.js`, `lib/renderer/markdown.js` | UPDATE | footer version 동기 (§3.7) |
| `CHANGELOG.md` | UPDATE | 1.20.3 row |
| `CLAUDE.md` §1.2 | UPDATE(선택) | "verdict=approve" 주장이 이제 실제 강제됨을 반영 (minor) |

## Tasks

### Task 1: schema에 codex_verdict 추가
- **Action**: `schema.js`의 resolution 하위(또는 receipt-level)에 optional `codex_verdict` enum(`converged|divergent|critical|unavailable|skipped`) 추가. 부재 허용(구 receipt 비파괴).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/*.test.js` (schema 테스트 green)

### Task 2: write.js가 verdict 수용·기록
- **Action**: `--codex-verdict` 인자 파싱 → resolution.codex_verdict 설정. 미전달 시 필드 생략(default converged=true는 유지하되 codex_verdict는 안 넣음 → dedupe가 fail-closed). receipt_hash 계산 이후/이전 순서 확인해 봉인 무결성 유지.
- **Validate**: write 후 receipt JSON에 codex_verdict 존재 + `validate` green

### Task 3: dedupe fail-closed 검사
- **Action**: `evaluateForDedupe`의 convergence 블록을 `codex_verdict==='converged'` 요구로 변경. plan/implement 어느 쪽이든 `codex_verdict!=='converged'`(부재 포함) → `skip_safe=false`, reason 명시.
- **Validate**: Task 6 테스트로 증명

### Task 4: finalize-receipt verdict forward
- **Action**: `deriveCodexFlags`가 codex-result.json의 verdict(parseVerdict 결과)를 읽어 `--codex-verdict`를 write flags에 추가. `write_flags_used`에 노출.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/*finalize*` (있으면) + 수동 trace

### Task 5: 게이트 command body가 Codex verdict 전달 (Codex R1 F2 — 변수 충돌 회피)
- **Action**: `plan.md` Phase 5.6 / `prp-implement.md` Phase 2.5.6의 receipt-write 호출에 `--codex-verdict "$CODEX_VERDICT"` 추가. **`$CODEX_VERDICT`는 반드시 별도 신규 변수** — 기존 impeccable design-critique retry loop의 `$VERDICT`/`$RECEIPT_VERDICT`와 **절대 재사용 금지**(재사용 시 converged design-critique가 divergent Codex를 converged로 오stamp → 버그 재현). 출처: Phase 5.2/2.5.3 Codex 응답(`JSON.parse(CODEX_STDOUT).stdout`)을 `codex-bridge.parseVerdict`(또는 공유 helper)로 통과시켜 도출. Codex disabled/skipped→`skipped`, advisory-unavailable→`unavailable`, 실제 approve만 `converged`.
- **Validate**: command doc grep(별도 `CODEX_VERDICT` 존재 + `VERDICT` 미재사용) + "design-critique converged & Codex divergent" mismatch dry trace

### Task 6: evaluateForDedupe 회귀 테스트 (B#9)
- **Action**: `dedupe.test.js`에 evaluateForDedupe import + tmp repo/mock receipt로 케이스: (1) 양쪽 converged + residual 없음 → skip_safe=true, (2) 한쪽 divergent → false, (3) 한쪽 codex_verdict 부재 → false, (4) plan receipt 없음 → false, (5) residual 존재 → false.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js` green

### Task 7: pr.md — stale `CODEX_DEDUPE_AT_PR` 하드닝 (Codex R1 F1)
- **Action**: `pr.md` Phase 2.5.2에서 `--dedupe`(codex-runner)를 **현재 `DEDUPE_JSON.skip_safe===true`에서만** 도출. 진입 시 기존/stale `CODEX_DEDUPE_AT_PR` env를 unset 또는 hard-reject — `evaluateForDedupe` fail-closed만으론 불충분(env-flag가 별도 우회구; stale=1이면 dual-review 우회). F9 mutex(`MCCP_PR_SKIP_CODEX_REVIEW`)와의 상호작용도 확인.
- **Validate**: stale `CODEX_DEDUPE_AT_PR=1` + (한쪽 divergent OR codex_verdict 부재) → PR-Codex가 **여전히 실행됨**을 증명하는 회귀 trace/test

### Task 8: version bump + footer + CHANGELOG (§3.7)
- **Action**: plugin.json 1.20.3, renderer footer 2곳 동기, CHANGELOG row.
- **Validate**: `node --test` 관련 i18n/renderer 테스트 green

## Validation

```bash
node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js
node --test plugins/mccp/scripts/receipt/tests/*.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
# 전체 스모크
node --test plugins/mccp/scripts/receipt/tests/ plugins/mccp/scripts/lib/tests/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 구 receipt(codex_verdict 부재)로 dedupe가 항상 skip 안 함 → PR-Codex가 더 자주 돎 | High(의도된 방향) | 안전한 fail-closed. dedupe는 최적화일 뿐, dual-review 실행이 default. 문서화. |
| receipt_hash 봉인 순서 실수로 tamper-detect 깨짐 | Medium | restamp-grounding 선례 미러 + write 후 validate로 확인 |
| command body 수정이 Codex skipped/disabled/advisory 경로와 충돌 | Medium | 각 경로별 verdict 매핑 명시(skipped→skipped, disabled→skipped, advisory-unavailable→unavailable) |
| schema 변경이 기존 receipt validate 회귀 | Low | optional/present-only, 부재 허용. 기존 테스트 green 확인 |

## Acceptance

- [ ] 양쪽 게이트 divergent 시 PR-Codex가 skip되지 않음(회귀 테스트로 증명)
- [ ] 구 receipt(필드 부재)에서 fail-closed(skip 안 함)
- [ ] evaluateForDedupe 테스트 커버리지 신설
- [ ] 전체 관련 테스트 green
- [ ] plugin.json 1.20.3 + footer + CHANGELOG 동기
- [ ] receipt_hash 무결성 유지(write 후 validate green)
- [ ] stale `CODEX_DEDUPE_AT_PR=1`이 fail-closed를 우회하지 못함 — 회귀 테스트 (Codex R1 F1)
- [ ] `--codex-verdict`가 design-critique `$VERDICT`와 **분리된 변수**에서 도출 (Codex R1 F2)

## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; classification=ok, blocking=false)
- 라운드 수: 1 (R1 — ACCEPT_NOW 2건 모두 plan 흡수로 해소 → R2 불요, cap=1)
- 합치 결론: needs-attention → R1에서 2 HIGH를 plan에 흡수(Task 5 재정의 + Task 7 신설 + Files/Acceptance 갱신). 흡수 후 unresolved ACCEPT_NOW HIGH/CRITICAL 없음.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 stale `CODEX_DEDUPE_AT_PR` env 우회 (`pr.md:403-406`) | HIGH | ACCEPT_NOW | evaluateForDedupe fail-closed만으론 불충분 — env-flag 별도 우회구. **Task 7**로 흡수. |
  | F2 design-critique `$VERDICT` 변수 재사용 위험 (plan Task 5) | HIGH | ACCEPT_NOW | 재사용 시 converged critique이 divergent Codex를 오stamp → 버그 재현. **Task 5** 별도 `$CODEX_VERDICT` 변수로 흡수. |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음 — secret/data-loss/auth-bypass/irreversible 무관)
- Codex session 참조: threadId `019f308f-7001-7313-9c06-40cc08d9cf48`
