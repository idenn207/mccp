# Implementation Report: Gate Guard Integrity — 신호 신뢰도 (M2)

**Plan**: `.claude/plans/gate-guard-integrity-m2.plan.md`
**Source PRD**: `.claude/prds/gate-guard-integrity.prd.md` · Milestone 2
**Branch**: `docs/gate-guard-integrity-m2-completion` · **Version**: 1.23.7 → 1.23.10
**Gate receipts**: `mccp-plan-codex` + `mccp-implement-codex` / decision=`gate-guard-integrity-m2` · validate ok

## 판정: **잔여를 명시한 채 운영자 수용 → complete**

축 B(스모크 skip 사유)와 축 C(`b2-coverage-gate` 상시 red 2건)는 **닫혔다** — 후자는 10회 전수에서 한 번도 재발하지 않았다. 축 A의 산출물도 전부 착지했고 각각 부정 케이스로 검증됐다.

**그러나 축 A의 목표는 달성되지 않았고, 이 변경이 그것을 악화시켰다.** 통제된 비교(같은 harness·같은 머신, 각 10회)에서 **수정 전 스위트는 10/10 완전히 동일**했고 **수정 후는 8/10**이다. 즉 이 milestone은 신호 신뢰도를 회복하겠다고 선언하고 신호를 흔들었다. 메커니즘은 세 차례 재현 시도에도 확정하지 못했다.

`after.tap` 한 번만 보면 §Validation의 네 델타 기준이 전부 충족되지만 **그 판정을 채택하지 않는다.** 8/10의 green을 성공으로 읽는 것이 이 PRD가 지목한 "통과 신호의 존재가 검사가 일어났음을 의미하지 않는다"의 재생산이다. 이 milestone의 harness가 그것을 잡았다는 사실은 도구가 작동한다는 증거이지, 통과의 근거가 아니다.

**운영자 판정 (2026-08-14): 아래 "남은 결정" 1번 — 잔여를 명시한 채 수용하고 ship.** 근거는 PRD Scope가 "테스트 병렬 실행 구조 재설계 — 비결정적 간섭의 근본 해소"를 M2 **범위 밖**으로 못박고 "Milestone 2는 **재현 조건 확정까지만** 다룬다"고 규정한 것이다. 재현 조건 확정은 달성됐다. 유입된 비결정 2건은 PRD Open Question으로 승계됐고, 이 리포트의 측정 기록이 그 재개 지점이다. **지표 미달 사실 자체는 위 표에 그대로 남는다** — 수용은 측정을 바꾸지 않는다.

---

## Task 0 — 봉인된 baseline `B`

착수 **전**(Task 1~7의 어떤 산출물도 존재하지 않는 트리에서) 전수를 **정확히 1회** 측정했다. 이 값은 이후 갱신되지 않았다.

```
node --test --test-reporter=tap "plugins/mccp/scripts/**/*.test.js"
```

| 지표 | `B` |
|---|---|
| tests | 3869 |
| pass | 3861 |
| fail | 2 |
| skipped | 6 |
| duration_ms | 297499.7676 |

**`B.failing` (이름 단위, top-level)** — 둘 다 `plugins/mccp/scripts/lib/tests/b2-coverage-gate.test.js`:

1. `static lint passes on the real repo (approved writers only)`
2. `full gate: covered observation on the real repo passes every axis`

원본 TAP은 `.claude/PRPs/reports/gate-guard-integrity-m2-baseline.tap`에 산출물로 보존된다.

baseline.tap sha256: 3ca7d8c74f9402d542fb52fe5a99696215a6dd2c417f5349aa27036bd4fd7d69

plan의 2026-08-12 증거값 `{pass 3861, fail 2, skipped 6}`과 **네 지표 모두 일치**한다. 이는 갱신이 아니라 최초이자 유일한 확정이며, 값이 같다는 사실은 우연이 아니라 그 사이 트리가 움직이지 않았다는 뜻이다(HEAD=`3eabab2`=`origin/main`, 착수 시점 `git rev-list --left-right --count origin/main...HEAD` = `0 0`).

**순서 증명** — 해시 일치는 변조만 잡고 순서는 잡지 못하므로 커밋 이력으로 증명한다.

