# ci-full-suite M1 — 전수 스위트 baseline

**측정일**: 2026-09-02 ·
**원자료**: [`.claude/_meta/data/2026-09-01-suite-baseline.json`](../../.claude/_meta/data/2026-09-01-suite-baseline.json)

이 문서의 모든 수치는 위 컨테이너의 `runs[]`에서 인용 가능하다. 목표치는 적지 않는다 (UI10) —
관측값과 그로부터 **따라오는 제약**만 적는다. M1은 측정이고, 느린 test의 수리는 M2 이후다 (UI5).

> **이 milestone의 한 줄**: 전수 실행 시간은 스위트의 성질이 아니라 **플랫폼의 성질**이었다.
> 같은 커밋·같은 Node에서 Windows 순차 합계가 Linux의 **64.8배**다. Linux CI에서 전수는
> **75초**에 끝난다.

## 1. 측정 원소

컨테이너에는 **5개 원소**가 있다. 아래 표는 각 축의 1차 run이며, 2·4번째 원소
(`ci-node20-r2` · `ci-node24-r2`)는 재실행 편차 측정용으로 §5a가 다룬다.


| 축 | `local` | `ci-node20` | `ci-node24` |
|---|---|---|---|
| 플랫폼 | win32 | ubuntu-latest | ubuntu-latest |
| Node | v24.19.0 | v20.20.2 | v24.19.0 |
| 코어 | 16 | 4 | 4 |
| **벽시계** | **1,882,988 ms (31.4분)** | **75,499 ms (75.5초)** | **97,965 ms (98.0초)** |
| 순차 합계 | 16,959,106 ms (282.7분) | 200,930 ms (200.9초) | 261,839 ms (261.8초) |
| 실효 speedup | 9.0배 | 2.7배 | 2.7배 |
| 파일 수 | 369 | 371 | 371 |
| `ok` · `attribution` | `true` · `complete` 369/369 | `true` · `complete` 371/371 | `true` · `complete` 371/371 |
| `exit_code` | 1 | 1 | 1 |
| `redaction_ok` | `true` | `true` | `true` |
| chunk | 1 | 1 | 1 |
| `git_sha` | `8e2b0a15` | `846f7cc1` | `846f7cc1` |
| `ci_run_id` | — | `33597753311` | `33597753311` |

`exit_code=1`인데 `ok=true`인 것은 설계대로다. `ok`는 *측정이 성립했는가*이지 스위트 green이
아니다 (plan Task 3). 세 실행 모두 귀속이 완전하므로 "실행되지 않았는데 통과로 읽힘"(DD8이
유일한 치명이라 부른 방향)은 어디서도 발생하지 않았다.

**`local`은 머지 이전 트리(369 파일)에서 떴고 CI 둘은 머지 이후 트리(371 파일)다.** 측정은
커밋에 결속되므로 소급 재작성하지 않는다. 파일 2개 차이는 아래 배율(60배 이상)에 비해 무시 가능하다.

## 2. 플랫폼 격차 — 이 milestone의 실제 발견

`local`과 `ci-node24`는 **같은 Node v24.19.0**이다. 즉 아래 차이에서 Node 버전은 변수가 아니다.

| 지표 | win32 (16코어) | linux (4코어) | 배율 |
|---|---|---|---|
| 순차 합계 | 16,959,106 ms | 261,839 ms | **64.8배** |
| 벽시계 | 1,882,988 ms | 97,965 ms | **19.2배** |
| 최장 파일 | 1,649,583 ms | 27,159 ms | **60.7배** |

코어 수는 Windows가 **4배 많은데도** 그렇다. 배율이 파일마다 3배~326배로 크게 갈리고 그 순위가
자식 프로세스 사용량과 함께 오르므로, 원인은 **프로세스 생성 비용**으로 귀속된다 — Windows의
`CreateProcess`는 Linux의 `fork`/`exec`보다 훨씬 비싸고, 이 스위트는 371개 파일 중 99개가
자식 프로세스를 띄운다 (§3).

**결론: 31.4분은 스위트의 성질이 아니라 개발 머신의 성질이다.** CI가 Linux에서 도는 한
M2가 다뤄야 할 수는 31.4분이 아니라 **75.5초**다.

## 3. 파일 단위 분해 — Linux 기준 상위 15개

Linux(node20)에서 상위 15개는 순차 시간의 **43.9%**를 차지한다. Windows에서 66.8%였던 것이
낮아진 것은 Windows의 편중이 프로세스 생성 비용에서 왔음을 다시 보여준다.

