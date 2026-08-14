# Plan Review Panel — meta-research-command-m1

**Plan**: `.claude/plans/meta-research-command-m1.plan.md` · **Plan version**: sha256:712d67157b2cfad2fe21704bf5a359bc6d969e6d3dc284770b70f518ef45250d
**Verdict**: divergent via multi-agent · **receipt 미발행**
**Quorum**: 4/3 responses · 4 roles (of 4) — passed=false
**Reason**: L2 quorum not satisfied: 5 blocking finding(s): test/CRITICAL, test/HIGH, test/HIGH, test/FAIL
**Layers**: L1 converged (violations 0) · L2 fail · L3 not fired (mode=multi-agent)
**Round**: R12 (이 세션 R7~R12) — R7(3) → R8(8) → R9(5) → R10(12) → R11(6) → R12(5). 앞선 R1~R6은 [plan-review-meta-research-command.md](plan-review-meta-research-command.md).

> **루프 종료 결정 (운영자 지시)**: "HIGH 수준의 문제만 수용하고 타협 가능한 수준에서 멈춘다."
> 이 세션에서 HIGH/CRITICAL은 전부 수용했고, R12 잔여는 아래 「미수용 잔여」에 기록한다.
> 세션 agent cap(24/24) 소진으로 추가 라운드 불가.

## 왜 receipt가 발행되지 않았는가 (기계적 사실)

패널 경로에서 **비수렴 상태로는 receipt를 만들 수 없다**. 우회가 아니라 설계다.

1. `plan-review/decide.js`는 비수렴 판정에서 `review_proof: null`을 반환한다. 같은 파일 헤더가 *"review_proof를 조립하는 유일한 곳이며 커맨드 본문이 손으로 만들어선 안 된다"*고 명시한다 — proof를 손으로 만드는 것은 계약 위반이다.
2. `receipt/write.js`는 `review_verdict` · `review_source` · `review_proof` **셋 전부 또는 전무**만 받는다(DD11). 실제 시도 결과: `review_* stamping is all-or-nothing (DD11): missing --review-proof-file`.
3. triple 없이 `--review-mode multi-agent`로 쓰면 "승인 기록 없는 패널 receipt는 converged로 읽힌다"는 가드가 막는다.

즉 `receipt/schema.js:206-212`가 감사용 비수렴 proof를 **허용**하더라도, 그 proof를 만들어 줄 sanctioned 생산자가 없다. 따라서 이 문서가 이번 게이트의 감사 기록 본체다.

## 수용한 HIGH/CRITICAL (이 세션)

| 라운드 | 관점 | 심각도 | 내용 | 처리 |
|---|---|---|---|---|
| R7 | test | HIGH | Validation §3 정리가 `git checkout`이라 Task 0의 미커밋 백필까지 되돌리고, Acceptance가 그 차이를 구분 못 함 | 정리를 워킹트리 밖 스냅샷 복원으로 교체. 검증을 byte-identical + 색인 행 수 보존 + `??` 부재 3단으로 바꿔 커밋 상태와 독립시킴 |
| R8 | invariant | HIGH ×2 | Phase 4가 `register` → `lint` 순서라 lint 실패 시 색인에 고아 항목이 남고 되돌릴 지점이 없음 | lint에 `--pre-register`(L4 제외) 신설, Phase 4를 `lint --pre-register` → `register` → `lint`로 재배열. 골격 계약 test가 등장 순서를 단언 |
| R8 | security | HIGH | "2층 봉쇄가 Task 4에서 짝으로 증명된다"가 과대 주장 — symlink 부정 케이스는 L3 참조 축이지 scaffold 디렉토리 앵커가 아님 | scaffold 부정 fixture 신설(symlink된 `_meta/`에서 발화). 두 층의 부정 케이스를 분리 |
| R8 | test | HIGH | `exempt[]` 길이 5만 보면 legacy 1종이 빠지고 다른 문서가 들어와도 통과 | 단언을 파일명 **집합 동일성**으로 격상(3곳) |
| R9 | security | HIGH | `assertContained(metaDir, repoRoot)`를 쓰면서 `repoRoot`·`metaDir` 출처 미명세 — 봉쇄 성립 여부가 구현자 재량 | `repoRoot` = `--repo-root` 또는 cwd 상향 git 루트, `metaDir`·README는 고정 파생. 인자로 열지 않는 것이 봉쇄의 전제임을 명시 |
| R10 | invariant | CRITICAL ×2 | `register`의 read-modify-write에 lock 부재 + tmp 이름 고정(`target + '.tmp'`)으로 동시 writer가 행을 조용히 유실 | `withLedgerLock` 형태 lock을 읽기~rename 전 구간에 적용, tmp를 `<README>.<pid>.<rand>.tmp`로 변경. 실패 정책은 선례대로 fail-open + loud warn |
| R11 | security | HIGH | `register --doc`가 임의 경로를 받아 README 축과 내부적으로 불일치 — `_meta/` 밖 문서를 등재하면 깨진 링크가 되고 L4가 못 잡음 | L3와 같은 3단계(lexical → existsSync → `assertContained(docPath, metaDir)`)로 봉쇄 |

## 미수용 잔여 (R12) — 이 상태로 종료

