# work Context Isolation — 오케스트레이터가 step body를 격리된 컨텍스트로 위임

## Problem
mccp 플러그인의 `/mccp:work`는 plan-prd→pr full chain을 한 세션에서 완주하도록 설계됐지만, 5개 스텝을 전부 `Skill()` 인라인으로 실행해 각 스텝의 작업 컨텍스트 — 특히 implement의 파일 읽기·diff 생성·테스트 출력 — 가 **메인 세션 한 윈도우에 선형 누적**된다. 그 결과 PR 도달 전 컨텍스트(200k~300k 토큰) 또는 cost hook($80/$100) 임계를 넘어 중단·hand-off되어 "한 번에 완주"라는 핵심 약속이 실현 불가능해진다. 이는 이 repo만의 문제가 아니라 mccp를 사용하는 다른 프로젝트에서도 재현되는 **플러그인 설계 레벨 결함**이다.

## Evidence
- **크로스-프로젝트 재현** — 다른 프로젝트에서 mccp로 `work`를 돌려도 동일 발생: 오케스트레이션이 컨텍스트를 관리해야 하는데 실제로는 관리되지 않고 메인 세션에서 작업이 진행됨 (사용자 관측).
- **실측 오버런** — `.claude/notes/mccp-v0.2-continuation.md` 85-89줄: v0.2 dogfood 세션이 $109 도달(실링 $100, $9.78 초과).
- **구조적 근거** — `plugins/mccp/commands/work.md` 112·116·133·137·141줄: 5개 스텝 전부 `Skill()` 인라인 호출. `plugins/mccp/scripts/lib/work-orchestrator.js` 3-10줄: 오케스트레이터는 스텝을 직접 실행 못 하고 "Claude's command body"(메인 세션)에서 실행됨.
- **Codex는 반례가 아님 (정정)** — `codex-invoke.js`가 `codex-companion.mjs`를 별도 서브프로세스로 spawn하고 `plan.md` 556줄이 출력을 shell 변수로 캡처(Claude stdout 미노출) → Codex의 대화·추론 트랜스크립트(수만 토큰)는 companion 프로세스에서 소멸. 메인 세션엔 triage용 소량 findings 요약만 진입. **Codex는 이미 컨텍스트 격리됨 — 누적 원인 아님.**
- **spawn 우회로 사망** — 이 환경 SessionStart `claude --version probe failed (ENOENT)` + `session-spawner.js` 248줄 degrade-to-notify. auto-spawn 기반 세션 전환은 이 환경/IDE 세션에서 성립 불가.

## Users
- **Primary**: mccp 플러그인으로 `/mccp:work`를 실제 운영하는 개발자 (현재 solo dogfood — 작성자 본인, 여러 프로젝트에서 work 사용).
- **Not for**: mccp 개별 서브명령(`/mccp:plan` 등)만 수동으로 쓰는 사용자 — 스텝 사이에 자연 세션 경계가 있어 누적 문제가 발생하지 않음.

## Hypothesis
We believe **오케스트레이터가 무거운 step body(특히 implement의 파일 탐색·diff·테스트 출력)를 격리된 sub-agent 컨텍스트로 위임하고 요약만 회수 + 스텝 경계 체크포인트를 남기는 것**이 **메인 세션을 얇게 유지해 full chain을 완주 가능하게** 만든다 for **`/mccp:work`를 운영하는 개발자**.
We'll know we're right when **대표 feature 하나를 work로 돌렸을 때 메인 세션 피크 컨텍스트가 격리 전 baseline 대비 유의미하게 감소하고, cost hook 임계 전에 done에 도달하거나 `/mccp:resume` ≤1회로 무손실 완결된다.**

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| 메인 세션 피크 컨텍스트 (대표 full-chain run) | implement 격리 후 baseline 대비 유의미 감소 (수치는 baseline 측정 후 확정) | work 실행 시 메인 세션 토큰 카운트 격리 전/후 비교 |
| full-chain 완주율 | cost hook 임계 전 done 도달, 또는 resume ≤1회로 완결 | dogfood run 관측 |
| Codex 격리 회귀 없음 | Codex 배관 무변경 (서브프로세스 격리 유지) | 코드 diff에 codex-invoke/codex-runner 변경 부재 확인 |
| dual-review 가치 보존 | cross-gate dedupe + receipt attribution 유지 | 격리 후에도 receipt chain 정합 검증 |

