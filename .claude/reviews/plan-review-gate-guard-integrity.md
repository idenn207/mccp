# Plan Review Panel — gate-guard-integrity

## R3 (2026-08-15) — **`converged`** · 승인

**Plan version**: `sha256:1bc24ac5814caec18444d08aa2d771cf9f1668d8683e0414b7991cec8f48e96a`
**Verdict**: `converged` via `multi-agent` · `verify-proof` `{ok:true, checked:1, problems:[]}`
**Quorum**: 4/3 응답 · 4 distinct roles (of 4) — 충족. **4/4 `pass`, findings 0**
**Layers**: L1 `converged`(violations 0) · L2 `converged` · L3 not fired (`fires.l3=false`)
**Elapsed**: 310s / 399k subagent tokens / 99 tool calls

blocking finding 추이: **R1 10 → R2 5 → R3 0.**

### Findings

None — all reviewers passed.

### Refutation attempted (승인 근거는 반증 실패뿐이므로 무엇을 공격했는지가 기록의 본체다)

| Perspective | 공격 축 |
|---|---|
| architect | C6 결함 주장을 `:883` 리터럴 vs `:939` self-derived로 직접 대조 · 가드 2 경계(`opts.planPath` 조건부) · B5 주장(§3.7 "5면" vs 실제 3리터럴+1파생) · C2 자기차단 논리 · Task 10의 강제 부재가 명시·기계화됐는지. 구조가 유지 못 할 불변식을 단언하는 지점 없음, 인용 불일치 없음, 순환 의존 없음 |
| security | terminal PR 게이트의 신뢰 경계 · 증거 무결성 사슬(`unverifiable` + `hash_bound===comparable` 양축) · fixture 경로 데이터 유출 · stale-plan 우회를 통한 권한 상승 · **gitignore negation 커버리지**(`.gitignore:32`가 ship receipt dir를 un-ignore함을 직접 확인 — R2 자신의 CRITICAL을 뒤집음) · decision-slug 충돌(선재, 본 plan이 악화시키지 않음) |
| test | 6개 결함 각각의 반증가능성 · 참조 test 파일 실재 · Validate가 사후 단언임을 헤더로 명시했는지 · **A/B 비공허성**(C3는 `dedupe.js` stash 후 red, C6는 `pr.md` stash 후 lint red) · Acceptance의 고정 문자열 grep이 구체적인지. test로 보이지 않는 단언 없음, 논리적 순환 없음 |
| invariant | C6의 fail-open → fail-closed 전환 · C2 자기차단 방지 · Task 1의 증거 anchoring이 fail-closed인지 · 9개 Validation 블록 전부가 exit code를 쓰는지 · §3.12 no-rehash 준수 · Task 10 게이트 부재의 3중 관측 완화 · R1/R2 blocking이 전부 처리됐는지 · UI5 범위 한정 문서화 |

---

## R2 (2026-08-15) — `divergent`, blocking 10 → 5

**Plan version**: `sha256:974ca961799147bf4eed4edbd2cf8d22cb8fef0707f1181f9a41947d1d01e08e`
**Quorum**: 4/3 응답 · 4 role — 미충족. architect **pass** · invariant **pass**(MEDIUM 1) · security **fail**(CRITICAL 1) · test **fail**(HIGH 2 + MEDIUM 3)
**Elapsed**: 247s / 393k subagent tokens / 116 tool calls

| Perspective | Severity | Claim | 저자 판정 |
|---|---|---|---|
| security | CRITICAL | Task 1이 ship receipt를 커밋하지 않아 `hash_bound===comparable`이 clone에서 성립 불가 | **반증** — `.gitignore:32` `!.claude/receipts/mccp-pr-codex/` 부정 패턴 존재. `git ls-files --error-unmatch` 성공 + `origin/main`에 존재(`fffa166`). 리뷰어가 negation 줄 미확인 |
| test | HIGH | `[C2]` 검증이 "읽을 수 없음" 경로만 치고 "게이트 이후 변경"을 안 침 | **수용** → `[G2]` 신설. 실측: 변조 사본 `stale`(`9fd9fd66…→a3777717…`), 원본 `ok:true` |
| test | HIGH | `[C6]` 검증이 syntax grep뿐이고 가드 동작 미검증 | **수용** → `[G2]`가 동작축, `[C6]`가 정적축 + A/B |
| test | MEDIUM | 회귀 대상 `plan-command-marker-states.test.js`는 `plan.md`만 스캔 | **수용** → `lint/tests/validate-callsite-lint.test.js`로 이전(그 파일 `:16`이 자기 공백을 명시) |
| test | MEDIUM | `dedupe.test.js`에 해당 이름의 test가 아직 없음 | **부분 수용** — Task 5의 산출물이므로 정상. Validation에 "사후 단언" 헤더 추가 |
| test | MEDIUM | Validation이 Task 0 완료를 전제해 자기완결적이지 않음 | **부분 수용** — 착수 전 상태는 `[T0]`와 `git stash` A/B가 담당함을 명시 |
| invariant | MEDIUM | "리포트에 명시" Acceptance가 기계적이지 않음(체크만 하고 안 써도 통과) | **수용** → 3항목을 고정 문자열 grep으로 전환 |
| architect | — | findings 0, 6개 결함 인용을 전수 대조 후 pass | — |