| # | 파일 (`plugins/mccp/scripts/` 생략) | linux ms | win ms | 배율 |
|---|---|---|---|---|
| 1 | `lib/tests/santa-seal.test.js` | 17,502 | 1,334,583 | 76배 |
| 2 | `lib/renderer/tests/a11y-landmarks.test.js` | 8,510 | 253,247 | 30배 |
| 3 | `lib/tests/santa-delta-instrumentation.test.js` | 8,039 | 789,052 | 98배 |
| 4 | `lib/tests/santa-adjudication.test.js` | 7,620 | 632,466 | 83배 |
| 5 | `lib/tests/plan-codex-runner.test.js` | 5,291 | 102,980 | 19배 |
| 6 | `receipt/tests/intent-gate-fields.test.js` | 5,065 | 1,649,583 | **326배** |
| 7 | `lib/tests/intent-arbiter-e2e.test.js` | 4,878 | 440,387 | 90배 |
| 8 | `lib/tests/santa-loop-cap.test.js` | 4,755 | 60,526 | 13배 |
| 9 | `lib/tests/pr-phase-helpers/finalize-receipt.test.js` | 4,438 | 65,775 | 15배 |
| 10 | `receipt/tests/tempfail-propagation.test.js` | 4,298 | 13,960 | 3배 |
| 11 | `lib/renderer/tests/index-outer-fail-open.test.js` | 3,652 | 123,072 | 34배 |
| 12 | `lib/tests/dashboard-server.test.js` | 3,651 | 118,719 | 33배 |
| 13 | `lib/renderer/tests/design-invariants.test.js` | 3,564 | 122,904 | 34배 |
| 14 | `receipt/tests/santa-review-gate.test.js` | 3,552 | 1,035,630 | **292배** |
| 15 | `lib/renderer/tests/renderer-generic.test.js` | 3,424 | 121,835 | 36배 |

**원인은 단일하다: 프로세스 생성이다.** 배율 상위 두 파일(326배 · 292배)이 `mkTmpRepo`를 가장
많이 부르는 둘이다. `mkTmpRepo`
([`receipt/tests/helpers.js:8-20`](../../plugins/mccp/scripts/receipt/tests/helpers.js))는
repo 1개당 git 프로세스 **6개**(`init` · `config`×3 · `add` · `commit`)를 띄운다.

| 축 | 파일 수 (371 중) |
|---|---|
| `mkTmpRepo` 사용 | 54 |
| 자체 git-init fixture(`makeRepo` 등) | 48 |
| 자식 프로세스를 하나라도 띄움 | 99 |

`intent-gate-fields.test.js` 기준: 54 repo × 6 = **324 git 프로세스**. Windows에서
1,649.6초 / 324 ≈ **5.1초/프로세스 묶음**, Linux에서 5.1초 / 324 ≈ **16 ms**. 같은 코드다.

**수리하지 않는다 (UI5)** — 이 수치가 M2의 근거다.

### 분포

| 백분위 | local (win) ms | ci-node20 ms | ci-node24 ms |
|---|---|---|---|
| p50 | 1,007 | 45 | 56 |
| p90 | 80,807 | 1,571 | 1,872 |
| p99 | 789,052 | 7,620 | 11,818 |
| max | 1,649,583 | 17,502 | 27,159 |

## 4. 병렬 하한 — M2에 부과되는 제약

**병렬 벽시계의 하한은 순차 합계 / 코어 수가 아니라 단일 최장 파일이다.**
`node --test`는 파일을 최소 스케줄 단위로 삼으므로 한 파일은 쪼개지지 않는다.

| 축 | 최장 파일 | 하한 | 현재 벽시계 | shard로 회수 가능한 최대 |
|---|---|---|---|---|
| local (win32 · 16코어) | `intent-gate-fields` | **1,649.6초 (27.5분)** | 1,883.0초 | 233.4초 (12%) |
| ci-node20 (linux · 4코어) | `santa-seal` | **17.5초** (2차 25.5초) | 75.5초 (2차 96.0초) | 58.0초 (77%) |
| ci-node24 (linux · 4코어) | `santa-seal` | **27.2초** (2차 21.1초) | 98.0초 (2차 92.2초) | 70.8초 (72%) |

**M2에 대한 제약은 플랫폼에 따라 정반대다.**