## Scope
**MVP** — 최대 누적원인 **implement 스텝을 격리**하는 것부터. 오케스트레이터가 implement의 무거운 작업(파일 탐색·diff·테스트)을 격리된 컨텍스트로 위임하고 요약(변경 파일·receipt path·verdict)만 회수. + 스텝 경계 체크포인트로 세션이 죽거나 cost hook에 걸려도 `/mccp:resume`가 자리 없이 이어감. 격리 메커니즘(A/B, 아래 Open Questions)은 `/mccp:plan`에서 결정.

**Out of scope**
- **병렬/멀티워커 fanout** — 별도 epic으로 승계. dispatch-controller(v1.2.0-m1)가 그 foundation(envelope·watcher·merge, M2 pilot fanout defer됨). 격리가 선행 substrate이므로 본 PRD 완료 후 착수.
- **Codex 리뷰 배관 변경** — 이미 서브프로세스로 컨텍스트 격리됨. 건드리지 않음.
- **auto-spawn 부활** — ENOENT로 사망. notify + 수동 `/mccp:resume` 전제로 대체.
- **PR 스텝 전체 격리** — gh·pr-phase lock·git push로 난이도 최상. MVP에서 제외, 분석 파트만 위임 여부는 후속.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | implement 스텝 격리 | work가 implement 작업을 격리 컨텍스트로 위임 → 메인 피크 컨텍스트 감소 (최대 누적원 해결) | complete | `.claude/plans/work-context-isolation.plan.md` |
| 2 | 스텝 경계 체크포인트 + 무손실 resume | 세션이 죽거나 cost hook에 걸려도 `/mccp:resume`로 자리 없이 완결 | pending | — |
| 3 | plan 스텝 격리 + classify 초과 예측 선포 | 나머지 무거운 스텝 격리 + 사용자에게 "N 체크포인트로 진행" 사전 고지 | pending | — |

## Open Questions
- [ ] **격리 메커니즘: A(스텝당 sub-agent, 한 세션 유지) vs B(체크포인트 + fresh 세션)** — A는 "한 세션에서 한 번에"를 보존하는 대신 mutating 스텝(implement)의 lock/gate/receipt write를 sub-agent가 다룰 수 있는지가 관건. B는 spawn 사망 탓에 수동 resume 전제. `/mccp:plan`에서 결정.
- [ ] 체크포인트 granularity — 명령 단위 vs task 단위. 세분화할수록 resume 재파생이 줄지만 마커 복잡도 증가.
- [ ] classify 시점 "윈도우 초과 예측" 신호 — 파일 수 / source signature / 예상 diff 규모 중 무엇을 쓸지.
- [ ] 병렬 fanout 도입 시점·형태 — 본 PRD(격리) 완료 후 별도 PRD로 승계.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| implement를 sub-agent로 격리 시 receipt/pr-phase lock/gate를 sub-agent가 못 다룸 | Medium | High | mutation은 메인 스레드 유지, 분석·실행 bulk만 위임하는 하이브리드. A/B 선택을 plan에서 확정 |
| 체크포인트 resume가 fresh 세션에서 컨텍스트 재파생 | Medium | Medium | STATE.md + receipt chain 재사용, task 단위 마커로 완료분 skip |
| auto-spawn 의존이 다시 유입 | Low | Medium | 명시적 out-of-scope. notify + 수동 resume 전제 고정 |
| 격리로 dual-review(cross-model) 가치 저하 | Low | High | cross-gate dedupe + receipt attribution 보존(dispatch-controller 패턴 재사용) |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-04.*