---


**Plan**: `.claude/plans/gate-guard-integrity-m3.plan.md` · **Plan version**: `sha256:a49b2cd830bfb13b7097ffa5d51d9bb49cb0755284ebb4a35aebd3ce06b03bfe`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) — **미충족**. blocking finding 10건 (`architect/CRITICAL` · `architect/HIGH` · `invariant/CRITICAL` · `invariant/HIGH`×3 · `verdict=fail`×4)
**Layers**: L1 `converged` (violations 0, 초회 4건은 수정 후 재실행) · L2 `fail` 4/4 · L3 not fired (`MCCP_PLAN_REVIEW_L3=0` → `fires.l3=false`)
**Date**: 2026-08-14 · **Elapsed**: L2 패널 277s / 398k subagent tokens / 100 tool calls

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| invariant | CRITICAL | Phase 2.5.8(code-review chain-check)이 `--plan`에 치환되지 않은 placeholder `<plan path>`를 그대로 담고 있다 | `plugins/mccp/commands/pr.md:883` 리터럴 `--plan <plan path>`. `:914` 주석은 "2.5.8's code-review chain-check **also passes** `--plan` and can stale-block"이라 **주장**한다. `validate-cmd.js:363`의 `if (opts.planPath)`가 staleness 전체를 조건부로 만들어, planPath 부재 시 경고 없이 skip |
| invariant | HIGH | M1은 2.5.9만 고쳤고 2.5.8은 미수정으로 남았다 — M3 plan은 가드 2가 M1에서 닫혔다고 전제한다 | M1 리포트가 2.5.9의 `SHIP_PLAN_PATH` self-derivation만 기록. `pr.md:943`은 실변수 `"$SHIP_PLAN_PATH"`, `:238`도 실변수 `"$PRECHECK_PLAN"`인데 `:883`만 placeholder — **pr.md 내 유일한 비대칭** |
| invariant | HIGH | `validate-cmd.js`의 staleness가 `--plan` 제공에 조건부라 placeholder 미치환이 곧 silent fail-open | `plugins/mccp/scripts/receipt/validate-cmd.js:363-384` — 블록 전체가 `if (opts.planPath) {…}` 안. 부재 시 error도 warning도 없음 |
| invariant | HIGH | M3 Task 0~9 어디에도 2.5.8 축이 없다 | `.claude/plans/gate-guard-integrity-m3.plan.md` Tasks 0-9. Task 3은 `prp-implement` Phase 5 축이라 `pr.md` 가드와 무관 |
| architect | CRITICAL | PRD Evidence가 인용한 `pr.md:202`·`pr.md:856`이 현 파일에서 validate 호출이 아니다 | 현 `pr.md:202`는 `DECISION_SLUG=…derive-decision`, 실제 staleness validate는 `:939-945`(`--plan "$SHIP_PLAN_PATH"`). 인용 행번호가 M1 수정 이후 드리프트 |
| architect | HIGH | Task 3이 아카이브를 `/mccp:archive-complete`로 위임하면서 Task 9(머지 후 별도 호출)에 기계적 강제가 없다 | `prp-implement.md:1469-1470`의 무조건 `mv` 제거 후, plan line 150의 "PR 머지 후 별도 호출"은 사람 의존 시퀀싱이며 게이트도 자동 점검도 없다 |
| architect | MEDIUM | version bump 5면을 제안하면서 해당 파일에 버전 문자열이 실재하는지 사전 확인 단계가 없다 | plan line 75가 §3.7 5면 패턴 인용, Files to Change에 5건. renderer glob에서 버전 문자열 미확인 |
| security | MEDIUM | Task 1의 A1 검증이 `unverifiable` 카운트만 보고 `receipt_hash` 무결성을 안 본다 | plan line 111이 `unverifiable` 19→18만 단언. `evidence-audit.js:235-236,265`는 `hash_bound`를 별도 추적하고 `:285`에서 `hash_bound < comparable`이면 `state='inconsistent'` |
| security | MEDIUM | 미추적 M2 ledger 엔트리를 커밋 전 hash 일치 확인 없이 커밋한다 | Task 1 action(line 109). `evidence-audit.js:185-196` `receiptIntegrityOk()`가 재계산 hash 대조를 제공하나 plan이 커밋 **전에** 호출하지 않음 |
| test | MEDIUM | Task 4의 신규 2케이스가 `## Validation` 블록에 반영되지 않아, 케이스를 안 써도 통과한다 | Task 4 Validate(line 126) vs 통합 Validation(line 166) — 후자는 기존 test 실행뿐 |
| test | MEDIUM | Task 5의 CLI 스모크(`--runs 2 --pattern <단일 파일> --json`)가 Validation 블록에 없다 | Task 5 Validate(line 132) vs Validation(line 167) |
| test | MEDIUM | Task 2의 "동시 3개 실행 간섭 0"이 Validation 블록에 없다 | Task 2 Validate(line 116) vs Validation(lines 164-165) |
| test | MEDIUM | Acceptance가 요구하는 A/B(수정 전 코드 red)의 **실행 방법**이 어디에도 없다 | Acceptance line 199 + Task 4 line 127은 요구만 하고, 코드 되돌리기·비교 절차가 Validation에 부재 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan의 인용을 실제 코드와 대조 · C1 fixture 패턴 실재 확인 · C2 아카이브 경계 vs §3.11 C2 · Task 3/9 시퀀싱 · renderer version sync 참조 탐색 · Acceptance 정의와 강제 · `pr.md`의 staleness validate 호출 위치 |
| security | fail | C1 fixture의 경로 탈출(→ `os.tmpdir()` mkdtemp + 고유 sessionId + `.gitignore`로 방어 확인) · C2 아카이브 경로 혼선(→ 위임 + grep 검증 확인) · A1 ledger의 절대경로 유출(→ M2 receipt `meta.cwd`가 `.`로 정규화됨 확인, 단 plan이 명시 검증 안 함) · A1 데이터 무결성(→ **결함 발견**) · ledger 타임스탬프 정합(2026-08-13 엔트리는 정당한 선행 세션 산물) · B1~B3·C3·C4·A2는 검증 적절 |
| test | fail | 편집 지점 소스 직독(`msw-events.test.js:12-14` · `toggle-snapshot.test.js:61` · `dedupe.js:103-130` · `suite-determinism.js:209`) · plan이 말한 신규 test의 실재 여부 · Validate 명령이 실제로 그 결함을 잡는 test를 돌리는가 · Task별 Validate vs 통합 Validation 대조 · Acceptance가 그 격차를 메우는가 |
| invariant | fail | M1 리포트에서 실제로 ship된 가드 2 수정 범위 확인(2.5.9의 `SHIP_PLAN_PATH`만 기록, 2.5.8 언급 없음) · `pr.md:880-883`의 리터럴 placeholder 확인 · `validate-cmd.js:363`의 조건부 staleness 확인 |

## 저자 사후 검증 (게이트 차단 후, read-only)

- **invariant CRITICAL — 확인됨.** `pr.md`의 `--plan` 출현 5곳 중 실행 경로 3곳을 대조했다: `:238` `"$PRECHECK_PLAN"`(실변수) · `:943` `"$SHIP_PLAN_PATH"`(실변수) · **`:883` `<plan path>`(리터럴 placeholder)**. `:914` 주석이 2.5.8도 `--plan`을 넘긴다고 명시적으로 주장하므로, 주장과 코드가 어긋난다. `validate-cmd.js:363-384`가 조건부인 것도 확인했다.
- **architect CRITICAL — 부분 타당.** PRD Evidence의 행 인용이 M1 수정 이후 드리프트한 것은 사실이다(문서 드리프트 B4 후보). 다만 "the guard the plan claims to restore may already exist"라는 추론은 오독이다 — M3 plan은 가드 2 복원을 **주장하지 않고**, C2 행 (b)에서 "M1이 복원한 가드 2 때문에"라고 M1 귀속을 명시한다. 이 오독은 리뷰어가 PRD의 *과거 시점 Evidence 절*을 M3 plan의 *현재 주장*으로 읽은 데서 나왔다.
