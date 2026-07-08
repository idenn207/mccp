# Audit Remediation Follow-up (P2–P6)

mccp 구현 감사 A(광범위 Haiku, 11 서브시스템) + B(심화 Opus, 5 서브시스템) 통합 수정의 후속 배치. P1(CRITICAL cross-gate dedupe false-skip)은 1.20.3으로 SHIPPED. 본 PRD는 남은 P2–P6를 mccp milestone 패턴으로 재구성한다.

## Problem

v1.20.x mccp 파이프라인은 서브시스템 테스트가 all-green(총 ~1,200+)이고 operability 렌즈 실질 결함은 0이지만, **테스트가 관측하지 못하는 잠복 결함 3축**이 남아 있다:

1. **hook 레이어 silent-failure** — SessionEnd marker가 hook-trace 로드 실패 시 조용히 누락되고(30+ 세션 관측), 중첩 catch가 실패를 exit 0으로 은폐한다. 세션 연속성이 침식되고 false crash alert가 발생한다.
2. **atomic-lock PID-reuse race** — 홀더 crash 후 다른 프로세스가 같은 PID를 재사용하면 same-host reclaim이 오판해 락이 lease(60s) 만료까지 stuck → PR 워크플로 60s+ 정지 가능.
3. **문서 드리프트** — CLAUDE.md가 실제 코드 동작과 여러 지점에서 불일치(classification 표, derive source 개수, enforcement 강도, lock schema 서술 등). 문서를 신뢰 기준으로 삼는 유지관리자를 오도한다.

방치 시 세션 연속성·락 무결성·문서 신뢰가 조용히 침식된다. 셋 다 "가동은 되지만 조용히 틀린" 부류라 사용자 감시 없이는 드러나지 않는다.

## Evidence

- 감사 A(Haiku 광범위 sweep) 10건 + B(Opus 심화) 17건, 중복/보강 제거 후 고유 이슈 ~19건. adversarial 검증으로 refuted A 5건 + B 2건 = 7건 제거(거짓 양성 신뢰성 신호).
- **실시간 신호**: 이번 감사 세션의 SessionStart가 "3세션 SessionEnd marker 없이 종료 — silent failure 의심" 경고를 발화. 감사 중 "30+ 세션 .end 누락" 관측 → B#4/B#5가 root cause로 grounded.
- 방법론 교훈: Haiku 광범위 sweep은 doc-drift는 잘 잡지만 로직 버그(P1 CRITICAL)는 놓쳤다. Opus 심화가 필수였음 — dual-model 감사의 가치 재확인.

## Users

- **Primary**: mccp 유지관리자 본인(파이프라인 dogfooder). 매 세션 SessionEnd silent-failure로 false crash alert를 받고, PR 게이트에서 락 stuck 위험에 노출되며, 드리프트된 CLAUDE.md를 작업 기준으로 삼는 당사자. 감사·수정·재감사 루프의 실행자이자 수혜자.
- **Not for**: mccp를 설치만 하고 파이프라인 내부(hook/lock/receipt)를 건드리지 않는 일반 사용자 — 이들에겐 대부분 투명하다(silent-failure의 정의상).

## Hypothesis

We believe **hook 레이어를 fail-loud-open으로 전환(marker > lease)하고, 락 reclaim을 PID-reuse에 강인하게 만들고, 문서를 실제 동작에 정합화**하면 **세션 연속성 침식·락 stuck·문서 오도**를 해소할 수 있다 for **mccp 유지관리자**.
We'll know we're right when **P2 이후 SessionEnd .end marker가 100% 기록되고(hook-trace 로드 실패 시에도 degraded marker 폴백), 무테스트였던 실패 경로에 회귀 테스트가 붙어 green**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| SessionEnd .end marker 기록률 (P2) | 누락 0 | degraded-marker 폴백 회귀 테스트 + 실세션 관측 |
| 실패 은폐 제거 (P2) | 중첩 catch가 exit 1로 표면화 | fail-loud 회귀 테스트 |
| 락 stuck 제거 (P3) | reused-PID + fresh-mtime 케이스 reclaim 정상 | 신규 회귀 케이스 green |
| dispatch inline degrade (P4) | worker 미런칭 시 HALT 아닌 graceful fallback | live full-chain 검증 + 테스트 |
| receipt_hash tamper 탐지 (P5) | findings/resolution/meta 변조 검출 | 변조 탐지 테스트 |
| 문서-코드 일치 (P6) | 감사 지적 문서 항목 잔존 0 | CLAUDE.md ↔ 코드 재대조 |

## Scope

**MVP** — P2(session-continuity silent-failure) 단일 milestone을 이번 세션에 완결한다: hook-trace 로드 실패에도 marker 보장, 중첩 catch 실패 표면화(exit 1), idle 세션 lease renew, fd 누수 try/finally, state-writer advisory-lock 문서 정정. 이것이 "30+ 세션 .end 누락"의 root cause를 직접 닫는 최소 단위이자 hypothesis 측정 지점.