- **Linux CI에서**: 하한 17.5~27.2초(§5a — 4회 관측 범위), 현재 75.5~98.0초. shard(= 러너 병렬)만으로 회수 가능한 여지가
  **72~77%**다. 원인 수리 없이 shard만으로도 20초대에 도달 가능하며, 그 이하는 `santa-seal`
  하나가 막는다. 그러나 **75.5초는 이미 어떤 PR 피드백 임계에도 들어간다** — M2의 존재
  이유 자체를 재검토해야 한다.
- **Windows 개발 머신에서**: 하한 27.5분, 현재 31.4분. shard로 회수 가능한 것은 **12%**뿐이고
  나머지는 전부 프로세스 생성 비용이다. 여기서는 shard가 수단이 될 수 없고 원인 수리가 유일하다.

**M2가 무엇을 최적화하는지 먼저 정해야 한다.** CI 피드백이라면 이미 충족됐고, 로컬 개발
루프라면 shard가 아니라 `mkTmpRepo` 감축이 유일한 수단이다. 이 판단은 M1의 산출이 아니라
M1이 M2에 넘기는 **질문**이다.

## 5. Node 20 파일 귀속 — DD6 fallback은 발화하지 않았다

DD5가 `node 20` matrix를 둔 목적은 `data.file` 가용성 판정이었다.

| 축 | `nesting0_events` | `attributed_events` | `attribution` |
|---|---|---|---|
| ci-node20 (v20.20.2) | 6,363 | **6,363** | `complete` |
| ci-node24 (v24.19.0) | 6,363 | **6,363** | `complete` |

**Node 20은 `data.file`을 전부 싣는다.** 귀속 손실 0건이며 DD6이 대비한
`attribution:'unavailable'` 분기는 발화하지 않았다. Acceptance 1이 `ci-node20`에 열어 둔
두 번째 수용 행(`ok:false` 그리고 `unavailable`)은 **쓰이지 않았다** — 첫 번째 행으로 충족됐다.

부수 관측: **두 Node 버전의 속도 차이는 관측되지 않았다.** 1차 run만 보면 node 20이 30% 빨랐으나
(75.5초 대 98.0초) 2차 run에서 순서가 뒤집혔다(96.0초 대 92.2초). 그 차이는 아래 §5a의
run 간 편차(최대 27.1%)보다 작다 — 즉 **구분 불가**다. 1차 관측만으로 결론짓지 않는다.

## 5a. run 간 편차 — 같은 트리, 같은 러너, 두 번

`pull_request` synchronize가 2차 run을 자동 발화시켜 **같은 workflow가 같은 스위트를 두 번**
측정했다(run `33597753311` · `33598634085`).

| 축 | 1차 | 2차 | 편차 |
|---|---|---|---|
| node20 벽시계 | 75,499 ms | 95,984 ms | **+27.1%** |
| node24 벽시계 | 97,965 ms | 92,186 ms | −5.9% |
| node20 순차 합계 | 200,892 ms | 253,920 ms | +26.4% |
| node24 순차 합계 | 261,776 ms | 247,607 ms | −5.4% |
| node20 최장 파일 | 17,502 ms | 25,478 ms | +45.6% |
| node24 최장 파일 | 27,159 ms | 21,093 ms | −22.3% |
| node20 실패 파일 | 9 | 10 | +1 |
| node24 실패 파일 | 8 | 8 | 0 |

**GitHub runner도 조용하지 않다.** 벽시계 편차 27.1%는 우산 PRD가 로컬 재실행에서 관측한
25.6%와 같은 크기다. 즉 §2의 플랫폼 배율(64.8배)은 이 잡음을 압도하지만, **파일별 ms와
병렬 하한은 ±30% 규모의 불확실성을 갖는다**고 읽어야 한다.

M2·M3에 대한 함의: 임계값을 단일 run에서 뽑으면 안 된다. 최소 3회 측정의 중앙값 또는
상위 백분위를 쓰고, 그 방법 자체를 M2가 정해야 한다.

## 6. 스위트 red 현황 — 기록만 한다

세 실행 모두 `exit_code=1`. **그런데 실패 집합이 플랫폼마다 거의 겹치지 않는다.**

| 축 | 실패 파일 수 |
|---|---|
| local (win32) | 8 |
| ci-node20 (linux) | 9 |
| ci-node24 (linux) | 8 |
| ci-node20 ∩ ci-node24 | 8 (Linux 두 Node는 거의 일치) |
| **win ∩ linux** | **2** |

