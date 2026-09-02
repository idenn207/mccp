# ci-full-suite M1 — 전수 스위트 baseline

**측정일**: 2026-09-02 · **커밋**: `8e2b0a15468d3649e9408e9b91dc269eb044bbfe` ·
**원자료**: [`.claude/_meta/data/2026-09-01-suite-baseline.json`](../../.claude/_meta/data/2026-09-01-suite-baseline.json)

이 문서의 모든 수치는 위 컨테이너의 `runs[]`에서 인용 가능하다. 목표치는 적지 않는다 (UI10) —
관측값과 그로부터 **따라오는 제약**만 적는다. M1은 측정이고, 느린 test의 수리는 M2 이후다 (UI5).

## 1. 벽시계와 환경

| 축 | `local` | `ci-node20` |
|---|---|---|
| 벽시계 | **1,882,988 ms = 31.4분** | 미측정 |
| Node | v24.19.0 | 20.x (예정) |
| 플랫폼 · 코어 | win32 · 16 | ubuntu-latest · 4 (예정) |
| 파일 수 | 369 (제외 0) | — |
| `ok` · `attribution` | `true` · `complete` (369/369) | — |
| `exit_code` | 1 (스위트 red — 측정은 성립) | — |
| chunk | 1 | — |

`ci-node20` 원소는 아직 컨테이너에 없다. `workflow_dispatch`는 default branch의 workflow
파일에만 발화하므로 머지 전 경로는 `pull_request` 하나이고, 그것은 브랜치 push + PR 개설을
요구한다 (plan Task 5 · 6-2). **Acceptance 1·3은 그 시점까지 미충족이다** — 이 문서는 그
사실을 숨기지 않는다.

`exit_code=1`인데 `ok=true`인 것은 설계대로다. `ok`는 *측정이 성립했는가*이지 스위트 green이
아니다 (plan Task 3). 귀속은 369/369로 완전하므로 "실행되지 않았는데 통과로 읽힘"(DD8이
유일한 치명이라 부른 방향)은 발생하지 않았다.

## 2. 순차 합계와 병렬 이득

| 지표 | 값 |
|---|---|
| 순차 합계 (`sum_ms` 총합) | 16,959,106 ms = **282.7분** |
| 병렬 벽시계 | 1,882,988 ms = **31.4분** |
| 실효 speedup | **9.0×** (16코어 대비 56% 효율) |
| test case 총수 | 5,947 (pass 5,920 · fail 27) |

우산 PRD의 "전수 순차 실행 174분"은 **이 스위트의 값이 아니다** — 그 로그는 `plugins/mccp/`
하위 346개만 돌았고 Task 0 머지 이전 값이다. 현재 분모 369에 대한 순차 합계는 282.7분이다.

## 3. 파일 단위 분해 — 상위 15개

상위 15개(4.1%)가 순차 시간의 **66.8%**를 차지한다.

| # | 파일 | ms | tests | 원인 |
|---|---|---|---|---|
| 1 | `receipt/tests/intent-gate-fields.test.js` | 1,649,583 | 53 | `withRepo`/`mkTmpRepo` 54회 |
| 2 | `lib/tests/santa-seal.test.js` | 1,334,583 | 18 | 로컬 `makeRepo` + `execFileSync(node, cli.js)` |
| 3 | `receipt/tests/santa-review-gate.test.js` | 1,035,630 | 25 | `mkTmpRepo` 25회 |
| 4 | `lib/tests/santa-delta-instrumentation.test.js` | 789,052 | 29 | 로컬 `makeRepo` + git 서브프로세스 |
| 5 | `receipt/tests/impeccable-skipped.test.js` | 742,035 | 10 | `mkTmpRepo` + CLI spawn |
| 6 | `receipt/tests/review-single-pass-fields.test.js` | 706,477 | 25 | `mkTmpRepo` 28회 |
| 7 | `receipt/tests/state-matrix.test.js` | 691,488 | 17 | `mkTmpRepo` 8회 |
| 8 | `receipt/tests/write.test.js` | 646,712 | 17 | `mkTmpRepo` 17회 |
| 9 | `lib/tests/santa-adjudication.test.js` | 632,466 | 90 | 로컬 `makeRepo` + CLI spawn 18회 |
| 10 | `receipt/tests/security-skipped.test.js` | 617,580 | 7 | `mkTmpRepo` + CLI spawn |
| 11 | `receipt/tests/validate-cmd.test.js` | 603,445 | 33 | `mkTmpRepo` + CLI spawn |
| 12 | `receipt/tests/design-grounding-fields.test.js` | 525,707 | 9 | `mkTmpRepo` 12회 |
| 13 | `receipt/tests/merged-verify-fields.test.js` | 464,585 | 11 | `mkTmpRepo` 10회 |
| 14 | `receipt/tests/validate-cmd-envelope.test.js` | 453,316 | 5 | `mkTmpRepo` + CLI spawn |
| 15 | `lib/tests/intent-arbiter-e2e.test.js` | 440,387 | 10 | `mkTmpRepo` + node spawn 2회 |