| 검사 | 결과 |
|---|---|
| TAP을 건드린 커밋 수 (`git log -- <tap>`) | **1** (`746e32a`) — 두 번째 측정이 없었다는 기계적 증거 |
| 봉인 커밋 ⊂ Task 1 산출물 커밋(`6c23b54`)의 조상 | **참** (`git merge-base --is-ancestor`) |
| report의 `baseline.tap sha256:` 줄 수 | **1** |
| 재해시 대조 | 일치 |

### Task 0 — 수정 전 skip 사유 봉인 (Task 5의 A/B 대조 대상)

```
ok 1 - real codex-companion: --json forwarded end-to-end (smoke) # SKIP real codex --json contract appears to be non-JSON; v0.2.4 followup
```

이 사유는 **거짓**이다 — `MCCP_CODEX_DISABLED=1`이 켜져 있어 companion이 spawn된 적이 없고, 따라서 "계약이 non-JSON으로 드리프트했다"는 관측은 성립하지 않는다.

### Task 0 — 봉인 후 flaky 발화 여부

`B` 측정 1회에서 plan `## 착수 전 실측`의 run 4 divergence(`session-start-bootstrap.test.js:101`)는 **발화하지 않았다**. 따라서 Task 2c는 plan이 규정한 대로 **2c-A(계약 강제, 무조건 착지)** 를 수행했고 2c-B(원인 확정)는 재현 조건부로 남았다.

---

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 다만 축 A의 *결론*이 예측과 다르다(아래) |
| Files Changed | 20 (CREATE 7 / UPDATE 13) | 19 파일 + 신규 test 34건 |
| 신규 테스트 | 미명시 | **+34** (3869 → 3903) |

---

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | baseline 봉인 | 완료 | 1회 측정 · 자기 커밋 1개 · 순서 증명 통과 |
| 1 | 결정성 harness | 완료 | `diffRuns` 부정 케이스 7건. **한계 1건 기록**(아래 L1) |
| 2a | perf-budget 자기 정규화 | 완료 | 주입 O(n²)에서 발화 재현 |
| 2b | a3 라이브 STATE.md 결합 제거 | 완료 | A/B 프로브로 전후 대조 |
| 2c-A | fail-open 계약 강제 | 완료 | 수정 전 코드에서 FAIL 확인(stub 아님) |
| 2c-B | 포착된 divergence 원인 확정 | **미수행 (조건 미충족)** | 대상 flake가 10회 + baseline 1회, 총 11회에서 **미재현**. 추정으로 채우지 않고 승계 |
| 3 | 잔여 timing 단언 3건 판정 | 완료 | 3건 모두 **무변경** — 근거 아래 |
| 4 | 도달 가능성 오라클 | 완료 | 14종 enum 전수 + 주석 헤더 대조 |
| 5 | skip 사유 정직화 | 완료 | 문자열 A/B 통과 |
| 6 | 승인된 격리 helper | 완료 | b2 red 2건 소멸, 가드 정의 무변경 |
| 7 | 회귀 대조 + 릴리스 | 완료 | 아래 판정 절 참조 |

---

## Validation Results — 통합 재현 3건의 출력 원문

plan이 "스위트가 강제하지 못하는 축의 유일한 증거"로 지정한 3건이다.

### (i) `MCCP_PERF_INJECT_QUADRATIC=1` — 대체 단언이 원 회귀를 여전히 잡는가

```
정상   : perf-budget: n=10 133ms · n=100 158ms · ratio=1.19 limit=20.00
주입   : perf-budget: n=10 229ms · n=100 10372ms · ratio=45.29 limit=20.00 [MCCP_PERF_INJECT_QUADRATIC=1]
         ✖ AssertionError: derive scaling regressed: ratio 45.29 exceeds linear*2 = 20.00
           (super-linear scaling between n=10 and n=100) (small=229ms @n=10, large=10372ms @n=100)
[NEG-OK] 주입된 O(n^2)에서 단언 발화
```

