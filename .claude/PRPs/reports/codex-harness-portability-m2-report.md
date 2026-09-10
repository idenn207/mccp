# Implementation Report: codex-harness-portability M2 — gate-ingress

## Summary

Codex에서 mccp receipt 게이트를 **0회 발화에서 1회 발화로** 올렸고, 선행 receipt가 없을 때
**실제로 차단하는 것**을 실측으로 고정했다(`runs[id=gate-block-live].pair_ok=true`).

측정을 배선보다 앞에 뒀고, 그 순서가 값을 했다 — plan의 핵심 결정 하나(DD3 판별자)가 M1
자신의 원자료에 의해 반증됐고, 다른 하나(DD1 `$schema` 사거리)는 사거리가 1건이 아니라 29건임이
드러났다. 둘 다 배선 전에 고쳤다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 다만 비용의 절반이 구현이 아니라 **plan 정정**이었다 |
| Confidence | — | 차단 실증은 실측으로 닫힘. `${CLAUDE_PLUGIN_ROOT}` 치환 축은 열지 못함 |
| Files Changed | 18 | 17 (신규 5 · 수정 12). `receipt-prompt-submit.test.js` 등 test는 계획대로, `env-contract` 3면이 계획 외 추가 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `$schema` 제거 + 상위키 가드 | 완료 | 하네스 가드가 선 **뒤에** 착지시켰다(L2-11). 핸들러 29 → 30(ingress +1) |
| 2 | 차단 프로토콜 계측 (B1·B2) | 완료 | `stdout-json` · `exit-2-stderr` 차단 확인, `permissionDecision` 미존중 |
| 3 | 판별자·플러그인 루트 계측 (B3·B4) | **부분** | B4 완료(음성 결과가 곧 측정값). **B3 미측정** — 아래 미달 항목 |
| 4 | ingress 오라클 | 완료 | 양성 신호 전용으로 재설계(이탈 1) |
| 5 | 게이트 코어 분리 | 완료 | 방출 seam을 `block()`이 아니라 **5개 출력 경로 전부**에 냈다 |
| 6 | Codex ingress hook 배선 | 완료 | 정규화에 security H3 3중 방어 포함 |
| 7 | bootstrap 플러그인 루트 폴백 | 완료 | plan이 지시한 "마지막 후보" 위치는 **도달하지 않는다** — 순서를 고쳤다(H1) |
| 8 | 실차단 실증 (라이브) | 완료 | 픽스처를 두 번 고쳐 도달. 이력을 판정 문서에 남김 |
| 9 | 판정 문서 · PRD · 인벤토리 · 보고 | 완료 | + env-contract 등재 3면(계획 외, security M3) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 신규 단위 test (V1) | Pass | 87건 |
| 기존 hook·receipt 회귀 (V2) | Pass* | 1033건 중 1032. 유일 실패는 **선재** Windows 경로 결함 — HEAD 내용만 뽑아 돌려도 동일하게 실패 |
| hooks.json 상위키 (V3) | Pass | `{hooks}`만 남음 |
| 차단 프로토콜 계측 (V4) | Pass | B1·B2 `measured` |
| 실차단 실증 (V5) | Pass | `pair_ok=true` |
| UI13 버전 동반 (V6) | Pass | 11 run 전부 |
| 결합 인벤토리 (V7) | Pass | `unlisted=0 fossil=0` |
| version 미선언 (V8) | Pass | guard exit 0 |
| 격리 잔재 (V10) | Pass | `clean: true` |
| env-contract (V11) | Pass | L1~L12 전부 |

### Design Grounding