**Out of scope**
- **Refuted 7건** (A 5 + B 2) — adversarial 검증으로 거짓 양성 판정. 재론 안 함.
- **quarantine lock hash 코드화** (defense-in-depth) — 사용자 결정: 문서 정정만. quarantine raw-token 설계는 0o600 파일 보호로 무해(audit B 평가). P6에서 §3.6 서술을 실제(quarantine=advisory/raw-token, pr-phase-lock만 hash+stdin-pipe)로 정정만 하고 코드는 손대지 않는다.
- **P1** — 이미 1.20.3으로 SHIPPED(본 PRD 범위 밖, 선행 완료).
- **각 milestone의 동시 구현** — P2-P6는 각각 독립 PR로 main에서 순차 분기([[stacked-pr-merge-order]] 함정 회피). 한 세션에 전부 구현하지 않는다.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->
<!-- 버전은 forward-reconciled — origin/main이 이미 1.20.4(PR #87 workflow-orchestration M1) 소진 -->

| # | Milestone | Outcome | Version | Status | Plan |
|---|---|---|---|---|---|
| P2 | session-continuity silent-failure | hook-trace 로드 실패에도 SessionEnd marker 보장 + 실패 표면화(exit 1) + idle lease renew + fd 누수 방지. false crash alert 제거. | 1.20.5 | complete | `.claude/plans/audit-remediation-p2-session-continuity.plan.md` |
| P3 | atomic-lock PID-reuse race | 재사용 PID를 살아있다 오판하지 않음 → 락 stuck 제거. PR 워크플로 60s+ 정지 방지. | 1.20.6 | complete | `.claude/plans/audit-remediation-p3-atomic-lock-pid.plan.md` |
| P4 | dispatch·work-isolation 강건화 (재스코프) | **원 범위(F1 pending-split graceful-degrade + F2 anchoring 검증)는 #91(v1.20.7 workflow-orchestration M2a)의 `deriveVerdict`/Step 3.gate가 이미 대체** — pending은 fail-closed `reconcile-mismatch` HALT(의도적), anchoring은 F3 post-hoc store 검증. 잔여 delta만 착지: B#6(prp-implement 2.5.6 receipt-write exit-code 표면화 → Phase 3 진입 전 hard-stop) + B#13(dispatch-worker 3-flag attribution doc, `deriveVerdict` 참조로 갱신). | 1.20.8 | complete | `.claude/plans/audit-remediation-p4-dispatch-work-isolation.plan.md` |
| P5 | receipt_hash tamper-detect 실연결 | validate-cmd가 receipt_hash를 재계산·비교(subject_hash 패턴 미러) → findings/resolution/meta 변조 실제 탐지. | 1.20.9 | complete | `.claude/plans/audit-remediation-p5-receipt-hash-tamper.plan.md` |
| P6 | 문서 정합화 (CLAUDE.md drift) | classification 표·derive source 개수·enforcement 강도·lock schema 서술 등 감사 지적 문서 항목을 실제 동작에 정합. quarantine §3.6 문서 정정 포함. | 1.20.12 | complete | `.claude/plans/audit-remediation-p6-doc-reconciliation.plan.md` |

각 milestone 완료 시 patch bump(§3.7) + renderer footer(html.js/markdown.js) 동기 + 독립 PR. PRD 전체 종료 시 다음 minor로 정리 후보.

## Open Questions
- [ ] P4 dispatch inline-degrade는 실제 `/mccp:work` full-chain live 검증이 필요 — 유닛 테스트만으로 불충분(worker 미런칭 시나리오 재현 방법 확정은 P4 plan 단계에서).
- [ ] P5 receipt_hash 재계산이 기존 working-tree receipt(구 schema)와 충돌 없는지 — validate 시 hash 부재/불일치 처리 정책은 P5 plan 단계에서(fail-closed vs advisory).
- [ ] P6 문서 정정 후 자동 drift 방지(pre-PR hook으로 CLAUDE.md ↔ 코드 lint) 여부 — §3.7 자동화 후보와 함께 P6 또는 후속에서 결정.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| fail-loud 전환(exit 1)이 정상 종료를 실패로 오탐 → 세션 종료 노이즈 | Medium | Medium | fail-loud-**open**: marker는 항상 쓰되(degraded 포함) 실패를 표면화. marker write 자체 실패만 exit 1. 회귀 테스트로 정상 경로 green 보장. |
| idle lease renew가 heartbeat 의미를 흐림(진짜 crash 미탐지) | Low | Medium | SessionStart의 idle renew는 "도구 미사용 순수 대화" 한정 신호. 실제 crash(프로세스 dead)는 별도 PID liveness로 판정 유지. |
| P3 mtime-only reclaim이 보수적으로 바뀌며 live holder 조기 reclaim | Medium | Medium | token 검증 통합 옵션 병행 검토(P3 plan). heartbeat mtime 갱신 유지로 live holder 보호. |
| 순차 stacked-PR 머지 순서 사고 재발 | Medium | High | 각 milestone을 origin/main에서 독립 분기, base→상단 순서 함정 회피([[stacked-pr-merge-order]]). PR merge 직후 같은 cycle에 worktree cleanup(§3.8). |
| 버전 reconcile 누락 → cache 디렉토리 stuck | Low | Medium | 각 milestone plugin.json bump을 acceptance 체크리스트에 포함(§3.7). footer 2곳 동기. |

## References

<!-- Source: /deep-research 산출물 (Anthropic native deep-research harness) -->

- **감사 소스**: `.claude/notes/audit-remediation-plan.md` — A(Haiku 광범위) + B(Opus 심화) 통합 수정 계획 원본. 생성 2026-07-05, 시작 버전 1.20.2, 브랜치 main(clean), Codex 플러그인 설치됨. 각 finding의 파일:라인 grounding 포함.
- **P1 선행 plan**: `.claude/plans/p1-codex-dedupe-integrity.plan.md` — SHIPPED(1.20.3, PR #86). 본 PRD milestone 구조·grounding 테이블·Codex 게이트 흡수 패턴의 참조 템플릿.

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-06.*