**구현 중 발견·수정한 자기 결함 1건**: 최초 구현은 바쁜 대기를 `Date.now()` 시작 **이전**에 두어 주입해도 `elapsed`가 움직이지 않았다 — 즉 이 축이 자기 자신을 검증하지 못했고 `[NEG-FAIL]`로 드러났다. 스톨을 측정 창 안으로 옮겨 해소했고, 그 배치가 계약의 일부임을 주석으로 고정했다.

### (ii) fail-open 계약 — 수정 전 스크립트 A/B (stub 방지)

```
수정 후: ✔ session-start exits 0 with a loud message when a module-scope require is broken (fail-open contract)
         ✔ session-start.js declares exactly one exit-code assignment (fail-open contract has no legitimate non-zero path)
수정 전: ✖ (양쪽 다)
         AssertionError: a broken module-scope require must NOT block session startup
           [status=1 signal=null error=none failOpenForced=none stderr=…]
[NEG-OK] 수정 전 코드에서 FAIL — test 본문이 계약을 실제로 단언한다
```

`status=1` · `failOpenForced=none`이 수정 전 상태의 정확한 기록이다 — 관측된 flake의 형태(`exit 1` + marker 없음)와 같다.

### (iii) 스모크 skip 사유 A/B — 문자열 단언

```
수정 전: # SKIP real codex --json contract appears to be non-JSON; v0.2.4 followup
수정 후: # SKIP smoke skipped: env-policy: MCCP_CODEX_DISABLED=1 — codex-invoke short-circuits
         before spawn, so the companion was never reached (this is a policy decision,
         not a contract observation)
NSKIP=1 · non-JSON 부재 · env-policy 존재
[NEG-OK] 그 한 줄의 사유가 env-policy로 정직화됨
```

### (부가) Task 2b 결합 제거 A/B — 파괴적 프로브 없이

`.claude/state/STATE.md`를 변조하지 않고 `repoRoot` 전달 여부만 바꿔 증명한다.

```
── measureA3 WITHOUT repoRoot (제거 대상 결합) ──
cwd=repo    state_block bytes: 7943
cwd=fixture state_block bytes: 111
── measureA3 WITH explicit repoRoot (Task 2b 이후) ──
cwd=repo    repoRoot=fixture state_block bytes: 111
cwd=fixture repoRoot=fixture state_block bytes: 111
```

### (부가) 봉쇄 술어 직접 검증 — stub 없이

```
[NEG-OK] 봉쇄 술어 직접 검증: 정상=true, 탈출=false, symlink=false
```

symlink 케이스가 실제로 실행됐다(이 머신에서 junction 생성 가능). 문자열 `startsWith` 구현은 이 케이스를 통과하지 못한다.

### 축 C — 가드 미약화의 기계적 증거

```
$ git diff -U0 -- plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js | grep -E "^[+-][^+-]"
+  { file: 'plugins/mccp/scripts/receipt/store.js', fn: 'quarantineReceipt' },
```

`+1/-0`. `APPROVED_WRITERS` · `APPROVED_PREFIXES` · `WRITE_CALL_RE` · `ANY_WRITE_CALL_RE` **전부 무변경**(UI6 준수). runner의 `fs.renameSync(` 호출부는 **2 → 1**로 줄었고 남은 1건은 `:81 fs.renameSync(tmp, file)` — marker atomic write다.

위임은 정적 문자열이 아니라 **호출 관측**으로 단언한다(변수명·주석·래핑으로 만족 불가):

- `quarantine delegates to the approved store helper with the receipt path and nonce` — 호출 1회 + 인자 3개 확인
- `quarantine failure surfaces as FATAL — the return value is never ignored` — stub이 `{ok:false}`일 때 기존 FATAL 메시지 3요소가 stderr에 나타남
- `(a) default dependencies are the REAL modules` — `defaultDeps.quarantineReceipt === receiptStore.quarantineReceipt` (주입된 fake만 검증하는 것을 방지)

---

## Task 3 — 잔여 timing 단언 3건 판정: **전부 무변경**

harness 10회(+ baseline 1회 + after 1회, 총 12회 관측)의 `sometimesFailing`·`unionFailing` 어디에도 아래 3건은 **등장하지 않았다**. plan의 금지 조항("흔들린 적 없는 단언을 '안전하게' 완화하는 것 — 근거 없는 신호 약화")에 따라 손대지 않는다.