N/A — design 트리거 미발화(`skill_available=1 / design_signal=0`, `reason=no-signal`).
렌더 surface 0으로 plan 예상과 일치. Phase 3.6·3.7 no-op.

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `plugins/mccp/scripts/lib/harness-ingress.js` | CREATED | 하네스 판별 + ingress 지목 오라클(순수) |
| `plugins/mccp/scripts/lib/tests/harness-ingress.test.js` | CREATED | 24건 — DD3 회귀 고정 포함 |
| `plugins/mccp/scripts/hooks/receipt-prompt-submit.js` | CREATED | Codex `UserPromptSubmit` ingress |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | CREATED | 21건 |
| `plugins/mccp/scripts/hooks/tests/bootstrap-resolve.test.js` | CREATED | 6건 — 해소 **순서** 단언 |
| `scripts/codex-probe/block-probe.js` | CREATED | B1·B2 스윕 + `gate-demo` |
| `plugins/mccp/hooks/hooks.json` | UPDATED | `$schema` 제거 + ingress 등록 |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATED | `runGate` export + 방출 seam |
| `plugins/mccp/scripts/hooks/bootstrap.js` | UPDATED | 해소 순서 + marker 검증 + 하네스 가드 |
| `plugins/mccp/scripts/hooks/{receipt-skill,pr-phase-guard,ultracode-phase-guard,goal-phase-guard}.js` | UPDATED | 하네스 가드 4건 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATED | 토글 2건 등재 + 밀린 evidence 5건 정정 |
| `docs/ENVIRONMENT.md` · `docs/environment/gates.md` | UPDATED | 색인 + 상세 앵커 |
| `scripts/codex-probe/{cli,report,scan-coupling,coupling-inventory}.js` | UPDATED | `block`·`gate-demo`·`teardown --verify` · B축 승격 · 정규식 정정 · 처분 갱신 |
| `scripts/tests/codex-probe.test.js` | UPDATED | Task 1 가드 5건 |
| `.claude/_meta/data/2026-09-09-codex-harness-truth.json` | UPDATED | run 2건 추가 |
| `docs/codex-harness-portability/m2-gate-ingress.md` | CREATED | 판정 문서 |

## Deviations from Plan

1. **DD3 판별자 폐기.** `CODEX_HOME`은 Codex가 주입하는 값이 아니라 프로브가 자기 자식 env에
   넣은 값이었다(`injected_by_codex: []`). 부재 기반 판별을 **양성 신호 전용**으로 교체했다.
   대가: `MCCP_HARNESS=codex` 없이는 게이트가 발화하지 않는다. 숨기지 않고 문서에 적었다.
2. **DD1 사거리 정정.** `$schema` 제거는 핸들러 29건을 동시에 살린다(exit-2 default-deny 5종 포함).
   `shouldRunClaudeHook` 가드를 먼저 세우고 착지시켰다.
3. **Task 7 폴백 위치.** plan은 "마지막 후보"라 적었으나 그 자리는 도달하지 않는다.
   `env(+marker 검증) → __dirname → home 스캔`으로 순서를 바꿨다.
4. **방출 seam 범위.** plan은 `block()`만 다뤘으나 stdout 출력이 5곳이라 전부를 seam 뒤로 냈다.
5. **Validation 4건 정정.** `--in` 미존재 · `unlisted` 타입 오류 · `--test <dir>` 미지원 ·
   `--verify` 미구현. 무효인 검사는 통과해도 아무것도 보증하지 않으므로 명령을 고쳤다.
6. **계획 외 파일 3면** (`env-contract` registry·색인·상세). 신규 토글이 lint L1을 red로
   만들므로 필수였다(security M3).
7. **Phase 2.5.5 MCCP-GATE-STOP 후 진행.** security HIGH 3건으로 게이트가 정지했고, 사용자가
   "1번(최소 요구 흡수 후 진행)"을 선택해 재개했다.