경로 접두는 전부 `plugins/mccp/scripts/`다.

**원인은 단일하다: 프로세스 생성이다.** 15개 전부가 `os.tmpdir()`에 진짜 git repo를 만들고,
다수가 그 위에서 `node <cli.js>`를 다시 spawn한다. `mkTmpRepo`
([`receipt/tests/helpers.js:8-20`](../../plugins/mccp/scripts/receipt/tests/helpers.js))는
repo 1개당 git 프로세스 **6개**(`init` · `config`×3 · `add` · `commit`)를 띄운다.

| 축 | 파일 수 (369 중) |
|---|---|
| `mkTmpRepo` 사용 | 54 |
| 자체 git-init fixture(`makeRepo` 등) | 48 |
| 자식 프로세스를 하나라도 띄움 | 99 |

1위 파일 기준: 54 repo × 6 = **324 git 프로세스**, 1,649.6초 / 324 ≈ **5.1초/repo**. Windows의
프로세스 생성 비용이 그대로 곱해진다. **수리하지 않는다 (UI5)** — 이 수치가 M2의 근거다.

### 분포

| 백분위 | ms |
|---|---|
| p50 | 1,007 |
| p90 | 80,807 |
| p99 | 789,052 |
| max | 1,649,583 |

중앙값 대비 최댓값이 **약 1,638배**다.

## 4. 병렬 하한 — M2에 부과되는 제약

**병렬 벽시계의 하한은 순차 합계 / 코어 수가 아니라 단일 최장 파일이다.**
`node --test`는 파일을 최소 스케줄 단위로 삼으므로 한 파일은 쪼개지지 않는다.

- 단일 최장 파일 = `intent-gate-fields.test.js` = **1,649,583 ms = 27.5분**
- 현재 병렬 벽시계 = 31.4분

**즉 shard를 무한히 늘려도 27.5분 밑으로 내려가지 않는다.** 31.4분과 27.5분의 차이는 3.9분뿐이고,
shard 수를 늘려 회수 가능한 전부가 그 3.9분이다. M2가 PR 피드백 임계를 27.5분보다 낮게 잡는다면
**shard는 수단이 될 수 없고 원인 수리(프로세스 생성 감축)가 필수**다.

파생 제약: 상위 2개(27.5분 + 22.2분)를 서로 다른 shard에 넣어도 하한은 27.5분이다. 하한을
낮추는 유일한 수단은 최장 파일 자체를 빠르게 만들거나 쪼개는 것이다.

## 5. flaky 판정 — 재현되지 않음

대상: `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js`
(우산 PRD가 red로 지목한 1건).

| 관측 | 결과 |
|---|---|
| 단독 실행 1 | exit 0 · 2/2 pass · 9,256 ms |
| 단독 실행 2 | exit 0 · 2/2 pass · 1,495 ms |
| 단독 실행 3 | exit 0 · 2/2 pass · 1,856 ms |
| 전수 병렬 실행 안에서 | 2/2 pass · 5,902 ms |

**4회 관측 모두 green이다.** 단독에서도, 전수 병렬 하에서도 재현되지 않았다. 우산 PRD가 인용한
FAIL은 이 커밋에서 **재현 불가**이며, 출력에 섞이는 `cache_stale: previous render was N seconds
old`는 test 단언이 아니라 렌더러 로그다.

**삭제하거나 격리하지 않는다 (UI11).** 원인 미규명 상태로 "재현되지 않은 과거 관측"으로 기록하고
M2·M3이 재관측 대상으로 승계한다. 실행 시간이 9.3초 → 1.5초로 변동하는 것(6배)은 캐시 온도
의존성을 시사하며, 그것이 원래 FAIL의 후보 원인이다 — 확정하지 않는다.

## 6. 스위트 red 현황 — 기록만 한다

`exit_code=1`. 8개 파일에서 27건의 test-level 실패.

| 파일 | pass/tests |
|---|---|
| `lib/tests/codex-invoke.test.js` | 38/47 |
| `lib/tests/plan-review-cli-emit.test.js` | 3/12 |
| `lib/tests/codex-invoke-json.test.js` | 1/5 |
| `lib/tests/codex-reachability.test.js` | 6/7 |
| `lib/tests/meta-research.test.js` | 44/45 |
| `receipt/tests/validate-cmd.test.js` | 32/33 |
| `receipt/tests/validate-cmd-intent-gate.test.js` | 16/17 |
| `receipt/tests/review-single-pass-fields.test.js` | 24/25 |

**M1은 이것을 수리하지 않는다 (UI4·UI5).** red는 목록으로 남고, 무엇을 고치고 무엇을 은퇴시킬지는
별도 축이다. 실패가 `codex-invoke` · `plan-review` 계열에 집중된 것은 관측 사실이며 원인 귀속은
하지 않았다.

