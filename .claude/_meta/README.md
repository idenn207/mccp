# `.claude/_meta/` — 메타 분석 산출물

조사·판정 결과를 누적하는 디렉토리. 개별 기능의 설계 문서(`docs/`)나 PRD/plan(`.claude/prds/`, `.claude/plans/`)과 달리, **여러 항목 사이의 공통 원인·상호 모순·선후 의존**을 판정한 결과가 들어온다.

## 색인

> 기계 앵커. `/mccp:meta-research`가 `register`로 유지하고 `lint`의 L4(색인 1홉)가 전수 검사한다.
> 아래 주제별 절은 "무엇을 다뤘는지"의 서술이며 역할이 다르다 — 중복 등재는 의도된 것이다.

| 문서 | 날짜 | 상태 | 한 줄 |
|---|---|---|---|
| [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md) | 2026-08-12 | active | 운영자 제기 8항목 + issue #124·#125 통합 판정 — receipt 149건 전수로 계측 부재를 단일 근인으로 지목 |
| [2026-08-12-prd-decomposition-addendum.md](2026-08-12-prd-decomposition-addendum.md) | 2026-08-12 | active | 위 판정을 병렬 PRD 분해로 옮기는 선행 분석 — 파일 소유권 충돌 실측 + P0를 병렬화 enabling 조건으로 판정 |
| [diverse-agent-review-analysis.md](diverse-agent-review-analysis.md) | 2026-08-06 | 부분 무효 | 논문 8편 + 타사 11개 사례 + R2(하이브리드) 결론. **§1.3의 4축 경고는 diverse-agent-review M1 ship으로 무효화** |
| [converged-redefinition-design.md](converged-redefinition-design.md) | 2026-08-06 | active | `converged` verdict 재정의 + 소비처 계승 |
| [verification-layer-design.md](verification-layer-design.md) | 2026-08-06 | active | L1/L2/L3 3층 verification 설계 |
| [2026-08-20-env-settings-authoring-surface.md](2026-08-20-env-settings-authoring-surface.md) | 2026-08-20 | active | 환경변수 발견성과 settings.json 작성 표면 — 외부 스키마 import 대 setup 시드 대 제3안 |
| [2026-08-20-env-contract-behavior-drift.md](2026-08-20-env-contract-behavior-drift.md) | 2026-08-20 | active | 환경변수 계약 대 실제 동작 — 선언 값이 코드에 없는 결함과 값 의미 문서 부재 |
| [2026-08-22-impeccable-plugin-channel-migration.md](2026-08-22-impeccable-plugin-channel-migration.md) | 2026-08-22 | active | impeccable 배포 채널 전환(npm CLI 3.6.0 → marketplace plugin 4.1.1)이 mccp의 탐지·setup·디자인 게이트에 만든 결함 전수 조사 |
| [2026-08-31-remaining-issue-disposition.md](2026-08-31-remaining-issue-disposition.md) | 2026-08-31 | active | 남은 open issue 4건(#127·#128·#129·#130) 통합 처분 조사 |
| [2026-08-31-harness-instability-and-command-bloat.md](2026-08-31-harness-instability-and-command-bloat.md) | 2026-08-31 | active | 하네스 구조 불안정성과 명령 본문 비대화 — 대범위 메타 분석 |
| [2026-08-31-receipt-intent-archaeology.md](2026-08-31-receipt-intent-archaeology.md) | 2026-08-31 | active | receipt 지속성·finding 정본의 설계 의도 역추적 — 직전 판정의 정정 |
| [2026-08-31-final-harness-assessment-and-umbrella-prd.md](2026-08-31-final-harness-assessment-and-umbrella-prd.md) | 2026-08-31 | active | 하네스 최종 판정 + 우산 PRD 분해 — 6렌즈 병렬 조사와 Codex 교차검증으로 C0~C10 자식 11개를 도출 |

## 2026-08 — 리뷰 루프 신뢰성

| 문서 | 다룬 것 |
|---|---|
| [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md) | 운영자 제기 8항목 + issue #124·#125 통합 판정. receipt 149건 전수로 **계측 부재**를 단일 근인으로 지목하고, 항목 3(Codex 불신)·4(관점 수)·6(델타 리뷰)의 프레이밍을 재판정 |
| [2026-08-12-prd-decomposition-addendum.md](2026-08-12-prd-decomposition-addendum.md) | 위 판정을 **병렬 PRD 분해**로 옮기는 선행 분석. santa-loop receipt 편입 확정 · 파일 소유권 충돌 실측 · P0(실체화)를 병렬화의 enabling 조건으로 판정 |

## 2026-08-06 — cross-model → diverse-agent 전환

| 문서 | 다룬 것 |
|---|---|
| [diverse-agent-review-analysis.md](diverse-agent-review-analysis.md) | 논문 8편 + 타사 11개 사례 + R2(하이브리드) 결론 |
| [converged-redefinition-design.md](converged-redefinition-design.md) | `converged` verdict 재정의 + 소비처 계승 |
| [verification-layer-design.md](verification-layer-design.md) | L1/L2/L3 3층 verification 설계 |

이 3문서는 [diverse-agent-review PRD](../prds/diverse-agent-review.prd.md)(M1 `complete`)의 설계 근거다.

> **유효기간 주의** — `diverse-agent-review-analysis.md` §1.3의 4축 경고는 **M1 ship으로 무효화**됐다. 자세한 건 위 부록 §2. 메타 문서는 작성 시점의 코드를 전제하므로, 인용 전에 그 전제가 아직 사는지 확인할 것.

## 이력

`.claude/meta/` → `.claude/_meta/` 통일 완료(2026-08-12, 운영자 결정). 인바운드 링크 6개(`diverse-agent-review.prd.md` 4 · `diverse-agent-review-m1.plan.md` 2) 갱신됨. `.claude/audit/`·`PRPs/plans/archived/` 의 `_meta` 문자열은 receipt validator 센티널(`blocking[].gate_id`)이라 **이 디렉토리와 무관** — 치환 대상이 아니다.
