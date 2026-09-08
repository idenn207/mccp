# Milestone Closure — ci-full-suite-m3

## Milestone
- ID         : ci-full-suite-m3
- Name       : ci-enforcement
- Plan       : .claude/plans/ci-full-suite-m3w.plan.md
- Status     : done
- Closed at  : 2026-09-04T07:52:00.000Z
- Closed by  : /mccp:milestone-close (run_id=d2f6a2e1-dd2b-496e-8c8f-30d25b18495b)

## Acceptance Condition

운영자가 `/goal`에 verbatim으로 넘긴 조건:

> ci-full-suite M3 closure is settled: the four unmet live-run outputs are
> recorded rather than rounded up, the measurement provenance gap is stated,
> and OQ3 plus the Task 0 Linux re-measurement are carried forward as open —
> or stop after 15 turns

## Goal Loop Result

verdict=done. `/goal` 루프는 **실제로 돌았고**, 최종 판정은 **운영자가 어시스턴트에게
명시 위임**했다 — 원문: «claude 판단으로 진행해줘.» 직전 turn에서 미충족 4건 · 신규
provenance gap · 기록 drift 2건을 전부 보고한 뒤 받은 응답이므로, 위임은 정보가 없는
상태의 위임이 아니다.

격리 lock은 표준대로 작동했다. 획득 후 Bash 호출이 **3회 실제 차단**됐고
(`goal-phase-guard` BLOCK · `owner-session-match` · `default-deny during goal-phase`),
그 뒤 조건 대조는 read-only 도구(Grep/Read)로만 수행했다. 이 문서와 plan stamp는 모두
`exit --run-id` 이후(`cleared:true`)에 쓰였다.

### 이 종결이 직접 실행한 기계적 검증

산문을 믿지 않고 이 세션에서 실제로 돌린 것들이다.

| 검사 | 명령 | 결과 |
|---|---|---|
| 단위 test 5면 | `node --test` (Validation 검사 1의 5파일) | **tests 139 · pass 139 · fail 0** |
| 번호 미선언 | `scripts/version-declaration-guard.js --base origin/main` | `ok:true` · 4면 전부 `1.34.4` · `violations:[]` |
| 게이트 (CI 동일 인자) | `scripts/test-suite/gate.js --measurement … --exclude-from … --floor-from … --base-ref origin/main` | **exit 0 · `blocked:false`** |
| 커버리지 | 같은 실행의 `coverage` | **98.4536082474227** (382/388) · `unexplained:[]` · `missing:[]` · `excluded` 6 |
| 전수 측정 | `.claude/cache/m3-local.json` 실독 | `ok:true` · `attribution:"complete"` · `redaction_ok:true` · `redaction_hits:[]` · `failing:[]` · 벽시계 650401ms |
| branch protection | `scripts/ci-required-checks.js --json` | **`ok:false` · `reasons:["protection_absent"]`** |
| 원격 상태 | `git ls-remote --heads origin ci-full-suite-m3` · `gh pr list` | **양쪽 공집합** |

마지막 두 줄이 아래 미충족 넷의 **단일 원인**이다.

### 조건별 판정 (산출물 실독 대조)

| 조건 | 판정 | 근거 |
|---|---|---|
| 라이브 산출물 넷의 미충족이 반올림 없이 기록 | 충족 | 기록 위치 셋이 서로를 보강한다 — `docs/ci-full-suite/m3-enforcement.md` §7 표 4행 · plan `## Acceptance` 체크박스 4개 전부 미체크 · PRD 3행 "넷 전부 미충족". 이 종결이 산출물 4와 1·3의 원인을 **독립 재확인**했다(위 표) |
| 측정 provenance gap이 기술 | 충족 (이 문서가 기술한다) | 기존 문서에 **미기록**이었다. 아래 전용 절 참조 |
| OQ3 + Task 0 Linux 재측정이 열린 채 이월 | 충족 | OQ3은 PRD line 95가 `- [ ]` 미체크로 들고 DD8 결정 규칙이 측정 **전에** 못박혀 있다. Task 0은 §1(L14-15) · §2 주(L56) · §7 · STATE.md가 기록. 격리 6건 티켓은 backlog line 1522~1527에 **6개 전부 실재**하며 dangling 0 |