## 7. argv 여유

| 항목 | 값 |
|---|---|
| 파일 수 | 369 |
| argv 바이트 | **22,083** |
| Windows `CreateProcess` 한계 | 32,767 |
| 사용률 | **67.4%** |
| chunk 임계 (`planChunks` 기본) | 24,000 |
| 실제 chunk 수 | 1 |

현재 평균 경로 길이는 약 59바이트다. 임계 24,000까지 여유는 1,917바이트 ≈ **파일 32개**이고,
`CreateProcess` 한계까지는 약 181개다. 즉 **test 파일이 32개 늘면 자동으로 2 chunk가 된다** —
그 전환은 조용하지 않다(`chunks` 필드가 산출에 실린다). M3의 감시 대상이다.

## 7a. 경로 redaction — 검증과 그 보조 grep의 오탐

컨테이너 전체에 **절대경로 0건**이다 (Acceptance 6). 정본 판정은 러너의 redaction 불변식이고,
`local` 원소는 `redaction_ok: true` · `redaction_hits: []` · `redaction_degraded: []` ·
`redaction_scan_truncated: false`다.

| 스캔 대상 | 컨테이너 내 건수 |
|---|---|
| `/home/` · `/Users/` · `/tmp/` · `/var/folders/` | 0 |
| `AppData` · `ADMINI~1` · `Administrator` | 0 |
| Windows 드라이브 경로 (`X:` + 백슬래시 + 경로문자) | 0 |

**plan Validation의 보조 grep은 이 파일에서 22건을 보고하며 전부 오탐이다.** 그 정규식의
`[A-Za-z]:\` 갈래가 JSON 이스케이프된 단언 실패 텍스트의 `equal:` + 백슬래시에 걸린다 — 드라이브 문자 뒤에 경로가 오는지를 보지 않기 때문이다. plan이 그 grep을 "보조 확인"이라
부르고 "플랫폼별 패턴 열거는 반드시 빠뜨린다"고 적은 이유가 이것이다. 다만 실측된 실패 방향은
*누락*이 아니라 *오탐*이었다. **정본은 러너의 `redaction_ok`이며 이 grep으로 red를 판정하지 말 것.**

## 8. Open Question 응답

| OQ | 상태 | 근거 |
|---|---|---|
| OQ1 — 조용한 머신이 어디인가 | **미해결** | 로컬 31.4분만 측정됐다. CI 값이 없어 비교가 성립하지 않는다 (§1) |
| OQ2 — 임계값 | 미해결 (M2 소유) | 목표치를 지어내지 않는다 (UI10) |
| OQ3 — shard 수 | 미해결 (M2 소유) | 다만 §4가 **하한 27.5분**이라는 제약을 확정했다 |
| OQ4 — flaky의 정체 | **부분 해결** | 4회 관측 전부 green. 재현 불가로 판정 (§5) |
| OQ5 — 파일 귀속이 가능한가 | **해결** | Node 24에서 `attribution=complete` 369/369 (§1). Node 20은 미검증 |

## 9. M2·M3이 물려받는 수치

- **병렬 하한 27.5분** — shard 수 산정의 하한. 이보다 낮은 임계는 shard로 도달 불가 (§4)
- **상위 15개 = 66.8%** — 원인 수리의 투자 대비 효과 상한
- **프로세스 생성 비용 ≈ 5.1초/repo** (Windows) — `mkTmpRepo` 1회 절감의 단가
- **99/369 파일이 자식 프로세스를 띄운다** — 수리 대상 모집단
- **argv 여유 32파일** — 2 chunk 전환 시점
- **커버리지 분모 369** — 단, `suite-determinism.js:29`의 `DEFAULT_PATTERN`은
  `.claude/scripts/receipt/tests/` 10건을 제외하므로 그 정의로는 359다. **두 정의가 어긋나 있고
  M1은 이를 해소하지 않는다** (DD3 · UI6). M3의 커버리지 분모가 어느 쪽을 정본으로 삼을지는 미결이다

## 10. 이 측정이 주장하지 않는 것

- **Node 20에서 파일 귀속이 되는지 모른다.** 로컬은 Node 24다. DD5가 node 20 matrix를 둔 목적이
  정확히 그 판정이며, 그 답은 CI 측정 이후에 온다.
- **31.4분이 "조용한 머신"의 값인지 모른다.** 개발 머신에서 다른 세션을 정지하고 측정했으나
  OS 수준 경합은 통제되지 않았다. OQ1이 열려 있는 이유다.
- **1회 측정이다.** 재실행 편차는 측정되지 않았다. 우산 PRD baseline에서 같은 파일의 재실행 편차가
  최대 25.6%였으므로, 여기 적힌 파일별 ms는 ±25% 규모의 불확실성을 갖는다고 읽어야 한다.
- **red의 원인을 규명하지 않았다.** 8개 파일의 실패는 목록일 뿐이다.
