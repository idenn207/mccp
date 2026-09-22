# M4 plan re-review — cap 3

Command body: installed mccp 1.34.4 commands/plan.md, verified by command-reach resolver.

Plan: .claude/plans/codex-harness-portability-m4.plan.md

R1 was already recorded; this resumption ran R2 and R3. Final verdict: divergent, total ledger count 3, cap 3. No product code was changed.

### Final re-review R3 (2026-09-10)

- 누적 round 3 / cap 3. Codex verdict: divergent. 추가 호출 없음.
- 원문: `.claude/reviews/codex-harness-portability-m4-plan-r3.json`.
- Run nonce: `9dac76fd-96b4-4d30-b971-7f7fe8fde589`.

| Finding | Severity | Verdict | Required follow-up |
|---|---|---|---|
| F1: Existing subjectHash still permits approval reuse across different implementation bytes | HIGH | DEFER_TO_BACKLOG | additive versioned reviewed-content digest 또는 immutable committed target을 선택하고 invocation·seal·validate·dedupe·PR finalization에 동일하게 연결한다. HEAD와 plan을 고정한 staged/unstaged/관련 untracked 변경 음성 대조가 필요하다. legacy hash는 보존한다. |
| F2: Required plan review-record injection invalidates the proposed evidence seal | HIGH | DEFER_TO_BACKLOG | reviewed-input identity와 final-receipt identity를 구분한다. 최종 plan hash를 유지하면서 허용된 review-section 주입만 stable remainder로 검증한다. 실제 Claude runner/writer에서 주입 성공, task/intent 변조 거부를 검증한다. seal 비교 제거로 우회하지 않는다. |

- 최종 backlog: `.claude/plans/codex-findings-backlog.md`, R3 항목 2건. R2의 ACCEPT_NOW F1은 cap 종료 시 미해결이므로 최종 DEFER_TO_BACKLOG로 전환했다.
- Open Questions: DIVERGENT_UNRESOLVED — HIGH F1/F2, 자동 CRITICAL 해당 없음.
- intent adjudication: 두 개선 권고 모두 사용자 제약을 강화하므로 conflict=none. F1의 reviewer UI3 표기는 영향받는 보증이고 제안 자체의 충돌은 아니다. F2는 reviewer도 none으로 판정했다.
- Task 도구 부재에 따른 author degradation을 봉인한다. 동일 계열 Codex 검토와 디자인 생략은 사용자 승인 예외이며 Claude 제품 acceptance를 충족하지 않는다.
- 현재 DD4/Task 3의 기존 subjectHash 재사용은 위 미해결 지적을 포함한 초안이다. 이번 문서 정리로 결함이 흡수됐다고 주장하지 않는다.


Design step skipped with explicit user authorization. The installed runner performs Codex review; the workspace M4 Claude adapter is the subject of review, not the executor of this gate.

## Final verification

- Installed receipt validator: ok=true, no stale/missing/blocking/open_critical; approved design skip produces its informational warning.
- Receipt schema: valid. Recomputed receipt_hash and plan_hash match.
- Sealed round ledger: 3/3; intent verdict preserved; author degradation recorded; two DEFER_TO_BACKLOG adjudications.
- git diff --check: passed.
- L1: divergent, nine C3_CREATE_EXISTS findings. Existing implementation files remain listed as CREATE in the original plan: reviewer-invoke.js, claude-review-invoke.js, reviewer-evidence.js, reviewer-probe.js, the three reviewer-inversion/reviewer-probe test files, m4-reviewer-inversion.md, and codex-harness-portability-m4.json. These are author-run structural-check results, not additional Codex rounds. Correct the resumed plan action column to UPDATE at the next plan revision; the already reviewed/sealed plan is retained to preserve the receipt hash.
- No product tests were rerun because this task changed planning and review artifacts only. M4 product acceptance remains incomplete.