- **Windows에서만 실패 (6)**: `codex-invoke.test.js` · `codex-invoke-json.test.js` ·
  `plan-review-cli-emit.test.js` · `validate-cmd.test.js` ·
  `validate-cmd-intent-gate.test.js` · `review-single-pass-fields.test.js`
- **Linux에서만 실패 (7)**: `mask.test.js` · `dispatch-controller.test.js` ·
  `dispatch-fullcycle-smoke.test.js` · `goal-phase-lock.test.js` ·
  `history-leak-scan.test.js` · `instruction-contract.test.js` · `santa-loop-cap.test.js`

**즉 어느 한 플랫폼에서만 스위트를 돌리면 실패의 절반 이상을 구조적으로 못 본다.** 이것은
M3의 CI 배선이 matrix를 가져야 하는지에 직접 걸리는 사실이다. **M1은 수리하지 않는다
(UI4 · UI5)** — 원인 귀속도 하지 않았다.

## 7. argv 여유

| 항목 | 값 |
|---|---|
| 파일 수 | 371 |
| argv 바이트 | 22,083 (369 파일 기준 실측) |
| Windows `CreateProcess` 한계 | 32,767 |
| 사용률 | 67.4% |
| chunk 임계 (`planChunks` 기본) | 24,000 |
| 실제 chunk 수 | 1 (세 실행 모두) |

임계 24,000까지 여유는 약 1,900바이트, 즉 **파일 32개**다. test 파일이 32개 늘면 자동으로
2 chunk가 되며, 그 전환은 조용하지 않다(`chunks` 필드가 산출에 실린다). M3의 감시 대상이다.

## 7a. 경로 redaction — 검증과 그 보조 grep의 오탐

컨테이너 전체에 **절대경로 0건**이다 (Acceptance 6). 정본 판정은 러너의 redaction 불변식이고,
세 원소 모두 `redaction_ok: true` · `redaction_hits: []`다. **CI 원소는 다른 머신
(`/home/runner`, `/tmp`)에서 생산됐고 그 판정도 그 머신에서 내려졌다** — 병합은
`redaction_ok !== true`인 원소를 거부하므로(security C-2 흡수) 이 머신이 타 머신의 root를
재도출할 필요가 없다.

| 스캔 대상 | 컨테이너 내 건수 |
|---|---|
| `/home/` · `/Users/` · `/tmp/` · `/var/folders/` | 0 |
| `AppData` · `ADMINI~1` · `Administrator` · `runner` | 0 |

**plan Validation의 보조 grep은 이 파일에서 오탐을 낸다.** 그 정규식의 드라이브 문자 갈래가
JSON 이스케이프된 단언 실패 텍스트의 `equal:` + 백슬래시에 걸린다 — 드라이브 문자 뒤에 경로가
오는지를 보지 않기 때문이다. plan이 그 grep을 "보조 확인"이라 부르고 "플랫폼별 패턴 열거는
반드시 빠뜨린다"고 적은 이유가 이것이며, 실측된 실패 방향은 *누락*이 아니라 *오탐*이었다.
**정본은 러너의 `redaction_ok`이며 이 grep으로 red를 판정하지 말 것.**

## 8. flaky 판정 — 재현되지 않음

대상: `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` (우산 PRD가 red로 지목한 1건).

| 관측 | 결과 |
|---|---|
| 단독 실행 3회 (win32) | 전부 exit 0 · 2/2 pass · 9,256 / 1,495 / 1,856 ms |
| 전수 병렬 (local) | 2/2 pass · 5,902 ms |
| 전수 병렬 (ci-node20) | pass |
| 전수 병렬 (ci-node24) | pass |

**6회 관측 모두 green이다.** 단독에서도, 전수 병렬 하에서도, 두 플랫폼 어디서도 재현되지
않았다. 출력에 섞이는 `cache_stale: previous render was N seconds old`는 test 단언이 아니라
렌더러 로그다.

**삭제하거나 격리하지 않는다 (UI11).** "재현되지 않은 과거 관측"으로 기록하고 M2·M3이 재관측
대상으로 승계한다. 단독 실행 시간이 9.3초에서 1.5초로 6배 변동하는 것은 캐시 온도 의존성을
시사하며 그것이 원래 FAIL의 후보 원인이다 — 확정하지 않는다.

## 9. Open Question 응답