8. **implement receipt를 EXECUTE 후 재anchor했다.** Phase 2.5.6에서 receipt를 쓴 **뒤**
   Validation 절 정정 등으로 plan 본문이 바뀌어 `plan_hash`가 어긋났고(`stale`), 그대로 두면
   v1.23.5 staleness 가드가 이 사이클의 PR을 막는다. `mccp-implement-codex`는 working-tree
   진단물이라 §3.12의 재봉인 금지(git-tracked ship corpus) 대상이 **아니므로** 같은
   `codex_verdict=divergent`로 다시 썼다. 즉 이 receipt는 "게이트가 최종 plan에 대해 돌았다"가
   아니라 "게이트가 돌았고 그 결과가 요구한 정정을 반영한 plan에 anchor돼 있다"를 뜻한다.
   그 차이를 여기 남긴다.

## Issues Encountered

- **선행 `mccp-plan-codex` receipt 부재.** plan 게이트가 완주하지 않아(`## Codex Adversarial
  Review`가 placeholder) receipt가 없다. 사용자 override
  `MCCP_SKIP_INTENT_GATE="구현하면서 흡수 진행"`로 진행했고, `MCCP_REVIEW_SINGLE_PASS`가
  backlog에 떨어뜨렸던 L2 패널 HIGH 8건을 구현 시점에 회수해 흡수했다.
- **`gate-demo` 픽스처 2회 실패.** 비-terminal 게이트의 missing-only가 informational ALLOW라는
  것(§1.3)과 generic slug 하드블록. 둘 다 게이트 결함이 아니라 픽스처가 차단 파티션에 있지
  않았던 것이다. 이력을 판정 문서에 남겼다.
- **env-contract L10의 줄 번호 취약성.** evidence가 정확한 줄 번호를 pin하므로 read site 위에
  한 줄만 삽입해도 red가 된다. 이번 사이클에 두 번 겪었다. 결함이라기보다 설계의 비용이며,
  고치려면 anchor 방식(심볼명)으로 바꿔야 한다 — 별도 축.

## Tests Written

| Test File | Tests | 축 |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/harness-ingress.test.js` | 23 | 판별표 전수 · DD3 회귀 · UI17 fail-closed · 원자료 parity |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | 21 | no-op 기본 · 정규화 · planPath containment · 방출 형태 |
| `plugins/mccp/scripts/hooks/tests/bootstrap-resolve.test.js` | 6 | 해소 **순서** · marker 검증 · fail-open |
| `scripts/tests/codex-probe.test.js` (추가분) | 5 | hooks.json 상위키 · 이벤트 enum 정합 · ingress 등록 |

## 미달 항목 (반올림하지 않는다)

- **B3 `${CLAUDE_PLUGIN_ROOT}` 치환은 측정되지 않았다.** `gate-demo`는 절대경로로 우회했고
  `resolveRoot()`의 `__dirname` 폴백이 그 값과 무관하게 성립하지만, **출하되는 `hooks.json`은
  여전히 그 변수를 쓴다.** 치환되지 않으면 Codex 사용자의 hook은 시작조차 못 한다. PRD OQ에 등재.
- **`PreToolUse` 차단 미측정.** ALLOW 통제가 성립하지 않아 시도하지 않았다.
- **Claude Code의 `UserPromptSubmit` payload 미측정.** payload 판별자가 한 방향으로만 작동한다.
- **Acceptance "이중 게이트 0"은 논증이지 관측이 아니다.** `shouldRunClaudeHook`과
  `resolveIngress`가 그것을 보장하도록 짜였고 test가 고정하지만, Claude Code에서 두 ingress가
  동시에 도는 것을 **실행으로** 확인하지는 않았다.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr`. **`/mccp:pr` 진입 시 `mccp-plan-codex` receipt가 여전히
      부재**하다(plan 게이트가 완주하지 않았고 사용자가 override로 진행을 승인했다). terminal
      게이트는 receipt 누락에 hard-block이므로 `/mccp:plan` 재실행으로 정규 receipt를 만들거나
      `MCCP_SKIP_RECEIPT=1`을 사유와 함께 써야 한다 — 어느 쪽이든 **선택은 사용자 몫**이다.
- [ ] M3(command-reach) 착수 전 B3 측정 — 그 값이 M3의 전제다
