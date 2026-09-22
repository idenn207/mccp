# Implementation Report: codex-harness-portability M4

## Summary

Codex host에서 plan·implement·PR reviewer가 Claude가 되도록 연결했다. immutable reviewed_input, 실제 실행에서만 생성 가능한 proof, owner 프로세스 봉인, evidence-only descendant 검증과 정확한 push OID를 구현했다. 세 gate owner CLI의 실제 Claude 승인/실패 대조를 완료했다.

## Assessment vs Reality

| Metric | Plan | Actual |
|---|---|---|
| Complexity | Large | Large |
| Confidence | 명시 없음 | 관련 회귀와 실제 CLI 검증 완료 |
| Scope | M4 reviewer inversion | M4 core 및 owner CLI; 전체 workflow/공개 PR/M5 제외 |

## Tasks Completed

| Task | Status | Evidence |
|---|---|---|
| 1 CLI 측정 | Complete | 이번 실행에서도 모델 식별·Write 거부·timeout/실패 재측정 |
| 2 routing/transport | Complete | host oracle, 도구 없는 frozen artifact 입력, gate별 Claude 원장 |
| 3 증거/판정 reader | Complete | stable draft + commit/tree, current/upstream 구분, 실제 실행만 봉인 |
| 4 세 gate 연결 | Complete | 실제 subprocess부터 writer/read-back까지 positive/negative 회귀 |
| 5 dedupe/회귀/실측 | Complete for M4 owner scope | 세 gate 모델 claude-opus-5, 승인·unavailable 대조 및 immutable ship 검증 |

## Validation Results

| Check | Result |
|---|---|
| 핵심·receipt·owner tests | 878 passed |
| plan-mode/canonical-reader tests | 454 passed |
| Codex adapter/round/coupling tests | 170 passed |
| 최종 artifact boundary tests | 23 passed (위 테스트의 재검증) |
| env-contract | L1–L12 pass |
| instruction-contract | C1–C4 pass |
| coupling inventory | unlisted 0 |
| diff whitespace | pass |
| Live plan/implement/PR | 각 승인/실패 대조 통과, round count 1 |
| Build/type-check | CommonJS 스크립트 저장소: 별도 빌드 없음; Node 구문 검사와 실제 실행으로 검증 |
| Design Grounding | N/A — 디자인 신호 없음 |

## Files Changed

새 모듈: `review-target.js`, `implement-review-runner.js`, `review-ship-target.js`.
새 테스트: 위 세 모듈에 대응하는 `scripts/lib/tests/*.test.js`.
변경: reviewer facade/Claude adapter/evidence, plan runner/mode, PR runner/finalizer, receipt writer/validator/dedupe, 세 명령 본문, probe/inventory, README 성격의 M4 문서와 CLAUDE.md.

## Deviations from Plan

- R5 계획 해시를 유지하기 위해 실행 기록·현재 완료 상태는 별도 문서에 남겼다. 승인된 계획 본문의 과거 execution/checklist는 변경하지 않았다.
- registry.js의 기존 env evidence line pointer 한 곳을 갱신했다. 새 환경변수나 정책 완화는 없다.
- snapshot은 checkout hook/filter 실행을 막기 위해 no-checkout worktree에서 Git objects를 수집하며 도구 없는 artifact review로 전달한다. 전체 데이터에 8 MiB 상한이 있다.
- Claude PR owner의 dedupe 실행 생략 최적화는 보수적으로 적용하지 않는다. 매번 실제 리뷰하며, 공통 dedupe predicate는 유효한 반대 계열 증거만 인정한다.
- 계획 Validation의 `*.test.jsreviewer-inversion.test.js` 오타 대신 실제 receipt glob 및 해당 테스트 파일을 실행했다.

## Issues Encountered

보안 리뷰와 실제 측정으로 checkout hook 실행, index/worktree 변경 상쇄, PR 봉인 전 owner 해제, receipt/proof와 manifest의 치환, intent applicability가 plan divergent를 성공 처리하는 결함을 발견했다. 모두 수정하고 회귀 테스트를 추가했다. 초기 raw 측정의 scratch 경로 redaction 거부는 diagnostic path를 기록하지 않도록 수정했다. 실제 비승인 응답은 별도 원자료에 보존했다.

## Tests Written

review-target 5개, implement owner 4개, ship/세 gate 9개, plan mode 신규 1개. 기존 evidence/adapter 테스트도 강화했다. 실패·dirty·hook·symlink·위조·소유권 경합·divergent 종료·중간 제품변경/revert를 검증한다.

## Artifacts and Limits

- 원자료: `.claude/_meta/data/codex-harness-portability-m4.json`
- 상세 계약: `docs/codex-harness-portability/m4-reviewer-inversion.md`
- 실행 리뷰: `.claude/reviews/codex-harness-portability-m4-implementation.md`
- 승인 계획: `.claude/plans/codex-harness-portability-m4.plan.md` (R5 bytes 보존)

필수 부가 Task/Workflow 도구가 없는 경로는 unavailable이며 일반 하네스 도구 이식은 완료했다고 주장하지 않는다. 공개 PR과 전체 pipeline/M5 교차 이어달리기는 실행하지 않았다. M3.5 및 전체 PRD의 완료도 별도다.