| 단언 | 위치 | 판정 | 근거 |
|---|---|---|---|
| `< 20000ms` | `lib/tests/plan-codex-runner.test.js:223` | 무변경 | 12회 관측 미발화 |
| `< LEASE_TTL_MS / 2` | `migrations/tests/v0.2.8-generic-receipt-quarantine.test.js:433` | 무변경 | 12회 관측 미발화 |
| `< 3000ms` | `receipt/tests/receipt-write-concurrency.test.js:176` | 무변경 | 12회 관측 미발화 (셋 중 가장 빡빡함에도) |

---

## 전수 회귀 대조 — 봉인된 `B` 대비

### 단일 실행 (`after.tap`)

| 지표 | `B` | after | 기준 | 판정 |
|---|---|---|---|---|
| `b2-coverage-gate` 2건 | 2 | **0** | 0 (이름 대조) | 충족 |
| fail | 2 | **0** | ≤ 0 (`B.fail` − 축 C 2건) | 충족 |
| pass | 3861 | **3897** | ≥ 3861 | 충족 |
| skipped | 6 | **6** | ≤ 6 | 충족 |

실패 이름 대조: after의 `not ok` 목록은 **비어 있다**.

### 10회 harness — 단일 실행이 못 보는 것

```
node plugins/mccp/scripts/lib/suite-determinism.js --runs 10 --json
```

| 필드 | 값 |
|---|---|
| `stable` | **false** |
| `reason` | `failing-set-diverged` |
| `runs_observed` | 10/10 (broken 0) |
| `alwaysFailing` | **[]** ← 축 C 해소의 결정적 증거 |
| `sometimesFailing` | `parsePlanFiles fails closed when table separator is missing` · `scanWorktrees: truncation retains the self worktree (anchor not dropped)` |

per-run: 8회가 `pass=3897 fail=0 skipped=6`, 2회가 `pass=3896 fail=1 skipped=6`.

**`alwaysFailing`이 비었다는 것이 축 C가 닫혔다는 가장 강한 형태의 증거다** — 10회 전부에서 그 두 이름이 사라졌다. 반면 `stable:false`는 milestone의 headline 목표("전수 실행 결과가 실행마다 동일")가 **달성되지 않았음**을 말한다.

`after.tap` 한 번만 보면 네 기준이 전부 충족되지만, **그 판정을 채택하지 않는다.** 같은 트리에서 10회를 관측한 더 강한 도구가 divergence를 봤고, 8/10의 green을 성공으로 읽는 것이 이 PRD가 지목한 "통과 신호의 존재가 검사를 의미하지 않는다"의 재생산이다.

### 포착된 divergence 2건 — 관측 사실만

| 항목 | 실측 |
|---|---|
| 위치 | `receipt/tests/dedupe.test.js:123` · `derive/tests/worktrees-source.test.js:344` |
| 이 milestone이 그 파일을 수정했는가 | **아니오** (둘 다 Files to Change 밖) |
| 격리 반복 15회 | **전부 통과** → 부하 의존 |
| 전수 10회 | 각 1회씩 발화 (≈10%) |
| plan/PRD/STATE가 예고한 목록에 있었는가 | **아니오** — 넷(`hook-caps:206`·`dedupe:306`·`a3-instruction-cost`·`perf-budget`) 어느 것도 아니다 |

두 테스트의 **본문 로직은 결정적**이다(`parsePlanFiles`는 순수 fs 파싱, `scanWorktrees`는 fixture 위 스캔). 비결정의 소재는 fixture 쪽으로 좁혀진다 — `mkTmpRepo`가 git 하위 프로세스 **6개**를, `makeMultiWorktree`가 `git init` + N회 `git worktree add`를 spawn한다. **다만 실패 메시지를 포착하지 못했으므로 메커니즘을 확정하지 않는다** — plan이 금지한 "원인을 추정으로 채우는 것"에 해당한다. 위 관찰은 후속 조사의 출발점이지 원인 지목이 아니다.

### 귀속 측정 — 이 변경이 유입시킨 것인가 (controlled 10 vs 10)