## 반올림하지 않은 미충족 — 라이브 산출물 넷

**넷 다 미충족이고 원인은 하나다: 브랜치가 원격에 없어 CI가 0회 돌았다.**

| # | 요구 | 상태 | 남은 것 |
|---|---|---|---|
| 1 | PR에서 `test-suite` 체크가 발화하고 green | 미충족 | push + PR. `paths` 필터가 없으므로 그 PR 자신이 실증이다 |
| 2 | 커버리지 실값이 **CI에서** 산출 | 미충족(라이브) / 로컬 실값은 존재 | CI producer `gate.json`의 존재가 미실증. 로컬 98.4536은 이 종결이 재산출했다 |
| 3 | 절단 A·B가 각각 CI red를 만든 run URL 둘 | 미충족 | DD5의 버리는 PR 절차. 로컬 왕복만 통과 |
| 4 | branch protection 후 `ci-required-checks.js` exit 0 | 미충족 | 수동 1회. 현재 진단이 `protection_absent`를 정직하게 보고한다(재확인함) |

즉 **M3이 착지시킨 것은 배선과 로컬 왕복이고, "CI가 강제한다"는 명제 자체는 아직 한 번도
관측되지 않았다.** 이 종결은 그것을 강제 달성으로 반올림하지 않는다.

## 이 종결이 새로 기술하는 것 — 측정 provenance gap

기존 문서 어디에도 없던 사실이다. `m3-enforcement.md`·plan의 `git_sha`/provenance 언급 2건은
게이트 *설계*에 관한 것이고 이 gap이 아니다.

- 전수 측정 `.claude/cache/m3-local.json`의 `git_sha` = `c124e17` 이고 작성 시각은 15:57:51이다.
- 현재 HEAD는 `ca6c67b`이고 커밋 시각은 16:27:44다.
- 그 30분 사이에 **`scripts/tests/test-suite-coverage.test.js` · `scripts/tests/wiring-cut.test.js`
  두 파일이 편집되어** `ca6c67b`에 포함됐다.

**따라서 "650초 전수 측정이 현재 커밋의 산출물"이라는 진술은 성립하지 않는다.** 정상적인
구현 → 측정 → 커밋 순서의 결과이지 결함은 아니지만, 기록되지 않으면 나중에 그 측정을 현재
커밋의 증거로 인용하게 된다.

**공백은 덮였다 — 다만 단일 산출물이 덮은 것이 아니다.** 두 축이 나눠 덮는다:

1. **파일 집합** — 게이트의 커버리지 오라클이 `git ls-files`로 **현재 트리**를 분모로 잡고
   측정의 귀속과 대조해 `unexplained:[]` · `missing:[]`을 냈다. 즉 현재 트리의 tracked test
   파일 집합은 측정이 전부 설명한다.
2. **그 두 파일의 현재 내용** — Validation 검사 1이 두 파일을 포함한 5면을 이 세션에서 다시
   돌려 139/139 green을 냈다.

남는 진짜 공백은 "그 두 파일의 **편집 후** 내용이 **전수 문맥**(382파일 동시 실행)에서도
green인가"이며, 그것은 CI 라이브 실행이 도착할 때 함께 닫힌다.

## 이 종결이 발견한 기록 drift 2건 (수정하지 않고 보고)