| OQ | 상태 | 근거 |
|---|---|---|
| OQ1 — 조용한 머신이 어디인가 | **해결** | **GitHub runner다.** 4코어 Linux가 16코어 Windows보다 벽시계 19.2배·순차 64.8배 빠르다 (§2). PRD가 "runner 자체가 그 조용한 머신일 수 있다"고 연 갈래가 확증됐다 |
| OQ2 — 임계값 | 미해결 (M2 소유) | 목표치를 지어내지 않는다 (UI10). 다만 Linux 75.5초는 이미 통상 임계 안이라 **M2의 전제 자체가 재검토 대상**이다 (§4) |
| OQ3 — shard 수 | 미해결 (M2 소유) | 하한이 플랫폼마다 다르다 — Linux 17.5초(회수 여지 77%) · Windows 27.5분(12%) (§4) |
| OQ4 — flaky의 정체 | **해결(재현 불가)** | 6회 관측 전부 green (§8) |
| OQ5 — 파일 귀속이 가능한가 | **해결** | Node 20·24, Linux·Windows 전부 `attribution=complete`, 귀속 손실 0 (§5) |

## 10. M2·M3이 물려받는 수치

- **Linux 전수 벽시계 75.5초 (node20) / 98.0초 (node24)** — M2가 줄여야 할 수. 31.4분이 아니다
- **Linux 병렬 하한 17.5초** — shard 수 산정의 하한. 회수 여지 77%
- **Windows 병렬 하한 27.5분** — 로컬 개발 루프를 최적화한다면 shard는 무의미(회수 12%)
- **플랫폼 배율 64.8배** — 원인 수리(프로세스 생성 감축)의 상한 이득
- **99/371 파일이 자식 프로세스를 띄운다** — 수리 대상 모집단. `mkTmpRepo` 54 · 자체 fixture 48
- **red가 플랫폼마다 다르다 (교집합 2)** — M3 CI 배선이 matrix를 요구하는지의 직접 근거 (§6)
- **argv 여유 32파일** — 2 chunk 전환 시점
- **커버리지 분모 371** — 단, `suite-determinism.js:29`의 `DEFAULT_PATTERN`은
  `.claude/scripts/receipt/tests/` 10건을 제외하므로 그 정의로는 361이다. **두 정의가 어긋나
  있고 M1은 이를 해소하지 않는다** (DD3 · UI6). M3의 커버리지 분모가 어느 쪽을 정본으로
  삼을지는 미결이다

## 11. 이 측정이 주장하지 않는 것

- **플랫폼 배율의 원인을 증명하지 않았다.** 프로세스 생성 비용으로 귀속한 것은 (a) 배율이
  자식 프로세스 사용량과 함께 오르고 (b) 같은 Node 버전에서 관측됐다는 두 정황이다.
  프로파일러를 붙이지 않았다.
- **CI는 2회, 로컬은 1회 측정이다.** CI 재실행 편차는 §5a가 실측했다(벽시계 최대 27.1%,
  최장 파일 최대 45.6%). **로컬은 재실행 편차가 여전히 미측정**이므로 Windows 값의 불확실성은
  우산 PRD의 25.6% 관측을 준용해 읽어야 한다. §2의 배율(60배 이상)은 양쪽 불확실성을 압도한다.
- **`local`과 CI가 같은 트리가 아니다.** 369 대 371 파일, 다른 커밋. §1에 명시했다.
  머지된 트리(371)에서 로컬을 재측정하려 시도했으나 **중단했다** — 세션이 동시에 다른 작업을
  하는 동안 돌리자 clean run(31.4분)의 2배를 넘겨도 끝나지 않았고, node 자식 프로세스가 336개까지
  쌓여 셸이 `fork: Resource temporarily unavailable`을 내는 지점에 도달했다. **그 실패 자체가
  OQ1의 답을 보강한다**: 이 개발 머신은 다른 작업이 하나라도 도는 동안 전수를 완주할 수 없다.
  기존 `local` 원소는 그런 경합이 없던 실행이라 보존했고, 오염된 값으로 덮어쓰지 않았다.
- **red의 원인을 규명하지 않았다.** 플랫폼별 실패 목록일 뿐이며, 왜 갈리는지는 보지 않았다.
- **Windows CI를 측정하지 않았다.** matrix는 `ubuntu-latest`뿐이라, 관측된 Windows 값은
  개발 머신 1대의 것이다. "Windows runner도 느린가"는 열린 질문이다.