plan에 없던 측정이다. "두 divergence가 선재했는가"는 **관측하지 않으면 말할 수 없고**, 마침 그것을 관측할 도구가 이 milestone의 산출물이다. 수정 전 커밋(`3eabab2`)을 별도 worktree로 꺼내 **같은 harness·같은 프로토콜·같은 머신**으로 10회 돌렸다.

```
node plugins/mccp/scripts/lib/suite-determinism.js --runs 10 --json --repo-root <3eabab2 worktree>
```

| | 수정 전 (`3eabab2`) | 수정 후 (`6c23b54`) |
|---|---|---|
| `stable` | **true** | **false** |
| `sometimesFailing` | **[]** | 2건 |
| `alwaysFailing` | b2 2건 | **[]** |
| per-run | 10회 전부 `pass=3861 fail=2 skipped=6` | 8회 `fail=0` · 2회 `fail=1` |

**수정 전 스위트는 10회 관측에서 완전히 결정적이었다.** 따라서 통제된 비교의 유일한 차이 변수는 이 변경이며, **결론은 이 milestone이 비결정성을 유입시켰다는 것이다.** 이 사실을 완화해 적지 않는다 — 신호 신뢰도를 회복하겠다는 milestone이 신호를 흔들었다.

명시할 교란 요인: 두 측정은 동시가 아니라 약 1시간 간격이고, probe는 별도(중첩) worktree다. 다만 probe 실행 중에는 문서 작성이 병행돼 부하가 **더** 높았음에도 10/10 결정적이었으므로, 교란은 결론과 **반대 방향**으로 작용했다.

#### 메커니즘: 확정하지 못했다

두 차례 재현을 시도했고 **둘 다 실패**했다. 추정으로 채우지 않는다.

| 시도 | 결과 | 함의 |
|---|---|---|
| 두 파일만 16회 **동시** 실행 | 16/16 통과 | 단순 git spawn 경합이 아니다 |
| 전수 **3개 동시**(3배 부하) | 두 이름 모두 미발화 | 부하 단조 증가형이 아니다 — 오히려 부하를 올리면 안 나온다 |
| 두 파일만 15회 **순차** 실행 | 15/15 통과 | 격리 상태에서는 재현 불가 |

두 테스트의 본문 로직은 결정적이고(순수 fs 파싱 / fixture 위 스캔), 비결정의 소재는 fixture 쪽으로 좁혀진다 — `mkTmpRepo`가 git 하위 프로세스 6개를, `makeMultiWorktree`가 `git init` + N회 `git worktree add`를 spawn한다. 이 변경은 그런 임시 fixture 활동을 늘렸다(perf-budget 1 → 2 temp repo · a3 6개 fixture 신설 · store-quarantine의 **junction 생성** 포함 ~10개 · bootstrap +1 repo). **그러나 이것은 상관이지 인과가 아니며, 위 세 재현 시도 중 어느 것도 그것을 확인하지 못했다.**

#### 3배 부하 진단의 방법적 결함 (자기 정정)

`msw-events: concurrent N-writer O_APPEND atomicity stress`가 3배 부하에서 반복 실패했는데, **이는 스위트의 성질이 아니라 진단 방법의 결함**이다. 그 테스트의 `getTempDir`(`msw-events.test.js:12-14`)는 **저장소 트리 안의 고정 경로**(`plugins/mccp/scripts/.test-msw-events/concurrent-stress`)를 쓰고 `sessionId`도 고정이라, 전수를 동시에 여러 개 돌리면 같은 파일에 쓴다. 정상 사용(단일 실행)에서는 충돌이 없다. 이 관측은 귀속 증거에서 **제외**한다.

#### 부수 발견 — 축 2a가 의도한 것을 정확히 달성했음의 직접 증거

같은 3배 부하 실험이 계획에 없던 강한 증거를 냈다.

| 트리 | perf-budget 단언 | 3배 부하 결과 |
|---|---|---|
| 수정 전 | `elapsed < 1000ms` (절대 wall-clock) | **3/3 실패** |
| 수정 후 | `judgeScaling` 비율 | **3/3 통과** |

