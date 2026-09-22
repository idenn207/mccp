# M4 reviewer inversion — 구현 및 검증 결과

M4 reviewer core 구현과 세 gate owner CLI의 실측을 완료했다. 전체 PRD 완료, 실제 PR 게시, M3.5 배포 acceptance 또는 M5 하네스 교차 이어달리기를 의미하지 않는다.

## 실행 계약

- `reviewer-invoke`는 공통 harness oracle로 Claude host → 기존 Codex adapter, Codex host → Claude adapter를 선택한다. unknown은 차단한다. Claude 양성 신호는 `CLAUDE_PLUGIN_ROOT`(hook 경로)와 `CLAUDECODE=1`(명령 본문이 도는 Bash 도구 셸 — 이 셸에는 `CLAUDE_PLUGIN_ROOT`가 없다, 2026-09-22 실측)이고, `MCCP_HARNESS=codex`가 둘보다 먼저 이긴다.
- `review-target`은 HEAD commit/tree, base commit, draft plan의 stable digest 및 design 입력 hash를 고정한다. staged·unstaged·untracked 제품 변경을 각각 검사하며 index/worktree 상쇄도 거부한다.
- 독립 worktree는 `--no-checkout`과 빈 hooksPath로 만들고 fsmonitor를 비활성화한다. checkout hook/filter 실행 없이 Git blob·mode·diff를 수집한다. UTF-8 텍스트는 그대로, binary는 base64로 전달한다. CLI 도구는 비활성화하여 symlink 또는 절대 경로를 통한 추가 파일 읽기를 막는다. 입력은 8 MiB까지이며 초과 시 unavailable이다.
- 호스트의 실행 지시와 리뷰 데이터는 구분한다. draft plan/design과 committed tree는 JSON의 서로 다른 필드다. 정확한 Codex Adversarial Review 섹션 외 plan 변경과 중복·모호한 섹션은 거부한다.
- 새 실행 증거는 WeakSet에 등록된 실제 호출에서만 생성한다. `reviewer_verdict`/`reviewer_execution`은 present-only이며 legacy 승인 축과 혼재할 수 없다. 이전 checkpoint의 reviewed_input 없는 쌍은 승인으로 사용하지 않는다. 기존 receipt corpus와 hash 계산은 변경하지 않았다.
- plan, implement, PR은 호출부터 writer/read-back까지 같은 프로세스가 execution 객체를 보유한다. implement/PR의 decision별 owner lock은 최종 봉인까지 유지된다. JSON 결과 파일은 새 execution으로 복원되지 않는다.
- 실제 Claude 응답만 원래 저장소의 해당 gate/decision 원장에 한 라운드로 계상한다. snapshot의 별도 gitdir에 계상하거나 Codex 채널로 기록하지 않는다. disabled/advisory Codex 정책은 Claude 실패를 승인하지 못한다.
- plan의 intent 적용 여부가 Claude의 divergent 판정을 성공 종료로 바꾸지 못한다. 새 receipt를 다시 읽고 reviewer 판정과 현재 대상 검증이 모두 통과해야 한다.
- PR 출하는 검토 commit R을 유지한다. 별도 manifest의 역할·경로를 독립적으로 재구성하고 모든 R..H commit의 bytes/mode를 검사한다. 제품 변경 후 revert, merge, rename/delete, 알 수 없는 파일, receipt/proof 치환 및 hash 불일치는 거부한다. push는 검증한 정확한 H를 사용한다.

## 실제 측정

CLI: Claude Code 2.1.267, codex-cli 0.154.0. Claude assistant 이벤트의 actual model은 `claude-opus-5`였다. 별도 권한 probe에서 실제 Write 시도가 거부되고 보호 파일 hash가 유지됐다. 인증 설정은 변경하지 않았다.

| Gate | 실제 승인 응답/receipt 검증 | unavailable 대조 | Claude 라운드 |
|---|---|---|---|
| plan | 통과 | exit 12, receipt 없음, 보호 파일 유지 | 1 |
| implement | 통과 | exit 12, receipt 없음, 보호 파일 유지 | 1 |
| PR | 통과 | exit 12, receipt 없음, 보호 파일 유지 | 1 |

원자료: `.claude/_meta/data/codex-harness-portability-m4.json`. 각 gate는 독립적인 임시 Git 저장소에서 실제 owner CLI를 호출했다. receipt/proof, target commit, 실제 모델 및 실패 결과를 보존하며 임시 저장소는 정리한다. 이 자료는 공개 PR이나 전체 명령 파이프라인 완주 증거가 아니다.

이전 plan 실측에는 비승인 응답이 있었다. 이를 승인으로 바꾸지 않고 `.claude/reviews/codex-harness-portability-m4-gates-before-prompt-fix.json`에 보존했다. offline 리뷰 지시와 데이터 경계를 정리한 최종 plan 결과는 `.claude/reviews/codex-harness-portability-m4-plan-gate-final.json`이다. 초기에 redaction gate가 scratch 경로를 탐지해 저장을 거부한 측정은 완료 증거로 사용하지 않았다.

재현:

```bash
node scripts/codex-probe/reviewer-probe.js --live --out /tmp/m4-cli.json
node scripts/codex-probe/reviewer-probe.js --gates-live --out /tmp/m4-gates.json
node scripts/codex-probe/redact-gate.js --check .claude/_meta/data/codex-harness-portability-m4.json
```

## 검증 및 범위

- 핵심/receipt/owner 회귀 878개 통과. 그중 receipt corpus 회귀는 726개다.
- plan mode·canonical reader 회귀 454개, Codex adapter·round ledger·coupling probe 회귀 170개 통과.
- 마지막 입력 경계 변경 후 관련 23개를 재검증했다.
- env-contract 12개 규칙, instruction-contract C1–C4, coupling inventory(unlisted 0), `git diff --check` 통과.
- 독립 Codex 보안 리뷰의 HIGH 지적은 hook 실행, PR owner lock 수명, receipt/manifest 치환, proof 재읽기 결합을 수정하고 재현 테스트로 검증했다. 추가 index/worktree 상쇄와 plan divergent 종료도 수정했다. 보안 리뷰는 Claude acceptance와 구분한다.

Claude PR owner는 dedupe 후보가 있어도 보수적으로 실제 리뷰를 다시 수행한다. 공유 dedupe 판정은 새 증거의 현재 target·hash·반대 계열 조건을 검증한다. Task/Workflow 기반의 필수 부가 security/intent 도구가 없는 명령 경로는 unavailable로 끝나며, 일반 도구 이식 또는 전체 chain completion을 주장하지 않는다. M5 producer/session provenance 및 하네스 교차 이어달리기는 미착수다.

승인된 R5 계획의 bytes는 보존했다. 최신 구현 상태는 이 문서와 `.claude/PRPs/reports/codex-harness-portability-m4-report.md`가 소유한다.
