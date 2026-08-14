# Plan Review Panel — setup-gitignore

**Plan**: `.claude/plans/setup-gitignore-m1.plan.md` · **Plan version**: `sha256:ecc3b282b1ba7aef7c135097c968023ef2e5ae6647e38a814bac9f5c8660cef4`
**Verdict**: divergent via multi-agent
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) — **not satisfied**: 8 blocking findings
**Layers**: L1 converged (violations 0) · L2 4/4 responded (3 fail, 1 pass) · L3 not fired (`MCCP_PLAN_REVIEW_L3=0`)

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| invariant | CRITICAL | CLI exit-code 계약 미지정 — setup.md Phase 5의 fail-open 경로 | plan L71이 `settings-writer.js`(오류 시 exit 1, `settings-writer.js:159-160`)와 `dep-check.js`(항상 exit 0, `dep-check.js:93`)를 동시에 mirror하라고 지시. Phase 5(L92)는 `{ok:false}`에서 halt하라는 요구가 없어 write 실패가 조용히 무시됨 |
| architect | HIGH | drift lint가 "미래 릴리스에서 정본에 새 경로를 넣는" 축을 강제하지 못함 | plan L121 risk. 누가·언제 `MCCP_IGNORE_ENTRIES`를 갱신하는지, test가 CI 필수 게이트인지 미지정. 사람이 기억해야만 작동 |
| test | HIGH | non-git-repo sentinel(UI5)에 대응하는 test 케이스 부재 | Task 1 L69가 `{ok:false,reason:'not-a-git-repo'}`를 명세하고 Task 3 L93이 skip 동작을 요구하나, Task 2의 8개 시나리오(L76-84)와 Acceptance(L130-135) 어디에도 없음 |
| invariant | HIGH | Validation이 실제 write를 한 번도 실행하지 않음 | Validation L108-113은 unit test + `--dry-run` + `git diff` 뿐. 멱등성(L130 `create` → 재실행 `noop`)이 acceptance 핵심인데 실제 쓰기 경로가 기계 검증되지 않음 |
| invariant | HIGH | 오류 처리 모델이 서로 모순 | L68 "settings-writer의 writeAtomic 형태 그대로"(throw) ↔ L69 "throw 금지" + L71 "dep-check sentinel". `applyMerge`와 CLI wrapper 중 누가 오류 계약을 소유하는지 미지정 |
| architect | MEDIUM | 정본 목록 전체가 plan에 열거되지 않음 | Task 1 L64는 receipt 4줄 + hook-trace만 명시. 나머지 ~20종(`loop-counter.json`·`.claude/cache/`·`dispatches/` 등)은 구현자가 `.gitignore`를 읽어 유추해야 함 |
| architect | MEDIUM | drift lint test가 비-hermetic (디스크의 실제 `.gitignore` 의존) | Task 2 L84. fixture인지 실제 repo인지, `.gitignore` 부재 repo는 어떻게 다루는지 미지정 |
| architect | MEDIUM | mccp-runtime ↔ REPO_ONLY 경계에 기계적 규칙 없음 | plan L65의 `REPO_ONLY` 열거가 불완전(`...`). 오분류를 사후 탐지에만 의존 |
| test | MEDIUM | drift lint의 주석·빈 줄 제거 알고리즘 미명세 | inline 주석 / 들여쓰기 / CRLF 처리가 구현자 가정에 좌우 |
| test | MEDIUM | Task 3 validation이 `grep -c "^## Phase"` = 6 뿐 | Phase 5의 non-git-repo 처리나 `git ls-files -i -c --exclude-standard` 호출 존재를 검증하지 않음 |
| invariant | MEDIUM | Phase 5의 git 명령 실패 경로 미지정 | `git ls-files` 실패(PATH 부재·권한) 시 skip인지 halt인지 없음. setup.md 최초의 git 사용 Phase |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 정본 목록 완전성 · 릴리스 간 유지 프로세스 · mccp/repo 경계의 기계적 규칙 · test hermeticity · 인용 패턴(`settings-writer.js` writeAtomic)의 실제 일치 여부 |
| security | **pass** | cwd/경로 유출 · 비밀 노출 · 신뢰 경계 · receipt 순서 무결성 · marker injection · 사용자 내용 파괴 · EOL 처리 · 정본 드리프트 · repo 고유 규칙 유출. 악용 경로 미발견 |
| test | fail | 설계 주장 ↔ test 케이스 교차 대조 · acceptance 커버리지 · drift lint 알고리즘 완전성 · Task 3 validation의 실효성 |
| invariant | fail | receipt 순서 불변식(통과) · marker 원자성(통과) · setup.md 오류 전파 · git 명령 실패 경로 · exit code 계약. codebase에서 두 모델의 비호환을 확인해 CRITICAL 확정 |