**같은 경합에서 옛 단언은 터지고 새 단언은 터지지 않는다.** 그리고 새 단언은 주입된 O(n²)를 여전히 기각한다(ratio 45.29 > 20). 이 두 사실이 함께 있어야 "완화가 아니라 대체"가 증명되는데, 이번 실험이 그 쌍을 실측으로 채웠다 — 초안이 요구한 것보다 강한 증거다. (부수적으로, plan이 지목한 `perf-budget`의 flaky 성질이 **실재함**이 여기서 처음 재현됐다. baseline 4회에서는 한 번도 안 나왔던 것이다.)

---

## Deviations from Plan

| # | 무엇 | 왜 |
|---|---|---|
| D1 | fail-open marker를 `FAIL-OPEN-FORCED原exit=<N>` → `FAIL-OPEN-FORCED orig_exit=<N>` | security-reviewer가 영어 코드베이스의 CJK 리터럴을 LOW로 지목. §Validation 게이트는 prefix만 grep하므로 판정 무영향이고, Windows에서 소스에 CJK를 심는 인코딩 위험을 회피 |
| D2 | `store.js#quarantineReceipt` 시그니처를 `(receiptFilePath, suffix)` → `(repoRoot, receiptFilePath, suffix)` | plan이 2-arg를 적으면서 `receiptsDir(repoRoot)` 봉쇄를 요구했다. 경로에서 repoRoot를 역산하면 **입력이 자기 봉쇄 루트를 정의**해 봉쇄가 무의미해진다. store.js 기존 관례(`writeReceipt(repoRoot, …)`)와도 일치 |
| D3 | 봉쇄 재검사를 "부모 realpath" → "**가장 가까운 실재 조상** realpath" | 부모를 곧장 realpath하면 아직 만들어지지 않은 gate dir 아래의 정상 경로가 `ENOENT`로 거부된다(plan §Validation의 `rdir/g/a.json` 케이스가 실제로 실패했다). 실재하지 않는 구성요소는 symlink일 수 없으므로 봉쇄는 약해지지 않고, symlink 탈출은 그대로 걸린다(실측 확인) |
| D4 | `plan-codex-runner.test.js:248`의 fixture 경로를 `<scratch>/plan-codex-receipt.json` → `<scratch>/.claude/receipts/mccp-plan-codex/r.json` | 봉쇄가 켜지면 receipts 밖 경로는 격리되지 않는다. 새 경로가 production이 실제로 쓰는 형태이므로 완화가 아니라 충실화 |
| D5 | 구현 게이트 리뷰 기록을 plan 본문이 아니라 `.claude/reviews/implement-review-<slug>.md`에 | 2.5.4가 plan 본문에 주입하면 plan_hash가 바뀌어 직전 `mccp-plan-codex` receipt가 **stale**이 되고 2.5.7이 자기 게이트를 `exit 2`로 거부한다(실측: `cc9d11a5…` ≠ 봉인 `9fd9fd66…`). 이 저장소가 같은 문제에 대해 이미 확립한 관례(plan §Review History, 커맨드 Phase 5.2h)를 구현 게이트에 적용 |
| D6 | plan의 `--test-name-pattern` 배치 교정 | 플래그를 파일 **뒤**에 두면 필터가 걸리지 않는다(실측: 8건 vs 2건). 검사는 통과하되 의도한 것을 재지 않으므로 플래그를 파일 앞으로 |
| D7 | version `1.23.8` → **`1.23.10`** | plan 작성 후 `origin/main`이 1.23.8을 발행했고, 미머지 sibling worktree 2개(`codex-intent-context`·`v1.24.0-multi-session-m5`)가 이미 1.23.9를 선언했다. §3.7 forward-only + 3자 충돌 회피 |
| D8 | `a3-instruction-cost.test.js`의 temp CLAUDE.md를 `__dirname` → fixture root | Task 2b가 fixture root를 만드는 김에 함께 옮겼다. **전수 병렬 실행 중 저장소 트리에 파일을 쓰는 것** 자체가 이 milestone이 제거하려는 간섭 형태다 |
| D9 | `runDerive` shim에서 주입 스톨을 측정 창 **안**으로 | 최초 구현이 타이머 밖에 두어 주입이 무효였다(§Validation (i) 참조). 배치가 계약의 일부 |
| D10 | `origin/main`(20커밋 앞섬) 머지를 PR 단계로 이연 | 봉인된 `B`는 착수 시점 트리(`3eabab2`)에 대한 것이다. 지금 머지하면 델타가 상류 변경과 뒤섞여 이 milestone의 기여를 분리할 수 없다. **머지 위험은 실측으로 낮음** — origin/main이 이 milestone의 변경 파일을 하나도 건드리지 않았고 신규 파일 충돌 0, `:248` red도 upstream에 그대로 |