1. **§7 산문과 자기 표의 불일치.** `m3-enforcement.md` §7 첫 문장은 "넷 다 미충족"인데 바로
   아래 표는 #2를 "**부분**"으로 적고, PRD 3행이 산문 쪽을 복사했다. 둘은 **서로 다른 범위를
   읽은 것**이라 엄밀히는 모순이 아니다 — 라이브 산출물로서는 미충족(CI 0회)이고, "부분"은
   로컬 대체값이 존재함을 가리킨다. 그래서 어느 한쪽으로 강제 정정하지 않고 이 문서가 범위를
   명시한다(위 미충족 표의 #2 행이 두 범위를 함께 적는다).
2. **단위 test 수가 세 기록에서 전부 다르다.** PRD 3행 "150" · STATE.md "135" · 이 세션 실측
   **139**. 방향은 무해하나 셋 다 어긋나며, 정본은 실측 139다.

## 이월 — 등재 강도가 둘로 갈린다

같은 "열린 채"라도 무게가 다르므로 구분해 적는다.

- **backlog 티켓 (강)**: 격리 6건이 `backlog:ci-full-suite-linux-red-*`로 line 1522~1527에
  전부 등재돼 있고 각 항목이 갈래 귀속(P/F/main 축)을 든다.
- **PRD 체크박스 + 산문 (약)**: OQ3(Windows matrix)과 Task 0 Linux 재측정 **자체**는 backlog
  티켓이 아니다. OQ는 PRD가 정본 carrier이므로 부적절한 것은 아니지만, 6건 티켓과 같은
  강도로 추적된다고 읽어서는 안 된다.

**격리 6건의 정당성은 Task 0 측정에 걸려 있다.** 여섯 전부 Windows 로컬에서 green이라
저작 호스트에서 재현되지 않으며, `m3-enforcement.md` §2 주가 "재현 불가는 원인 규명이
아니다"를 명시한다. 측정이 도착하면 여섯은 전건 재평가 대상이다.

## 이 종결이 주장하지 않는 것

- **CI가 강제한다고 주장하지 않는다.** 배선과 로컬 왕복이 착지했을 뿐이고, 발화는 0회다.
- **커버리지 100%를 주장하지 않는다.** 실값은 98.4536이고 차이는 격리 6건의 대가다.
  게이트 green과 커버리지 100%는 다른 명제다(DD2).
- **격리 6건이 옳다고 주장하지 않는다.** 재현 불가이며 원인 미규명이다.
- **OQ3에 답하지 않는다.** 배선 다섯은 착지했고 측정만 없다. DD8의 결정 규칙은 측정 전에
  못박혀 있으며 **측정 후에 바꾸지 않는다**.
- **cross-model 반증을 받았다고 주장하지 않는다.** 이 사이클의 Implement-Codex는 운영자 정책
  (`MCCP_CODEX_DISABLED=1`)으로 발화하지 않았고 receipt가 `codex_verdict='skipped'`로 봉인한다.
  Codex 축의 회수 지점은 `/mccp:pr`이다.
- **게이트 위조를 닫는다고 주장하지 않는다**(DD4a). 이 게이트가 막는 것은 부주의이지 의도가
  아니다.

## 이 판정을 뒤집을 조건

push 후 CI가 실제로 돌았을 때 (a) `test-suite` 체크가 로컬과 다른 판정을 내거나 (b) 게이트가
로컬에서 통과한 축에서 차단하면, 이 종결이 "로컬에서 검증됐다"고 적은 부분이 반증된다.
그 경우 M3은 재개 대상이며 이 문서의 검증 표가 대조 기준이다.

## Next

`/mccp:prp-commit` → `/mccp:pr`. 그 PR 자신이 산출물 1의 실증이다. 머지 후: Task 0 dispatch →
Task 6 OS 축 측정 → OQ3 판정 → 축 D run URL 둘 → branch protection → Task 9 병합.

## Provenance
- Lock run_id        : d2f6a2e1-dd2b-496e-8c8f-30d25b18495b
- Lock owner session : 41f9eebe-2fce-4d9c-9cab-f90ac02a01ad
- Plan source        : .claude/plans/ci-full-suite-m3w.plan.md
- Detection signal   : {"row":3,"name":"ci-enforcement","plan":".claude/plans/ci-full-suite-m3w.plan.md","status":"in-progress","availability":"available","goal_signal":true,"reason":"ok"}
- Measurement        : .claude/cache/m3-local.json (git_sha `c124e17` · win32 · node v24.19.0)
- Gate re-run        : exit 0 · blocked=false · coverage 98.4536082474227 (382/388)
- mccp version       : 1.34.4 (브랜치 미선언 — 우산 결정 1)
- Mask applied       : derive/mask.js#maskSecrets. `#scrubAbsPaths`는 의도적 미적용 — M2 종결이
  기록한 이유와 동일(슬래시 명령 이름과 숫자 구분자를 훼손한다). 본문은 repo-relative 경로만 쓴다

## 이 종결이 발견한 결함 — m3 plan이 스캐너에게 보이지 않는다 (수리하지 않고 보고)

종결 직후 `/mccp:archive-complete`의 scan을 돌려 정합을 확인하다가 발견했다.

`scan.js`는 이 PRD를 `archivable:true`(3/3 complete)로 판정하는데, 그 `plans` 배열에
**m1·m2만 있고 m3w가 없다.** 원인을 `derive/sources/plans.js`까지 추적했다:

```
extractFields()  → { slug:'ci-full-suite-m3w',
                     error:'plan file > 262144 bytes; skipped (perf guard)' }
```

- 상한은 `plans.js:117`의 `maxPlanScanBytes` 기본값 **256 KiB = 262,144 bytes**다.
- `.claude/plans/ci-full-suite-m3w.plan.md`는 **270,081 bytes**로 그 상한을 7,937 bytes
  초과한다. **이 종결의 stamp 이전에 이미 초과 상태였다** — stamp는 270 bytes를 더했을 뿐
  원인이 아니다.
- 상한을 넘으면 `extractFields`가 조기 반환하므로 `source_prd`와 `milestone`이 **아예 추출되지
  않는다**(둘 다 `undefined`). m1·m2는 62KB·72KB라 정상 추출된다.

**결과**: §3.11 C1대로 plan discovery는 활성 PRD의 `source_prd`로만 이뤄지므로, 이 plan은
`/mccp:archive-complete`가 **구조적으로 옮길 수 없다**. PRD가 archivable이 된 지금,
아카이브를 실행하면 **m1·m2만 이동하고 m3w는 orphan으로 남는다.** 그 복구는 §3.11의
orphan 런북(수동 `git mv`)이다.

부수 효과로 이 plan은 대시보드의 plan↔PRD 상관에서도 빠진다.

**수리하지 않는 이유**: 상한 변경은 전 plan의 스캔 비용을 바꾸는 배포 표면 변경이라 milestone
종결의 범위가 아니다. 후보는 셋이고 어느 것도 자명하지 않다 — (a) 상한 상향 (b) 상한 초과 시
전문 대신 **머리 N KB만** 읽어 헤더 필드를 뽑는 부분 파싱 (c) `error` 필드를 소비처가
"보이지 않는 plan"으로 표면화. (b)가 유력하다: 헤더 3줄은 항상 파일 머리에 있으므로 perf
guard의 목적(대용량 전문 정규식 스캔 회피)을 해치지 않으면서 discovery를 복원한다.

**이것이 우산 PRD의 서명 실패 모드와 같은 형태라는 점은 적어 둘 만하다** — "기계는 만들어지고
그것을 부르는 한 줄이 빠진다"의 변종으로, 여기서는 *계획서가 스캐너의 상한을 넘어 조용히
목록에서 사라졌다*. 게이트는 정직하게 `error`를 남기지만 그것을 읽는 소비처가 없다.

**후속 행동**: ci-full-suite PRD를 아카이브할 때 m3w를 orphan 런북으로 함께 옮길 것.
파서 수리는 별도 축.