| 관점 | 심각도 | 내용 | 판정 |
|---|---|---|---|
| test | CRITICAL / HIGH ×2 | symlink 부정 test 2건이 대상 플랫폼(Windows 11 Home)에서 `fs.symlinkSync` EPERM으로 **항상 loud skip** → "짝으로 증명"의 발화 절반이 이 환경에서 미실행 | **실체 있음.** 다만 잘못된 동작이 아니라 한 플랫폼의 커버리지 공백이며, plan이 이미 "loud skip — 조용히 통과시키지 않는다"로 표면화한다. 심각도는 과대(CRITICAL은 잘못된 동작/불안전 상태 기준). **구현 단계에서 처리** — 개발자 모드 유무 판정 후, 불가하면 CI/WSL 경로로 옮기거나 Acceptance 문구를 "이 플랫폼에서 미검증"으로 정직하게 낮춘다 |
| test | MEDIUM | Task 5 Phase 4의 stop-at-first-failure 오류 처리가 명시되지 않음 | 이연. 커맨드 본문 작성 시 확정 |
| invariant | MEDIUM | `receipt/aliases.js`에 `/mccp:meta-research` 미등재(선례: `plan-prd`는 등재) | 이연. UI1(receipt 미발행)과 별개 축이며 등재는 빈 produces/requires로 가능 |
| R10 잔여 | MEDIUM ×5 | test 위치 3중 기재의 정본 모호 · `--pre-register` 전용 test 부재 · L4가 면제 문서에도 도는지의 명시 단언 · 순서 회귀가 `code`를 보는지 · Validation의 Task 0 순차 의존 | backlog 이연 |

## 기각한 지적 (근거는 plan의 `### 리뷰에서 기각한 지적` 2개 절에 상주)

- **"test 파일이 없어 27 케이스를 확인 불가"**(R10 test HIGH) — 구조적으로 성립 불가한 요구. 받아들이면 통과 조건이 "plan이 기술한 코드가 이미 존재할 것"이 되어 어떤 plan도 게이트를 못 지난다.
- **"순서를 뒤집으면 실패하는 test가 없다"**(R10 test HIGH) — 있다. 골격 계약 test가 등장 index 오름차순을 단언한다. 근거로 든 문장은 R9 흡수로 **과대 주장을 낮춘 결과**였다.
- **"면제가 2단 검증을 만든다"**(R8 invariant MEDIUM) · **"Validate 절이 실행 강제가 아니다"**(R8 test MEDIUM) · **"`detail` 형식 미명세"**(R8 test LOW) — 각각 의도된 성질 / 범주 오류 / 비계약.

## 리뷰어 계약 위반 관측 (게이트 자체의 개선 축)

R11 test(LOW+MEDIUM만 부여) · R12 invariant(MEDIUM만 부여)가 **자기 severity와 모순되는 `verdict=fail`** 을 반환했다. 반환 계약은 "HIGH/CRITICAL이 있을 때만 fail"인데, `quorum.js`는 `verdict=fail` 자체를 `FAIL` 심각도의 blocking finding으로 집계하므로 이 오류가 그대로 차단으로 이어진다. 리뷰어가 haiku(`CLAUDE_CODE_SUBAGENT_MODEL=haiku`)로 도는 것과 무관하지 않다. 게이트 개선 후보 — backlog 등재.

## Findings (R12 전문)

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | CRITICAL | scaffold의 `assertContained` 층을 증명하는 symlink 부정 케이스가 대상 플랫폼에서 항상 skip된다 | plan 234·242행의 `fs.symlinkSync` EPERM loud skip + 실행 환경 win32 Windows 11 Home |
| test | HIGH | 같은 이유로 L3 참조 축의 realpath 봉쇄(3단계)가 이 환경에서 미실행 | plan 242행 |
| test | HIGH | Acceptance의 "참조 경로 실존 100%(L3가 기계 검증)"가 위 skip으로 이 플랫폼에서 검증 불가 | plan 345행 |
| test | MEDIUM | Phase 4의 stop-at-first-failure 오류 처리가 Task 5에 명시되지 않음 | plan 252-261행 |
| invariant | MEDIUM | `aliases.js`에 신규 커맨드 미등재 | `receipt/aliases.js:14-21`(plan-prd 선례) vs `Files to Change` |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | path-containment 2-arg 규약 · lexical-screen-first 순서를 `instruction-contract/lint.js` 선례와 대조 · Task 0 순서 강제(Task 2/3 색인 검사로 기계적) · slug allowlist traversal 차단 · 면제 분기 · 27개 fixture. 경계 누수·추상화 불일치·순서 공백 미발견 |
| security | pass | 2-arg/3-arg `assertContained` 규약을 `path-containment.js:50`과 대조 · metaDir/README가 사용자 입력이 아님을 확인 · realpath 검사와 write 사이 TOCTOU · Windows 구분자/인코딩 traversal 우회(정규식이 구분자·NUL 전부 배제) · README 동시 write race(O_EXCL lock + pid tmp) · Premises lexical 순서 · `_meta` 산출물로의 절대경로 유출. 입력→결과 취약 경로 미발견 |
| test | fail | Validation §1~4와 Acceptance 전수 대조 · symlink test의 플랫폼 skip이 "짝 증명"과 primary 지표에 미치는 영향 추적 · `goal-detect.test.js`의 `{ skip: process.platform === 'win32' }` 관례 확인 · Phase 4 오류 처리 명시 여부 |
| invariant | fail | receipt schema가 meta-research를 배제함을 확인(UI1) · register fail-open lock이 L4로 완화됨 · Task 0 선행이 scaffold/register 양쪽 fail-closed로 강제됨 · 27 부정 + 3 긍정 + 4 회귀 커버리지 · 2층 봉쇄 · rollback 의미(문서 보존, 색인 무변경). 다만 `aliases.js` 미등재를 지적 |