---

## Issues Encountered

1. **2.5.4 ↔ 2.5.7 구조 결함** (D5) — 커맨드가 지시한 plan 본문 주입이 같은 커맨드의 다음 단계를 stale로 만든다. STATE.md Open Questions에 이미 backlog 항목으로 있던 것이 이번에 실제로 발화했다. 우회는 sibling 아티팩트.
2. **`gitRepoRoot`가 비-git 디렉토리에서 throw** — 반환값이 아니라 예외다. 격리는 실패 경로 위의 정리 동작이라 여기서 예외가 올라가면 진짜 사유가 가려진다. `containmentRoot()`로 흡수하고 cwd로 떨어진다.
3. **주입 스위치 무효화** (D9) — 자기 검증 없이 착지했다면 "대체가 아니라 완화"를 그대로 통과시킬 뻔했다. `[NEG-FAIL]`이 잡았다.

---

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/suite-determinism.test.js` | 7 | `diffRuns` 4필드 · 카운트 divergence · fail-closed(1회/0회/malformed) · TAP 파싱(정수 강제·디렉티브 제거) |
| `lib/tests/perf-scaling.test.js` | 5 | 선형 통과·2차 기각 · 경계 포함성 · slack · `small.ms=0` unmeasurable · malformed |
| `lib/tests/codex-reachability.test.js` | 7 | precedence(실재하지 않는 조합) · 14종 enum 전수 · 주석 헤더 대조 · unknown fail-closed · `registryProbe` 불변성 |
| `receipt/tests/store-quarantine.test.js` | 10 | 봉쇄 술어 직접(정상·`..`·**symlink**·malformed) · 정상 격리 · 부재 no-op · 부정 3종 · helper 경계 |
| `hooks/tests/session-start-bootstrap.test.js` | +2 (6 → 8) | broken module-scope require · exit-code 대입 0건 + 최종 강제 실재 |
| `lib/tests/plan-codex-runner.test.js` | +2 (23 → 25) | 위임 호출·인자 관측 · `{ok:false}` FATAL 발화 |
| `lib/tests/a3-instruction-cost.test.js` | +1 | `repoRoot` 구동성(라이브 저장소 비종속) |

합계 **+34** (3869 → 3903). 기존 6개 bootstrap test는 marker 부재 단언(`assertCleanExit`)이 추가돼 강화됐다 — **정상 경로에서 강제가 발동하면 여전히 test 실패로 나타난다**(관측면 분리).

---

## 명시적 한계 (주장하지 않는 것)

- **L1 — harness는 per-run 실패 이름을 기록하지 않는다.** `per_run`에 pass/fail/skipped만 담고 어느 실행에서 어느 이름이 갈렸는지는 남기지 않는다. 판정(`sometimesFailing`)에는 영향이 없지만 진단에는 부족하다. 이번 증거는 **ship되는 그 코드가 생산한 것**이어야 하므로 사후 개선하지 않고 한계로 기록한다.
- **L2 — `stable:true`는 결정성의 증명이 아니다.** 10회 미포착 확률은 관측된 flake의 발화율 p에 대해 `(1-p)^10`이다. plan이 근거로 삼은 p≈0.25에서는 **약 5.6%**, 이번에 실제 관측된 p≈0.10에서는 **약 35%**다. 즉 10회는 생각보다 약한 관측이다.
- **L3 — 비율 판정은 상수 배수 회귀를 잡지 못한다.** derive가 선형을 유지한 채 전체적으로 느려지면 ratio는 그대로다. 원 단언은 그것을 잡았다. 그래서 경합 잡음보다 한참 위인 느슨한 절대 상한(30s)을 **별개 축으로** 함께 뒀다. 두 축은 서로를 대체하지 않는다. 실측 여유도 크다 — 정상 ratio 1.19 대 상한 20이므로 이 축이 잡는 것은 상당히 심한 초선형뿐이다.
- **L4 — 2c-B는 수행되지 않았다.** 대상 divergence가 11회 관측에서 미재현이다. 원인을 추정으로 채우지 않고 PRD Open Questions로 승계한다. 다만 **2c-A는 무조건 착지했으므로 계약 위반 자체는 남지 않는다** — 이것이 plan이 Task를 둘로 쪼갠 이유다.
- **L5 — cross-model 확증 없음.** `MCCP_CODEX_DISABLED=1`로 Codex가 미발화했고(`classification=disabled`·`durationMs=0`), plan 게이트도 같은 공백이었다. security-reviewer는 실발화했으나 Claude 계열이므로 **모델 다양성은 얻지 못했다**. 이 milestone은 그것을 획득했다고 주장하지 않는다.
- **L6 — `origin/main` 머지 후 상태는 검증되지 않았다** (D10). 이 리포트의 모든 델타는 `3eabab2` 기준이다.

---

## 남은 결정 (운영자)

이 milestone은 **complete로 표시하지 않았다**(PRD Milestone 2 = `in-progress` 유지). 아래는 서로 배타적인 세 갈래이며, 어느 것을 택할지는 범위·비용 판단이라 구현자가 정할 것이 아니다.

1. **잔여를 명시한 채 수용** — 축 B·C는 닫혔고 축 A 산출물은 전부 실재한다. 유입된 비결정 2건(≈10%/run)을 PRD Open Question으로 승계하고 ship. 근거: PRD Scope가 "테스트 병렬 실행 구조 재설계 — 비결정적 간섭의 근본 해소"를 **M2 범위 밖**으로 명시했고("Milestone 2는 재현 조건 확정까지만 다루며"), 재현 조건 확정은 달성됐다.
2. **부하 감축 후 재측정** — 이 변경이 늘린 임시 fixture 비용을 줄이고 10회를 다시 돌린다. 1회 측정에 약 50분. 메커니즘 미확정 상태의 시도이므로 **성공 보장 없음**.
3. **M3 신설** — 격리 구조(고정 경로 fixture · git-heavy fixture · 부하 민감 stress test)를 별도 milestone으로 연다. 이번 실측이 그 근거를 제공한다: `msw-events.test.js:12-14`가 **저장소 트리 안 고정 경로**에 쓰고, 두 flake의 fixture가 git 하위 프로세스를 6~N개 spawn한다.

권고는 **1 또는 3**이다. 2는 표적 없이 쏘는 것이라 비용 대비 기대값이 낮다.

## Next Steps

- [ ] `origin/main` 머지 + 머지 후 전수 재확인 (D10 — PR 단계 의무)
- [ ] CHANGELOG `## [1.23.8]` 헤딩이 머지 시 중복되지 않는지 확인 (§3.7)
- [x] `git worktree remove .worktrees/m2-attribution-probe` — 귀속 측정 후 정리 완료
- [ ] `plugins/mccp/scripts/.test-msw-events/`가 `.gitignore` 밖이라는 사실 (별건 — 이번 진단에서 드러남)
- [ ] 신규 test-only env 2종(`MCCP_PERF_INJECT_QUADRATIC` · `MCCP_TEST_SESSION_START_PATH`)의 `docs/ENVIRONMENT.md` 등재 여부 — plan의 Files to Change에 없어 **범위를 조용히 넓히지 않았다**. 운영 토글이 아니라 test 전용이므로 §11 canonical 목록의 대상인지 자체가 판단 사항

> **plan을 `completed/`로 아카이브하지 않았다.** 커맨드 Phase 5는 아카이브를 지시하지만 CLAUDE.md §3.11 C2가 "완료 plan archive는 **PRD 전체 완료 시에만** — 미완료 PRD의 plan을 옮기면 어느 스캔에도 안 잡혀 PRD가 소실된다"를 명시한다. Milestone 2가 `in-progress`이므로 저장소 규칙이 우선한다.
